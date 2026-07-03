import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import vm from 'node:vm';

const args = new Set(process.argv.slice(2));
const distDir = args.has('--dist') ? 'dist' : 'dist';
const productionMode = args.has('--production');
const checks = [];

function add(name, pass, detail = '') {
  checks.push({ name, pass, detail });
}

function readText(path) {
  return readFileSync(path, 'utf8');
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function parseRuntimeConfig(path) {
  const code = readText(path);
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: path, timeout: 1000 });
  return sandbox.window.PET_COMPANION_CONFIG || {};
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
  return /(example\.com|placeholder|todo|待定|示例)/i.test(String(value || ''));
}

function extractStringArray(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  if (!match) return [];
  return [...match[1].matchAll(/'([^']+)'/g)].map(item => item[1]);
}

function readPwaDistEvidence() {
  const assets = extractStringArray(serviceWorker, 'ASSETS');
  const cacheName = serviceWorker.match(/const\s+CACHE_NAME\s*=\s*'([^']+)'/)?.[1] || '';
  const assetHash = createHash('sha256');
  for (const asset of assets.filter(item => item !== './')) {
    const normalizedAsset = asset.replace(/^\.\//, '');
    const filePath = join(distDir, normalizedAsset);
    if (existsSync(filePath)) {
      assetHash.update(normalizedAsset);
      assetHash.update(readFileSync(filePath));
    }
  }
  const precacheHash = assetHash.digest('hex').slice(0, 12);
  const expectedCacheName = `pet-companion-v${pkg.version}-assets-${precacheHash}`;
  return {
    assets,
    cacheName,
    precacheHash,
    expectedCacheName,
    matchesExpected: cacheName === expectedCacheName,
    runtimeConfigPrecached: assets.includes('./runtime-config.js')
  };
}

const requiredDistFiles = [
  'index.html',
  'runtime-config.js',
  'runtime-config.example.js',
  'styles.css',
  'manifest.webmanifest',
  'service-worker.js',
  'build-info.json',
  '_headers',
  'assets/icon.svg',
  'assets/maskable-icon.svg',
  'src/main.js'
];

for (const file of requiredDistFiles) {
  add(`dist file:${file}`, existsSync(join(distDir, file)), file);
}

if (checks.some(check => !check.pass)) {
  for (const check of checks) console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
  console.error('\n部署检查缺少必要文件。');
  process.exit(1);
}

const pkg = readJson('package.json');
const buildInfo = readJson(join(distDir, 'build-info.json'));
const manifest = readJson(join(distDir, 'manifest.webmanifest'));
const index = readText(join(distDir, 'index.html'));
const serviceWorker = readText(join(distDir, 'service-worker.js'));
const headers = readText(join(distDir, '_headers'));
const runtimeCode = readText(join(distDir, 'runtime-config.js'));
const runtimeConfig = parseRuntimeConfig(join(distDir, 'runtime-config.js'));
const pwaDist = readPwaDistEvidence();

add('build version matches package', buildInfo.version === pkg.version, `${buildInfo.version} vs ${pkg.version}`);
add('build target is h5-pwa', buildInfo.target === 'h5-pwa');
add('build gates recorded', Array.isArray(buildInfo.gates) && buildInfo.gates.includes('audit') && buildInfo.gates.includes('test') && buildInfo.gates.includes('pwa:cache:check'));
add('build audit test and pwa cache passed', buildInfo.audit === 'passed' && buildInfo.test === 'passed' && buildInfo.pwaCacheCheck === 'passed');
add('build pwa cache metadata recorded', buildInfo.pwa?.cacheName && buildInfo.pwa?.precacheHash && buildInfo.pwa?.matchesExpected === true);
add('build pwa runtime config excluded', buildInfo.pwa?.runtimeConfigPrecached === false);
add('build pwa cache hash matches dist', buildInfo.pwa?.precacheHash === pwaDist.precacheHash, `${buildInfo.pwa?.precacheHash || 'missing'} vs ${pwaDist.precacheHash}`);
add('build pwa expected cache name matches dist', buildInfo.pwa?.expectedCacheName === pwaDist.expectedCacheName, `${buildInfo.pwa?.expectedCacheName || 'missing'} vs ${pwaDist.expectedCacheName}`);

add('index loads runtime config before module', index.indexOf('./runtime-config.js') > -1 && index.indexOf('./runtime-config.js') < index.indexOf('./src/main.js'));
add('index has manifest and theme color', index.includes('rel="manifest"') && index.includes('name="theme-color"'));

add('manifest standalone pwa', manifest.display === 'standalone' && manifest.start_url && manifest.scope);
add('manifest has maskable icon', Array.isArray(manifest.icons) && manifest.icons.some(icon => String(icon.purpose).includes('maskable')));
add('manifest language is zh-CN', manifest.lang === 'zh-CN');

add('service worker cache excludes runtime config', !serviceWorker.includes('runtime-config.js'));
add('service worker caches app entry', serviceWorker.includes('./index.html') && serviceWorker.includes('./src/main.js'));
add('service worker cache matches build info', serviceWorker.includes(buildInfo.pwa?.cacheName || '(missing-cache-name)'));
add('service worker cache matches generated hash', pwaDist.matchesExpected, `${pwaDist.cacheName} vs ${pwaDist.expectedCacheName}`);
add('service worker runtime config excluded from precache list', pwaDist.runtimeConfigPrecached === false);

add('runtime config object exists', runtimeConfig && typeof runtimeConfig === 'object' && !Array.isArray(runtimeConfig));
add('runtime config timeout valid', Number(runtimeConfig.API_TIMEOUT_MS) >= 1000 && Number(runtimeConfig.API_TIMEOUT_MS) <= 30000);
add('runtime config sample rate valid', Number(runtimeConfig.MONITORING_SAMPLE_RATE) >= 0 && Number(runtimeConfig.MONITORING_SAMPLE_RATE) <= 1);
add('runtime config support fields valid', ['OPERATOR_NAME', 'SUPPORT_CONTACT_LABEL', 'SUPPORT_CONTACT_URL', 'SUPPORT_EMAIL'].every(key => typeof (runtimeConfig[key] || '') === 'string'));
add('runtime config contains no obvious secrets', !/token|cookie|private[_-]?key|password/i.test(runtimeCode));

if (productionMode) {
  add('production release channel', runtimeConfig.APP_RELEASE_CHANNEL === 'production');
  add('production api is https', isHttpsUrl(runtimeConfig.API_BASE_URL));
  add('production disables mock fallback', runtimeConfig.API_MOCK_FALLBACK === false);
  add('production monitoring is https', isHttpsUrl(runtimeConfig.MONITORING_ENDPOINT));
  add('production operator name configured', typeof runtimeConfig.OPERATOR_NAME === 'string' && runtimeConfig.OPERATOR_NAME.trim().length >= 2);
  add('production support contact configured', isHttpsUrl(runtimeConfig.SUPPORT_CONTACT_URL) || isEmail(runtimeConfig.SUPPORT_EMAIL));
  add('production runtime config has no placeholders', ['API_BASE_URL', 'MONITORING_ENDPOINT', 'OPERATOR_NAME', 'SUPPORT_CONTACT_URL', 'SUPPORT_EMAIL'].every(key => !hasPlaceholder(runtimeConfig[key])));
} else {
  add('local deploy profile accepted', typeof runtimeConfig.APP_RELEASE_CHANNEL === 'string' && runtimeConfig.APP_RELEASE_CHANNEL.length > 0);
}

add('security headers include CSP', headers.includes('Content-Security-Policy'));
add('security headers include nosniff', headers.includes('X-Content-Type-Options: nosniff'));
add('security headers restrict permissions', headers.includes('Permissions-Policy'));
add('security headers set referrer policy', headers.includes('Referrer-Policy'));

const failed = checks.filter(check => !check.pass);
for (const check of checks) {
  console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
}

if (failed.length) {
  console.error(`\n${failed.length} deploy check(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} deploy checks passed${productionMode ? ' for production mode' : ''}.`);
