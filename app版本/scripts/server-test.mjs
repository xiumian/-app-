import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const dataDir = await mkdtemp(join(tmpdir(), 'pet-companion-api-'));
process.env.PET_SERVER_DATA_DIR = dataDir;
process.env.PET_SERVER_HOST = '127.0.0.1';
process.env.PET_CORS_ORIGIN = '*';
process.env.PET_AUTH_RATE_LIMIT_MAX = '5';
process.env.PET_AUTH_RATE_LIMIT_WINDOW_MS = '60000';
process.env.PET_TRUST_PROXY = 'true';
process.env.PET_MONITORING_RATE_LIMIT_MAX = '2';
process.env.PET_MONITORING_RATE_LIMIT_WINDOW_MS = '60000';
process.env.PET_SERVER_LOG_LEVEL = 'off';

const { createPetCompanionServer } = await import('../server/index.js');
const { assertProductionServerConfig, getServerRuntimeChecks } = await import('../server/config.js');
const { installGracefulShutdown } = await import('../server/lifecycle.js');
const { readDb, updateDb } = await import('../server/storage.js');
const { createStateBackup } = await import('../src/domain/backups.js');

function listen(server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

async function request(baseUrl, path, { method = 'GET', token = '', body = null, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : null
  });
  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';
  const payload = text && contentType.includes('application/json') ? JSON.parse(text) : (text || null);
  return { response, payload, requestId: response.headers.get('x-request-id') };
}

function assertJsonNoStore(result) {
  assert.equal(result.response.headers.get('cache-control'), 'no-store');
  assert.equal(result.response.headers.get('pragma'), 'no-cache');
  assert.equal(result.response.headers.get('vary'), 'Origin');
  assert.equal(result.response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(result.response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(result.response.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()');
  assert.equal(result.response.headers.get('cross-origin-opener-policy'), 'same-origin');
  assert.ok(result.response.headers.get('access-control-expose-headers').includes('Retry-After'));
}

async function assertGracefulShutdownLifecycle() {
  const processLike = new EventEmitter();
  processLike.exitCode = null;
  let exitCode = null;
  let closeCalls = 0;
  const fakeServer = {
    close(callback) {
      closeCalls += 1;
      setTimeout(() => callback(), 0);
    }
  };
  const lifecycle = installGracefulShutdown(fakeServer, {
    signals: ['SIGTERM'],
    timeoutMs: 200,
    processLike,
    logger: { info() {}, error() {} },
    exit(code) {
      exitCode = code;
      processLike.exitCode = code;
    }
  });

  processLike.emit('SIGTERM');
  const result = await lifecycle.shutdown('manual');
  assert.equal(result.ok, true);
  assert.equal(result.signal, 'SIGTERM');
  assert.equal(closeCalls, 1);
  assert.equal(exitCode, 0);
  assert.equal(processLike.listenerCount('SIGTERM'), 0);
}

function assertProductionConfigValidation() {
  const unsafeEnv = {
    NODE_ENV: 'production',
    PET_SERVER_HOST: '127.0.0.1',
    PET_SERVER_DATA_DIR: 'server-data',
    PET_CORS_ORIGIN: '*',
    PET_AUTH_RATE_LIMIT_MAX: '300',
    PET_TRUST_PROXY: 'maybe',
    PET_MONITORING_RATE_LIMIT_MAX: '5',
    PET_MONITORING_RATE_LIMIT_WINDOW_MS: '1000',
    PET_REFRESH_TOKEN_TTL_MS: '60000',
    PET_BACKUP_RETENTION_MAX: '1000',
    PET_SERVER_REQUEST_TIMEOUT_MS: '1000',
    PET_SERVER_HEADERS_TIMEOUT_MS: '180000',
    PET_SERVER_KEEP_ALIVE_TIMEOUT_MS: '90000',
    PET_AUTH_SECRET: 'replace-with-secret'
  };
  const unsafeChecks = getServerRuntimeChecks({ envSource: unsafeEnv, requireProduction: true });
  assert.ok(unsafeChecks.some(check => check.name === 'PET_SERVER_HOST is not loopback' && !check.pass));
  assert.ok(unsafeChecks.some(check => check.name === 'PET_CORS_ORIGIN is not wildcard' && !check.pass));
  assert.ok(unsafeChecks.some(check => check.name === 'PET_REFRESH_TOKEN_TTL_MS not shorter than access token' && !check.pass));
  assert.ok(unsafeChecks.some(check => check.name === 'PET_BACKUP_RETENTION_MAX within production bounds' && !check.pass));
  assert.ok(unsafeChecks.some(check => check.name === 'PET_SERVER_REQUEST_TIMEOUT_MS within production bounds' && !check.pass));
  assert.ok(unsafeChecks.some(check => check.name === 'PET_SERVER_HEADERS_TIMEOUT_MS not greater than request timeout' && !check.pass));
  assert.ok(unsafeChecks.some(check => check.name === 'PET_SERVER_KEEP_ALIVE_TIMEOUT_MS not greater than request timeout' && !check.pass));
  assert.ok(unsafeChecks.some(check => check.name === 'PET_STORAGE_DRIVER is sqlite in production' && !check.pass));
  assert.ok(unsafeChecks.some(check => check.name === 'PET_MONITORING_RATE_LIMIT_MAX within production bounds' && !check.pass));
  assert.ok(unsafeChecks.some(check => check.name === 'PET_MONITORING_RATE_LIMIT_WINDOW_MS within production bounds' && !check.pass));
  assert.ok(unsafeChecks.some(check => check.name === 'PET_AUTH_SECRET is not placeholder' && !check.pass));
  assert.ok(unsafeChecks.some(check => check.name === 'PET_TRUST_PROXY is boolean' && !check.pass));
  assert.ok(unsafeChecks.some(check => check.name === 'PET_MEDIA_LOCAL_DIR is explicit when local media is used' && !check.pass));
  assert.throws(() => assertProductionServerConfig({ envSource: unsafeEnv }), /生产服务端配置不完整/);

  const placeholderEnv = {
    ...unsafeEnv,
    PET_SERVER_HOST: '0.0.0.0',
    PET_SERVER_DATA_DIR: 'D:\\pet-companion-data',
    PET_CORS_ORIGIN: 'https://app.example.com',
    PET_AUTH_RATE_LIMIT_MAX: '30',
    PET_TRUST_PROXY: 'true',
    PET_MONITORING_RATE_LIMIT_MAX: '120',
    PET_MONITORING_RATE_LIMIT_WINDOW_MS: '60000',
    PET_REFRESH_TOKEN_TTL_MS: '2592000000',
    PET_BACKUP_RETENTION_MAX: '20',
    PET_SERVER_REQUEST_TIMEOUT_MS: '30000',
    PET_SERVER_HEADERS_TIMEOUT_MS: '15000',
    PET_SERVER_KEEP_ALIVE_TIMEOUT_MS: '5000',
    PET_AUTH_SECRET: 'prod-secret-0123456789abcdef0123456789abcdef',
    PET_STORAGE_DRIVER: 'sqlite',
    PET_SQLITE_FILE: 'D:\\pet-companion-data\\pet-companion.sqlite',
    PET_MEDIA_STORAGE_DRIVER: 's3',
    PET_MEDIA_S3_ENDPOINT: 'https://s3.example.com',
    PET_MEDIA_S3_REGION: 'cn-test-1',
    PET_MEDIA_S3_BUCKET: 'example-bucket',
    PET_MEDIA_S3_ACCESS_KEY_ID: 'access-key',
    PET_MEDIA_S3_SECRET_ACCESS_KEY: 'secret-key'
  };
  const placeholderChecks = getServerRuntimeChecks({ envSource: placeholderEnv, requireProduction: true });
  assert.ok(placeholderChecks.some(check => check.name === 'PET_CORS_ORIGIN is not placeholder' && !check.pass));
  assert.ok(placeholderChecks.some(check => check.name === 'PET_MEDIA_S3_ENDPOINT is not placeholder when s3 media is used' && !check.pass));
  assert.ok(placeholderChecks.some(check => check.name === 'PET_MEDIA_S3_BUCKET is not placeholder when s3 media is used' && !check.pass));

  const safeEnv = {
    NODE_ENV: 'production',
    PET_SERVER_HOST: '0.0.0.0',
    PET_SERVER_PORT: '8787',
    PET_SERVER_DATA_DIR: 'D:\\pet-companion-data',
    PET_CORS_ORIGIN: 'https://app.pet-companion.test',
    PET_AUTH_RATE_LIMIT_MAX: '30',
    PET_AUTH_RATE_LIMIT_WINDOW_MS: '300000',
    PET_TRUST_PROXY: 'true',
    PET_MONITORING_RATE_LIMIT_MAX: '120',
    PET_MONITORING_RATE_LIMIT_WINDOW_MS: '60000',
    PET_BACKUP_RETENTION_MAX: '20',
    PET_SERVER_REQUEST_TIMEOUT_MS: '30000',
    PET_SERVER_HEADERS_TIMEOUT_MS: '15000',
    PET_SERVER_KEEP_ALIVE_TIMEOUT_MS: '5000',
    PET_ACCESS_TOKEN_TTL_MS: '604800000',
    PET_REFRESH_TOKEN_TTL_MS: '2592000000',
    PET_AUTH_SECRET: 'prod-secret-0123456789abcdef0123456789abcdef',
    PET_MAX_BODY_BYTES: '2097152',
    PET_STORAGE_DRIVER: 'sqlite',
    PET_SQLITE_FILE: 'D:\\pet-companion-data\\pet-companion.sqlite',
    PET_MEDIA_STORAGE_DRIVER: 'local',
    PET_MEDIA_LOCAL_DIR: 'D:\\pet-companion-data\\media'
  };
  assert.doesNotThrow(() => assertProductionServerConfig({ envSource: safeEnv }));
}

function assertRateLimitTrustProxyBoundary() {
  const script = `
    import assert from 'node:assert/strict';
    import { assertRateLimit, resetRateLimits } from './server/rateLimit.js';
    const request = (forwarded, remoteAddress) => ({ headers: { 'x-forwarded-for': forwarded }, socket: { remoteAddress } });
    assert.doesNotThrow(() => assertRateLimit(request('198.51.100.1', '10.0.0.1'), 'unit', { max: 1, windowMs: 60000 }));
    assert.throws(() => assertRateLimit(request('198.51.100.2', '10.0.0.1'), 'unit', { max: 1, windowMs: 60000 }), error => error.code === 'RATE_LIMITED' && Number(error.headers['Retry-After']) > 0);
    resetRateLimits();
  `;
  const directResult = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, PET_TRUST_PROXY: 'false' }
  });
  assert.equal(directResult.status, 0, `${directResult.stdout}\n${directResult.stderr}`);

  const proxyScript = `
    import assert from 'node:assert/strict';
    import { assertRateLimit, resetRateLimits } from './server/rateLimit.js';
    const request = (forwarded, remoteAddress) => ({ headers: { 'x-forwarded-for': forwarded }, socket: { remoteAddress } });
    assert.doesNotThrow(() => assertRateLimit(request('198.51.100.1', '10.0.0.1'), 'unit', { max: 1, windowMs: 60000 }));
    assert.doesNotThrow(() => assertRateLimit(request('198.51.100.2', '10.0.0.1'), 'unit', { max: 1, windowMs: 60000 }));
    assert.throws(() => assertRateLimit(request('198.51.100.2', '10.0.0.1'), 'unit', { max: 1, windowMs: 60000 }), error => error.code === 'RATE_LIMITED' && Number(error.headers['Retry-After']) > 0);
    resetRateLimits();
  `;
  const proxyResult = spawnSync(process.execPath, ['--input-type=module', '-e', proxyScript], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, PET_TRUST_PROXY: 'true' }
  });
  assert.equal(proxyResult.status, 0, `${proxyResult.stdout}\n${proxyResult.stderr}`);
}


async function assertSqliteStorageDriver() {
  const sqliteDir = await mkdtemp(join(tmpdir(), 'pet-companion-sqlite-'));
  const sqliteFile = join(sqliteDir, 'pet-companion.sqlite');
  const script = `
    import assert from 'node:assert/strict';
    import { readDb, updateDb, probeStorage } from './server/storage.js';
    await updateDb(db => {
      db.users.push({ id: 'usr_sqlite', name: 'SQLite \u7528\u6237' });
    });
    const db = await readDb();
    assert.equal(db.users[0].id, 'usr_sqlite');
    const readiness = await probeStorage();
    assert.equal(readiness.driver, 'sqlite');
    assert.equal(readiness.writable, true);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      PET_STORAGE_DRIVER: 'sqlite',
      PET_SQLITE_FILE: sqliteFile,
      PET_SERVER_DATA_DIR: sqliteDir
    }
  });
  try {
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  } finally {
    await rm(sqliteDir, { recursive: true, force: true });
  }
}


async function assertMediaStorageReadinessProbe() {
  const mediaDir = await mkdtemp(join(tmpdir(), 'pet-companion-media-'));
  const localScript = `
    import assert from 'node:assert/strict';
    import { probeMediaStorage } from './server/media.js';
    const readiness = await probeMediaStorage();
    assert.equal(readiness.ok, true);
    assert.equal(readiness.driver, 'local');
    assert.equal(readiness.writable, true);
  `;
  const localResult = spawnSync(process.execPath, ['--input-type=module', '-e', localScript], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      PET_MEDIA_STORAGE_DRIVER: 'local',
      PET_MEDIA_LOCAL_DIR: mediaDir
    }
  });

  const s3Script = `
    import assert from 'node:assert/strict';
    import { probeMediaStorage } from './server/media.js';
    const readiness = await probeMediaStorage();
    assert.equal(readiness.ok, true);
    assert.equal(readiness.driver, 's3');
    assert.equal(readiness.configured, true);
    assert.equal(readiness.publicBaseUrlHttps, true);
    assert.equal(readiness.endpointHttps, true);
    assert.equal(readiness.writable, 'external_evidence_required');
    assert.deepEqual(readiness.missing, []);
  `;
  const s3Result = spawnSync(process.execPath, ['--input-type=module', '-e', s3Script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      PET_MEDIA_STORAGE_DRIVER: 's3',
      PET_MEDIA_PUBLIC_BASE_URL: 'https://cdn.example.com',
      PET_MEDIA_S3_ENDPOINT: 'https://s3.example.com',
      PET_MEDIA_S3_REGION: 'us-east-1',
      PET_MEDIA_S3_BUCKET: 'pet-companion-media',
      PET_MEDIA_S3_ACCESS_KEY_ID: 'test-access-key',
      PET_MEDIA_S3_SECRET_ACCESS_KEY: 'test-secret-key'
    }
  });

  try {
    assert.equal(localResult.status, 0, `${localResult.stdout}
${localResult.stderr}`);
    assert.equal(s3Result.status, 0, `${s3Result.stdout}
${s3Result.stderr}`);
  } finally {
    await rm(mediaDir, { recursive: true, force: true });
  }
}

assertProductionConfigValidation();
assertRateLimitTrustProxyBoundary();
await assertSqliteStorageDriver();
await assertMediaStorageReadinessProbe();
await assertGracefulShutdownLifecycle();

const server = createPetCompanionServer();
assert.equal(server.requestTimeout, 30000);
assert.equal(server.headersTimeout, 15000);
assert.equal(server.keepAliveTimeout, 5000);
await listen(server);
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

try {
  let result = await request(baseUrl, '/health');
  assert.equal(result.response.status, 200);
  assertJsonNoStore(result);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.status, 'live');
  assert.equal(result.payload.service, 'pet-companion-api');
  assert.ok(result.requestId.startsWith('req_'));

  result = await request(baseUrl, '/health', { headers: { 'x-request-id': 'req_test_trace_001' } });
  assert.equal(result.response.status, 200);
  assert.equal(result.requestId, 'req_test_trace_001');

  result = await request(baseUrl, '/auth/sign-in', { method: 'OPTIONS', headers: { Origin: 'https://app.example.com' } });
  assert.equal(result.response.status, 204);
  assertJsonNoStore(result);
  assert.ok(result.response.headers.get('access-control-allow-methods').includes('DELETE'));

  result = await request(baseUrl, '/auth/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: { account: 'demo@example.com', password: 'DemoPass123' }
  });
  assert.equal(result.response.status, 415);
  assertJsonNoStore(result);
  assert.equal(result.payload.code, 'UNSUPPORTED_MEDIA_TYPE');

  result = await request(baseUrl, '/ready');
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.status, 'ready');
  assert.equal(result.payload.checks.storage.writable, true);
  assert.equal(result.payload.checks.storage.driver, 'json-file');
  assert.equal(result.payload.checks.media.writable, true);
  assert.equal(result.payload.checks.media.driver, 'local');

  result = await request(baseUrl, '/monitoring/events', {
    method: 'POST',
    headers: { 'x-forwarded-for': '198.51.100.20' },
    body: {
      type: 'frontend_error',
      level: 'error',
      source: 'unit-test',
      detail: {
        message: 'safe summary',
        accessToken: 'pat_secret',
        nested: { password: 'DemoPass123', header: 'Bearer hidden' }
      }
    }
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.ok, true);
  const monitoringDb = await readDb();
  const storedMonitoringEvent = monitoringDb.monitoringEvents.at(-1);
  assert.equal(storedMonitoringEvent.detail.message, 'safe summary');
  assert.equal(storedMonitoringEvent.detail.accessToken, '[redacted]');
  assert.equal(storedMonitoringEvent.detail.nested.password, '[redacted]');
  assert.equal(storedMonitoringEvent.detail.nested.header, '[redacted]');
  assert.equal(JSON.stringify(storedMonitoringEvent).includes('pat_secret'), false);
  assert.equal(JSON.stringify(storedMonitoringEvent).includes('DemoPass123'), false);
  assert.equal(JSON.stringify(storedMonitoringEvent).includes('Bearer hidden'), false);

  result = await request(baseUrl, '/monitoring/events', {
    method: 'POST',
    headers: { 'x-forwarded-for': '198.51.100.20' },
    body: { type: 'frontend_error', level: 'error', source: 'unit-test' }
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.ok, true);
  result = await request(baseUrl, '/monitoring/events', {
    method: 'POST',
    headers: { 'x-forwarded-for': '198.51.100.20' },
    body: { type: 'frontend_error', level: 'error', source: 'unit-test' }
  });
  assert.equal(result.response.status, 429);
  assert.equal(result.payload.code, 'RATE_LIMITED');
  assert.ok(Number(result.response.headers.get('retry-after')) > 0);

  result = await request(baseUrl, '/auth/register', {
    method: 'POST',
    body: { account: 'demo@example.com', name: '主人', password: 'DemoPass123' }
  });
  assert.equal(result.response.status, 201);
  assert.ok(result.payload.user.id.startsWith('usr_'));
  assert.ok(result.payload.session.accessToken.startsWith('pat_'));

  result = await request(baseUrl, '/auth/register', {
    method: 'POST',
    body: { account: 'demo@example.com', name: '主人', password: 'DemoPass123' }
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.code, 'ACCOUNT_EXISTS');

  result = await request(baseUrl, '/auth/sign-in', {
    method: 'POST',
    body: { account: 'demo@example.com', password: 'wrong-pass' }
  });
  assert.equal(result.response.status, 401);
  assert.equal(result.payload.code, 'INVALID_CREDENTIALS');

  for (let index = 0; index < 5; index += 1) {
    result = await request(baseUrl, '/auth/sign-in', {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.10' },
      body: { account: 'missing@example.com', password: 'WrongPass123' }
    });
    assert.equal(result.response.status, 401);
  }
  result = await request(baseUrl, '/auth/sign-in', {
    method: 'POST',
    headers: { 'x-forwarded-for': '203.0.113.10' },
    body: { account: 'missing@example.com', password: 'WrongPass123' }
  });
  assert.equal(result.response.status, 429);
  assert.equal(result.payload.code, 'RATE_LIMITED');

  result = await request(baseUrl, '/auth/sign-in', {
    method: 'POST',
    body: { account: 'demo@example.com', password: 'DemoPass123' }
  });
  assert.equal(result.response.status, 200);
  assert.ok(result.payload.user.id.startsWith('usr_'));
  assert.ok(result.payload.session.accessToken.startsWith('pat_'));
  assert.ok(result.payload.session.refreshToken.startsWith('prt_'));
  assert.ok(Date.parse(result.payload.session.expiresAt) > Date.now());
  assert.ok(Date.parse(result.payload.session.refreshExpiresAt) > Date.parse(result.payload.session.expiresAt));
  const { accessToken, refreshToken } = result.payload.session;

  const dbSnapshot = JSON.parse(await readFile(join(dataDir, 'pet-companion-server.json'), 'utf8'));
  assert.equal(dbSnapshot.users[0].password, undefined);
  assert.ok(dbSnapshot.users[0].passwordHash.startsWith('scrypt:'));
  assert.notEqual(dbSnapshot.users[0].passwordHash, 'DemoPass123');
  assert.equal(dbSnapshot.sessions[0].accessToken, undefined);
  assert.equal(dbSnapshot.sessions[0].refreshToken, undefined);
  assert.ok(/^[a-f0-9]{64}$/.test(dbSnapshot.sessions[0].accessTokenHash));
  assert.ok(/^[a-f0-9]{64}$/.test(dbSnapshot.sessions[0].refreshTokenHash));
  assert.ok(Date.parse(dbSnapshot.sessions[0].refreshExpiresAt) > Date.parse(dbSnapshot.sessions[0].expiresAt));
  assert.notEqual(dbSnapshot.sessions[0].accessTokenHash, accessToken);
  assert.notEqual(dbSnapshot.sessions[0].refreshTokenHash, refreshToken);

  result = await request(baseUrl, '/app-state');
  assert.equal(result.response.status, 401);
  assert.equal(result.payload.requestId, result.requestId);

  result = await request(baseUrl, '/media/uploads', {
    method: 'POST',
    body: { dataUrl: 'data:image/png;base64,aGVsbG8=' }
  });
  assert.equal(result.response.status, 401);

  const unauthInvalidMedia = await fetch(`${baseUrl}/media/uploads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{broken-json'
  });
  const unauthInvalidMediaPayload = JSON.parse(await unauthInvalidMedia.text());
  assert.equal(unauthInvalidMedia.status, 401);
  assert.equal(unauthInvalidMediaPayload.code, 'UNAUTHORIZED');

  result = await request(baseUrl, '/media/uploads', {
    method: 'POST',
    token: accessToken,
    body: { dataUrl: 'data:image/png;base64,aGVsbG8=', fileName: 'hello.png', title: '\u9996\u5f20\u7167\u7247' }
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.payload.mimeType, 'image/png');
  assert.equal(result.payload.size, 5);
  assert.equal(result.payload.storageDriver, 'local');
  assert.ok(result.payload.url.startsWith('/media/files/'));
  const uploadedMediaUrl = result.payload.url;

  result = await request(baseUrl, uploadedMediaUrl);
  assert.equal(result.response.status, 200);
  assert.equal(result.response.headers.get('content-type'), 'image/png');
  assert.equal(result.payload, 'hello');

  result = await request(baseUrl, '/auth/register', {
    method: 'POST',
    body: { account: 'media-other@example.com', name: '媒体权限测试', password: 'OtherPass123' }
  });
  assert.equal(result.response.status, 201);
  const otherMediaToken = result.payload.session.accessToken;

  result = await request(baseUrl, uploadedMediaUrl, { method: 'DELETE', token: otherMediaToken });
  assert.equal(result.response.status, 403);
  assert.equal(result.payload.code, 'MEDIA_FORBIDDEN');

  result = await request(baseUrl, uploadedMediaUrl, { method: 'DELETE' });
  assert.equal(result.response.status, 401);

  result = await request(baseUrl, uploadedMediaUrl, { method: 'DELETE', token: accessToken });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.deleted, true);
  assert.equal(result.payload.storageDriver, 'local');

  result = await request(baseUrl, uploadedMediaUrl);
  assert.equal(result.response.status, 404);
  assert.equal(result.payload.code, 'MEDIA_NOT_FOUND');

  result = await request(baseUrl, uploadedMediaUrl, { method: 'DELETE', token: accessToken });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.deleted, false);

  result = await request(baseUrl, '/app-state', { token: accessToken });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.state.currentUserId, result.payload.state.users[0].id);

  const state = {
    schemaVersion: 4,
    currentUserId: result.payload.state.currentUserId,
    users: result.payload.state.users,
    pets: [{ id: 'p1', ownerId: result.payload.state.currentUserId, name: '奶盖' }],
    reminders: [],
    records: [],
    photos: [],
    posts: [],
    checkins: [],
    reports: [
      { id: 'r1', reporterId: result.payload.state.currentUserId, reason: 'other', detail: 'Bearer pat_secret password=123456', createdAt: '2026-06-29T00:00:00.000Z' },
      { id: 'duplicate_report', reporterId: result.payload.state.currentUserId, reason: 'other', detail: 'Bearer pat_secret password=123456', createdAt: '2026-06-29T00:05:00.000Z' }
    ],
    session: { accessToken: 'client-secret', refreshToken: 'client-refresh' },
    ui: { sheet: 'checkins', detailPetId: 'p1' }
  };

  result = await request(baseUrl, '/app-state', { method: 'PUT', token: accessToken, body: { state } });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.ok, true);

  const forbiddenState = {
    ...state,
    pets: [{ id: 'p2', ownerId: 'usr_other', name: '越权宠物' }]
  };
  result = await request(baseUrl, '/app-state', { method: 'PUT', token: accessToken, body: { state: forbiddenState } });
  assert.equal(result.response.status, 403);
  assert.equal(result.payload.code, 'FORBIDDEN_RESOURCE');

  result = await request(baseUrl, '/app-state', { token: accessToken });
  assert.equal(result.payload.state.pets[0].name, '奶盖');
  assert.equal(result.payload.state.session.accessToken, null);
  assert.equal(result.payload.state.ui.sheet, null);
  assert.equal(result.payload.state.reports[0].detail.includes('pat_secret'), false);
  assert.equal(result.payload.state.reports[0].detail.includes('password'), false);
  assert.equal(result.payload.state.reports.length, 1);
  const sanitizedStateDb = await readDb();
  assert.equal(JSON.stringify(sanitizedStateDb.states[result.payload.state.currentUserId]).includes('pat_secret'), false);

  const backup = createStateBackup(state, { appVersion: 'server-test', createdAt: '2026-06-29T00:00:00.000Z' });
  result = await request(baseUrl, '/app-state/backups', { method: 'POST', token: accessToken, body: backup });
  assert.equal(result.response.status, 200);
  assert.ok(result.payload.backupId.startsWith('bak_'));
  const { backupId } = result.payload;

  const rawBackup = {
    backupVersion: 1,
    appVersion: 'raw-client',
    schemaVersion: 4,
    createdAt: '2026-06-29T00:00:01.000Z',
    counts: { users: 1, pets: 1, reminders: 0, records: 0, photos: 0, posts: 0, checkins: 0, reports: 1 },
    state
  };
  result = await request(baseUrl, '/app-state/backups', { method: 'POST', token: accessToken, body: rawBackup });
  assert.equal(result.response.status, 200);
  const rawBackupId = result.payload.backupId;
  const sanitizedBackupDb = await readDb();
  const storedRawBackup = sanitizedBackupDb.backups[state.currentUserId].find(item => item.backupId === rawBackupId);
  assert.equal(JSON.stringify(storedRawBackup).includes('pat_secret'), false);

  const forbiddenBackup = createStateBackup(forbiddenState, { appVersion: 'server-test', createdAt: '2026-06-29T00:00:00.000Z' });
  result = await request(baseUrl, '/app-state/backups', { method: 'POST', token: accessToken, body: forbiddenBackup });
  assert.equal(result.response.status, 403);
  assert.equal(result.payload.code, 'FORBIDDEN_RESOURCE');

  result = await request(baseUrl, '/app-state/backups', { token: accessToken });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.length, 2);
  assert.equal(result.payload[0].backupId, backupId);

  result = await request(baseUrl, `/app-state/backups/${encodeURIComponent(rawBackupId)}/restore`, { method: 'POST', token: accessToken });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.state.pets[0].name, '奶盖');
  assert.equal(result.payload.state.reports[0].detail.includes('pat_secret'), false);
  assert.equal(result.payload.state.reports.length, 1);

  for (let index = 0; index < 21; index += 1) {
    const retentionBackup = createStateBackup(state, {
      appVersion: `retention-${index}`,
      createdAt: `2026-06-29T00:00:${String(index).padStart(2, '0')}.000Z`
    });
    result = await request(baseUrl, '/app-state/backups', { method: 'POST', token: accessToken, body: retentionBackup });
    assert.equal(result.response.status, 200);
  }
  result = await request(baseUrl, '/app-state/backups', { token: accessToken });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.length, 20);
  assert.equal(result.payload.some(item => item.appVersion === 'retention-0'), false);
  assert.equal(result.payload.some(item => item.appVersion === 'retention-20'), true);

  result = await request(baseUrl, '/auth/register', {
    method: 'POST',
    body: { account: 'delete-me@example.com', name: '注销测试', password: 'DeletePass123' }
  });
  assert.equal(result.response.status, 201);
  const deleteUser = result.payload.user;
  const deleteToken = result.payload.session.accessToken;
  result = await request(baseUrl, '/media/uploads', {
    method: 'POST',
    token: deleteToken,
    body: { dataUrl: 'data:image/png;base64,ZGVsZXRlLW1lZGlh', fileName: 'delete.png', title: '注销清理照片' }
  });
  assert.equal(result.response.status, 201);
  const deleteMediaUrl = result.payload.url;
  const deleteState = {
    schemaVersion: 4,
    currentUserId: deleteUser.id,
    users: [deleteUser],
    pets: [{ id: 'p_delete', ownerId: deleteUser.id, name: '注销宠物', avatarImage: deleteMediaUrl }],
    reminders: [],
    records: [],
    photos: [{ id: 'ph_delete', petId: 'p_delete', title: '注销清理照片', imageData: deleteMediaUrl }],
    posts: [],
    checkins: []
  };
  result = await request(baseUrl, '/app-state', { method: 'PUT', token: deleteToken, body: { state: deleteState } });
  assert.equal(result.response.status, 200);
  const deleteBackup = createStateBackup(deleteState, { appVersion: 'server-test', createdAt: '2026-06-29T00:00:00.000Z' });
  result = await request(baseUrl, '/app-state/backups', { method: 'POST', token: deleteToken, body: deleteBackup });
  assert.equal(result.response.status, 200);
  await updateDb(db => {
    db.states[deleteUser.id].reports = [{ id: 'legacy_report', reporterId: deleteUser.id, reason: 'other', detail: 'Bearer pat_secret password=123456' }];
    db.backups[deleteUser.id][0].state.reports = [{ id: 'legacy_backup_report', reporterId: deleteUser.id, reason: 'other', detail: 'token=pat_secret password=123456' }];
    return { ok: true };
  });
  result = await request(baseUrl, '/account/export', { token: deleteToken });
  assert.equal(result.response.status, 200);
  assertJsonNoStore(result);
  assert.equal(result.payload.exportVersion, 1);
  assert.equal(result.payload.user.account, 'delete-me@example.com');
  assert.equal(result.payload.user.passwordHash, undefined);
  assert.equal(result.payload.state.pets[0].name, '注销宠物');
  assert.equal(result.payload.backups.length, 1);
  assert.equal(JSON.stringify(result.payload).includes('pat_secret'), false);
  assert.equal(JSON.stringify(result.payload).includes('password=123456'), false);
  result = await request(baseUrl, '/account/export');
  assert.equal(result.response.status, 401);
  for (let index = 0; index < 5; index += 1) {
    result = await request(baseUrl, '/account', {
      method: 'DELETE',
      token: deleteToken,
      headers: { 'x-forwarded-for': '198.51.100.30' },
      body: { password: 'wrong-pass' }
    });
    assert.equal(result.response.status, 401);
  }
  result = await request(baseUrl, '/account', {
    method: 'DELETE',
    token: deleteToken,
    headers: { 'x-forwarded-for': '198.51.100.30' },
    body: { password: 'wrong-pass' }
  });
  assert.equal(result.response.status, 429);
  assert.equal(result.payload.code, 'RATE_LIMITED');
  result = await request(baseUrl, '/account', { method: 'DELETE', token: deleteToken, body: { password: 'DeletePass123' } });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.media.deletedFiles >= 1, true);
  result = await request(baseUrl, deleteMediaUrl);
  assert.equal(result.response.status, 404);
  result = await request(baseUrl, '/app-state', { token: deleteToken });
  assert.equal(result.response.status, 401);
  const afterDeleteDb = await readDb();
  assert.equal(afterDeleteDb.users.some(user => user.id === deleteUser.id), false);
  assert.equal(afterDeleteDb.sessions.some(session => session.userId === deleteUser.id), false);
  assert.equal(afterDeleteDb.states[deleteUser.id], undefined);
  assert.equal(afterDeleteDb.backups[deleteUser.id], undefined);

  result = await request(baseUrl, '/auth/register', {
    method: 'POST',
    body: { account: 'expired-refresh@example.com', name: '过期刷新', password: 'ExpirePass123' }
  });
  assert.equal(result.response.status, 201);
  const expiredUserId = result.payload.user.id;
  const expiredRefreshToken = result.payload.session.refreshToken;
  await updateDb(db => {
    const session = db.sessions.find(item => item.userId === expiredUserId);
    session.refreshExpiresAt = '2000-01-01T00:00:00.000Z';
    return { ok: true };
  });
  result = await request(baseUrl, '/auth/refresh', { method: 'POST', body: { refreshToken: expiredRefreshToken } });
  assert.equal(result.response.status, 401);
  assert.equal(result.payload.code, 'UNAUTHORIZED');

  result = await request(baseUrl, '/auth/refresh', { method: 'POST', body: { refreshToken } });
  assert.equal(result.response.status, 200);
  assert.ok(result.payload.accessToken.startsWith('pat_'));
  assert.ok(result.payload.refreshToken.startsWith('prt_'));
  assert.notEqual(result.payload.refreshToken, refreshToken);
  assert.ok(Date.parse(result.payload.refreshExpiresAt) > Date.parse(result.payload.expiresAt));
  const rotatedAccessToken = result.payload.accessToken;
  const rotatedRefreshToken = result.payload.refreshToken;

  result = await request(baseUrl, '/auth/refresh', { method: 'POST', body: { refreshToken } });
  assert.equal(result.response.status, 401);
  assert.equal(result.payload.code, 'UNAUTHORIZED');

  result = await request(baseUrl, '/monitoring/events', {
    method: 'POST',
    body: { type: 'frontend_event', level: 'error', source: 'server-test', detail: { message: 'boom' } }
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.ok, true);

  result = await request(baseUrl, '/auth/sign-out', { method: 'POST', body: { refreshToken: rotatedRefreshToken } });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.ok, true);
  result = await request(baseUrl, '/app-state', { token: rotatedAccessToken });
  assert.equal(result.response.status, 401);
  assert.equal(result.payload.code, 'UNAUTHORIZED');

  const dbFile = join(dataDir, 'pet-companion-server.json');
  const backupFile = `${dbFile}.bak`;
  const backupSnapshot = JSON.parse(await readFile(backupFile, 'utf8'));
  assert.ok(backupSnapshot.users.length >= 1);
  await writeFile(dbFile, '{broken-json', 'utf8');
  const recoveredDb = await readDb();
  assert.ok(recoveredDb.users.length >= 1);
  JSON.parse(await readFile(dbFile, 'utf8'));

  console.log('PASS server api contract smoke');
} finally {
  await close(server);
  await rm(dataDir, { recursive: true, force: true });
}
