import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const fixMode = process.argv.includes('--fix');
const checks = [];
const add = (name, pass, detail = '') => checks.push({ name, pass, detail });
const normalize = path => path.replaceAll('\\\\', '/').replaceAll('\\', '/');

async function collectJsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectJsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(normalize(relative('.', fullPath)));
    }
  }
  return files;
}

function extractStringArray(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  if (!match) return [];
  return [...match[1].matchAll(/'([^']+)'/g)].map(item => item[1]);
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const config = readFileSync('src/core/config.js', 'utf8');
const serviceWorker = readFileSync('service-worker.js', 'utf8');

const appVersion = config.match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1] || '';
const cacheName = serviceWorker.match(/const\s+CACHE_NAME\s*=\s*'([^']+)'/)?.[1] || '';
const assets = extractStringArray(serviceWorker, 'ASSETS');
const assetSet = new Set(assets);
const srcJsFiles = await collectJsFiles('src');
const hashableAssets = assets
  .filter(asset => asset !== './')
  .map(asset => asset.replace(/^\.\//, ''));
const assetHash = createHash('sha256');
for (const asset of hashableAssets) {
  if (existsSync(asset)) {
    assetHash.update(asset);
    assetHash.update(readFileSync(asset));
  }
}
const cacheAssetHash = assetHash.digest('hex').slice(0, 12);
const expectedCacheName = `pet-companion-v${pkg.version}-assets-${cacheAssetHash}`;

if (fixMode && cacheName !== expectedCacheName) {
  const nextServiceWorker = serviceWorker.replace(
    /const\s+CACHE_NAME\s*=\s*'[^']+';/,
    `const CACHE_NAME = '${expectedCacheName}';`
  );
  await import('node:fs/promises').then(fs => fs.writeFile('service-worker.js', nextServiceWorker, 'utf8'));
  console.log(`Updated service-worker cache name: ${expectedCacheName}`);
}
const checkedCacheName = fixMode ? expectedCacheName : cacheName;

add('package version matches app version', pkg.version === appVersion, `${pkg.version} vs ${appVersion}`);
add('service worker cache name exists', Boolean(cacheName));
add('service worker cache name matches generated version/hash', checkedCacheName === expectedCacheName, `${checkedCacheName} vs ${expectedCacheName}`);
add('service worker cache name uses app prefix', checkedCacheName.startsWith('pet-companion-'), checkedCacheName);
add('service worker excludes runtime config from precache', !assetSet.has('./runtime-config.js') && !serviceWorker.includes("'./runtime-config.js'"));

for (const asset of ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest', './assets/icon.svg', './assets/maskable-icon.svg']) {
  add(`service worker precaches:${asset}`, assetSet.has(asset), asset);
}

for (const file of srcJsFiles) {
  add(`service worker precaches:${file}`, assetSet.has(`./${file}`), file);
}

add('service worker controls activation', serviceWorker.includes('SKIP_WAITING') && serviceWorker.includes('self.skipWaiting()'));
add('service worker claims clients after activate', serviceWorker.includes('self.clients.claim()'));
add('service worker deletes old app caches only', serviceWorker.includes("key.startsWith('pet-companion-')") && serviceWorker.includes('key !== CACHE_NAME'));
add('service worker provides offline navigation fallback', serviceWorker.includes("event.request.mode === 'navigate'") && serviceWorker.includes("caches.match('./index.html')"));

const failed = checks.filter(check => !check.pass);
for (const check of checks) {
  console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
}

if (failed.length) {
  console.error(`\n${failed.length} PWA cache checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} PWA cache checks passed.`);
