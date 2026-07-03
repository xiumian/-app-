import { ApiError } from '../api/client.js';

export function mergeRefreshedSession(currentSession, refreshedSession) {
  if (!refreshedSession?.accessToken) throw new Error('远端会话刷新失败');
  return {
    ...currentSession,
    accessToken: refreshedSession.accessToken,
    refreshToken: refreshedSession.refreshToken || currentSession?.refreshToken || null,
    expiresAt: refreshedSession.expiresAt || currentSession?.expiresAt || null,
    refreshExpiresAt: refreshedSession.refreshExpiresAt || currentSession?.refreshExpiresAt || null,
    updatedAt: new Date().toISOString()
  };
}

export async function runWithRemoteRefresh({ getSession, refreshSession, saveSession, operation }) {
  try {
    return await operation();
  } catch (error) {
    const session = getSession();
    if (!(error instanceof ApiError) || error.status !== 401 || !session?.refreshToken) {
      throw error;
    }

    const refreshed = await refreshSession(session);
    const nextSession = mergeRefreshedSession(session, refreshed?.data || refreshed);
    saveSession(nextSession);
    return operation();
  }
}
