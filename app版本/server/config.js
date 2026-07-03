import { isAbsolute, join, resolve } from 'node:path';

const DAY_MS = 24 * 60 * 60 * 1000;

export const SERVER_PORT = Number(process.env.PET_SERVER_PORT || 8787);
export const SERVER_HOST = process.env.PET_SERVER_HOST || '127.0.0.1';
export const DATA_DIR = resolve(process.env.PET_SERVER_DATA_DIR || 'server-data');
export const ACCESS_TOKEN_TTL_MS = Number(process.env.PET_ACCESS_TOKEN_TTL_MS || 7 * DAY_MS);
export const REFRESH_TOKEN_TTL_MS = Number(process.env.PET_REFRESH_TOKEN_TTL_MS || 30 * DAY_MS);
export const AUTH_SECRET = String(process.env.PET_AUTH_SECRET || '').trim();
export const CORS_ORIGIN = process.env.PET_CORS_ORIGIN || '*';
export const MAX_BODY_BYTES = Number(process.env.PET_MAX_BODY_BYTES || 2 * 1024 * 1024);
export const AUTH_RATE_LIMIT_WINDOW_MS = Number(process.env.PET_AUTH_RATE_LIMIT_WINDOW_MS || 5 * 60 * 1000);
export const AUTH_RATE_LIMIT_MAX = Number(process.env.PET_AUTH_RATE_LIMIT_MAX || 30);
export const TRUST_PROXY = String(process.env.PET_TRUST_PROXY || 'false').trim().toLowerCase() === 'true';
export const MONITORING_RATE_LIMIT_WINDOW_MS = Number(process.env.PET_MONITORING_RATE_LIMIT_WINDOW_MS || 60 * 1000);
export const MONITORING_RATE_LIMIT_MAX = Number(process.env.PET_MONITORING_RATE_LIMIT_MAX || 120);
export const BACKUP_RETENTION_MAX = Number(process.env.PET_BACKUP_RETENTION_MAX || 20);
export const SERVER_REQUEST_TIMEOUT_MS = Number(process.env.PET_SERVER_REQUEST_TIMEOUT_MS || 30 * 1000);
export const SERVER_HEADERS_TIMEOUT_MS = Number(process.env.PET_SERVER_HEADERS_TIMEOUT_MS || 15 * 1000);
export const SERVER_KEEP_ALIVE_TIMEOUT_MS = Number(process.env.PET_SERVER_KEEP_ALIVE_TIMEOUT_MS || 5 * 1000);
export const SERVER_LOG_LEVEL = process.env.PET_SERVER_LOG_LEVEL || 'info';
export const STORAGE_DRIVER = String(process.env.PET_STORAGE_DRIVER || 'json').trim().toLowerCase() || 'json';
export const SQLITE_FILE = resolve(process.env.PET_SQLITE_FILE || join(DATA_DIR, 'pet-companion.sqlite'));
export const MEDIA_STORAGE_DRIVER = String(process.env.PET_MEDIA_STORAGE_DRIVER || 'local').trim().toLowerCase() || 'local';
export const MEDIA_LOCAL_DIR = resolve(process.env.PET_MEDIA_LOCAL_DIR || join(DATA_DIR, 'media'));
export const MEDIA_PUBLIC_BASE_URL = String(process.env.PET_MEDIA_PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
export const MEDIA_S3_ENDPOINT = String(process.env.PET_MEDIA_S3_ENDPOINT || '').trim().replace(/\/$/, '');
export const MEDIA_S3_REGION = String(process.env.PET_MEDIA_S3_REGION || '').trim();
export const MEDIA_S3_BUCKET = String(process.env.PET_MEDIA_S3_BUCKET || '').trim();
export const MEDIA_S3_PREFIX = String(process.env.PET_MEDIA_S3_PREFIX || 'pet-media').trim().replace(/^\/+|\/+$/g, '');
export const MEDIA_S3_ACCESS_KEY_ID = String(process.env.PET_MEDIA_S3_ACCESS_KEY_ID || '').trim();
export const MEDIA_S3_SECRET_ACCESS_KEY = String(process.env.PET_MEDIA_S3_SECRET_ACCESS_KEY || '').trim();
export const MEDIA_MAX_BYTES = Number(process.env.PET_MEDIA_MAX_BYTES || 1.5 * 1024 * 1024);

function env(envSource, name) {
  return String(envSource[name] || '').trim();
}

function numberEnv(envSource, name, fallback) {
  const raw = env(envSource, name);
  return raw ? Number(raw) : fallback;
}

function isHttpsOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value.replace(/\/$/, '');
  } catch {
    return false;
  }
}

function hasPlaceholderValue(value) {
  return /(example(?:\.com)?|placeholder|todo|\u5f85\u5b9a|\u793a\u4f8b)/i.test(String(value || ''));
}

export function getServerRuntimeChecks({ envSource = process.env, requireProduction = false } = {}) {
  const nodeEnv = env(envSource, 'NODE_ENV');
  const serverHost = env(envSource, 'PET_SERVER_HOST');
  const dataDirRaw = env(envSource, 'PET_SERVER_DATA_DIR');
  const corsOrigin = env(envSource, 'PET_CORS_ORIGIN');
  const serverPort = numberEnv(envSource, 'PET_SERVER_PORT', 8787);
  const accessTokenTtl = numberEnv(envSource, 'PET_ACCESS_TOKEN_TTL_MS', 7 * DAY_MS);
  const refreshTokenTtl = numberEnv(envSource, 'PET_REFRESH_TOKEN_TTL_MS', 30 * DAY_MS);
  const authSecret = env(envSource, 'PET_AUTH_SECRET');
  const maxBodyBytes = numberEnv(envSource, 'PET_MAX_BODY_BYTES', 2 * 1024 * 1024);
  const rateLimitWindow = numberEnv(envSource, 'PET_AUTH_RATE_LIMIT_WINDOW_MS', 5 * 60 * 1000);
  const rateLimitMax = numberEnv(envSource, 'PET_AUTH_RATE_LIMIT_MAX', 30);
  const trustProxyRaw = env(envSource, 'PET_TRUST_PROXY') || 'false';
  const monitoringRateLimitWindow = numberEnv(envSource, 'PET_MONITORING_RATE_LIMIT_WINDOW_MS', 60 * 1000);
  const monitoringRateLimitMax = numberEnv(envSource, 'PET_MONITORING_RATE_LIMIT_MAX', 120);
  const backupRetentionMax = numberEnv(envSource, 'PET_BACKUP_RETENTION_MAX', 20);
  const requestTimeout = numberEnv(envSource, 'PET_SERVER_REQUEST_TIMEOUT_MS', 30 * 1000);
  const headersTimeout = numberEnv(envSource, 'PET_SERVER_HEADERS_TIMEOUT_MS', 15 * 1000);
  const keepAliveTimeout = numberEnv(envSource, 'PET_SERVER_KEEP_ALIVE_TIMEOUT_MS', 5 * 1000);
  const storageDriver = env(envSource, 'PET_STORAGE_DRIVER') || 'json';
  const sqliteFileRaw = env(envSource, 'PET_SQLITE_FILE');
  const mediaStorageDriver = env(envSource, 'PET_MEDIA_STORAGE_DRIVER') || 'local';
  const mediaLocalDirRaw = env(envSource, 'PET_MEDIA_LOCAL_DIR');
  const mediaPublicBaseUrl = env(envSource, 'PET_MEDIA_PUBLIC_BASE_URL');
  const mediaS3Endpoint = env(envSource, 'PET_MEDIA_S3_ENDPOINT');
  const mediaS3Region = env(envSource, 'PET_MEDIA_S3_REGION');
  const mediaS3Bucket = env(envSource, 'PET_MEDIA_S3_BUCKET');
  const mediaS3AccessKeyId = env(envSource, 'PET_MEDIA_S3_ACCESS_KEY_ID');
  const mediaS3SecretAccessKey = env(envSource, 'PET_MEDIA_S3_SECRET_ACCESS_KEY');
  const mediaMaxBytes = numberEnv(envSource, 'PET_MEDIA_MAX_BYTES', 1.5 * 1024 * 1024);

  const checks = [
    { name: 'PET_SERVER_PORT is numeric', pass: Number.isFinite(serverPort), detail: String(serverPort) },
    { name: 'PET_ACCESS_TOKEN_TTL_MS is numeric', pass: Number.isFinite(accessTokenTtl), detail: String(accessTokenTtl) },
    { name: 'PET_REFRESH_TOKEN_TTL_MS is numeric', pass: Number.isFinite(refreshTokenTtl), detail: String(refreshTokenTtl) },
    { name: 'PET_MAX_BODY_BYTES is numeric', pass: Number.isFinite(maxBodyBytes), detail: String(maxBodyBytes) },
    { name: 'PET_AUTH_RATE_LIMIT_WINDOW_MS is numeric', pass: Number.isFinite(rateLimitWindow), detail: String(rateLimitWindow) },
    { name: 'PET_AUTH_RATE_LIMIT_MAX is numeric', pass: Number.isFinite(rateLimitMax), detail: String(rateLimitMax) },
    { name: 'PET_MONITORING_RATE_LIMIT_WINDOW_MS is numeric', pass: Number.isFinite(monitoringRateLimitWindow), detail: String(monitoringRateLimitWindow) },
    { name: 'PET_MONITORING_RATE_LIMIT_MAX is numeric', pass: Number.isFinite(monitoringRateLimitMax), detail: String(monitoringRateLimitMax) },
    { name: 'PET_BACKUP_RETENTION_MAX is numeric', pass: Number.isFinite(backupRetentionMax), detail: String(backupRetentionMax) },
    { name: 'PET_SERVER_REQUEST_TIMEOUT_MS is numeric', pass: Number.isFinite(requestTimeout), detail: String(requestTimeout) },
    { name: 'PET_SERVER_HEADERS_TIMEOUT_MS is numeric', pass: Number.isFinite(headersTimeout), detail: String(headersTimeout) },
    { name: 'PET_SERVER_KEEP_ALIVE_TIMEOUT_MS is numeric', pass: Number.isFinite(keepAliveTimeout), detail: String(keepAliveTimeout) },
    { name: 'PET_SERVER_PORT valid', pass: Number.isInteger(serverPort) && serverPort > 0 && serverPort < 65536, detail: String(serverPort) },
    { name: 'PET_ACCESS_TOKEN_TTL_MS within production bounds', pass: accessTokenTtl >= 5 * 60 * 1000 && accessTokenTtl <= 30 * DAY_MS, detail: String(accessTokenTtl) },
    { name: 'PET_REFRESH_TOKEN_TTL_MS within production bounds', pass: refreshTokenTtl >= DAY_MS && refreshTokenTtl <= 90 * DAY_MS, detail: String(refreshTokenTtl) },
    { name: 'PET_REFRESH_TOKEN_TTL_MS not shorter than access token', pass: Number.isFinite(refreshTokenTtl) && Number.isFinite(accessTokenTtl) && refreshTokenTtl >= accessTokenTtl, detail: `${refreshTokenTtl}/${accessTokenTtl}` },
    { name: 'PET_MAX_BODY_BYTES within production bounds', pass: maxBodyBytes >= 1024 && maxBodyBytes <= 2 * 1024 * 1024, detail: String(maxBodyBytes) },
    { name: 'PET_AUTH_RATE_LIMIT_WINDOW_MS within production bounds', pass: rateLimitWindow >= 60 * 1000 && rateLimitWindow <= 60 * 60 * 1000, detail: String(rateLimitWindow) },
    { name: 'PET_AUTH_RATE_LIMIT_MAX within production bounds', pass: Number.isInteger(rateLimitMax) && rateLimitMax >= 1 && rateLimitMax <= 100, detail: String(rateLimitMax) },
    { name: 'PET_TRUST_PROXY is boolean', pass: ['true', 'false'].includes(trustProxyRaw), detail: trustProxyRaw },
    { name: 'PET_MONITORING_RATE_LIMIT_WINDOW_MS within production bounds', pass: monitoringRateLimitWindow >= 60 * 1000 && monitoringRateLimitWindow <= 60 * 60 * 1000, detail: String(monitoringRateLimitWindow) },
    { name: 'PET_MONITORING_RATE_LIMIT_MAX within production bounds', pass: Number.isInteger(monitoringRateLimitMax) && monitoringRateLimitMax >= 10 && monitoringRateLimitMax <= 1000, detail: String(monitoringRateLimitMax) },
    { name: 'PET_BACKUP_RETENTION_MAX within production bounds', pass: Number.isInteger(backupRetentionMax) && backupRetentionMax >= 3 && backupRetentionMax <= 100, detail: String(backupRetentionMax) },
    { name: 'PET_SERVER_REQUEST_TIMEOUT_MS within production bounds', pass: Number.isFinite(requestTimeout) && requestTimeout >= 5 * 1000 && requestTimeout <= 120 * 1000, detail: String(requestTimeout) },
    { name: 'PET_SERVER_HEADERS_TIMEOUT_MS within production bounds', pass: Number.isFinite(headersTimeout) && headersTimeout >= 5 * 1000 && headersTimeout <= 60 * 1000, detail: String(headersTimeout) },
    { name: 'PET_SERVER_KEEP_ALIVE_TIMEOUT_MS within production bounds', pass: Number.isFinite(keepAliveTimeout) && keepAliveTimeout >= 1000 && keepAliveTimeout <= 30 * 1000, detail: String(keepAliveTimeout) },
    { name: 'PET_SERVER_HEADERS_TIMEOUT_MS not greater than request timeout', pass: Number.isFinite(headersTimeout) && Number.isFinite(requestTimeout) && headersTimeout <= requestTimeout, detail: `${headersTimeout}/${requestTimeout}` },
    { name: 'PET_SERVER_KEEP_ALIVE_TIMEOUT_MS not greater than request timeout', pass: Number.isFinite(keepAliveTimeout) && Number.isFinite(requestTimeout) && keepAliveTimeout <= requestTimeout, detail: `${keepAliveTimeout}/${requestTimeout}` },
    { name: 'PET_STORAGE_DRIVER is supported', pass: ['json', 'sqlite'].includes(storageDriver), detail: storageDriver },
    { name: 'PET_MEDIA_STORAGE_DRIVER is supported', pass: ['local', 's3'].includes(mediaStorageDriver), detail: mediaStorageDriver },
    { name: 'PET_MEDIA_MAX_BYTES within bounds', pass: Number.isFinite(mediaMaxBytes) && mediaMaxBytes >= 1024 && mediaMaxBytes <= 5 * 1024 * 1024, detail: String(mediaMaxBytes) }
  ];

  if (requireProduction || nodeEnv === 'production') {
    checks.push(
      { name: 'NODE_ENV is production', pass: nodeEnv === 'production', detail: nodeEnv || '(empty)' },
      { name: 'PET_SERVER_HOST is explicit', pass: Boolean(serverHost), detail: serverHost || '(empty)' },
      { name: 'PET_SERVER_HOST is not loopback', pass: !['127.0.0.1', 'localhost', '::1'].includes(serverHost), detail: serverHost || '(empty)' },
      { name: 'PET_SERVER_DATA_DIR is explicit', pass: Boolean(dataDirRaw), detail: dataDirRaw || '(empty)' },
      { name: 'PET_SERVER_DATA_DIR is absolute', pass: Boolean(dataDirRaw) && isAbsolute(dataDirRaw), detail: dataDirRaw || '(empty)' },
      { name: 'PET_SERVER_DATA_DIR is not local default', pass: !['server-data', './server-data', '.\\server-data'].includes(dataDirRaw), detail: dataDirRaw || '(empty)' },
      { name: 'PET_CORS_ORIGIN is explicit', pass: Boolean(corsOrigin), detail: corsOrigin || '(empty)' },
      { name: 'PET_CORS_ORIGIN is not wildcard', pass: corsOrigin !== '*', detail: corsOrigin || '(empty)' },
      { name: 'PET_CORS_ORIGIN is HTTPS origin', pass: isHttpsOrigin(corsOrigin), detail: corsOrigin || '(empty)' },
      { name: 'PET_CORS_ORIGIN is not placeholder', pass: Boolean(corsOrigin) && !hasPlaceholderValue(corsOrigin), detail: corsOrigin || '(empty)' },
      { name: 'PET_AUTH_SECRET is explicit', pass: Boolean(authSecret), detail: authSecret ? '(set)' : '(empty)' },
      { name: 'PET_AUTH_SECRET is at least 32 chars', pass: authSecret.length >= 32, detail: authSecret ? `${authSecret.length} chars` : '(empty)' },
      { name: 'PET_AUTH_SECRET is not placeholder', pass: Boolean(authSecret) && !/replace|placeholder|example|test|demo|dummy/i.test(authSecret), detail: authSecret ? '(set)' : '(empty)' },
      { name: 'PET_STORAGE_DRIVER is sqlite in production', pass: storageDriver === 'sqlite', detail: storageDriver },
      { name: 'PET_SQLITE_FILE is explicit', pass: Boolean(sqliteFileRaw), detail: sqliteFileRaw || '(empty)' },
      { name: 'PET_SQLITE_FILE is absolute', pass: Boolean(sqliteFileRaw) && isAbsolute(sqliteFileRaw), detail: sqliteFileRaw || '(empty)' },
      { name: 'PET_SQLITE_FILE is not local default', pass: Boolean(sqliteFileRaw) && !sqliteFileRaw.includes('server-data'), detail: sqliteFileRaw || '(empty)' },
      { name: 'PET_MEDIA_STORAGE_DRIVER is local or s3 in production', pass: ['local', 's3'].includes(mediaStorageDriver), detail: mediaStorageDriver },
      { name: 'PET_MEDIA_LOCAL_DIR is explicit when local media is used', pass: mediaStorageDriver !== 'local' || Boolean(mediaLocalDirRaw), detail: mediaLocalDirRaw || '(empty)' },
      { name: 'PET_MEDIA_LOCAL_DIR is absolute when local media is used', pass: mediaStorageDriver !== 'local' || (Boolean(mediaLocalDirRaw) && isAbsolute(mediaLocalDirRaw)), detail: mediaLocalDirRaw || '(empty)' },
      { name: 'PET_MEDIA_LOCAL_DIR is not local default', pass: mediaStorageDriver !== 'local' || (Boolean(mediaLocalDirRaw) && !mediaLocalDirRaw.includes('server-data')), detail: mediaLocalDirRaw || '(empty)' },
      { name: 'PET_MEDIA_PUBLIC_BASE_URL is HTTPS when set', pass: !mediaPublicBaseUrl || isHttpsOrigin(mediaPublicBaseUrl), detail: mediaPublicBaseUrl || '(empty)' },
      { name: 'PET_MEDIA_PUBLIC_BASE_URL is not placeholder when set', pass: !mediaPublicBaseUrl || !hasPlaceholderValue(mediaPublicBaseUrl), detail: mediaPublicBaseUrl || '(empty)' },
      { name: 'PET_MEDIA_S3_ENDPOINT is HTTPS when s3 media is used', pass: mediaStorageDriver !== 's3' || isHttpsOrigin(mediaS3Endpoint), detail: mediaS3Endpoint || '(empty)' },
      { name: 'PET_MEDIA_S3_ENDPOINT is not placeholder when s3 media is used', pass: mediaStorageDriver !== 's3' || !hasPlaceholderValue(mediaS3Endpoint), detail: mediaS3Endpoint || '(empty)' },
      { name: 'PET_MEDIA_S3_REGION is explicit when s3 media is used', pass: mediaStorageDriver !== 's3' || Boolean(mediaS3Region), detail: mediaS3Region || '(empty)' },
      { name: 'PET_MEDIA_S3_BUCKET is explicit when s3 media is used', pass: mediaStorageDriver !== 's3' || Boolean(mediaS3Bucket), detail: mediaS3Bucket || '(empty)' },
      { name: 'PET_MEDIA_S3_BUCKET is not placeholder when s3 media is used', pass: mediaStorageDriver !== 's3' || !hasPlaceholderValue(mediaS3Bucket), detail: mediaS3Bucket || '(empty)' },
      { name: 'PET_MEDIA_S3_ACCESS_KEY_ID is explicit when s3 media is used', pass: mediaStorageDriver !== 's3' || Boolean(mediaS3AccessKeyId), detail: mediaS3AccessKeyId ? '(set)' : '(empty)' },
      { name: 'PET_MEDIA_S3_SECRET_ACCESS_KEY is explicit when s3 media is used', pass: mediaStorageDriver !== 's3' || Boolean(mediaS3SecretAccessKey), detail: mediaS3SecretAccessKey ? '(set)' : '(empty)' }
    );
  }

  return checks;
}

export function assertProductionServerConfig({ envSource = process.env } = {}) {
  if (env(envSource, 'NODE_ENV') !== 'production') return;
  const failed = getServerRuntimeChecks({ envSource, requireProduction: true }).filter(check => !check.pass);
  if (!failed.length) return;

  const detail = failed.map(check => `${check.name}: ${check.detail}`).join('; ');
  throw new Error(`生产服务端配置不完整：${detail}`);
}
