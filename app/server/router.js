import { readDb, updateDb } from './storage.js';
import { attachRequestLogger, createRequestContext, readJsonBody, sendError, sendJson, sendOptions, HttpError } from './http.js';
import { deleteAccount, exportAccountData, refreshSession, register, requireAuth, signIn, signOut } from './auth.js';
import { createBackup, getState, listBackups, putState, restoreBackup } from './state.js';
import { deleteMedia, deleteUserMedia, mediaKeyFromUrl, readLocalMedia, uploadMedia } from './media.js';
import { assertRateLimit } from './rateLimit.js';
import { getHealth, getReadiness } from './health.js';
import { MONITORING_RATE_LIMIT_MAX, MONITORING_RATE_LIMIT_WINDOW_MS } from './config.js';

function routeKey(method, pathname) {
  return `${method} ${pathname}`;
}

const MONITORING_SENSITIVE_KEY = /token|password|cookie|secret|authorization|private[_-]?key|access[_-]?key|refresh[_-]?key/i;
const MONITORING_SENSITIVE_VALUE = /pat_|prt_|Bearer\s+|password|cookie=|PRIVATE KEY|AKIA[0-9A-Z]{16}/i;

function sanitizeMonitoringValue(value, depth = 0) {
  if (depth > 4) return '[truncated]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    const text = value.replace(/\s+/g, ' ').trim().slice(0, 500);
    return MONITORING_SENSITIVE_VALUE.test(text) ? '[redacted]' : text;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map(item => sanitizeMonitoringValue(item, depth + 1));
  if (typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value).slice(0, 40)) {
      output[key] = MONITORING_SENSITIVE_KEY.test(key) ? '[redacted]' : sanitizeMonitoringValue(item, depth + 1);
    }
    return output;
  }
  return String(value).slice(0, 120);
}

function trimMonitoringEvent(event) {
  return {
    type: String(event?.type || 'frontend_event').slice(0, 80),
    level: String(event?.level || 'info').slice(0, 20),
    source: String(event?.source || 'client').slice(0, 80),
    appVersion: String(event?.appVersion || '').slice(0, 40),
    occurredAt: event?.occurredAt || new Date().toISOString(),
    detail: event?.detail && typeof event.detail === 'object' ? sanitizeMonitoringValue(event.detail) : {}
  };
}

function collectMediaKeysFromValue(value, output = new Set()) {
  if (typeof value === 'string') {
    const key = mediaKeyFromUrl(value);
    if (key) output.add(key);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectMediaKeysFromValue(item, output));
    return output;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach(item => collectMediaKeysFromValue(item, output));
  }
  return output;
}

function collectAccountMediaKeys(db, user) {
  const keys = new Set();
  collectMediaKeysFromValue(db.states[user.id], keys);
  collectMediaKeysFromValue(db.backups[user.id], keys);
  return [...keys];
}

export async function handleRequest(request, response) {
  const context = createRequestContext(request);
  attachRequestLogger(request, response, context);
  try {
    if (request.method === 'OPTIONS') {
      sendOptions(response, context);
      return;
    }

    const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`);
    const key = routeKey(request.method, url.pathname);

    if (key === 'GET /health') {
      sendJson(response, 200, getHealth(), {}, context);
      return;
    }

    if (key === 'GET /ready') {
      const result = await getReadiness();
      sendJson(response, result.status, result.body, {}, context);
      return;
    }

    if (key === 'POST /auth/sign-in') {
      assertRateLimit(request, 'auth:sign-in');
      const body = await readJsonBody(request);
      const result = await updateDb(db => signIn(db, body));
      sendJson(response, 200, result, {}, context);
      return;
    }

    if (key === 'POST /auth/register') {
      assertRateLimit(request, 'auth:register');
      const body = await readJsonBody(request);
      const result = await updateDb(db => register(db, body));
      sendJson(response, 201, result, {}, context);
      return;
    }

    if (key === 'POST /auth/refresh') {
      assertRateLimit(request, 'auth:refresh');
      const body = await readJsonBody(request);
      const result = await updateDb(db => refreshSession(db, body));
      sendJson(response, 200, result, {}, context);
      return;
    }

    if (key === 'POST /auth/sign-out') {
      assertRateLimit(request, 'auth:sign-out');
      const body = await readJsonBody(request);
      const result = await updateDb(db => signOut(db, body));
      sendJson(response, 200, result, {}, context);
      return;
    }

    if (key === 'GET /account/export') {
      const db = await readDb();
      const { user } = requireAuth(db, request);
      sendJson(response, 200, exportAccountData(db, user), {}, context);
      return;
    }

    if (key === 'DELETE /account') {
      assertRateLimit(request, 'account:delete');
      const db = await readDb();
      const { user } = requireAuth(db, request);
      const mediaKeys = collectAccountMediaKeys(db, user);
      const body = await readJsonBody(request);
      const result = await updateDb(db => {
        const { user } = requireAuth(db, request);
        return deleteAccount(db, user, body);
      });
      const media = await deleteUserMedia({ user, keys: mediaKeys });
      sendJson(response, 200, { ...result, media }, {}, context);
      return;
    }

    if (key === 'POST /monitoring/events') {
      assertRateLimit(request, 'monitoring:events', { max: MONITORING_RATE_LIMIT_MAX, windowMs: MONITORING_RATE_LIMIT_WINDOW_MS });
      const body = trimMonitoringEvent(await readJsonBody(request));
      const result = await updateDb(db => {
        db.monitoringEvents.push({ ...body, receivedAt: new Date().toISOString() });
        db.monitoringEvents = db.monitoringEvents.slice(-300);
        return { ok: true };
      });
      sendJson(response, 200, result, {}, context);
      return;
    }

    if (url.pathname === '/media/uploads' && request.method === 'POST') {
      const db = await readDb();
      const { user } = requireAuth(db, request);
      const body = await readJsonBody(request);
      const result = await uploadMedia({ user, body });
      sendJson(response, 201, result, {}, context);
      return;
    }

    const mediaMatch = url.pathname.match(/^\/media\/files\/(.+)$/);
    if (mediaMatch && request.method === 'GET') {
      const media = await readLocalMedia(mediaMatch[1]);
      response.writeHead(200, {
        'Content-Type': media.mimeType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'X-Request-ID',
        ...(context.requestId ? { 'X-Request-ID': context.requestId } : {}),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'Cross-Origin-Opener-Policy': 'same-origin'
      });
      response.end(media.buffer);
      return;
    }

    if (mediaMatch && request.method === 'DELETE') {
      const db = await readDb();
      const { user } = requireAuth(db, request);
      const result = await deleteMedia({ user, key: mediaMatch[1] });
      sendJson(response, 200, result, {}, context);
      return;
    }

    if (url.pathname === '/app-state' && request.method === 'GET') {
      const db = await readDb();
      const { user } = requireAuth(db, request);
      sendJson(response, 200, getState(db, user), {}, context);
      return;
    }

    if (url.pathname === '/app-state' && request.method === 'PUT') {
      requireAuth(await readDb(), request);
      const body = await readJsonBody(request);
      const result = await updateDb(db => {
        const { user } = requireAuth(db, request);
        return putState(db, user, body);
      });
      sendJson(response, 200, result, {}, context);
      return;
    }

    if (url.pathname === '/app-state/backups' && request.method === 'GET') {
      const db = await readDb();
      const { user } = requireAuth(db, request);
      sendJson(response, 200, listBackups(db, user), {}, context);
      return;
    }

    if (url.pathname === '/app-state/backups' && request.method === 'POST') {
      requireAuth(await readDb(), request);
      const body = await readJsonBody(request);
      const result = await updateDb(db => {
        const { user } = requireAuth(db, request);
        return createBackup(db, user, body);
      });
      sendJson(response, 200, result, {}, context);
      return;
    }

    const restoreMatch = url.pathname.match(/^\/app-state\/backups\/([^/]+)\/restore$/);
    if (restoreMatch && request.method === 'POST') {
      const backupId = decodeURIComponent(restoreMatch[1]);
      const result = await updateDb(db => {
        const { user } = requireAuth(db, request);
        return restoreBackup(db, user, backupId);
      });
      sendJson(response, 200, result, {}, context);
      return;
    }

    throw new HttpError(404, 'NOT_FOUND', '接口不存在');
  } catch (error) {
    sendError(response, error, context);
  }
}
