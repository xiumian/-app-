export function findOrCreateUser({ state, uid, name, account }) {
  const normalizedName = String(name || '').trim();
  const normalizedAccount = String(account || '').trim();
  let user = state.users.find(item => item.account === normalizedAccount);

  if (!user) {
    user = {
      id: uid('u'),
      name: normalizedName,
      account: normalizedAccount,
      createdAt: new Date().toISOString()
    };
    state.users.push(user);
  } else {
    user.name = normalizedName || user.name;
  }

  return user;
}

export function upsertRemoteUser({ state, user }) {
  const remoteUser = {
    id: String(user?.id || '').trim(),
    name: String(user?.name || '').trim(),
    account: String(user?.account || '').trim(),
    createdAt: user?.createdAt || new Date().toISOString()
  };

  if (!remoteUser.id || !remoteUser.account) {
    throw new Error('远端用户数据不完整');
  }

  const index = state.users.findIndex(item => item.id === remoteUser.id || item.account === remoteUser.account);
  if (index >= 0) {
    state.users[index] = { ...state.users[index], ...remoteUser };
    return state.users[index];
  }

  state.users.push(remoteUser);
  return remoteUser;
}
