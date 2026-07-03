export const SESSION_VERSION = 1;

export function createLocalSession({ uid, user, authMode = 'local' }) {
  return {
    sessionVersion: SESSION_VERSION,
    id: uid('sess'),
    userId: user.id,
    authMode,
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    refreshExpiresAt: null,
    profile: {
      id: user.id,
      name: user.name,
      account: user.account
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function createMigratedLocalSession({ userId }) {
  return {
    sessionVersion: SESSION_VERSION,
    id: `sess_${userId}`,
    userId,
    authMode: 'local',
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    refreshExpiresAt: null,
    profile: { id: userId },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function createRemoteSession({ uid, user, session }) {
  return {
    sessionVersion: SESSION_VERSION,
    id: uid('sess'),
    userId: user.id,
    authMode: 'remote',
    accessToken: session?.accessToken || null,
    refreshToken: session?.refreshToken || null,
    expiresAt: session?.expiresAt || null,
    refreshExpiresAt: session?.refreshExpiresAt || null,
    profile: {
      id: user.id,
      name: user.name,
      account: user.account
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function clearSession() {
  return null;
}

export function getSessionStatus(session) {
  if (!session) return { signedIn: false, authMode: 'none', expiresAt: null, refreshExpiresAt: null, hasToken: false };
  return {
    signedIn: Boolean(session.userId),
    authMode: session.authMode || 'local',
    expiresAt: session.expiresAt || null,
    refreshExpiresAt: session.refreshExpiresAt || null,
    hasToken: Boolean(session.accessToken)
  };
}
