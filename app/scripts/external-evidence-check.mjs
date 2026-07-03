import { existsSync, readFileSync } from 'node:fs';

const REQUIRED_IDS = [
  'domainTls',
  'productionEnv',
  'persistentStorage',
  'objectStorage',
  'monitoringAlerts',
  'platformBackups',
  'legalApproval',
  'manualDeviceAcceptance'
];

const ALLOWED_STATUS = new Set(['pending', 'provided', 'verified']);
const SECRET_PATTERN = /(password|secret|token|cookie|private[_-]?key|access[_-]?key|AKIA[0-9A-Z]{16}|-----BEGIN)/i;
const PLACEHOLDER_PATTERN = /(example\.com|ops-owner|legal-owner|qa-owner|placeholder|todo|待定|示例)/i;
const MOJIBAKE_PATTERN = /\?{2,}/;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_EVIDENCE_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const checks = [];
const add = (name, pass, detail = '') => checks.push({ name, pass, detail });

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
}

function validateEvidenceFile(path, { requireNoVerified = false } = {}) {
  const payload = readJson(path);
  add(`${path}: schema`, payload.schema === 'pet-companion-production-evidence-v1');
  add(`${path}: items array`, Array.isArray(payload.items));
  if (!Array.isArray(payload.items)) return;

  const ids = payload.items.map(item => item.id);
  for (const id of REQUIRED_IDS) {
    add(`${path}: includes ${id}`, ids.includes(id));
  }
  add(`${path}: no duplicate ids`, new Set(ids).size === ids.length);

  for (const item of payload.items) {
    add(`${path}: ${item.id} status valid`, ALLOWED_STATUS.has(item.status), item.status);
    add(`${path}: ${item.id} label present`, typeof item.label === 'string' && item.label.length > 4);
    add(`${path}: ${item.id} evidence ref present`, typeof item.evidenceRef === 'string' && item.evidenceRef.length > 4);
    add(`${path}: ${item.id} no mojibake placeholders`, !MOJIBAKE_PATTERN.test(JSON.stringify(item)));
    add(`${path}: ${item.id} required proof present`, Array.isArray(item.requiredProof) && item.requiredProof.length >= 2);
    if (Array.isArray(item.requiredProof)) {
      for (const [index, proof] of item.requiredProof.entries()) {
        add(`${path}: ${item.id} proof ${index + 1} valid`, typeof proof === 'string' && proof.length > 6);
        add(`${path}: ${item.id} proof ${index + 1} no obvious secrets`, !SECRET_PATTERN.test(proof));
      }
    }
    add(`${path}: ${item.id} no obvious secrets`, !SECRET_PATTERN.test(JSON.stringify(item)));
    if (requireNoVerified) {
      add(`${path}: ${item.id} example not verified`, item.status !== 'verified');
    }
    if (!requireNoVerified && item.status !== 'pending') {
      add(`${path}: ${item.id} evidence ref not placeholder`, !PLACEHOLDER_PATTERN.test(item.evidenceRef || ''));
      add(`${path}: ${item.id} owner not placeholder`, !PLACEHOLDER_PATTERN.test(item.owner || ''));
      add(`${path}: ${item.id} proofRefs present`, Array.isArray(item.proofRefs) && item.proofRefs.length > 0);
      if (Array.isArray(item.proofRefs)) {
        for (const [index, proofRef] of item.proofRefs.entries()) {
          add(`${path}: ${item.id} proofRef ${index + 1} valid`, typeof proofRef === 'string' && proofRef.length > 6);
          add(`${path}: ${item.id} proofRef ${index + 1} no obvious secrets`, !SECRET_PATTERN.test(proofRef));
          add(`${path}: ${item.id} proofRef ${index + 1} not placeholder`, !PLACEHOLDER_PATTERN.test(proofRef));
        }
      }
    }
    if (item.status === 'verified') {
      const checkedAtTime = Date.parse(item.checkedAt || '');
      add(`${path}: ${item.id} checkedAt present`, typeof item.checkedAt === 'string' && item.checkedAt.length >= 10);
      add(`${path}: ${item.id} checkedAt parseable`, !Number.isNaN(checkedAtTime));
      add(`${path}: ${item.id} checkedAt not future`, Number.isNaN(checkedAtTime) || checkedAtTime <= Date.now() + MAX_CLOCK_SKEW_MS);
      add(`${path}: ${item.id} checkedAt not stale`, Number.isNaN(checkedAtTime) || checkedAtTime >= Date.now() - MAX_EVIDENCE_AGE_MS);
      add(`${path}: ${item.id} owner present`, typeof item.owner === 'string' && item.owner.length > 2);
      add(`${path}: ${item.id} verified has proofRefs for every required proof`, Array.isArray(item.proofRefs) && Array.isArray(item.requiredProof) && item.proofRefs.length >= item.requiredProof.length);
    }
  }
}

validateEvidenceFile('deploy/production-evidence.example.json', { requireNoVerified: true });

if (existsSync('output/production-evidence.json')) {
  validateEvidenceFile('output/production-evidence.json');
} else {
  add('optional output/production-evidence.json absent', true, 'real production evidence is external');
}

let failed = 0;
for (const check of checks) {
  if (check.pass) {
    console.log(`PASS ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
  } else {
    failed += 1;
    console.error(`FAIL ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
  }
}

if (failed) {
  console.error(`\n${failed} external evidence checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} external evidence checks passed.`);
