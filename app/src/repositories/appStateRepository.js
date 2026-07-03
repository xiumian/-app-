import { clearAppState, getStorageStatus, loadAppState, saveAppState } from '../api/localStore.js';
import {
  createRemoteBackup as postRemoteBackup,
  fetchRemoteState,
  hasRemoteStateApi,
  listRemoteBackups as fetchRemoteBackups,
  restoreRemoteBackup as requestRemoteBackupRestore,
  saveRemoteState
} from '../api/appStateClient.js';
import { createStateBackup, sanitizeStateForBackup, sanitizeStateForRestore, validateStateBackup } from '../domain/backups.js';

function sanitizeRemoteStateResult(result) {
  if (!result || typeof result !== 'object') return result;
  if (result.state) return { ...result, state: sanitizeStateForRestore(result.state) };
  if (result.backup?.state) {
    return {
      ...result,
      backup: {
        ...result.backup,
        state: sanitizeStateForRestore(result.backup.state)
      }
    };
  }
  return result;
}

export const appStateRepository = {
  load() {
    return loadAppState();
  },

  save(state) {
    saveAppState(state);
  },

  clear() {
    clearAppState();
  },

  status() {
    return {
      ...getStorageStatus(),
      remoteReady: hasRemoteStateApi(),
      backupReady: hasRemoteStateApi()
    };
  },

  async pullRemote(session) {
    return sanitizeRemoteStateResult(await fetchRemoteState(session));
  },

  async pushRemote(state) {
    return saveRemoteState(sanitizeStateForBackup(state), state?.session);
  },

  createLocalBackup(state) {
    return createStateBackup(state);
  },

  async createRemoteBackup(state) {
    return postRemoteBackup(createStateBackup(state), state?.session);
  },

  async listRemoteBackups(session) {
    return fetchRemoteBackups(session);
  },

  async restoreRemoteBackup(backupId, session) {
    return sanitizeRemoteStateResult(await requestRemoteBackupRestore(backupId, session));
  },

  validateBackup(payload) {
    return validateStateBackup(payload);
  }
};
