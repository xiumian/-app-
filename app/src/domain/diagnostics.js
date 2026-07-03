import {
  API_BASE_URL,
  API_MOCK_FALLBACK,
  APP_BUILD_TARGET,
  APP_RELEASE_CHANNEL,
  APP_VERSION,
  MONITORING_ENDPOINT,
  RUNTIME_CONFIG_SOURCE
} from '../core/config.js';

export const SUPPORT_DIAGNOSTICS_VERSION = 1;

const DATA_KEYS = ['users', 'pets', 'reminders', 'records', 'photos', 'posts', 'checkins'];
const SENSITIVE_PATTERN = /token|password|cookie|secret|authorization|private[_-]?key|access[_-]?key/i;

export function countStateItems(state = {}) {
  return DATA_KEYS.reduce((counts, key) => {
    counts[key] = Array.isArray(state[key]) ? state[key].length : 0;
    return counts;
  }, {});
}

export function createSupportDiagnostics({
  state,
  storageStatus,
  monitoringStatus,
  sessionStatus,
  consentStatus,
  environment = {}
}) {
  return {
    diagnosticsVersion: SUPPORT_DIAGNOSTICS_VERSION,
    generatedAt: new Date().toISOString(),
    redaction: 'no user content, no credentials, no cookies',
    app: {
      version: APP_VERSION,
      buildTarget: APP_BUILD_TARGET,
      releaseChannel: APP_RELEASE_CHANNEL,
      runtimeConfigSource: RUNTIME_CONFIG_SOURCE,
      apiConfigured: Boolean(API_BASE_URL),
      mockFallback: Boolean(API_MOCK_FALLBACK),
      monitoringConfigured: Boolean(MONITORING_ENDPOINT)
    },
    environment: {
      path: environment.path || '',
      userAgent: clamp(environment.userAgent, 180),
      language: clamp(environment.language, 40),
      online: Boolean(environment.online)
    },
    storage: {
      sourceVersion: storageStatus?.sourceVersion ?? null,
      targetVersion: storageStatus?.targetVersion ?? null,
      migrated: Boolean(storageStatus?.migrated),
      recovered: Boolean(storageStatus?.recovered),
      remoteReady: Boolean(storageStatus?.remoteReady),
      backupReady: Boolean(storageStatus?.backupReady),
      repairedFields: Array.isArray(storageStatus?.repairedFields) ? [...storageStatus.repairedFields] : []
    },
    state: {
      schemaVersion: state?.schemaVersion ?? null,
      activeTab: state?.activeTab || '',
      carePanel: state?.carePanel || '',
      hasCurrentUser: Boolean(state?.currentUserId),
      hasSelectedPet: Boolean(state?.selectedPetId),
      counts: countStateItems(state)
    },
    session: {
      signedIn: Boolean(sessionStatus?.signedIn),
      authMode: sessionStatus?.authMode || 'none',
      remoteCredentialPresent: Boolean(sessionStatus?.hasToken),
      expiresAt: sessionStatus?.expiresAt || null
    },
    consent: {
      accepted: Boolean(consentStatus?.accepted),
      version: consentStatus?.version || '',
      acceptedAt: consentStatus?.acceptedAt || null,
      source: consentStatus?.source || null
    },
    monitoring: {
      enabled: Boolean(monitoringStatus?.enabled),
      endpointConfigured: Boolean(monitoringStatus?.endpointConfigured),
      sampleRate: monitoringStatus?.sampleRate ?? null,
      captured: monitoringStatus?.captured ?? 0,
      sent: monitoringStatus?.sent ?? 0,
      failed: monitoringStatus?.failed ?? 0,
      lastEventAt: monitoringStatus?.lastEventAt || null,
      lastErrorName: monitoringStatus?.lastErrorName || ''
    }
  };
}

export function assertSupportDiagnosticsSafe(payload) {
  const unsafe = [];
  scan(payload, [], unsafe);
  return { safe: unsafe.length === 0, unsafe };
}

function scan(value, path, unsafe) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scan(item, [...path, String(index)], unsafe));
    return;
  }

  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_PATTERN.test(key)) unsafe.push([...path, key].join('.'));
      scan(child, [...path, key], unsafe);
    }
    return;
  }

  if (typeof value === 'string' && /(pat_|prt_|Bearer\s+|password|cookie=|PRIVATE KEY)/i.test(value)) {
    unsafe.push(path.join('.'));
  }
}

function clamp(value, max) {
  const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
