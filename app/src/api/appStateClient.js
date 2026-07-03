import { apiRequest, hasRemoteApi } from './client.js';

const STATE_PATH = '/app-state';
const BACKUP_PATH = '/app-state/backups';

function authHeaders(session) {
  return session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {};
}

export function hasRemoteStateApi() {
  return hasRemoteApi();
}

export async function fetchRemoteState(session) {
  const response = await apiRequest(STATE_PATH, { headers: authHeaders(session) });
  return response.data;
}

export async function saveRemoteState(state, session = state?.session) {
  const response = await apiRequest(STATE_PATH, { method: 'PUT', body: { state }, headers: authHeaders(session) });
  return response.data;
}

export async function createRemoteBackup(backup, session) {
  const response = await apiRequest(BACKUP_PATH, { method: 'POST', body: backup, headers: authHeaders(session) });
  return response.data;
}

export async function listRemoteBackups(session) {
  const response = await apiRequest(BACKUP_PATH, { headers: authHeaders(session) });
  return response.data || [];
}

export async function restoreRemoteBackup(backupId, session) {
  const response = await apiRequest(`${BACKUP_PATH}/${encodeURIComponent(backupId)}/restore`, { method: 'POST', headers: authHeaders(session) });
  return response.data;
}
