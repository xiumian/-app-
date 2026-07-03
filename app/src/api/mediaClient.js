import { apiRequest, hasRemoteApi } from './client.js';

function authHeaders(session) {
  return session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {};
}

export function hasRemoteMediaApi() {
  return hasRemoteApi();
}

export async function uploadRemoteMedia({ dataUrl, fileName = '', title = '' }, session) {
  const response = await apiRequest('/media/uploads', {
    method: 'POST',
    headers: authHeaders(session),
    body: { dataUrl, fileName, title }
  });
  return response.data;
}

export function mediaUrlToDeletePath(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('data:')) return '';

  try {
    const url = raw.startsWith('/') ? new URL(raw, 'https://local.invalid') : new URL(raw);
    const localMatch = url.pathname.match(/^\/media\/files\/(.+)$/);
    if (localMatch) return `/media/files/${localMatch[1]}`;
    if (url.protocol === 'https:' && url.pathname.length > 1) {
      return `/media/files/${url.pathname.slice(1).split('/').map(encodeURIComponent).join('/')}`;
    }
    return '';
  } catch {
    return raw.startsWith('/media/files/') ? raw : '';
  }
}

export async function deleteRemoteMedia({ url }, session) {
  const path = mediaUrlToDeletePath(url);
  if (!path) return { ok: true, skipped: true };
  const response = await apiRequest(path, {
    method: 'DELETE',
    headers: authHeaders(session)
  });
  return response.data;
}
