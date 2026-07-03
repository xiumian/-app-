import { createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { ACCESS_TOKEN_TTL_MS, AUTH_SECRET, REFRESH_TOKEN_TTL_MS } from './config.js';
import { HttpError, requireText } from './http.js';
import { sanitizeState } from './state.js';

const PASSWORD_KEY_LENGTH = 64;

function nowIso() {
  return new Date().toISOString();
}

function expiryIso() {
  return new Date(Date.now() + ACCESS_TOKEN_TTL_MS).toISOString();
}

function refreshExpiryIso() {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();
}

export function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    account: user.account,
    createdAt: user.createdAt
  };
}

function publicSession(session) {
  return {
    authMode: 'remote',
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
    refreshExpiresAt: session.refreshExpiresAt
  };
}

function hashToken(token) {
  if (AUTH_SECRET) return createHmac('sha256', AUTH_SECRET).update(token).digest('hex');
  return createHash('sha256').update(token).digest('hex');
}

function tokenHashEqual(leftHash, rightHash) {
  const left = Buffer.from(String(leftHash || ''), 'hex');
  const right = Buffer.from(String(rightHash || ''), 'hex');
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

function normalizeAccount(value) {
  return requireText(value, '账号', 80).toLowerCase();
}

function requirePassword(value) {
  const password = requireText(value, '密码', 128);
  if (password.length < 8) throw new HttpError(400, 'VALIDATION_ERROR', '密码至少需要 8 位');
  return password;
}

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [algorithm, salt, hash] = String(storedHash || '').split(':');
  if (algorithm !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = Buffer.from(hashPassword(password, salt).split(':')[2], 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function exportAccountData(db, user) {
  const backups = Array.isArray(db.backups[user.id]) ? db.backups[user.id] : [];
  return {
    exportVersion: 1,
    exportedAt: nowIso(),
    user: publicUser(user),
    state: db.states[user.id] ? sanitizeState(db.states[user.id]) : null,
    backups: backups.map(backup => ({
      ...backup,
      state: sanitizeState(backup.state)
    }))
  };
}

export function deleteAccount(db, user, payload) {
  const password = requirePassword(payload.password);
  if (!verifyPassword(password, user.passwordHash)) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', '账号或密码不正确');
  }

  db.users = db.users.filter(item => item.id !== user.id);
  db.sessions = db.sessions.filter(item => item.userId !== user.id);
  delete db.states[user.id];
  delete db.backups[user.id];
  return { ok: true, deletedAt: nowIso() };
}

function createSession(db, user) {
  const accessToken = `pat_${randomUUID()}`;
  const refreshToken = `prt_${randomUUID()}`;
  const session = {
    userId: user.id,
    accessTokenHash: hashToken(accessToken),
    refreshTokenHash: hashToken(refreshToken),
    expiresAt: expiryIso(),
    refreshExpiresAt: refreshExpiryIso(),
    createdAt: nowIso()
  };
  db.sessions = db.sessions.filter(item => item.userId !== user.id);
  db.sessions.push(session);
  return { user: publicUser(user), session: publicSession({ ...session, accessToken, refreshToken }) };
}

export function register(db, payload) {
  const account = normalizeAccount(payload.account);
  const name = requireText(payload.name || '主人', '昵称', 40);
  const password = requirePassword(payload.password);

  if (db.users.some(item => item.account === account)) {
    throw new HttpError(409, 'ACCOUNT_EXISTS', '账号已存在');
  }

  const user = {
    id: `usr_${randomUUID()}`,
    account,
    name,
    passwordHash: hashPassword(password),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  db.users.push(user);
  return createSession(db, user);
}

export function signIn(db, payload) {
  const account = requireText(payload.account, '账号', 80);
  const password = requirePassword(payload.password);

  const user = db.users.find(item => item.account === account.toLowerCase());
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', '账号或密码不正确');
  }

  user.updatedAt = nowIso();
  return createSession(db, user);
}

export function refreshSession(db, payload) {
  const refreshToken = requireText(payload.refreshToken, 'refreshToken', 160);
  const refreshTokenHash = hashToken(refreshToken);
  const session = db.sessions.find(item => tokenHashEqual(item.refreshTokenHash, refreshTokenHash));
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', '登录已失效');
  if (!session.refreshExpiresAt || new Date(session.refreshExpiresAt).getTime() <= Date.now()) {
    throw new HttpError(401, 'UNAUTHORIZED', '登录已失效');
  }

  const accessToken = `pat_${randomUUID()}`;
  const nextRefreshToken = `prt_${randomUUID()}`;
  session.accessTokenHash = hashToken(accessToken);
  session.refreshTokenHash = hashToken(nextRefreshToken);
  session.expiresAt = expiryIso();
  session.refreshExpiresAt = refreshExpiryIso();
  return publicSession({ ...session, accessToken, refreshToken: nextRefreshToken });
}

export function signOut(db, payload) {
  const refreshToken = requireText(payload.refreshToken, 'refreshToken', 160);
  const refreshTokenHash = hashToken(refreshToken);
  db.sessions = db.sessions.filter(item => !tokenHashEqual(item.refreshTokenHash, refreshTokenHash));
  return { ok: true };
}

export function requireAuth(db, request) {
  const header = request.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'UNAUTHORIZED', '请先登录');

  const accessTokenHash = hashToken(token);
  const session = db.sessions.find(item => tokenHashEqual(item.accessTokenHash, accessTokenHash));
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
    throw new HttpError(401, 'UNAUTHORIZED', '登录已失效');
  }

  const user = db.users.find(item => item.id === session.userId);
  if (!user) throw new HttpError(401, 'UNAUTHORIZED', '用户不存在');

  return { user, session };
}
