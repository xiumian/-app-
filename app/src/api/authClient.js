import { apiRequest } from './client.js';

export async function registerRemote(credentials) {
  return apiRequest('/auth/register', { method: 'POST', body: credentials });
}

export async function signInRemote(credentials) {
  return apiRequest('/auth/sign-in', { method: 'POST', body: credentials });
}

export async function refreshRemoteSession(session) {
  return apiRequest('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: session?.refreshToken || null }
  });
}

export async function signOutRemote(session) {
  return apiRequest('/auth/sign-out', {
    method: 'POST',
    body: { refreshToken: session?.refreshToken || null }
  });
}
