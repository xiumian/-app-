import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { APP_VERSION, APP_BUILD_TARGET, APP_RELEASE_CHANNEL } from '../src/core/config.js';

const distDir = 'dist';
const copyTargets = [
  'index.html',
  '_headers',
  'runtime-config.js',
  'runtime-config.example.js',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'service-worker.js',
  'src',
  'assets'
];
const publicDocs = [
  'privacy.md',
  'terms.md'
];

const gates = [
  ['audit', ['./scripts/audit.mjs']],
  ['test', ['./scripts/test.mjs']],
  ['pwa:cache:check', ['./scripts/pwa-cache-check.mjs']]
];

function extractStringArray(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  if (!match) return [];
  return [...match[1].matchAll(/'([^']+)'/g)].map(item => item[1]);
}

function readPwaBuildInfo(serviceWorkerPath) {
  if (!existsSync(serviceWorkerPath)) {
    return {
      serviceWorkerPath,
      cacheName: '',
      expectedCacheName: '',
      precacheHash: '',
      matchesExpected: false,
      runtimeConfigPrecached: false
    };
  }

  const serviceWorker = readFileSync(serviceWorkerPath, 'utf8');
  const cacheName = serviceWorker.match(/const\s+CACHE_NAME\s*=\s*'([^']+)'/)?.[1] || '';
  const assets = extractStringArray(serviceWorker, 'ASSETS');
  const assetHash = createHash('sha256');
  const baseDir = dirname(serviceWorkerPath);
  for (const asset of assets.filter(item => item !== './')) {
    const normalizedAsset = asset.replace(/^\.\//, '');
    const filePath = join(baseDir, normalizedAsset);
    if (existsSync(filePath)) {
      assetHash.update(normalizedAsset);
      assetHash.update(readFileSync(filePath));
    }
  }
  const precacheHash = assetHash.digest('hex').slice(0, 12);
  const expectedCacheName = `pet-companion-v${APP_VERSION}-assets-${precacheHash}`;
  return {
    serviceWorkerPath,
    cacheName,
    expectedCacheName,
    precacheHash,
    matchesExpected: cacheName === expectedCacheName,
    runtimeConfigPrecached: assets.includes('./runtime-config.js')
  };
}

for (const [name, args] of gates) {
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.status !== 0) {
    console.error(`\nBuild gate failed: ${name}`);
    process.exit(result.status || 1);
  }
}

const resolvedDistDir = resolve(distDir);
const workspaceRoot = `${process.cwd()}${process.cwd().endsWith('\\') ? '' : '\\'}`;
if (!resolvedDistDir.startsWith(workspaceRoot)) {
  console.error(`Refusing to clean dist outside workspace: ${resolvedDistDir}`);
  process.exit(1);
}

await rm(resolvedDistDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

for (const target of copyTargets) {
  if (!existsSync(target)) continue;
  await cp(target, join(distDir, target), { recursive: true, force: true });
}

await minifyDistCss(join(distDir, 'styles.css'));
await minifyDistJs(distDir);
await syncDistServiceWorkerCache(join(distDir, 'service-worker.js'));

await mkdir(join(distDir, 'docs'), { recursive: true });
for (const doc of publicDocs) {
  const source = join('docs', doc);
  if (!existsSync(source)) continue;
  await cp(source, join(distDir, 'docs', doc), { force: true });
}

const buildInfo = {
  name: '宠伴记',
  version: APP_VERSION,
  target: APP_BUILD_TARGET,
  channel: APP_RELEASE_CHANNEL,
  builtAt: new Date().toISOString(),
  entry: './index.html',
  gates: gates.map(([name]) => name),
  audit: 'passed',
  test: 'passed',
  pwaCacheCheck: 'passed',
  publicDocs,
  pwa: readPwaBuildInfo(join(distDir, 'service-worker.js'))
};

await writeFile(join(distDir, 'build-info.json'), `${JSON.stringify(buildInfo, null, 2)}\n`, 'utf8');

console.log(`\nBuild ready: ${distDir} · v${APP_VERSION}`);

async function minifyDistCss(path) {
  if (!existsSync(path)) return;
  const css = readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
  await writeFile(path, css, 'utf8');
}

async function minifyDistJs(dir) {
  if (!existsSync(dir)) return;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await minifyDistJs(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const js = readFileSync(fullPath, 'utf8')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .join('\n');
      await writeFile(fullPath, `${js}\n`, 'utf8');
    }
  }
}

async function syncDistServiceWorkerCache(serviceWorkerPath) {
  if (!existsSync(serviceWorkerPath)) return;
  const info = readPwaBuildInfo(serviceWorkerPath);
  if (!info.expectedCacheName || info.cacheName === info.expectedCacheName) return;
  const serviceWorker = readFileSync(serviceWorkerPath, 'utf8');
  await writeFile(
    serviceWorkerPath,
    serviceWorker.replace(
      /const\s+CACHE_NAME\s*=\s*'[^']+';/,
      `const CACHE_NAME = '${info.expectedCacheName}';`
    ),
    'utf8'
  );
}
