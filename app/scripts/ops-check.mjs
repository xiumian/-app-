import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const args = new Set(process.argv.slice(2));
const selfTest = args.has('--self-test');
const allowLocal = args.has('--allow-local') || selfTest;
const targetDir = resolve('dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8'
};

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': "default-src 'self'"
};

function env(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

function ensureUrl(value, label) {
  assert.ok(value, `${label} is required`);
  const url = new URL(value);
  if (!allowLocal) assert.equal(url.protocol, 'https:', `${label} must use HTTPS`);
  if (!allowLocal) assert.equal(hasPlaceholder(url.toString()), false, `${label} must not use placeholder host`);
  return url.toString().replace(/\/$/, '');
}

async function timedFetch(label, url, options = {}, maxMs) {
  const started = performance.now();
  const response = await fetch(url, options);
  const durationMs = Math.round(performance.now() - started);
  assert.ok(durationMs <= maxMs, `${label} latency ${durationMs}ms exceeds ${maxMs}ms`);
  return { response, durationMs };
}

async function readPayload(response) {
  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/json') && text ? JSON.parse(text) : text;
}

function assertHeaderIncludes(response, name, expected) {
  const actual = response.headers.get(name) || '';
  assert.ok(actual.includes(expected), `${name} missing or invalid: ${actual || '(empty)'}`);
}

function assertRuntimeConfig(text, apiBaseUrl) {
  assert.equal(extractRuntimeString(text, 'APP_RELEASE_CHANNEL'), 'production', 'runtime-config must be production');
  assert.equal(extractRuntimeBoolean(text, 'API_MOCK_FALLBACK'), false, 'runtime-config must disable mock fallback');
  assert.equal(extractRuntimeString(text, 'API_BASE_URL'), apiBaseUrl, 'runtime-config API_BASE_URL mismatch');
  const operatorName = extractRuntimeString(text, 'OPERATOR_NAME');
  const supportUrl = extractRuntimeString(text, 'SUPPORT_CONTACT_URL');
  const supportEmail = extractRuntimeString(text, 'SUPPORT_EMAIL');
  assert.ok(operatorName.length >= 2, 'runtime-config operator name missing');
  assert.ok(isHttpsUrl(supportUrl) || isEmail(supportEmail), 'runtime-config support contact missing');
  for (const [key, value] of Object.entries({ OPERATOR_NAME: operatorName, SUPPORT_CONTACT_URL: supportUrl, SUPPORT_EMAIL: supportEmail })) {
    assert.equal(hasPlaceholder(value), false, `runtime-config ${key} still uses placeholder`);
  }
}

function extractRuntimeString(source, key) {
  const pattern = new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']*)["']`);
  return source.match(pattern)?.[1]?.trim() || '';
}

function extractRuntimeBoolean(source, key) {
  const pattern = new RegExp(`["']?${key}["']?\\s*:\\s*(true|false)\\b`);
  const value = source.match(pattern)?.[1];
  return value === undefined ? undefined : value === 'true';
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isEmail(value) {
  const email = String(value || '').trim();
  return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email) && !email.includes('..');
}

function hasPlaceholder(value) {
  return /(example\.com|placeholder|todo|\u5f85\u5b9a|\u793a\u4f8b)/i.test(String(value || ''));
}

export async function runOpsCheck({ appUrl, apiBaseUrl, maxLatencyMs = 1500 }) {
  const app = ensureUrl(appUrl, 'PET_PROD_APP_URL');
  const api = ensureUrl(apiBaseUrl, 'PET_PROD_API_BASE_URL');
  const events = [];

  let result = await timedFetch('index.html', `${app}/index.html`, {}, maxLatencyMs);
  assert.equal(result.response.status, 200, 'index.html must return 200');
  for (const [name, expected] of Object.entries(SECURITY_HEADERS)) assertHeaderIncludes(result.response, name, expected);
  const html = await result.response.text();
  assert.ok(html.includes('./runtime-config.js'), 'index.html must load runtime-config.js');
  events.push({ check: 'index', durationMs: result.durationMs });

  result = await timedFetch('runtime-config.js', `${app}/runtime-config.js`, { cache: 'no-store' }, maxLatencyMs);
  assert.equal(result.response.status, 200, 'runtime-config.js must return 200');
  assertHeaderIncludes(result.response, 'cache-control', 'no-store');
  assertRuntimeConfig(await result.response.text(), api);
  events.push({ check: 'runtime-config', durationMs: result.durationMs });

  result = await timedFetch('service-worker.js', `${app}/service-worker.js`, { cache: 'no-store' }, maxLatencyMs);
  assert.equal(result.response.status, 200, 'service-worker.js must return 200');
  assertHeaderIncludes(result.response, 'cache-control', 'no-cache');
  events.push({ check: 'service-worker', durationMs: result.durationMs });

  result = await timedFetch('api health', `${api}/health`, { headers: { 'X-Request-ID': 'req_ops_health_001' } }, maxLatencyMs);
  assert.equal(result.response.status, 200, '/health must return 200');
  assert.equal(result.response.headers.get('x-request-id'), 'req_ops_health_001');
  let payload = await readPayload(result.response);
  assert.equal(payload.ok, true);
  events.push({ check: 'api-health', durationMs: result.durationMs });

  result = await timedFetch('api ready', `${api}/ready`, { headers: { 'X-Request-ID': 'req_ops_ready_001' } }, maxLatencyMs);
  assert.equal(result.response.status, 200, '/ready must return 200');
  payload = await readPayload(result.response);
  assert.equal(payload.ok, true);
  assert.ok(payload.checks?.storage?.writable, '/ready must prove storage writable');
  events.push({ check: 'api-ready', durationMs: result.durationMs });

  result = await timedFetch('unauthorized app-state', `${api}/app-state`, { headers: { 'X-Request-ID': 'req_ops_unauth_001' } }, maxLatencyMs);
  assert.equal(result.response.status, 401, 'unauthorized app-state must return 401');
  payload = await readPayload(result.response);
  assert.equal(payload.requestId, 'req_ops_unauth_001');
  events.push({ check: 'unauthorized-boundary', durationMs: result.durationMs });

  result = await timedFetch('monitoring event', `${api}/monitoring/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'req_ops_monitoring_001' },
    body: JSON.stringify({ type: 'ops_check', level: 'info', source: 'ops-check', detail: { checks: events.length } })
  }, maxLatencyMs);
  assert.equal(result.response.status, 200, 'monitoring ingest must return 200');
  payload = await readPayload(result.response);
  assert.equal(payload.ok, true);
  events.push({ check: 'monitoring-ingest', durationMs: result.durationMs });

  console.log(JSON.stringify({ ok: true, appUrl: app, apiBaseUrl: api, maxLatencyMs, checks: events }, null, 2));
}

function securityHeaders(extra = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'",
    ...extra
  };
}

async function createStaticServer(apiBaseUrl) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      if (url.pathname === '/runtime-config.js') {
        response.writeHead(200, securityHeaders({ 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' }));
        const runtimeConfig = {
          APP_RELEASE_CHANNEL: 'production',
          API_BASE_URL: apiBaseUrl,
          API_TIMEOUT_MS: 8000,
          API_MOCK_FALLBACK: false,
          MONITORING_ENDPOINT: `${apiBaseUrl}/monitoring/events`,
          MONITORING_SAMPLE_RATE: 1,
          OPERATOR_NAME: '宠伴记运营主体',
          SUPPORT_CONTACT_LABEL: '客服与投诉入口',
          SUPPORT_CONTACT_URL: `${apiBaseUrl}/support`,
          SUPPORT_EMAIL: 'support@pet-companion.test'
        };
        response.end(`window.PET_COMPANION_CONFIG = ${JSON.stringify(runtimeConfig, null, 2)};`);
        return;
      }
      const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const filePath = resolve(join(targetDir, pathname));
      if (!filePath.startsWith(targetDir)) {
        response.writeHead(403, securityHeaders());
        response.end('Forbidden');
        return;
      }
      const fileStat = await stat(filePath);
      const finalPath = fileStat.isDirectory() ? join(filePath, 'index.html') : filePath;
      const body = await readFile(finalPath);
      const cacheHeader = finalPath.endsWith('service-worker.js') ? 'no-cache' : 'public, max-age=60';
      response.writeHead(200, securityHeaders({ 'Content-Type': MIME_TYPES[extname(finalPath)] || 'application/octet-stream', 'Cache-Control': cacheHeader }));
      response.end(body);
    } catch {
      response.writeHead(404, securityHeaders());
      response.end('Not Found');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function runSelfTest() {
  assert.ok(existsSync(join(targetDir, 'index.html')), 'ops self-test requires npm run build first');
  const dataDir = await mkdtemp(join(tmpdir(), 'pet-companion-ops-'));
  process.env.PET_SERVER_DATA_DIR = dataDir;
  process.env.PET_SERVER_HOST = '127.0.0.1';
  process.env.PET_CORS_ORIGIN = '*';
  process.env.PET_SERVER_LOG_LEVEL = 'off';

  const { createPetCompanionServer } = await import('../server/index.js');
  const apiServer = createPetCompanionServer();
  await new Promise(resolve => apiServer.listen(0, '127.0.0.1', resolve));
  const apiBaseUrl = `http://127.0.0.1:${apiServer.address().port}`;
  const appServer = await createStaticServer(apiBaseUrl);
  const appUrl = `http://127.0.0.1:${appServer.address().port}`;

  try {
    await runOpsCheck({ appUrl, apiBaseUrl, maxLatencyMs: 3000 });
  } finally {
    appServer.close();
    apiServer.close();
    await rm(dataDir, { recursive: true, force: true });
  }
}

if (selfTest) {
  await runSelfTest();
} else {
  await runOpsCheck({
    appUrl: env('PET_PROD_APP_URL'),
    apiBaseUrl: env('PET_PROD_API_BASE_URL') || env('PET_API_BASE_URL'),
    maxLatencyMs: Number(env('PET_OPS_MAX_LATENCY_MS', '1500'))
  });
}
