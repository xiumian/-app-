import { existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const evidencePath = 'output/production-evidence.json';
const backupDir = 'output/evidence-backups';
const allowedStatus = new Set(['pending', 'provided', 'verified']);
const secretPattern = /(password|secret|token|cookie|private[_-]?key|access[_-]?key|AKIA[0-9A-Z]{16}|-----BEGIN)/i;
const placeholderPattern = /(example\.com|ops-owner|legal-owner|qa-owner|placeholder|todo|\u5f85\u5b9a|\u793a\u4f8b)/i;
const mojibakePattern = /\?{2,}/;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_EVIDENCE_AGE_MS = 90 * 24 * 60 * 60 * 1000;

function parseArgs(argv) {
  const result = { dryRun: false, proofRef: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      result.dryRun = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      result.help = true;
      continue;
    }
    if (!arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
    if (key === 'proofRef') {
      result.proofRef.push(value.trim());
    } else {
      result[key] = value.trim();
    }
    index += 1;
  }
  return result;
}

function usage() {
  return `Usage: node ./scripts/external-evidence-update.mjs --id <id> --status <pending|provided|verified> [--owner <name>] [--evidence-ref <ref>] [--proof-ref <ref>]... [--checked-at <iso>] [--dry-run]

Examples:
  npm run external:evidence:update -- --id domainTls --status provided --owner ops-wang --evidence-ref "ops-ticket-123" --proof-ref "ops-ticket-123#https" --dry-run
  npm run external:evidence:update -- --id legalApproval --status verified --owner legal-wang --evidence-ref "legal-checklist-2026-06-29" --proof-ref "legal-checklist-2026-06-29#operator" --proof-ref "legal-checklist-2026-06-29#policy"`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
}

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function backupPathForTarget(path) {
  return `${backupDir}/${path.split('/').pop().replace(/\.json$/, '')}.${timestampForPath()}.json`;
}

function assertSafeText(label, value, { allowEmpty = false, blockPlaceholder = false } = {}) {
  const text = String(value || '').trim();
  if (!allowEmpty && !text) throw new Error(`${label} is required`);
  if (mojibakePattern.test(text)) throw new Error(`${label} contains mojibake markers`);
  if (secretPattern.test(text)) throw new Error(`${label} appears to contain a secret; store only a masked ticket/link/record`);
  if (blockPlaceholder && placeholderPattern.test(text)) throw new Error(`${label} still looks like a placeholder`);
  return text;
}

function validatePayload(payload) {
  if (payload.schema !== 'pet-companion-production-evidence-v1') throw new Error('Evidence schema mismatch');
  if (!Array.isArray(payload.items)) throw new Error('Evidence items must be an array');
  const ids = payload.items.map(item => item.id);
  if (new Set(ids).size !== ids.length) throw new Error('Evidence item ids must be unique');
}

function updateItem(item, options) {
  const status = assertSafeText('status', options.status);
  if (!allowedStatus.has(status)) throw new Error(`Unsupported status: ${status}`);

  item.status = status;
  if (status === 'pending') {
    item.checkedAt = '';
    item.proofRefs = [];
    if (options.owner !== undefined) item.owner = assertSafeText('owner', options.owner, { allowEmpty: true });
    if (options.evidenceRef !== undefined) item.evidenceRef = assertSafeText('evidenceRef', options.evidenceRef, { allowEmpty: true });
    return item;
  }

  item.owner = assertSafeText('owner', options.owner !== undefined ? options.owner : item.owner, { blockPlaceholder: true });
  item.evidenceRef = assertSafeText('evidenceRef', options.evidenceRef !== undefined ? options.evidenceRef : item.evidenceRef, { blockPlaceholder: true });
  if (options.proofRef.length) {
    item.proofRefs = options.proofRef.map((value, index) => assertSafeText(`proofRef ${index + 1}`, value, { blockPlaceholder: true }));
  }
  if (!Array.isArray(item.proofRefs) || item.proofRefs.length === 0) {
    throw new Error('proofRefs are required for provided or verified evidence; pass one or more --proof-ref values');
  }
  const requiredProofCount = Array.isArray(item.requiredProof) ? item.requiredProof.length : 0;
  if (status === 'verified' && item.proofRefs.length < requiredProofCount) {
    throw new Error(`verified evidence requires proofRefs for every required proof; expected at least ${requiredProofCount}, got ${item.proofRefs.length}`);
  }
  item.checkedAt = assertSafeText('checkedAt', options.checkedAt || new Date().toISOString());
  const checkedAtTime = Date.parse(item.checkedAt);
  if (Number.isNaN(checkedAtTime)) throw new Error('checkedAt must be a parseable date/time');
  if (checkedAtTime > Date.now() + MAX_CLOCK_SKEW_MS) throw new Error('checkedAt must not be in the future');
  if (checkedAtTime < Date.now() - MAX_EVIDENCE_AGE_MS) throw new Error('checkedAt is too old; refresh external evidence before marking verified');
  return item;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const id = assertSafeText('id', options.id);
  if (!existsSync(evidencePath)) throw new Error(`${evidencePath} is missing; run npm run external:evidence:init first`);

  const payload = readJson(evidencePath);
  validatePayload(payload);
  const item = payload.items.find(entry => entry.id === id);
  if (!item) throw new Error(`Unknown evidence id: ${id}`);

  updateItem(item, options);
  payload.updatedAt = new Date().toISOString();

  const backupPath = backupPathForTarget(evidencePath);
  if (options.dryRun) {
    console.log(`PASS external evidence update dry-run :: would backup ${evidencePath} to ${backupPath}`);
    console.log(`PASS external evidence update dry-run :: ${id} -> ${item.status}`);
    return;
  }

  await mkdir(dirname(backupPath), { recursive: true });
  await copyFile(evidencePath, backupPath);
  await writeFile(evidencePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`PASS external evidence update backup :: ${backupPath}`);
  console.log(`PASS external evidence update :: ${id} -> ${item.status}`);
}

main().catch(error => {
  console.error(`FAIL external evidence update :: ${error.message}`);
  process.exit(1);
});
