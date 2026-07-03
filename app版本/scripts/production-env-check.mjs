import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getServerRuntimeChecks } from '../server/config.js';

const args = process.argv.slice(2);
const filePath = valueAfter('--file') || 'deploy/production.env';
const templateMode = args.includes('--template');
const productionMode = args.includes('--production');
const selfTest = args.includes('--self-test');

const composeProductionDefaults = {
  NODE_ENV: 'production',
  PET_SERVER_HOST: '0.0.0.0',
  PET_SERVER_PORT: '8787',
  PET_SERVER_DATA_DIR: '/data',
  PET_STORAGE_DRIVER: 'sqlite',
  PET_SQLITE_FILE: '/data/pet-companion.sqlite',
  PET_MEDIA_STORAGE_DRIVER: 'local',
  PET_MEDIA_LOCAL_DIR: '/data/media'
};

const requiredEnvKeys = [
  'APP_VERSION',
  'PET_CORS_ORIGIN',
  'PET_AUTH_RATE_LIMIT_MAX',
  'PET_AUTH_RATE_LIMIT_WINDOW_MS',
  'PET_TRUST_PROXY',
  'PET_MONITORING_RATE_LIMIT_MAX',
  'PET_MONITORING_RATE_LIMIT_WINDOW_MS',
  'PET_BACKUP_RETENTION_MAX',
  'PET_SERVER_REQUEST_TIMEOUT_MS',
  'PET_SERVER_HEADERS_TIMEOUT_MS',
  'PET_SERVER_KEEP_ALIVE_TIMEOUT_MS',
  'PET_ACCESS_TOKEN_TTL_MS',
  'PET_REFRESH_TOKEN_TTL_MS',
  'PET_AUTH_SECRET',
  'PET_MAX_BODY_BYTES',
  'PET_SERVER_LOG_LEVEL',
  'PET_MEDIA_STORAGE_DRIVER',
  'PET_MEDIA_LOCAL_DIR',
  'PET_MEDIA_MAX_BYTES'
];

const secretKeys = [
  'PET_AUTH_SECRET',
  'PET_MEDIA_S3_ACCESS_KEY_ID',
  'PET_MEDIA_S3_SECRET_ACCESS_KEY'
];

const placeholderPattern = /replace-with|placeholder|example\.com|example|dummy|demo|test-secret/i;
const secretPattern = /(?:AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|[A-Za-z0-9+/]{48,}={0,2})/;

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : '';
}

function parseEnv(text) {
  const values = {};
  const errors = [];
  const seen = new Set();
  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) {
      errors.push(`line ${lineNumber}: invalid KEY=value syntax`);
      continue;
    }
    const [, key, rawValue] = match;
    if (seen.has(key)) errors.push(`line ${lineNumber}: duplicate key ${key}`);
    seen.add(key);
    values[key] = rawValue.replace(/^['"]|['"]$/g, '').trim();
  }
  return { values, errors };
}

function maskedDetail(key, value) {
  if (secretKeys.includes(key)) return value ? '(set)' : '(empty)';
  return value || '(empty)';
}

function checkEnv({ path, mode }) {
  const checks = [];
  const add = (name, pass, detail = '') => checks.push({ name, pass, detail });
  if (!existsSync(path)) {
    add('production env file exists', false, path);
    return checks;
  }

  const text = readFileSync(path, 'utf8');
  const parsed = parseEnv(text);
  add('production env syntax valid', parsed.errors.length === 0, parsed.errors.join('; '));

  for (const key of requiredEnvKeys) {
    add(`production env has ${key}`, Object.hasOwn(parsed.values, key), maskedDetail(key, parsed.values[key]));
  }

  add('production env does not include private key blocks', !/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text));
  add('production env does not include shell metacharacter command snippets', !/[`;&|<>]/.test(text));

  if (mode === 'template') {
    add('template keeps auth secret placeholder', placeholderPattern.test(parsed.values.PET_AUTH_SECRET || ''), maskedDetail('PET_AUTH_SECRET', parsed.values.PET_AUTH_SECRET));
    add('template keeps example HTTPS origin', /^https:\/\/.+example\.com$/.test(parsed.values.PET_CORS_ORIGIN || ''), parsed.values.PET_CORS_ORIGIN || '(empty)');
    return checks;
  }

  for (const [key, value] of Object.entries(parsed.values)) {
    add(`production env ${key} is not placeholder`, !placeholderPattern.test(value), maskedDetail(key, value));
    if (secretKeys.includes(key)) continue;
    add(`production env ${key} has no obvious secret material`, !secretPattern.test(value), maskedDetail(key, value));
  }

  const runtimeChecks = getServerRuntimeChecks({
    envSource: { ...composeProductionDefaults, ...parsed.values },
    requireProduction: true
  });
  for (const check of runtimeChecks) {
    add(`server runtime:${check.name}`, check.pass, secretKeys.some(key => check.name.includes(key)) ? '(redacted)' : check.detail);
  }
  return checks;
}

async function runSelfTest() {
  await mkdir('output', { recursive: true });
  const okPath = join('output', 'production-env-ok.env');
  const badPath = join('output', 'production-env-bad.env');
  const okText = readFileSync('deploy/production.env.example', 'utf8')
    .replace('https://app.example.com', 'https://pets.company.invalid')
    .replace('replace-with-random-auth-secret-at-least-32-chars', 'prod-auth-secret-0123456789abcdef0123456789');
  await writeFile(okPath, okText, 'utf8');
  await writeFile(badPath, readFileSync('deploy/production.env.example', 'utf8'), 'utf8');
  const okFailed = checkEnv({ path: okPath, mode: 'production' }).filter(check => !check.pass);
  const badFailed = checkEnv({ path: badPath, mode: 'production' }).filter(check => !check.pass);
  if (okFailed.length) {
    console.error(`FAIL production env self-test :: valid env rejected: ${okFailed.map(item => item.name).join(', ')}`);
    process.exit(1);
  }
  if (!badFailed.some(check => check.name.includes('not placeholder'))) {
    console.error('FAIL production env self-test :: placeholder env was not rejected');
    process.exit(1);
  }
  console.log('PASS production env self-test');
}

if (selfTest) {
  await runSelfTest();
  process.exit(0);
}

const checks = checkEnv({ path: filePath, mode: templateMode ? 'template' : 'production' });
const failed = checks.filter(check => !check.pass);
for (const check of checks) {
  console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
}

if (failed.length) {
  console.error(`\n${failed.length} production env check(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} production env checks passed.`);
