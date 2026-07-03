import { APP_RELEASE_CHANNEL, APP_VERSION, MONITORING_ENDPOINT, MONITORING_SAMPLE_RATE } from './config.js';
import { hasMonitoringEndpoint, sendMonitoringEvent } from '../api/monitoringClient.js';

const MAX_MESSAGE_LENGTH = 220;
const MAX_STACK_LENGTH = 900;
const SENSITIVE_KEY_PATTERN = /token|password|cookie|secret|authorization|private[_-]?key|access[_-]?key|refresh[_-]?key/i;
const SENSITIVE_VALUE_PATTERN = /pat_|prt_|Bearer\s+|password|cookie=|PRIVATE KEY|AKIA[0-9A-Z]{16}/i;

const monitoringState = {
  captured: 0,
  sent: 0,
  failed: 0,
  lastEventAt: null,
  lastErrorName: ''
};

function clampText(value, max) {
  const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function sanitizeMonitoringValue(value, depth = 0) {
  if (depth > 4) return '[truncated]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    const text = clampText(value, 500);
    return SENSITIVE_VALUE_PATTERN.test(text) ? '[redacted]' : text;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map(item => sanitizeMonitoringValue(item, depth + 1));
  if (typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value).slice(0, 40)) {
      output[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : sanitizeMonitoringValue(item, depth + 1);
    }
    return output;
  }
  return clampText(value, 120);
}

function shouldSample() {
  if (!hasMonitoringEndpoint()) return false;
  if (MONITORING_SAMPLE_RATE >= 1) return true;
  if (MONITORING_SAMPLE_RATE <= 0) return false;
  return Math.random() <= MONITORING_SAMPLE_RATE;
}

function normalizeError(input) {
  if (input instanceof Error) {
    return {
      name: clampText(input.name || 'Error', 80),
      message: clampText(input.message || 'Unknown error', MAX_MESSAGE_LENGTH),
      stack: clampText(input.stack || '', MAX_STACK_LENGTH)
    };
  }

  return {
    name: 'NonError',
    message: clampText(input, MAX_MESSAGE_LENGTH),
    stack: ''
  };
}

function baseEvent(level, source, detail = {}) {
  return {
    type: 'frontend_event',
    level,
    source,
    appVersion: APP_VERSION,
    releaseChannel: APP_RELEASE_CHANNEL,
    url: typeof location !== 'undefined' ? clampText(location.pathname, 160) : '',
    userAgent: typeof navigator !== 'undefined' ? clampText(navigator.userAgent, 180) : '',
    occurredAt: new Date().toISOString(),
    detail: sanitizeMonitoringValue(detail)
  };
}

export function getMonitoringStatus() {
  return {
    enabled: hasMonitoringEndpoint(),
    endpointConfigured: Boolean(MONITORING_ENDPOINT),
    sampleRate: MONITORING_SAMPLE_RATE,
    ...monitoringState
  };
}

export function captureMessage(message, { level = 'info', source = 'app', detail = {} } = {}) {
  const event = baseEvent(level, source, {
    message: clampText(message, MAX_MESSAGE_LENGTH),
    ...detail
  });
  return dispatchMonitoringEvent(event);
}

export function captureException(error, { source = 'runtime', detail = {} } = {}) {
  const normalized = normalizeError(error);
  monitoringState.captured += 1;
  monitoringState.lastEventAt = new Date().toISOString();
  monitoringState.lastErrorName = normalized.name;

  const event = baseEvent('error', source, {
    error: normalized,
    ...detail
  });
  return dispatchMonitoringEvent(event);
}

function dispatchMonitoringEvent(event) {
  if (!shouldSample()) return Promise.resolve({ ok: true, sent: false, sampled: false });

  return sendMonitoringEvent(event)
    .then(result => {
      if (result.sent) monitoringState.sent += 1;
      return result;
    })
    .catch(error => {
      monitoringState.failed += 1;
      if (typeof console !== 'undefined') console.warn('monitoring_failed', error);
      return { ok: false, sent: false, error };
    });
}
