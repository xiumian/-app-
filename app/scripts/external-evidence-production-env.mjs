#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const outputDir = 'output';
const latestJsonPath = `${outputDir}/production-env-evidence-latest.json`;
const latestMarkdownPath = `${outputDir}/production-env-evidence-latest.md`;
const DEFAULT_FILE = 'deploy/production.env';
const REQUIRED_KEYS = [
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
const SECRET_KEYS = new Set([
  'PET_AUTH_SECRET',
  'PET_MEDIA_S3_ACCESS_KEY_ID',
  'PET_MEDIA_S3_SECRET_ACCESS_KEY'
]);
const PLACEHOLDER_PATTERN = /replace-with|placeholder|example\.com|example|dummy|demo|test-secret/i;
const PRIVATE_BLOCK_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const SECRET_TEXT_PATTERN = /(password|secret|token|cookie|private[_-]?key|access[_-]?key|AKIA[0-9A-Z]{16}|-----BEGIN)/i;

function parseArgs(argv) {
  const result = { file: DEFAULT_FILE, owner: 'production-env-owner' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      result.help = true;
      continue;
    }
    if (arg === '--self-test') {
      result.selfTest = true;
      continue;
    }
    if (!arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
    result[key] = value.trim();
    index += 1;
  }
  return result;
}

function usage() {
  return `Usage: node ./scripts/external-evidence-production-env.mjs [--file deploy/production.env] [--review-ref <masked-ref>] [--owner <owner-id>]

Examples:
  npm.cmd run external:evidence:production-env -- --file deploy/production.env --review-ref "ops-ticket-456#masked-env-review" --owner "ops-wang"
  npm.cmd run external:evidence:update -- --id productionEnv --status verified --owner "ops-wang" --evidence-ref "output/production-env-evidence-latest.json" --proof-ref "output/production-env-evidence-latest.json#file-metadata" --proof-ref "output/production-env-evidence-latest.json#masked-config" --proof-ref "output/production-env-evidence-latest.json#not-in-repo"

This collector stores key presence, file metadata, and masked review references only. It never writes env values to evidence output.`;
}

function assertSafeText(label, value, { allowEmpty = false } = {}) {
  const text = String(value || '').trim();
  if (!allowEmpty && !text) throw new Error(`${label} is required`);
  if (SECRET_TEXT_PATTERN.test(text)) throw new Error(`${label} appears to contain a secret; store only a masked ticket/link/record`);
  return text;
}

function parseEnv(text) {
  const values = {};
  const errors = [];
  const duplicateKeys = [];
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
    if (seen.has(key)) duplicateKeys.push(key);
    seen.add(key);
    values[key] = rawValue.replace(/^['"]|['"]$/g, '').trim();
  }
  return { values, errors, duplicateKeys };
}

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function formatChinaTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} +08:00`;
}

function gitEvidenceFor(file) {
  const inside = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
  if (inside.status !== 0) {
    return {
      checked: false,
      status: 'not_git_worktree',
      detail: 'Current directory is not a git worktree; operator must verify the production env file is not committed in the deployment repo.'
    };
  }
  const result = spawnSync('git', ['status', '--ignored', '--short', '--', file], { encoding: 'utf8' });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  return {
    checked: result.status === 0,
    status: output.startsWith('!!') ? 'ignored' : output ? 'visible_to_git_status' : 'not_listed_by_git_status',
    detail: output || 'no git status output for file'
  };
}

function buildUpdateCommand({ owner, reviewRef, readyForProvided, readyForVerified }) {
  const proofRefs = [
    `${latestJsonPath}#file-metadata`,
    reviewRef || `${latestJsonPath}#masked-config`,
    `${latestJsonPath}#not-in-repo`
  ];
  const status = readyForVerified ? 'verified' : 'provided';
  const base = `npm.cmd run external:evidence:update -- --id productionEnv --status ${status} --owner "${owner}" --evidence-ref "${latestJsonPath}"`;
  return readyForProvided ? `${base}${proofRefs.map(ref => ` --proof-ref "${ref}"`).join('')}` : '# production env evidence is incomplete; fix syntax, placeholders, or required keys before registering';
}

function escapePipes(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function markdownFor(payload) {
  const requiredRows = payload.keySummary.required.map(key => `| ${key} | ${payload.keySummary.missing.includes(key) ? 'missing' : 'present'} | ${SECRET_KEYS.has(key) ? 'secret-set-only' : 'masked'} |`);
  const coverageRows = payload.requiredProofCoverage.map((item, index) => `| ${index + 1} | ${escapePipes(item.requiredProof)} | ${item.covered ? 'yes' : 'no'} | ${escapePipes(item.proofRef || 'missing')} |`);
  return `# productionEnv external evidence result

- Generated at: ${payload.generatedAtLocal}
- Env file path: ${payload.envFile.path}
- Env file exists: ${payload.envFile.exists ? 'yes' : 'no'}
- Review reference: ${payload.reviewRef || 'missing'}
- Summary: ${payload.summary.readyForVerified ? 'ready for verified after human review' : payload.summary.readyForProvided ? 'ready for provided; one or more verified proof refs still need review' : 'not ready; fix env evidence first'}

## File metadata

| Item | Result |
| --- | --- |
| Exists | ${payload.envFile.exists ? 'yes' : 'no'} |
| Size bytes | ${payload.envFile.sizeBytes == null ? 'unknown' : payload.envFile.sizeBytes} |
| Modified at | ${payload.envFile.modifiedAt || 'unknown'} |
| Mode | ${payload.envFile.mode || 'unknown'} |
| Git status | ${payload.git.status} |
| Git detail | ${escapePipes(payload.git.detail)} |

## Required key coverage

| Key | Status | Output policy |
| --- | --- | --- |
${requiredRows.join('\n')}

## Safe config summary

- Syntax errors: ${payload.keySummary.syntaxErrors.length}
- Missing required keys: ${payload.keySummary.missing.length}
- Placeholder keys: ${payload.keySummary.placeholderKeys.length ? payload.keySummary.placeholderKeys.join(', ') : 'none'}
- Secret keys set: ${payload.keySummary.secretKeysSet.length ? payload.keySummary.secretKeysSet.join(', ') : 'none'}
- Private key block present: ${payload.keySummary.privateKeyBlockPresent ? 'yes' : 'no'}

## requiredProof coverage

| # | requiredProof | covered | proofRef |
| ---: | --- | --- | --- |
${coverageRows.join('\n')}

## Suggested update command

~~~powershell
${payload.suggestedUpdateCommand}
~~~

This file intentionally does not include env values, passwords, tokens, cookies, private keys, or production secrets. Use it as a masked evidence pointer only.
`;
}

async function collect(options) {
  const file = assertSafeText('file', options.file || DEFAULT_FILE);
  const owner = assertSafeText('owner', options.owner || 'production-env-owner');
  const reviewRef = options.reviewRef ? assertSafeText('reviewRef', options.reviewRef) : '';
  const generatedAt = new Date();
  const exists = existsSync(file);
  let metadata = { exists, sizeBytes: null, modifiedAt: '', mode: '' };
  let keySummary = {
    required: REQUIRED_KEYS,
    present: [],
    missing: REQUIRED_KEYS,
    syntaxErrors: [],
    duplicateKeys: [],
    placeholderKeys: [],
    secretKeysSet: [],
    privateKeyBlockPresent: false
  };

  if (exists) {
    const fileStat = await stat(file);
    const text = readFileSync(file, 'utf8');
    const parsed = parseEnv(text);
    const present = REQUIRED_KEYS.filter(key => Object.hasOwn(parsed.values, key));
    const missing = REQUIRED_KEYS.filter(key => !Object.hasOwn(parsed.values, key));
    const placeholderKeys = Object.entries(parsed.values)
      .filter(([, value]) => PLACEHOLDER_PATTERN.test(value))
      .map(([key]) => key);
    const secretKeysSet = Object.entries(parsed.values)
      .filter(([key, value]) => SECRET_KEYS.has(key) && String(value || '').trim())
      .map(([key]) => key);
    metadata = {
      exists,
      sizeBytes: fileStat.size,
      modifiedAt: fileStat.mtime.toISOString(),
      mode: `0${(fileStat.mode & 0o777).toString(8)}`
    };
    keySummary = {
      required: REQUIRED_KEYS,
      present,
      missing,
      syntaxErrors: parsed.errors,
      duplicateKeys: parsed.duplicateKeys,
      placeholderKeys,
      secretKeysSet,
      privateKeyBlockPresent: PRIVATE_BLOCK_PATTERN.test(text)
    };
  }

  const fileMetadataCovered = Boolean(exists && metadata.sizeBytes > 0);
  const maskedConfigCovered = Boolean(
    exists &&
    keySummary.syntaxErrors.length === 0 &&
    keySummary.duplicateKeys.length === 0 &&
    keySummary.missing.length === 0 &&
    keySummary.placeholderKeys.length === 0 &&
    keySummary.secretKeysSet.includes('PET_AUTH_SECRET') &&
    !keySummary.privateKeyBlockPresent
  );
  const git = gitEvidenceFor(file);
  const notInRepoCovered = git.status === 'ignored' || git.status === 'not_listed_by_git_status' || git.status === 'not_git_worktree';
  const readyForProvided = fileMetadataCovered || maskedConfigCovered;
  const readyForVerified = fileMetadataCovered && maskedConfigCovered && notInRepoCovered && Boolean(reviewRef);

  const payload = {
    schema: 'pet-companion-production-env-evidence-v1',
    generatedAt: generatedAt.toISOString(),
    generatedAtLocal: formatChinaTime(generatedAt),
    owner,
    reviewRef,
    envFile: {
      path: file,
      ...metadata
    },
    git,
    keySummary,
    output: {
      latestJsonPath,
      latestMarkdownPath,
      archiveJsonPath: `${outputDir}/production-env-evidence-${timestampForPath(generatedAt)}.json`,
      archiveMarkdownPath: `${outputDir}/production-env-evidence-${timestampForPath(generatedAt)}.md`
    },
    summary: {
      readyForProvided,
      readyForVerified,
      fileMetadataCovered,
      maskedConfigCovered,
      notInRepoCovered,
      reviewRefProvided: Boolean(reviewRef)
    },
    requiredProofCoverage: [
      {
        requiredProof: 'Production host env file path and permission record',
        covered: fileMetadataCovered,
        proofRef: fileMetadataCovered ? `${latestJsonPath}#file-metadata` : ''
      },
      {
        requiredProof: 'Masked production config review screenshot or ticket',
        covered: maskedConfigCovered && Boolean(reviewRef),
        proofRef: reviewRef || `${latestJsonPath}#masked-config`
      },
      {
        requiredProof: 'Confirmation that deploy/production.env is not committed to the repo',
        covered: notInRepoCovered,
        proofRef: `${latestJsonPath}#not-in-repo`
      }
    ]
  };
  payload.suggestedUpdateCommand = buildUpdateCommand({ owner, reviewRef, readyForProvided, readyForVerified });
  return payload;
}

async function writeOutputs(payload) {
  await mkdir(outputDir, { recursive: true });
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  const markdown = markdownFor(payload);
  await writeFile(payload.output.archiveJsonPath, json, 'utf8');
  await writeFile(payload.output.archiveMarkdownPath, markdown, 'utf8');
  await writeFile(latestJsonPath, json, 'utf8');
  await writeFile(latestMarkdownPath, markdown, 'utf8');
}

async function runSelfTest() {
  const checks = [];
  const add = (name, pass, detail = '') => checks.push({ name, pass, detail });
  await mkdir(outputDir, { recursive: true });
  const fixturePath = `${outputDir}/production-env-evidence-fixture.env`;
  const fixtureSecret = 'prod-auth-secret-0123456789abcdef0123456789';
  const fixtureText = readFileSync('deploy/production.env.example', 'utf8')
    .replace('https://app.example.com', 'https://pets.company.invalid')
    .replace('replace-with-random-auth-secret-at-least-32-chars', fixtureSecret);
  await writeFile(fixturePath, fixtureText, 'utf8');
  const payload = await collect({ file: fixturePath, owner: 'ops-wang', reviewRef: 'ops-ticket-456#masked-env-review' });
  const json = JSON.stringify(payload);
  const markdown = markdownFor(payload);
  add('collector does not expose secret value in json', !json.includes(fixtureSecret));
  add('collector does not expose secret value in markdown', !markdown.includes(fixtureSecret));
  add('collector sees required keys', payload.keySummary.missing.length === 0);
  add('collector records PET_AUTH_SECRET as set only', payload.keySummary.secretKeysSet.includes('PET_AUTH_SECRET'));
  add('collector builds update command', payload.suggestedUpdateCommand.includes('external:evidence:update') && payload.suggestedUpdateCommand.includes('--id productionEnv'));
  add('markdown documents required proof coverage', markdown.includes('requiredProof coverage') && markdown.includes('Suggested update command'));

  let failed = 0;
  for (const check of checks) {
    if (check.pass) console.log(`PASS ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
    else {
      failed += 1;
      console.error(`FAIL ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
    }
  }
  if (failed) throw new Error(`${failed} production env self-test checks failed`);
  console.log(`\nPASS external evidence production env self-test :: ${checks.length} checks passed.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (options.selfTest) {
    await runSelfTest();
    return;
  }
  const payload = await collect(options);
  await writeOutputs(payload);
  console.log(`PASS productionEnv evidence latest json :: ${latestJsonPath}`);
  console.log(`PASS productionEnv evidence latest markdown :: ${latestMarkdownPath}`);
  console.log(`PASS productionEnv evidence archive json :: ${payload.output.archiveJsonPath}`);
  console.log(`PASS productionEnv evidence archive markdown :: ${payload.output.archiveMarkdownPath}`);
  console.log(`productionEnv readyForProvided: ${payload.summary.readyForProvided}`);
  console.log(`productionEnv readyForVerified: ${payload.summary.readyForVerified}`);
  console.log('Suggested update command:');
  console.log(payload.suggestedUpdateCommand);
}

main().catch(error => {
  console.error(`FAIL external evidence production env :: ${error.message}`);
  process.exit(1);
});
