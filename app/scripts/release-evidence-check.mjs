import { existsSync, readFileSync } from 'node:fs';

const failures = [];
const fail = message => failures.push(message);
const MOJIBAKE_PATTERN = /\?{2,}/;

function readJson(path) {
  if (!existsSync(path)) {
    fail(`${path} is missing`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    fail(`${path} is not valid JSON: ${error.message}`);
    return null;
  }
}

function parseNpmRunSteps(command) {
  return String(command || '')
    .split(/\s+&&\s+/)
    .map(step => step.trim())
    .map(step => step.match(/^npm run ([\w:-]+)$/)?.[1] || '')
    .filter(Boolean);
}

function assertEqual(name, actual, expected) {
  if (actual !== expected) {
    fail(`${name} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertArrayEqual(name, actual, expected) {
  const actualArray = Array.isArray(actual) ? actual : [];
  const expectedArray = Array.isArray(expected) ? expected : [];
  if (JSON.stringify(actualArray) !== JSON.stringify(expectedArray)) {
    fail(`${name} mismatch: expected ${JSON.stringify(expectedArray)}, got ${JSON.stringify(actualArray)}`);
  }
}

const pkg = readJson('package.json') || {};
const evidence = readJson('output/release-evidence.json');
const artifactManifest = readJson('output/release-artifacts.json');
const buildInfo = existsSync('dist/build-info.json') ? readJson('dist/build-info.json') : null;
const serviceWorkerPath = existsSync('dist/service-worker.js') ? 'dist/service-worker.js' : 'service-worker.js';

const releaseCheckCommand = pkg.scripts?.['release:check'] || '';
const releaseCheckSteps = parseNpmRunSteps(releaseCheckCommand);
const evidenceSelfTestStepIndex = releaseCheckSteps.indexOf('release:evidence:self-test');
const evidenceStepIndex = releaseCheckSteps.indexOf('release:evidence');
const evidenceCheckStepIndex = releaseCheckSteps.indexOf('release:evidence:check');
const localGateSteps = releaseCheckSteps.filter(
  name => name !== 'release:evidence' && name !== 'release:evidence:check'
);

if (!releaseCheckCommand) {
  fail('package.json is missing scripts.release:check');
}

if (evidenceStepIndex === -1) {
  fail('release:check must include npm run release:evidence');
}

if (evidenceSelfTestStepIndex === -1) {
  fail('release:check must include npm run release:evidence:self-test');
}

if (!pkg.scripts?.['release:evidence:self-test']?.includes('scripts/release-evidence.mjs --self-test')) {
  fail('package.json is missing scripts.release:evidence:self-test');
}

if (evidenceCheckStepIndex === -1) {
  fail('release:check must include npm run release:evidence:check');
}

if (evidenceSelfTestStepIndex > -1 && evidenceStepIndex > -1 && evidenceSelfTestStepIndex > evidenceStepIndex) {
  fail('release:evidence:self-test must run before release:evidence');
}

if (evidenceStepIndex > -1 && evidenceCheckStepIndex > -1 && evidenceStepIndex > evidenceCheckStepIndex) {
  fail('release:evidence:check must run after release:evidence');
}

if (!pkg.scripts?.['release:evidence:check']?.includes('scripts/release-evidence-check.mjs')) {
  fail('package.json is missing scripts.release:evidence:check');
}

if (evidence) {
  assertEqual('releaseCheck.command', evidence.releaseCheck?.command, releaseCheckCommand);
  assertArrayEqual('releaseCheck.actualSteps', evidence.releaseCheck?.actualSteps, releaseCheckSteps);
  assertArrayEqual('releaseCheck.expectedSteps', evidence.releaseCheck?.expectedSteps, releaseCheckSteps);
  assertEqual('releaseCheck.matchesExpected', evidence.releaseCheck?.matchesExpected, true);
  assertEqual('releaseCheck.selfTestStep', evidence.releaseCheck?.selfTestStep, 'release:evidence:self-test');
  assertEqual('releaseCheck.evidenceStep', evidence.releaseCheck?.evidenceStep, 'release:evidence');
  assertEqual('evidenceVerification.command', evidence.evidenceVerification?.command, 'npm run release:evidence:check');
  assertEqual('launchStatus.command', evidence.launchStatus?.command, 'npm run launch:status');
  assertEqual('launchStatus.requireGoCommand', evidence.launchStatus?.requireGoCommand, 'npm run launch:status -- --require-go');
  assertEqual('launchStatus.jsonCommand', evidence.launchStatus?.jsonCommand, 'npm --silent run launch:status -- --json');
  assertEqual('launchStatus.expectedDecisionWhenExternalPending', evidence.launchStatus?.expectedDecisionWhenExternalPending, 'NO_GO');
  assertEqual('launchStatus.status', evidence.launchStatus?.status, 'configured');

  assertArrayEqual(
    'localGates',
    Array.isArray(evidence.localGates) ? evidence.localGates.map(item => item.name) : [],
    localGateSteps
  );

  assertEqual('evidenceGeneration.selfTestCommand', evidence.evidenceGeneration?.selfTestCommand, 'npm run release:evidence:self-test');
  assertEqual('evidenceGeneration.command', evidence.evidenceGeneration?.command, 'npm run release:evidence');
  assertEqual('evidenceGeneration.status', evidence.evidenceGeneration?.status, 'generated');

  const externalEvidence = Array.isArray(evidence.externalEvidence) ? evidence.externalEvidence : [];
  const verifiedExternalEvidence = externalEvidence.filter(item => item.status === 'verified_external_evidence').length;
  const invalidExternalEvidence = externalEvidence.filter(item => item.status === 'invalid_external_evidence').length;
  const pendingExternalEvidence = externalEvidence.length - verifiedExternalEvidence;
  for (const item of externalEvidence) {
    if (MOJIBAKE_PATTERN.test(JSON.stringify(item))) {
      fail(`externalEvidence.${item.id || 'unknown'} contains mojibake placeholders`);
    }
    if (!Array.isArray(item.requiredProof) || item.requiredProof.length < 2) {
      fail(`externalEvidence.${item.id || 'unknown'}.requiredProof must include at least two proof requirements`);
    }
    if (item.status === 'verified_external_evidence' && Array.isArray(item.validationErrors) && item.validationErrors.length) {
      fail(`externalEvidence.${item.id || 'unknown'} cannot be verified with validation errors`);
    }
    if (item.status === 'invalid_external_evidence' && (!Array.isArray(item.validationErrors) || item.validationErrors.length === 0)) {
      fail(`externalEvidence.${item.id || 'unknown'} invalid status must include validation errors`);
    }
    for (const proof of item.requiredProof || []) {
      if (typeof proof !== 'string' || proof.length < 7) {
        fail(`externalEvidence.${item.id || 'unknown'}.requiredProof contains an invalid proof requirement`);
      }
    }
  }
  assertEqual('externalEvidenceSummary.total', evidence.externalEvidenceSummary?.total, externalEvidence.length);
  assertEqual('externalEvidenceSummary.verified', evidence.externalEvidenceSummary?.verified, verifiedExternalEvidence);
  assertEqual('externalEvidenceSummary.invalid', evidence.externalEvidenceSummary?.invalid, invalidExternalEvidence);
  assertEqual('externalEvidenceSummary.pending', evidence.externalEvidenceSummary?.pending, pendingExternalEvidence);
  assertEqual(
    'conclusion',
    evidence.conclusion,
    pendingExternalEvidence === 0
      ? 'local_release_gates_ready_external_evidence_verified'
      : 'local_release_gates_ready_external_evidence_required'
  );
}

if (evidence && artifactManifest) {
  assertEqual('artifacts.manifestPresent', evidence.artifacts?.manifestPresent, true);
  assertEqual('artifacts.manifestPath', evidence.artifacts?.manifestPath, 'output/release-artifacts.json');
  assertEqual('artifacts.manifestMarkdownPath', evidence.artifacts?.manifestMarkdownPath, 'output/release-artifacts.md');
  assertEqual('artifacts.schema', evidence.artifacts?.schema, artifactManifest.schema);
  assertEqual('artifacts.fileCount', evidence.artifacts?.fileCount, artifactManifest.summary?.fileCount || 0);
  assertEqual('artifacts.totalBytes', evidence.artifacts?.totalBytes, artifactManifest.summary?.totalBytes || 0);
  assertEqual('artifacts.manifestSha256', evidence.artifacts?.manifestSha256, artifactManifest.summary?.manifestSha256 || '');
  assertArrayEqual('artifacts.missingRequired', evidence.artifacts?.missingRequired, artifactManifest.missingRequired || []);
}

if (evidence) {
  assertEqual('pwa.serviceWorkerPath', evidence.pwa?.serviceWorkerPath, serviceWorkerPath);
  assertEqual('pwa.serviceWorkerPresent', evidence.pwa?.serviceWorkerPresent, true);
  assertEqual('pwa.matchesExpected', evidence.pwa?.matchesExpected, true);
  assertEqual('pwa.runtimeConfigPrecached', evidence.pwa?.runtimeConfigPrecached, false);
  if (!String(evidence.pwa?.cacheName || '').includes(String(evidence.app?.version || ''))) {
    fail('pwa.cacheName must include app version');
  }
  if (!String(evidence.pwa?.cacheName || '').includes(String(evidence.pwa?.precacheHash || 'missing-hash'))) {
    fail('pwa.cacheName must include precacheHash');
  }
}

if (evidence && buildInfo) {
  assertEqual('buildInfo.pwa.cacheName', buildInfo.pwa?.cacheName, evidence.pwa?.cacheName);
  assertEqual('buildInfo.pwa.expectedCacheName', buildInfo.pwa?.expectedCacheName, evidence.pwa?.expectedCacheName);
  assertEqual('buildInfo.pwa.precacheHash', buildInfo.pwa?.precacheHash, evidence.pwa?.precacheHash);
  assertEqual('buildInfo.pwa.matchesExpected', buildInfo.pwa?.matchesExpected, evidence.pwa?.matchesExpected);
  assertEqual('buildInfo.pwa.runtimeConfigPrecached', buildInfo.pwa?.runtimeConfigPrecached, evidence.pwa?.runtimeConfigPrecached);
}

if (failures.length) {
  console.error('FAIL release evidence check');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('PASS release evidence check :: output/release-evidence.json matches package release gate and artifact manifest');
