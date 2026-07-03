import { apiRequest, hasRemoteApi } from './client.js';

function authHeaders(session) {
  return session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {};
}

export function hasRemoteAccountApi() {
  return hasRemoteApi();
}

export async function exportRemoteAccount(session) {
  const response = await apiRequest('/account/export', { headers: authHeaders(session) });
  return response.data;
}

export async function deleteRemoteAccount({ session, password }) {
  const response = await apiRequest('/account', {
    method: 'DELETE',
    body: { password },
    headers: authHeaders(session)
  });
  return response.data;
}
