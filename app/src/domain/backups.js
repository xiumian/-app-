import { APP_VERSION } from '../core/config.js';
import { migrateState } from '../core/migrations.js';

export const BACKUP_VERSION = 1;

const DATA_KEYS = ['users', 'pets', 'reminders', 'records', 'photos', 'posts', 'checkins', 'reports'];

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function stripBackupOnlyFields(snapshot) {
  snapshot.ui = { sheet: null, detailPetId: null };

  if (snapshot.session) {
    snapshot.session.accessToken = null;
    snapshot.session.refreshToken = null;
  }

  for (const key of DATA_KEYS) {
    if (!Array.isArray(snapshot[key])) snapshot[key] = [];
  }

  return snapshot;
}

export function sanitizeStateForRestore(state) {
  const migrated = migrateState(state || {}).state;
  return stripBackupOnlyFields(cloneJson(migrated));
}

export function sanitizeStateForBackup(state) {
  return sanitizeStateForRestore(state);
}

export function countBackupItems(state) {
  return DATA_KEYS.reduce((counts, key) => {
    counts[key] = Array.isArray(state[key]) ? state[key].length : 0;
    return counts;
  }, {});
}

export function createStateBackup(state, { createdAt = new Date().toISOString(), appVersion = APP_VERSION } = {}) {
  const snapshot = sanitizeStateForBackup(state);
  return {
    backupVersion: BACKUP_VERSION,
    appVersion,
    schemaVersion: snapshot.schemaVersion,
    createdAt,
    counts: countBackupItems(snapshot),
    state: snapshot
  };
}

export function validateStateBackup(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (payload.backupVersion !== BACKUP_VERSION) return false;
  if (!payload.state || typeof payload.state !== 'object' || Array.isArray(payload.state)) return false;
  return DATA_KEYS.every(key => Array.isArray(payload.state[key]));
}

export function summarizeStateBackup(payload) {
  if (!validateStateBackup(payload)) {
    return { valid: false, label: '备份不可用', counts: {} };
  }

  return {
    valid: true,
    label: `v${payload.appVersion || '-'} · Schema v${payload.schemaVersion || '-'}`,
    createdAt: payload.createdAt || '',
    counts: payload.counts || countBackupItems(payload.state)
  };
}
