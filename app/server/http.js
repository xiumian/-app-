import { randomUUID } from 'node:crypto';
import { CORS_ORIGIN, MAX_BODY_BYTES } from './config.js';
import { logAccess, logError } from './logger.js';

export class HttpError extends Error {
  constructor(status, code, message, headers = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

function normalizeIncomingRequestId(value) {
  const text = String(value || '').trim();
  return /^[A-Za-z0-9_.:-]{6,96}$/.test(text) ? text : '';
}

export function createRequestContext(request) {
  const incoming = Array.isArray(request.headers['x-request-id'])
    ? request.headers['x-request-id'][0]
    : request.headers['x-request-id'];
  return {
    requestId: normalizeIncomingRequestId(incoming) || `req_${randomUUID()}`,
    startedAt: process.hrtime.bigint()
  };
}

export function attachRequestLogger(request, response, context) {
  response.once('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - context.startedAt) / 1_000_000;
    const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`);
    logAccess({
      requestId: context.requestId,
      method: request.method,
      path: url.pathname,
      statusCode: response.statusCode,
      durationMs: Math.round(durationMs),
      userAgent: String(request.headers['user-agent'] || '').slice(0, 160)
    });
  });
}

export function sendJson(response, status, payload, extraHeaders = {}, context = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Request-ID',
    'Access-Control-Expose-Headers': 'X-Request-ID,Retry-After',
    ...(context.requestId ? { 'X-Request-ID': context.requestId } : {}),
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
    Vary: 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
}

export function sendError(response, error, context = {}) {
  const status = error instanceof HttpError ? error.status : 500;
  const code = error instanceof HttpError ? error.code : 'INTERNAL_ERROR';
  const message = error instanceof HttpError ? error.message : '服务器内部错误';
  const headers = error instanceof HttpError ? error.headers : {};
  const requestId = context.requestId || `req_${randomUUID()}`;
  if (status >= 500) {
    logError({
      requestId,
      code,
      message: error.message || message
    });
  }
  sendJson(response, status, {
    code,
    message,
    requestId
  }, headers, { requestId });
}

export function sendOptions(response, context = {}) {
  sendJson(response, 204, null, {}, context);
}

export async function readJsonBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', '请求体过大');
    chunks.push(chunk);
  }

  if (!chunks.length) return {};
  const contentType = String(request.headers['content-type'] || '').toLowerCase();
  if (!contentType.split(';')[0].trim().endsWith('/json') && !contentType.includes('+json')) {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', '请求体必须使用 application/json');
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'JSON 格式不正确');
  }
}

export function requireText(value, label, max = 80) {
  const text = String(value == null ? '' : value).trim();
  if (!text) throw new HttpError(400, 'VALIDATION_ERROR', `${label}不能为空`);
  if (text.length > max) throw new HttpError(400, 'VALIDATION_ERROR', `${label}过长`);
  return text;
}
