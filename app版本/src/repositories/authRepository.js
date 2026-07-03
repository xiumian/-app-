import { registerRemote, signInRemote, refreshRemoteSession, signOutRemote } from '../api/authClient.js';
import { findOrCreateUser } from '../domain/users.js';
import { clearSession, createLocalSession, getSessionStatus } from '../domain/sessions.js';

export const authRepository = {
  signInLocal({ state, uid, name, account }) {
    const user = findOrCreateUser({ state, uid, name, account });
    state.currentUserId = user.id;
    state.session = createLocalSession({ uid, user });
    return { user, session: state.session };
  },

  signOut({ state }) {
    state.currentUserId = null;
    state.session = clearSession();
  },

  status({ state }) {
    return getSessionStatus(state.session);
  },

  async signInRemote(credentials) {
    return signInRemote(credentials);
  },

  async registerRemote(credentials) {
    return registerRemote(credentials);
  },

  async refreshRemote(session) {
    return refreshRemoteSession(session);
  },

  async signOutRemote(session) {
    return signOutRemote(session);
  }
};
