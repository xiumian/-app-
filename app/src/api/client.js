import { API_BASE_URL, API_MOCK_FALLBACK, API_TIMEOUT_MS } from '../core/config.js';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'API_ERROR', detail = null, retryAfterSeconds = null, requestId = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.retryAfterSeconds = retryAfterSeconds;
    this.requestId = requestId;
  }
}

export function hasRemoteApi() {
  return Boolean(API_BASE_URL);
}

function createClientRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `web_${crypto.randomUUID()}`;
  return `web_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function withRequestIdHeader(headers) {
  const hasRequestId = Object.keys(headers).some(key => key.toLowerCase() === 'x-request-id');
  return hasRequestId ? headers : { 'X-Request-ID': createClientRequestId(), ...headers };
}

function readRequestIdHeader(headers) {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === 'x-request-id');
  return entry ? String(entry[1] || '') : '';
}

export async function apiRequest(path, { method = 'GET', body = null, headers = {} } = {}) {
  if (!hasRemoteApi()) {
    if (API_MOCK_FALLBACK) return { ok: true, mocked: true, data: null };
    throw new ApiError('未配置 API 地址', { code: 'API_NOT_CONFIGURED' });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const requestHeaders = {
    'Content-Type': 'application/json',
    ...withRequestIdHeader(headers)
  };
  const clientRequestId = readRequestIdHeader(requestHeaders);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: requestHeaders,
      body: body == null ? null : JSON.stringify(body),
      signal: controller.signal
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();

    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const requestId = response.headers.get('x-request-id') || payload?.requestId || clientRequestId;
      throw new ApiError(payload?.message || 'API 请求失败', {
        status: response.status,
        code: payload?.code || 'HTTP_ERROR',
        detail: payload,
        retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
        requestId
      });
    }

    return { ok: true, mocked: false, data: payload };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new ApiError('API 请求超时', { code: 'API_TIMEOUT', requestId: clientRequestId });
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError('API 网络异常', { code: 'NETWORK_ERROR', detail: error.message, requestId: clientRequestId });
  } finally {
    clearTimeout(timeoutId);
  }
}
