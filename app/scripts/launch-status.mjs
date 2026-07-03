import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

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
const PLACEHOLDER_PATTERN = /(example\.com|ops-owner|legal-owner|qa-owner|placeholder|todo|\u5f85\u5b9a|\u793a\u4f8b)/i;
const MOJIBAKE_PATTERN = /\?{2,}/;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_EVIDENCE_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const OWNER_GROUPS = {
  ops: ['domainTls', 'productionEnv', 'persistentStorage', 'objectStorage', 'monitoringAlerts', 'platformBackups'],
  legal: ['legalApproval'],
  qa: ['manualDeviceAcceptance']
};

const args = new Set(process.argv.slice(2));
const jsonOutput = args.has('--json');
const requireGo = args.has('--require-go');
const selfTest = args.has('--self-test');

function readJson(path) {
  if (!existsSync(path)) return { path, exists: false, value: null, error: '' };
  try {
    return { path, exists: true, value: JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')), error: '' };
  } catch (error) {
    return { path, exists: true, value: null, error: `${path} is not valid JSON: ${error.message}` };
  }
}

function normalizePath(path) {
  return path.replaceAll('\\\\', '/').replaceAll('\\', '/');
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function collectCurrentArtifacts(dir) {
  const files = [];
  const walk = currentDir => {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const info = statSync(fullPath);
        files.push({
          path: normalizePath(relative(dir, fullPath)),
          bytes: info.size,
          sha256: sha256(readFileSync(fullPath))
        });
      }
    }
  };
  walk(dir);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function compareCurrentDistToArtifactManifest(manifest, dir = 'dist') {
  if (!existsSync(dir)) return [`${dir} is missing`];
  if (!manifest || !Array.isArray(manifest.artifacts)) return ['artifact manifest artifacts array missing'];
  const currentArtifacts = collectCurrentArtifacts(dir);
  const expected = new Map(manifest.artifacts.map(item => [item.path, item]));
  const actual = new Map(currentArtifacts.map(item => [item.path, item]));
  const missing = manifest.artifacts.filter(item => !actual.has(item.path)).map(item => item.path);
  const extra = currentArtifacts.filter(item => !expected.has(item.path)).map(item => item.path);
  const changed = currentArtifacts
    .filter(item => expected.has(item.path))
    .filter(item => expected.get(item.path).bytes !== item.bytes || expected.get(item.path).sha256 !== item.sha256)
    .map(item => item.path);
  const currentManifestSha256 = sha256(Buffer.from(JSON.stringify(currentArtifacts.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })), null, 2), 'utf8'));
  const mismatches = [];
  if (missing.length) mismatches.push(`artifact manifest has missing dist files: ${missing.join(', ')}`);
  if (extra.length) mismatches.push(`artifact manifest has unlisted dist files: ${extra.join(', ')}`);
  if (changed.length) mismatches.push(`artifact manifest has changed dist files: ${changed.join(', ')}`);
  if (currentManifestSha256 !== manifest.summary?.manifestSha256) mismatches.push('artifact manifest sha does not match current dist');
  return mismatches;
}

function blocker(id, status, label, extra = {}) {
  return {
    id,
    status,
    label,
    owner: extra.owner || '',
    evidenceRef: extra.evidenceRef || ''
  };
}

function ownerGroupForId(id) {
  for (const [group, ids] of Object.entries(OWNER_GROUPS)) {
    if (ids.includes(id)) return group;
  }
  return '';
}

function ownerShortcutsFor(blockers) {
  const groups = new Set(
    blockers
      .map(item => ownerGroupForId(item.id))
      .filter(Boolean)
  );
  return [...groups].map(group => ({
    group,
    command: `npm.cmd run external:evidence:next:${group}`
  }));
}

function hasSafeString(value, minLength = 1) {
  return typeof value === 'string' && value.trim().length >= minLength;
}

function pushInvalid(blockers, item, reason) {
  blockers.push(blocker(item.id || 'productionEvidence', 'invalid', reason, item));
}

function validateEvidenceItem(item, blockers) {
  const serialized = JSON.stringify(item);
  if (!ALLOWED_STATUS.has(item.status)) pushInvalid(blockers, item, `invalid status for ${item.id || 'unknown evidence item'}`);
  if (!hasSafeString(item.label, 5)) pushInvalid(blockers, item, `missing label for ${item.id || 'unknown evidence item'}`);
  if (!hasSafeString(item.evidenceRef, 5)) pushInvalid(blockers, item, `missing evidenceRef for ${item.id || 'unknown evidence item'}`);
  if (MOJIBAKE_PATTERN.test(serialized)) pushInvalid(blockers, item, `mojibake marker found in ${item.id || 'unknown evidence item'}`);
  if (SECRET_PATTERN.test(serialized)) pushInvalid(blockers, item, `possible secret found in ${item.id || 'unknown evidence item'}`);
  if (!Array.isArray(item.requiredProof) || item.requiredProof.length < 2) {
    pushInvalid(blockers, item, `missing requiredProof for ${item.id || 'unknown evidence item'}`);
  }
  if (Array.isArray(item.requiredProof)) {
    for (const [index, proof] of item.requiredProof.entries()) {
      if (!hasSafeString(proof, 7)) pushInvalid(blockers, item, `invalid requiredProof ${index + 1} for ${item.id || 'unknown evidence item'}`);
      if (SECRET_PATTERN.test(String(proof || ''))) pushInvalid(blockers, item, `possible secret in requiredProof ${index + 1} for ${item.id || 'unknown evidence item'}`);
    }
  }
  if (item.status !== 'pending') {
    if (PLACEHOLDER_PATTERN.test(item.evidenceRef || '')) pushInvalid(blockers, item, `placeholder evidenceRef for ${item.id || 'unknown evidence item'}`);
    if (PLACEHOLDER_PATTERN.test(item.owner || '')) pushInvalid(blockers, item, `placeholder owner for ${item.id || 'unknown evidence item'}`);
    if (!Array.isArray(item.proofRefs) || item.proofRefs.length === 0) pushInvalid(blockers, item, `missing proofRefs for ${item.id || 'unknown evidence item'}`);
    for (const [index, proofRef] of (item.proofRefs || []).entries()) {
      if (!hasSafeString(proofRef, 7)) pushInvalid(blockers, item, `invalid proofRef ${index + 1} for ${item.id || 'unknown evidence item'}`);
      if (SECRET_PATTERN.test(String(proofRef || ''))) pushInvalid(blockers, item, `possible secret in proofRef ${index + 1} for ${item.id || 'unknown evidence item'}`);
      if (PLACEHOLDER_PATTERN.test(String(proofRef || ''))) pushInvalid(blockers, item, `placeholder proofRef ${index + 1} for ${item.id || 'unknown evidence item'}`);
    }
  }
  if (item.status === 'verified') {
    if (!hasSafeString(item.owner, 3)) pushInvalid(blockers, item, `missing owner for verified ${item.id || 'unknown evidence item'}`);
    if (!hasSafeString(item.checkedAt, 10)) pushInvalid(blockers, item, `missing checkedAt for verified ${item.id || 'unknown evidence item'}`);
    if (hasSafeString(item.checkedAt, 1)) {
      const checkedAtTime = Date.parse(item.checkedAt);
      if (Number.isNaN(checkedAtTime)) {
        pushInvalid(blockers, item, `checkedAt is not parseable for verified ${item.id || 'unknown evidence item'}`);
      } else if (checkedAtTime > Date.now() + MAX_CLOCK_SKEW_MS) {
        pushInvalid(blockers, item, `checkedAt is in the future for verified ${item.id || 'unknown evidence item'}`);
      } else if (checkedAtTime < Date.now() - MAX_EVIDENCE_AGE_MS) {
        pushInvalid(blockers, item, `checkedAt is too old for verified ${item.id || 'unknown evidence item'}`);
      }
    }
    if (!Array.isArray(item.proofRefs) || !Array.isArray(item.requiredProof) || item.proofRefs.length < item.requiredProof.length) {
      pushInvalid(blockers, item, `verified proofRefs do not cover requiredProof for ${item.id || 'unknown evidence item'}`);
    }
  }
}

function createVerifiedEvidence(overrides = {}) {
  return {
    schema: 'pet-companion-production-evidence-v1',
    items: REQUIRED_IDS.map(id => ({
      id,
      label: `Evidence ${id}`,
      status: 'verified',
      evidenceRef: `ops-ticket-${id}`,
      owner: `owner-${id}`,
      checkedAt: '2026-06-29T00:00:00.000Z',
      requiredProof: [`proof one for ${id}`, `proof two for ${id}`],
      proofRefs: [`record one for ${id}`, `record two for ${id}`],
      ...(overrides[id] || {})
    }))
  };
}

function runSelfTest() {
  assert.equal(externalSummary(null).blockers[0].status, 'missing');
  assert.ok(readJson('output/definitely-missing-launch-status-test.json').exists === false);
  assert.equal(externalSummary(null, { exists: true, error: 'output/production-evidence.json is not valid JSON: bad' }).blockers[0].status, 'invalid');
  assert.equal(externalSummary({ schema: 'bad', items: [] }).blockers[0].status, 'invalid');
  assert.equal(externalSummary({ schema: 'pet-companion-production-evidence-v1', items: {} }).blockers[0].status, 'invalid');
  assert.equal(externalSummary(createVerifiedEvidence()).blockers.length, 0);
  assert.ok(externalSummary(createVerifiedEvidence({ domainTls: { owner: 'ops-owner' } })).blockers.some(item => item.label.includes('placeholder owner')));
  assert.ok(externalSummary(createVerifiedEvidence({ domainTls: { evidenceRef: 'https://example.com/ticket' } })).blockers.some(item => item.label.includes('placeholder evidenceRef')));
  assert.ok(externalSummary(createVerifiedEvidence({ domainTls: { evidenceRef: 'ticket token=abc' } })).blockers.some(item => item.label.includes('possible secret')));
  assert.ok(externalSummary(createVerifiedEvidence({ domainTls: { proofRefs: [] } })).blockers.some(item => item.label.includes('missing proofRefs')));
  assert.ok(externalSummary(createVerifiedEvidence({ domainTls: { proofRefs: ['todo'] } })).blockers.some(item => item.label.includes('placeholder proofRef')));
  assert.ok(externalSummary(createVerifiedEvidence({ domainTls: { checkedAt: 'not-a-date' } })).blockers.some(item => item.label.includes('checkedAt is not parseable')));
  assert.ok(externalSummary(createVerifiedEvidence({ domainTls: { checkedAt: '2999-01-01T00:00:00.000Z' } })).blockers.some(item => item.label.includes('checkedAt is in the future')));
  assert.ok(externalSummary(createVerifiedEvidence({ domainTls: { checkedAt: '2000-01-01T00:00:00.000Z' } })).blockers.some(item => item.label.includes('checkedAt is too old')));
  assert.ok(externalSummary(createVerifiedEvidence({ domainTls: { requiredProof: [] } })).blockers.some(item => item.label.includes('missing requiredProof')));
  assert.ok(externalSummary(createVerifiedEvidence({ domainTls: { label: ['?', '?', '?', '?'].join('') } })).blockers.some(item => item.label.includes('mojibake marker')));
  assert.deepEqual(ownerShortcutsFor([{ id: 'domainTls' }, { id: 'legalApproval' }, { id: 'manualDeviceAcceptance' }]).map(item => item.command), [
    'npm.cmd run external:evidence:next:ops',
    'npm.cmd run external:evidence:next:legal',
    'npm.cmd run external:evidence:next:qa'
  ]);
  const duplicate = createVerifiedEvidence();
  duplicate.items.push({ ...duplicate.items[0] });
  assert.ok(externalSummary(duplicate).blockers.some(item => item.label.includes('duplicate external evidence item')));
  const missing = createVerifiedEvidence();
  missing.items = missing.items.filter(item => item.id !== 'domainTls');
  assert.ok(externalSummary(missing).blockers.some(item => item.label.includes('required external evidence item domainTls is missing')));
  console.log('PASS launch status self-test');
}

function externalSummary(payload, readResult = { exists: Boolean(payload), error: '' }) {
  if (readResult.error) {
    return {
      source: 'output/production-evidence.json',
      total: REQUIRED_IDS.length,
      verified: 0,
      provided: 0,
      pending: REQUIRED_IDS.length,
      blockers: [blocker('productionEvidence', 'invalid', readResult.error)]
    };
  }

  if (!payload) {
    return {
      source: 'missing',
      total: REQUIRED_IDS.length,
      verified: 0,
      provided: 0,
      pending: REQUIRED_IDS.length,
      blockers: [blocker('productionEvidence', 'missing', 'output/production-evidence.json is missing')]
    };
  }

  if (payload.schema !== 'pet-companion-production-evidence-v1') {
    return {
      source: 'output/production-evidence.json',
      total: REQUIRED_IDS.length,
      verified: 0,
      provided: 0,
      pending: REQUIRED_IDS.length,
      blockers: [blocker('productionEvidence', 'invalid', 'production evidence schema mismatch')]
    };
  }

  if (!Array.isArray(payload.items)) {
    return {
      source: 'output/production-evidence.json',
      total: REQUIRED_IDS.length,
      verified: 0,
      provided: 0,
      pending: REQUIRED_IDS.length,
      blockers: [blocker('productionEvidence', 'invalid', 'production evidence items must be an array')]
    };
  }

  const duplicateIds = payload.items
    .map(item => item.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);
  const itemsById = new Map(payload.items.map(item => [item.id, item]));
  const requiredItems = REQUIRED_IDS.map(id => itemsById.get(id)).filter(Boolean);
  const blockers = [];

  for (const item of payload.items) validateEvidenceItem(item, blockers);

  for (const id of REQUIRED_IDS) {
    const item = itemsById.get(id);
    if (!item) {
      blockers.push(blocker(id, 'missing', `required external evidence item ${id} is missing`));
      continue;
    }
    if (item.status !== 'verified') {
      blockers.push(blocker(item.id, item.status || 'invalid', item.label || item.id, item));
    }
  }

  for (const id of new Set(duplicateIds)) {
    blockers.push(blocker(id, 'invalid', `duplicate external evidence item ${id}`));
  }

  return {
    source: 'output/production-evidence.json',
    total: REQUIRED_IDS.length,
    verified: requiredItems.filter(item => item.status === 'verified').length,
    provided: requiredItems.filter(item => item.status === 'provided').length,
    pending: requiredItems.filter(item => item.status === 'pending' || !item.status).length + REQUIRED_IDS.length - requiredItems.length,
    blockers
  };
}

if (selfTest) {
  runSelfTest();
  process.exit(0);
}

const releaseEvidenceRead = readJson('output/release-evidence.json');
const artifactManifestRead = readJson('output/release-artifacts.json');
const productionEvidenceRead = readJson('output/production-evidence.json');
const releaseEvidence = releaseEvidenceRead.value;
const artifactManifest = artifactManifestRead.value;
const productionEvidence = productionEvidenceRead.value;
const external = externalSummary(productionEvidence, productionEvidenceRead);
const localBlockers = [];

if (releaseEvidenceRead.error) {
  localBlockers.push(releaseEvidenceRead.error);
}
if (!releaseEvidenceRead.exists) {
  localBlockers.push('missing output/release-evidence.json');
}
if (artifactManifestRead.error) {
  localBlockers.push(artifactManifestRead.error);
}
if (!artifactManifestRead.exists) {
  localBlockers.push('missing output/release-artifacts.json');
}
if (!existsSync('dist/index.html')) {
  localBlockers.push('dist/index.html is missing');
}
if (artifactManifest) {
  localBlockers.push(...compareCurrentDistToArtifactManifest(artifactManifest, 'dist'));
}
if (releaseEvidence && !releaseEvidence.build?.distPresent) {
  localBlockers.push('dist is missing');
}
if (releaseEvidence && !releaseEvidence.build?.buildInfoPresent) {
  localBlockers.push('dist/build-info.json is missing');
}
if (releaseEvidence && !releaseEvidence.artifacts?.manifestPresent) {
  localBlockers.push('output/release-artifacts.json is missing');
}
if (releaseEvidence && artifactManifest) {
  if (releaseEvidence.artifacts?.schema !== artifactManifest.schema) {
    localBlockers.push('release evidence artifact schema does not match current artifact manifest');
  }
  if (releaseEvidence.artifacts?.fileCount !== (artifactManifest.summary?.fileCount || 0)) {
    localBlockers.push('release evidence artifact file count does not match current artifact manifest');
  }
  if (releaseEvidence.artifacts?.totalBytes !== (artifactManifest.summary?.totalBytes || 0)) {
    localBlockers.push('release evidence artifact total bytes does not match current artifact manifest');
  }
  if (releaseEvidence.artifacts?.manifestSha256 !== (artifactManifest.summary?.manifestSha256 || '')) {
    localBlockers.push('release evidence artifact sha does not match current artifact manifest');
  }
  if (JSON.stringify(releaseEvidence.artifacts?.missingRequired || []) !== JSON.stringify(artifactManifest.missingRequired || [])) {
    localBlockers.push('release evidence missing artifact list does not match current artifact manifest');
  }
}
if (releaseEvidence && Array.isArray(releaseEvidence.artifacts?.missingRequired) && releaseEvidence.artifacts.missingRequired.length) {
  localBlockers.push(`missing required artifacts: ${releaseEvidence.artifacts.missingRequired.join(', ')}`);
}
if (releaseEvidence && releaseEvidence.releaseCheck?.matchesExpected !== true) {
  localBlockers.push('release:check command drifted from expected evidence steps');
}
if (releaseEvidence && releaseEvidence.pwa?.matchesExpected !== true) {
  localBlockers.push('PWA cache evidence does not match expected cache name');
}
if (releaseEvidence && releaseEvidence.pwa?.runtimeConfigPrecached !== false) {
  localBlockers.push('runtime-config.js is precached by service worker');
}

const externalBlockers = external.blockers.map(item => `${item.id} [${item.status}] ${item.label}`);
const decision = localBlockers.length === 0 && externalBlockers.length === 0 ? 'GO' : 'NO_GO';
const status = {
  decision,
  generatedAt: new Date().toISOString(),
  releaseEvidenceSource: releaseEvidence ? 'output/release-evidence.json' : 'missing',
  local: {
    blockers: localBlockers,
    artifactManifestSha256: releaseEvidence?.artifacts?.manifestSha256 || '',
    pwaCacheName: releaseEvidence?.pwa?.cacheName || '',
    releaseConclusion: releaseEvidence?.conclusion || ''
  },
  external,
  ownerShortcuts: ownerShortcutsFor(external.blockers),
  nextActions: [
    ...localBlockers.map(item => `Fix local gate: ${item}`),
    ...external.blockers.map(item => item.id === 'productionEvidence' || item.status === 'invalid'
      ? `Fix external evidence file: ${item.label}`
      : `Verify external evidence: ${item.id}`)
  ]
};

if (jsonOutput) {
  console.log(JSON.stringify(status, null, 2));
} else {
  console.log(`Launch decision: ${status.decision}`);
  console.log(`Release evidence: ${status.releaseEvidenceSource}`);
  console.log(`Artifact SHA-256: ${status.local.artifactManifestSha256 || 'missing'}`);
  console.log(`PWA cache: ${status.local.pwaCacheName || 'missing'}`);
  console.log(`External evidence: ${external.verified}/${external.total} verified`);
  if (localBlockers.length) {
    console.log('\nLocal blockers:');
    for (const item of localBlockers) console.log(`- ${item}`);
  }
  if (external.blockers.length) {
    console.log('\nExternal blockers:');
    for (const item of external.blockers) {
      console.log(`- ${item.id} [${item.status}] ${item.label}`);
    }
  }
  if (status.ownerShortcuts.length) {
    console.log('\nOwner shortcut commands:');
    for (const item of status.ownerShortcuts) console.log(`- ${item.group}: ${item.command}`);
  }
  if (!status.nextActions.length) {
    console.log('\nNext actions: none');
  } else {
    console.log('\nNext actions:');
    for (const item of status.nextActions) console.log(`- ${item}`);
  }
}

if (requireGo && decision !== 'GO') {
  console.error(`\nFAIL launch status :: ${decision}`);
  process.exit(1);
}
