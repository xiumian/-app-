import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8'
};

const args = new Set(process.argv.slice(2));
const allowLocal = args.has('--allow-local') || args.has('--self-test');
const selfTest = args.has('--self-test');
const targetDir = resolve('dist');

function env(name) {
  return String(process.env[name] || '').trim();
}

function ensureUrl(value, label) {
  assert.ok(value, `${label} 不能为空`);
  const url = new URL(value);
  if (!allowLocal) assert.equal(url.protocol, 'https:', `${label} 必须使用 HTTPS`);
  if (!allowLocal) assert.equal(hasPlaceholder(url.toString()), false, `${label} 不能使用占位域名`);
  return url;
}

function trimTrailingSlash(value) {
  return value.replace(/\/$/, '');
}

function assertRuntimeConfig(runtimeConfig, apiBaseUrl) {
  assert.equal(extractRuntimeString(runtimeConfig, 'APP_RELEASE_CHANNEL'), 'production', 'runtime-config 必须是 production channel');
  assert.equal(extractRuntimeBoolean(runtimeConfig, 'API_MOCK_FALLBACK'), false, 'runtime-config 必须关闭 mock fallback');
  assert.equal(extractRuntimeString(runtimeConfig, 'API_BASE_URL'), apiBaseUrl, 'runtime-config 必须指向目标 API');
  const operatorName = extractRuntimeString(runtimeConfig, 'OPERATOR_NAME');
  const supportUrl = extractRuntimeString(runtimeConfig, 'SUPPORT_CONTACT_URL');
  const supportEmail = extractRuntimeString(runtimeConfig, 'SUPPORT_EMAIL');
  assert.ok(operatorName.length >= 2, 'runtime-config 必须提供真实运营主体');
  assert.ok(isHttpsUrl(supportUrl) || isEmail(supportEmail), 'runtime-config 必须提供 HTTPS 客服/投诉入口或客服邮箱');
  for (const [key, value] of Object.entries({ OPERATOR_NAME: operatorName, SUPPORT_CONTACT_URL: supportUrl, SUPPORT_EMAIL: supportEmail })) {
    assert.equal(hasPlaceholder(value), false, `runtime-config ${key} 不能使用占位内容`);
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

function assertBuildInfo(buildInfo, serviceWorker) {
  assert.equal(buildInfo.target, 'h5-pwa', 'build-info 必须记录 h5-pwa 构建目标');
  assert.ok(Array.isArray(buildInfo.gates) && buildInfo.gates.includes('pwa:cache:check'), 'build-info 必须记录 pwa:cache:check 门禁');
  assert.equal(buildInfo.pwa?.matchesExpected, true, 'build-info PWA 缓存名必须匹配预缓存哈希');
  assert.equal(buildInfo.pwa?.runtimeConfigPrecached, false, 'build-info 必须确认 runtime-config.js 未被预缓存');
  assert.ok(buildInfo.pwa?.cacheName && serviceWorker.includes(buildInfo.pwa.cacheName), '线上 service-worker.js 必须包含 build-info 记录的缓存名');
  assert.ok(String(buildInfo.pwa?.cacheName || '').includes(String(buildInfo.pwa?.precacheHash || 'missing-hash')), 'PWA 缓存名必须包含预缓存内容哈希');
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  return { response, payload };
}

async function runSmoke({ appUrl, apiBaseUrl }) {
  const app = ensureUrl(appUrl, 'PET_PROD_APP_URL');
  const api = ensureUrl(apiBaseUrl, 'PET_PROD_API_BASE_URL');
  const normalizedAppUrl = trimTrailingSlash(app.toString());
  const normalizedApiBaseUrl = trimTrailingSlash(api.toString());

  const htmlResponse = await fetch(`${normalizedAppUrl}/index.html`);
  assert.equal(htmlResponse.status, 200, '前端 index.html 必须可访问');
  const html = await htmlResponse.text();
  assert.ok(html.includes('./runtime-config.js'), '前端必须加载 runtime-config.js');
  assert.ok(html.includes('./src/main.js'), '前端必须加载应用入口');

  const runtimeResponse = await fetch(`${normalizedAppUrl}/runtime-config.js`, { cache: 'no-store' });
  assert.equal(runtimeResponse.status, 200, 'runtime-config.js 必须可访问');
  assertRuntimeConfig(await runtimeResponse.text(), normalizedApiBaseUrl);

  const buildInfo = await fetchJson(`${normalizedAppUrl}/build-info.json`, { cache: 'no-store' });
  assert.equal(buildInfo.response.status, 200, 'build-info.json 必须可访问');
  const serviceWorkerResponse = await fetch(`${normalizedAppUrl}/service-worker.js`, { cache: 'no-store' });
  assert.equal(serviceWorkerResponse.status, 200, 'service-worker.js 必须可访问');
  assertBuildInfo(buildInfo.payload, await serviceWorkerResponse.text());

  const health = await fetchJson(`${normalizedApiBaseUrl}/health`, {
    headers: { 'X-Request-ID': 'req_smoke_health_001' }
  });
  assert.equal(health.response.status, 200, 'API /health 必须返回 200');
  assert.equal(health.response.headers.get('x-request-id'), 'req_smoke_health_001');
  assert.equal(health.payload.ok, true);
  assert.equal(health.payload.service, 'pet-companion-api');

  const ready = await fetchJson(`${normalizedApiBaseUrl}/ready`, {
    headers: { 'X-Request-ID': 'req_smoke_ready_001' }
  });
  assert.equal(ready.response.status, 200, 'API /ready 必须返回 200');
  assert.equal(ready.response.headers.get('x-request-id'), 'req_smoke_ready_001');
  assert.equal(ready.payload.ok, true);

  const unauthorized = await fetchJson(`${normalizedApiBaseUrl}/app-state`, {
    headers: { 'X-Request-ID': 'req_smoke_unauth_001' }
  });
  assert.equal(unauthorized.response.status, 401, '未授权 app-state 必须返回 401');
  assert.equal(unauthorized.response.headers.get('x-request-id'), 'req_smoke_unauth_001');
  assert.equal(unauthorized.payload.requestId, 'req_smoke_unauth_001');

  console.log(`PASS production smoke :: app=${normalizedAppUrl} api=${normalizedApiBaseUrl}`);
}

async function createStaticServer({ apiBaseUrl }) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      if (url.pathname === '/runtime-config.js') {
        response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
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
        response.writeHead(403);
        response.end('Forbidden');
        return;
      }

      const fileStat = await stat(filePath);
      const finalPath = fileStat.isDirectory() ? join(filePath, 'index.html') : filePath;
      const body = await readFile(finalPath);
      response.writeHead(200, { 'Content-Type': MIME_TYPES[extname(finalPath)] || 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('Not Found');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function runSelfTest() {
  assert.ok(existsSync(join(targetDir, 'index.html')), 'self-test 需要先执行 npm run build');
  const dataDir = await mkdtemp(join(tmpdir(), 'pet-companion-smoke-'));
  process.env.PET_SERVER_DATA_DIR = dataDir;
  process.env.PET_SERVER_HOST = '127.0.0.1';
  process.env.PET_CORS_ORIGIN = '*';
  process.env.PET_SERVER_LOG_LEVEL = 'off';

  const { createPetCompanionServer } = await import('../server/index.js');
  const apiServer = createPetCompanionServer();
  await new Promise(resolve => apiServer.listen(0, '127.0.0.1', resolve));
  const apiBaseUrl = `http://127.0.0.1:${apiServer.address().port}`;
  const appServer = await createStaticServer({ apiBaseUrl });
  const appUrl = `http://127.0.0.1:${appServer.address().port}`;

  try {
    await runSmoke({ appUrl, apiBaseUrl });
  } finally {
    appServer.close();
    apiServer.close();
    await rm(dataDir, { recursive: true, force: true });
  }
}

if (selfTest) {
  await runSelfTest();
} else {
  await runSmoke({
    appUrl: env('PET_PROD_APP_URL'),
    apiBaseUrl: env('PET_PROD_API_BASE_URL') || env('PET_API_BASE_URL')
  });
}
