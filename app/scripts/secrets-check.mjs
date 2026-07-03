import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['.git', 'node_modules', 'output', 'server-data']);
const TEXT_EXTENSIONS = new Set([
  '.css', '.html', '.js', '.json', '.md', '.mjs', '.svg', '.txt', '.webmanifest', '.yml'
]);
const SECRET_NAME = /(?:SECRET|TOKEN|PASSWORD|PASS|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|API[_-]?KEY|COOKIE|SESSION)/i;
const ASSIGNMENT = /([A-Z0-9_]*?(?:SECRET|TOKEN|PASSWORD|PASS|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|API[_-]?KEY|COOKIE|SESSION)[A-Z0-9_-]*)\s*[:=]\s*['"]?([^'"\s,#}]+)/gi;
const PRIVATE_KEY_BLOCK = new RegExp('-----BEGIN [A-Z ]*' + 'PRIVATE KEY-----');
const CERT_BLOCK = new RegExp('-----BEGIN ' + 'CERTIFICATE-----');
const AWS_KEY = new RegExp('\\b' + 'AKIA' + '[0-9A-Z]{16}\\b');

const allowedValueHints = [
  '',
  '***',
  'example',
  'placeholder',
  'replace-with',
  'test-',
  'demo',
  'dummy',
  'local',
  'app.example.com',
  'api.example.com',
  'cdn.example.com',
  's3.example.com',
  'monitoring.example.com',
  'must-not-persist',
  'client-secret',
  'client-refresh',
  'pat_secret',
  'pat_new'
];

const allowedFiles = new Set([
  'deploy/production.env.example'
]);

const failures = [];
const scanned = [];

function normalizePath(path) {
  return path.split(sep).join('/');
}

function addFailure(file, rule) {
  failures.push({ file, rule });
}

function extensionOf(file) {
  const match = file.match(/(\.[^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}

function isAllowedSecretValue(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return allowedValueHints.some(hint => normalized === hint || normalized.includes(hint));
}

function looksLikeBinary(buffer) {
  if (!buffer.length) return false;
  const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
  return sample.includes(0);
}

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.name === 'certs' && normalizePath(relative(ROOT, join(dir, entry.name))) === 'deploy/certs') continue;
      walk(join(dir, entry.name));
      continue;
    }
    if (!entry.isFile()) continue;
    const file = normalizePath(relative(ROOT, join(dir, entry.name)));
    const ext = extensionOf(file);
    if (!TEXT_EXTENSIONS.has(ext) && !['Dockerfile', '.gitignore', '.dockerignore', '_headers'].includes(entry.name)) continue;
    const stat = statSync(join(dir, entry.name));
    if (stat.size > 512 * 1024) continue;
    scanned.push(file);
  }
}

if (existsSync('deploy/production.env')) addFailure('deploy/production.env', 'real production env file must not be present in the repository workspace');
if (existsSync('deploy/certs')) addFailure('deploy/certs', 'TLS certificate directory must not be present in the repository workspace');

walk(ROOT);

for (const file of scanned) {
  const fullPath = join(ROOT, file);
  const buffer = readFileSync(fullPath);
  if (looksLikeBinary(buffer)) continue;
  const text = buffer.toString('utf8');

  if (!allowedFiles.has(file) && PRIVATE_KEY_BLOCK.test(text)) addFailure(file, 'private key block detected');
  if (!allowedFiles.has(file) && CERT_BLOCK.test(text)) addFailure(file, 'certificate block detected');
  if (AWS_KEY.test(text)) addFailure(file, 'AWS access key id pattern detected');

  for (const match of text.matchAll(ASSIGNMENT)) {
    const [, name, value] = match;
    if (!SECRET_NAME.test(name)) continue;
    if (isAllowedSecretValue(value)) continue;
    if (/^\d+$/.test(value)) continue;
    if (value.length < 12) continue;
    addFailure(file, `possible secret assignment for ${name}`);
  }
}

for (const item of failures) {
  console.error(`FAIL ${item.file} :: ${item.rule}`);
}

if (failures.length) {
  console.error(`\n${failures.length} secret hygiene checks failed.`);
  process.exit(1);
}

console.log(`PASS secret hygiene :: scanned ${scanned.length} text files`);
