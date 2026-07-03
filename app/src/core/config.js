const runtimeConfig = (
  typeof globalThis !== 'undefined'
  && globalThis.PET_COMPANION_CONFIG
  && typeof globalThis.PET_COMPANION_CONFIG === 'object'
) ? globalThis.PET_COMPANION_CONFIG : {};

function runtimeString(key, fallback) {
  const value = runtimeConfig[key];
  return typeof value === 'string' ? value.trim() : fallback;
}

function runtimeNumber(key, fallback, { min = 0, max = Number.POSITIVE_INFINITY } = {}) {
  const value = Number(runtimeConfig[key]);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

function runtimeBoolean(key, fallback) {
  return typeof runtimeConfig[key] === 'boolean' ? runtimeConfig[key] : fallback;
}

export const APP_VERSION = '0.4.0';
export const APP_BUILD_TARGET = 'h5-pwa';
export const APP_RELEASE_CHANNEL = runtimeString('APP_RELEASE_CHANNEL', 'local-production-ready');
export const APP_IS_PRODUCTION = APP_RELEASE_CHANNEL === 'production';
export const API_BASE_URL = runtimeString('API_BASE_URL', '');
export const API_TIMEOUT_MS = runtimeNumber('API_TIMEOUT_MS', 8000, { min: 1000, max: 30000 });
export const API_MOCK_FALLBACK = runtimeBoolean('API_MOCK_FALLBACK', true);
export const MONITORING_ENDPOINT = runtimeString('MONITORING_ENDPOINT', '');
export const MONITORING_SAMPLE_RATE = runtimeNumber('MONITORING_SAMPLE_RATE', 1, { min: 0, max: 1 });
export const OPERATOR_NAME = runtimeString('OPERATOR_NAME', '');
export const SUPPORT_CONTACT_LABEL = runtimeString('SUPPORT_CONTACT_LABEL', '');
export const SUPPORT_CONTACT_URL = runtimeString('SUPPORT_CONTACT_URL', '');
export const SUPPORT_EMAIL = runtimeString('SUPPORT_EMAIL', '');
export const RUNTIME_CONFIG_SOURCE = Object.keys(runtimeConfig).length ? 'runtime-config' : 'built-in-defaults';
