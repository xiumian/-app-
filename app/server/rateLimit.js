import { AUTH_RATE_LIMIT_MAX, AUTH_RATE_LIMIT_WINDOW_MS, TRUST_PROXY } from './config.js';
import { HttpError } from './http.js';

const buckets = new Map();

function clientIp(request) {
  const forwarded = TRUST_PROXY ? String(request.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  return forwarded || request.socket?.remoteAddress || 'unknown';
}

function bucketKey(request, scope) {
  return `${scope}:${clientIp(request)}`;
}

function cleanExpired(now) {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function assertRateLimit(request, scope, { max = AUTH_RATE_LIMIT_MAX, windowMs = AUTH_RATE_LIMIT_WINDOW_MS } = {}) {
  if (max <= 0 || windowMs <= 0) return;

  const now = Date.now();
  cleanExpired(now);

  const key = bucketKey(request, scope);
  const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }

  bucket.count += 1;
  buckets.set(key, bucket);

  if (bucket.count > max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    throw new HttpError(429, 'RATE_LIMITED', '请求过于频繁，请稍后再试', {
      'Retry-After': String(retryAfterSeconds)
    });
  }
}

export function resetRateLimits() {
  buckets.clear();
}
