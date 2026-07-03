import { API_TIMEOUT_MS, MONITORING_ENDPOINT } from '../core/config.js';

export function hasMonitoringEndpoint() {
  return Boolean(MONITORING_ENDPOINT);
}

export async function sendMonitoringEvent(event) {
  if (!hasMonitoringEndpoint()) {
    return { ok: true, sent: false, disabled: true };
  }

  const body = JSON.stringify(event);

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const sent = navigator.sendBeacon(MONITORING_ENDPOINT, new Blob([body], { type: 'application/json' }));
    if (sent) return { ok: true, sent: true, transport: 'beacon' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(MONITORING_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
      keepalive: true
    });
    return { ok: response.ok, sent: true, status: response.status, transport: 'fetch' };
  } finally {
    clearTimeout(timeoutId);
  }
}
