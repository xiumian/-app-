export const APP_STATE_KEY = 'pet_companion_state_v3';
export const LEGACY_STATE_KEYS = ['pet_companion_state_v2', 'pet_companion_state_v1'];
export const RECOVERY_PREFIX = 'pet_companion_recovery_';

let storageStatus = {
  sourceKey: null,
  recovered: false,
  backupKey: null,
  error: null
};

export function getStorageStatus() {
  return { ...storageStatus };
}

export function loadAppState() {
  storageStatus = { sourceKey: null, recovered: false, backupKey: null, error: null };

  for (const key of [APP_STATE_KEY, ...LEGACY_STATE_KEYS]) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;

    try {
      storageStatus.sourceKey = key;
      return JSON.parse(raw) || {};
    } catch (error) {
      const backupKey = `${RECOVERY_PREFIX}${Date.now()}`;
      try {
        localStorage.setItem(backupKey, raw);
      } catch {}
      localStorage.removeItem(key);
      storageStatus = {
        sourceKey: key,
        recovered: true,
        backupKey,
        error: error instanceof Error ? error.message : 'parse_failed'
      };
    }
  }

  return {};
}

export function saveAppState(state) {
  localStorage.setItem(APP_STATE_KEY, JSON.stringify(state));
  for (const key of LEGACY_STATE_KEYS) localStorage.removeItem(key);
}

export function clearAppState() {
  localStorage.removeItem(APP_STATE_KEY);
  for (const key of LEGACY_STATE_KEYS) localStorage.removeItem(key);
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(RECOVERY_PREFIX)) localStorage.removeItem(key);
  }
}
