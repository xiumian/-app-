import { existsSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const distDir = 'dist';
const checks = [];
const add = (name, pass, detail = '') => checks.push({ name, pass, detail });

const allowedMarkdown = new Set([
  'docs/privacy.md',
  'docs/terms.md'
]);

const forbiddenArtifacts = [
  'README.md',
  'docs/requirements.md',
  'docs/api-contract.md',
  'docs/architecture.md',
  'docs/backend.md',
  'docs/deployment.md',
  'docs/operations.md',
  'docs/production-readiness.md',
  'docs/release-evidence.md',
  'docs/release-runbook.md',
  'docs/manual-device-acceptance.md',
  'docs/rollback.md',
  'docs/security.md',
  'docs/ci.md',
  'docs/external-evidence.md',
  'docs/runtime-config.md',
  'deploy',
  'server',
  'scripts',
  'output',
  '.github'
];

const textLikeExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.svg',
  '.txt',
  '.webmanifest'
]);

const internalLeakPatterns = [
  /deploy\/production\.env/i,
  /deploy\/target\.json/i,
  /deploy\/production-evidence\.example\.json/i,
  /output\/production-evidence\.json/i,
  /output\/release-evidence\.json/i,
  /docs\/manual-device-acceptance\.md/i,
  /docs\/release-runbook\.md/i,
  /docs\/rollback\.md/i,
  /server\/index\.js/i,
  /scripts\/.+\.mjs/i,
  /PET_AUTH_SECRET/i,
  /PRIVATE_KEY_BLOCK/i,
  /BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY/i
];

function normalizePath(path) {
  return path.replaceAll('\\\\', '/').replaceAll('\\', '/');
}

function extensionOf(path) {
  const match = path.match(/(\.[^.\/]+)$/);
  return match ? match[1].toLowerCase() : '';
}

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

add('dist exists', existsSync(join(distDir, 'index.html')), 'run npm run build first');

let files = [];
if (existsSync(join(distDir, 'index.html'))) {
  files = (await collectFiles(distDir))
    .map(file => ({ fullPath: file, path: normalizePath(relative(distDir, file)) }));
}

const totalBytes = files.reduce((sum, file) => sum + statSyncSize(file.fullPath), 0);
const markdownFiles = files.filter(file => file.path.endsWith('.md')).map(file => file.path).sort();

for (const file of ['index.html', 'src/main.js', 'styles.css', 'service-worker.js', 'docs/privacy.md', 'docs/terms.md']) {
  add(`public bundle includes:${file}`, files.some(item => item.path === file), file);
}

for (const artifact of forbiddenArtifacts) {
  add(
    `public bundle excludes:${artifact}`,
    !files.some(file => file.path === artifact || file.path.startsWith(`${artifact}/`)),
    artifact
  );
}

add('public markdown limited to legal docs', markdownFiles.every(file => allowedMarkdown.has(file)), markdownFiles.join(', ') || '(none)');
add('public bundle stays under 180KB', totalBytes <= 180 * 1024, `${totalBytes} bytes`);

const publicLegalForbiddenPattern = /(Before a public|Implementation Notes|Production privacy tasks|TODO|TBD|待填写|占位|placeholder|example\.com|正式上线前)/i;
for (const file of allowedMarkdown) {
  const fullPath = join(distDir, file);
  if (!existsSync(fullPath)) continue;
  const text = readFileSync(fullPath, 'utf8');
  add(`public legal doc has no launch placeholders:${file}`, !publicLegalForbiddenPattern.test(text), file);
  add(`public legal doc names operator responsibility:${file}`, text.includes('实际部署并对外提供服务的一方负责运营'), file);
}

const buildInfo = existsSync(join(distDir, 'build-info.json'))
  ? JSON.parse(readFileSync(join(distDir, 'build-info.json'), 'utf8'))
  : null;
add('build info records public docs', Array.isArray(buildInfo?.publicDocs) && buildInfo.publicDocs.includes('privacy.md') && buildInfo.publicDocs.includes('terms.md'));

const suspiciousExtensions = ['.map', '.bak', '.tmp', '.log'];
for (const extension of suspiciousExtensions) {
  add(`public bundle excludes ${extension}`, !files.some(file => file.path.endsWith(extension)));
}

for (const file of files.filter(file => textLikeExtensions.has(extensionOf(file.path)))) {
  const text = readFileSync(file.fullPath, 'utf8');
  const leak = internalLeakPatterns.find(pattern => pattern.test(text));
  add(`public text has no internal deployment references:${file.path}`, !leak, leak ? String(leak) : file.path);
}

const failed = checks.filter(check => !check.pass);
for (const check of checks) {
  console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
}

if (failed.length) {
  console.error(`\n${failed.length} public bundle checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} public bundle checks passed (${files.length} files, ${totalBytes} bytes).`);

function statSyncSize(path) {
  return Number(readFileSync(path).byteLength);
}
