import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { APP_BUILD_TARGET, APP_RELEASE_CHANNEL, APP_VERSION } from '../src/core/config.js';

const outputDir = 'output';
const jsonPath = join(outputDir, 'release-evidence.json');
const markdownPath = join(outputDir, 'release-evidence.md');
const args = new Set(process.argv.slice(2));
const selfTest = args.has('--self-test');
const ALLOWED_EXTERNAL_STATUS = new Set(['pending', 'provided', 'verified']);
const SECRET_PATTERN = /(password|secret|token|cookie|private[_-]?key|access[_-]?key|AKIA[0-9A-Z]{16}|-----BEGIN)/i;
const PLACEHOLDER_PATTERN = /(example\.com|ops-owner|legal-owner|qa-owner|placeholder|todo|\u5f85\u5b9a|\u793a\u4f8b)/i;
const MOJIBAKE_PATTERN = /\?{2,}/;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_EVIDENCE_AGE_MS = 90 * 24 * 60 * 60 * 1000;


function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function parseNpmRunSteps(command) {
  return String(command || '')
    .split(/\s+&&\s+/)
    .map(step => step.trim())
    .map(step => step.match(/^npm run ([\w:-]+)$/)?.[1] || '')
    .filter(Boolean);
}

function hasSafeString(value, minLength = 1) {
  return typeof value === 'string' && value.trim().length >= minLength;
}

function validateExternalEvidenceItem(item) {
  const errors = [];
  const id = item?.id || 'unknown';
  const serialized = JSON.stringify(item || {});
  if (!ALLOWED_EXTERNAL_STATUS.has(item?.status)) errors.push(`invalid status for ${id}`);
  if (!hasSafeString(item?.label, 5)) errors.push(`missing label for ${id}`);
  if (!hasSafeString(item?.evidenceRef, 5)) errors.push(`missing evidenceRef for ${id}`);
  if (MOJIBAKE_PATTERN.test(serialized)) errors.push(`mojibake marker found in ${id}`);
  if (SECRET_PATTERN.test(serialized)) errors.push(`possible secret found in ${id}`);
  if (!Array.isArray(item?.requiredProof) || item.requiredProof.length < 2) errors.push(`missing requiredProof for ${id}`);
  for (const [index, proof] of (item?.requiredProof || []).entries()) {
    if (!hasSafeString(proof, 7)) errors.push(`invalid requiredProof ${index + 1} for ${id}`);
    if (SECRET_PATTERN.test(String(proof || ''))) errors.push(`possible secret in requiredProof ${index + 1} for ${id}`);
  }
  if (item?.status !== 'pending') {
    if (PLACEHOLDER_PATTERN.test(item?.evidenceRef || '')) errors.push(`placeholder evidenceRef for ${id}`);
    if (PLACEHOLDER_PATTERN.test(item?.owner || '')) errors.push(`placeholder owner for ${id}`);
    if (!Array.isArray(item?.proofRefs) || item.proofRefs.length === 0) errors.push(`missing proofRefs for ${id}`);
    for (const [index, proofRef] of (item?.proofRefs || []).entries()) {
      if (!hasSafeString(proofRef, 7)) errors.push(`invalid proofRef ${index + 1} for ${id}`);
      if (SECRET_PATTERN.test(String(proofRef || ''))) errors.push(`possible secret in proofRef ${index + 1} for ${id}`);
      if (PLACEHOLDER_PATTERN.test(String(proofRef || ''))) errors.push(`placeholder proofRef ${index + 1} for ${id}`);
    }
  }
  if (item?.status === 'verified') {
    if (!hasSafeString(item?.owner, 3)) errors.push(`missing owner for verified ${id}`);
    if (!hasSafeString(item?.checkedAt, 10)) errors.push(`missing checkedAt for verified ${id}`);
    if (hasSafeString(item?.checkedAt, 1)) {
      const checkedAtTime = Date.parse(item.checkedAt);
      if (Number.isNaN(checkedAtTime)) errors.push(`checkedAt is not parseable for verified ${id}`);
      else if (checkedAtTime > Date.now() + MAX_CLOCK_SKEW_MS) errors.push(`checkedAt is in the future for verified ${id}`);
      else if (checkedAtTime < Date.now() - MAX_EVIDENCE_AGE_MS) errors.push(`checkedAt is too old for verified ${id}`);
    }
    if (!Array.isArray(item?.proofRefs) || !Array.isArray(item?.requiredProof) || item.proofRefs.length < item.requiredProof.length) errors.push(`verified proofRefs do not cover requiredProof for ${id}`);
  }
  return errors;
}

function externalEvidenceStatus(provided, validationErrors) {
  if (provided?.status === 'verified' && validationErrors.length === 0) return 'verified_external_evidence';
  if (validationErrors.length > 0) return 'invalid_external_evidence';
  return `external_evidence_${provided?.status || 'missing'}`;
}

function runSelfTest() {
  const valid = {
    id: 'domainTls',
    label: 'Domain TLS evidence',
    status: 'verified',
    evidenceRef: 'ops-ticket-domain-tls',
    owner: 'ops-wang',
    checkedAt: '2026-06-29T00:00:00.000Z',
    requiredProof: ['public HTTPS endpoint record', 'TLS certificate expiry record'],
    proofRefs: ['ops-ticket-domain-tls#https-endpoint', 'ops-ticket-domain-tls#tls-expiry']
  };
  assert.deepEqual(validateExternalEvidenceItem(valid), []);
  assert.equal(externalEvidenceStatus(valid, []), 'verified_external_evidence');
  assert.equal(externalEvidenceStatus({ ...valid, status: 'provided' }, []), 'external_evidence_provided');
  assert.equal(externalEvidenceStatus(valid, ['placeholder owner for domainTls']), 'invalid_external_evidence');
  assert.ok(validateExternalEvidenceItem({ ...valid, owner: 'ops-owner' }).some(item => item.includes('placeholder owner')));
  assert.ok(validateExternalEvidenceItem({ ...valid, evidenceRef: 'https://example.com/ticket' }).some(item => item.includes('placeholder evidenceRef')));
  assert.ok(validateExternalEvidenceItem({ ...valid, evidenceRef: 'ticket token=abc' }).some(item => item.includes('possible secret')));
  assert.ok(validateExternalEvidenceItem({ ...valid, proofRefs: [] }).some(item => item.includes('missing proofRefs')));
  assert.ok(validateExternalEvidenceItem({ ...valid, proofRefs: ['todo'] }).some(item => item.includes('placeholder proofRef')));
  assert.ok(validateExternalEvidenceItem({ ...valid, checkedAt: 'not-a-date' }).some(item => item.includes('checkedAt is not parseable')));
  assert.ok(validateExternalEvidenceItem({ ...valid, checkedAt: '2999-01-01T00:00:00.000Z' }).some(item => item.includes('checkedAt is in the future')));
  assert.ok(validateExternalEvidenceItem({ ...valid, checkedAt: '2000-01-01T00:00:00.000Z' }).some(item => item.includes('checkedAt is too old')));
  assert.ok(validateExternalEvidenceItem({ ...valid, requiredProof: [] }).some(item => item.includes('missing requiredProof')));
  assert.ok(validateExternalEvidenceItem({ ...valid, label: ['?', '?', '?', '?'].join('') }).some(item => item.includes('mojibake marker')));
  console.log('PASS release evidence self-test');
}

function extractStringArray(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  if (!match) return [];
  return [...match[1].matchAll(/'([^']+)'/g)].map(item => item[1]);
}

function readPwaCacheEvidence() {
  const serviceWorkerPath = existsSync('dist/service-worker.js') ? 'dist/service-worker.js' : 'service-worker.js';
  if (!existsSync(serviceWorkerPath)) {
    return {
      serviceWorkerPath,
      serviceWorkerPresent: false,
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
    serviceWorkerPresent: true,
    cacheName,
    expectedCacheName,
    precacheHash,
    matchesExpected: cacheName === expectedCacheName,
    runtimeConfigPrecached: assets.includes('./runtime-config.js')
  };
}

if (selfTest) {
  runSelfTest();
  process.exit(0);
}

const pkg = readJson('package.json') || {};
const buildInfo = readJson('dist/build-info.json');
const productionEvidenceTemplate = readJson('deploy/production-evidence.example.json');
const productionEvidence = readJson('output/production-evidence.json');
const artifactManifest = readJson('output/release-artifacts.json');
const gitCommit = git(['rev-parse', 'HEAD']);
const gitBranch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
const pwaCache = readPwaCacheEvidence();

const expectedReleaseCheckSteps = [
  'build',
  'e2e',
  'e2e:remote',
  'smoke:production:self-test',
  'ops:check:self-test',
  'deploy:check',
  'public:bundle:check',
  'pwa:cache:check',
  'server:test',
  'backup:drill',
  'container:check',
  'deploy:target:check',
  'deploy:bundle:check',
  'production:env:example:check',
  'production:env:self-test',
  'manual:acceptance:check',
  'release:plan:check',
  'readiness:check',
  'architecture:check',
  'launch:status:self-test',
  'external:evidence:check',
  'external:evidence:collectors:self-test',
  'secrets:check',
  'accessibility:check',
  'artifact:manifest',
  'artifact:verify',
  'deploy:transfer:plan',
  'release:evidence:self-test',
  'release:evidence',
  'release:evidence:check'
];
const releaseCheckCommand = pkg.scripts?.['release:check'] || '';
const releaseCheckSteps = parseNpmRunSteps(releaseCheckCommand);
const releaseCheckMatchesExpected = JSON.stringify(releaseCheckSteps) === JSON.stringify(expectedReleaseCheckSteps);
const localGates = releaseCheckSteps.filter(name => name !== 'release:evidence' && name !== 'release:evidence:check');

if (!releaseCheckMatchesExpected) {
  console.error('FAIL release evidence :: release:check command drifted from expected gate order');
  console.error(`expected: ${expectedReleaseCheckSteps.join(' -> ')}`);
  console.error(`actual:   ${releaseCheckSteps.join(' -> ')}`);
  process.exit(1);
}

const externalEvidence = [
  ['domainTls', '公网 HTTPS 入口、TLS 证书和网关（域名或 IP）'],
  ['productionEnv', '部署主机上的 deploy/production.env，且不进入仓库'],
  ['persistentStorage', 'SQLite 持久化数据卷或正式托管数据库方案'],
  ['objectStorage', '服务器本地媒体持久化目录和图片访问'],
  ['monitoringAlerts', '生产监控端点、告警规则和告警接收人'],
  ['platformBackups', '平台级定时备份、异地保存、保留周期和恢复责任人'],
  ['legalApproval', '真实运营主体、客服渠道、隐私政策、用户协议和地区法务确认'],
  ['manualDeviceAcceptance', 'iPhone/Android 真机多尺寸验收记录']
].map(([id, label]) => ({
  id,
  label,
  status: 'pending_external_evidence'
}));

const productionEvidenceById = new Map(
  Array.isArray(productionEvidence?.items)
    ? productionEvidence.items.map(item => [item.id, item])
    : []
);
const productionEvidenceTemplateById = new Map(
  Array.isArray(productionEvidenceTemplate?.items)
    ? productionEvidenceTemplate.items.map(item => [item.id, item])
    : []
);

const mergedExternalEvidence = externalEvidence.map(item => {
  const provided = productionEvidenceById.get(item.id);
  const template = productionEvidenceTemplateById.get(item.id);
  const requiredProof = Array.isArray(provided?.requiredProof)
    ? provided.requiredProof
    : Array.isArray(template?.requiredProof)
      ? template.requiredProof
      : [];
  if (!provided) return { ...item, requiredProof, validationErrors: ['missing production evidence item'] };
  const validationErrors = validateExternalEvidenceItem({ ...provided, label: provided.label || item.label, requiredProof });
  return {
    ...item,
    requiredProof,
    status: externalEvidenceStatus(provided, validationErrors),
    evidenceRef: provided.evidenceRef || '',
    owner: provided.owner || '',
    checkedAt: provided.checkedAt || '',
    proofRefs: Array.isArray(provided.proofRefs) ? provided.proofRefs : [],
    validationErrors
  };
});

const externalEvidenceSummary = {
  total: mergedExternalEvidence.length,
  verified: mergedExternalEvidence.filter(item => item.status === 'verified_external_evidence').length,
  invalid: mergedExternalEvidence.filter(item => item.status === 'invalid_external_evidence').length,
  pending: mergedExternalEvidence.filter(item => item.status !== 'verified_external_evidence').length
};

const evidence = {
  generatedAt: new Date().toISOString(),
  app: {
    name: pkg.name || 'pet-companion-app',
    version: APP_VERSION,
    packageVersion: pkg.version || '',
    target: APP_BUILD_TARGET,
    channel: APP_RELEASE_CHANNEL
  },
  git: {
    commit: gitCommit || 'not-a-git-worktree',
    branch: gitBranch || 'not-a-git-worktree'
  },
  build: {
    distPresent: existsSync('dist/index.html'),
    buildInfoPresent: Boolean(buildInfo),
    buildInfo,
    embeddedGates: Array.isArray(buildInfo?.gates) ? buildInfo.gates : ['audit', 'test', 'pwa:cache:check']
  },
  artifacts: {
    manifestPresent: Boolean(artifactManifest),
    manifestPath: 'output/release-artifacts.json',
    manifestMarkdownPath: 'output/release-artifacts.md',
    schema: artifactManifest?.schema || '',
    fileCount: artifactManifest?.summary?.fileCount || 0,
    totalBytes: artifactManifest?.summary?.totalBytes || 0,
    manifestSha256: artifactManifest?.summary?.manifestSha256 || '',
    missingRequired: artifactManifest?.missingRequired || []
  },
  pwa: pwaCache,
  localGates: localGates.map(name => ({
    name,
    expectedStatus: 'pass',
    evidenceSource: name === 'build'
      ? 'dist/build-info.json and release:check output'
      : name === 'artifact:manifest'
        ? 'output/release-artifacts.json and release:check output'
        : name === 'artifact:verify'
          ? 'output/release-artifacts.json verification and release:check output'
        : 'release:check output'
  })),
  releaseCheck: {
    command: releaseCheckCommand,
    expectedSteps: expectedReleaseCheckSteps,
    actualSteps: releaseCheckSteps,
    matchesExpected: releaseCheckMatchesExpected,
    selfTestStep: 'release:evidence:self-test',
    evidenceStep: 'release:evidence'
  },
  ci: {
    workflow: '.github/workflows/release-gate.yml',
    command: 'npm run ci:check',
    status: 'configured'
  },
  evidenceGeneration: {
    command: 'npm run release:evidence',
    selfTestCommand: 'npm run release:evidence:self-test',
    expectedOrder: 'after all local gates in npm run release:check',
    status: 'generated'
  },
  evidenceVerification: {
    command: 'npm run release:evidence:check',
    expectedOrder: 'immediately after npm run release:evidence',
    status: 'configured'
  },
  launchStatus: {
    command: 'npm run launch:status',
    requireGoCommand: 'npm run launch:status -- --require-go',
    jsonCommand: 'npm --silent run launch:status -- --json',
    expectedDecisionWhenExternalPending: 'NO_GO',
    status: pkg.scripts?.['launch:status']?.includes('scripts/launch-status.mjs') ? 'configured' : 'missing'
  },
  externalEvidenceSource: productionEvidence ? 'output/production-evidence.json' : 'none',
  externalEvidenceSummary,
  externalEvidence: mergedExternalEvidence,
  conclusion: mergedExternalEvidence.every(item => item.status === 'verified_external_evidence')
    ? 'local_release_gates_ready_external_evidence_verified'
    : 'local_release_gates_ready_external_evidence_required'
};

function formatExternalEvidenceMarkdown(item) {
  const proofLines = Array.isArray(item.requiredProof) && item.requiredProof.length
    ? item.requiredProof.map(proof => `  - ${proof}`).join('\n')
    : '  - missing';
  const validationLines = Array.isArray(item.validationErrors) && item.validationErrors.length
    ? `\n  - Validation issues:\n${item.validationErrors.map(error => `    - ${error}`).join('\n')}`
    : '';
  return `- ${item.label}: ${item.status}\n  - Required proof:\n${proofLines}${validationLines}`;
}

const markdown = `# 宠伴记发布证据包

- 生成时间：${evidence.generatedAt}
- 应用版本：${evidence.app.version}
- 发布通道：${evidence.app.channel}
- 构建目标：${evidence.app.target}
- Git 分支：${evidence.git.branch}
- Git 提交：${evidence.git.commit}
- Dist 存在：${evidence.build.distPresent ? '是' : '否'}
- Build info 存在：${evidence.build.buildInfoPresent ? '是' : '否'}
- Build 内部门禁：${evidence.build.embeddedGates.join('、')}
- 产物清单存在：${evidence.artifacts.manifestPresent ? '是' : '否'}
- 产物文件数：${evidence.artifacts.fileCount}
- 产物总字节数：${evidence.artifacts.totalBytes}
- 产物清单 SHA-256：${evidence.artifacts.manifestSha256 || 'missing'}
- 必要产物缺失：${evidence.artifacts.missingRequired.length ? evidence.artifacts.missingRequired.join(', ') : '无'}

## PWA 缓存证据

- Service Worker：${evidence.pwa.serviceWorkerPath}
- Cache Name：${evidence.pwa.cacheName || 'missing'}
- Expected Cache Name：${evidence.pwa.expectedCacheName || 'missing'}
- Precache Hash：${evidence.pwa.precacheHash || 'missing'}
- Matches Expected：${evidence.pwa.matchesExpected ? '是' : '否'}
- Runtime Config Precached：${evidence.pwa.runtimeConfigPrecached ? '是' : '否'}

## 本地门禁

${evidence.localGates.map(item => `- ${item.name}：${item.expectedStatus}`).join('\n')}

## Release Check 步骤

- Command：${evidence.releaseCheck.command}
- Matches expected：${evidence.releaseCheck.matchesExpected ? '是' : '否'}
- Steps：${evidence.releaseCheck.actualSteps.join(' -> ')}

## CI 门禁

- Workflow：${evidence.ci.workflow}
- Command：${evidence.ci.command}
- Status：${evidence.ci.status}

## 证据生成

- Self Test Command：${evidence.evidenceGeneration.selfTestCommand}
- Command：${evidence.evidenceGeneration.command}
- Expected order：${evidence.evidenceGeneration.expectedOrder}
- Status：${evidence.evidenceGeneration.status}

## 证据自校验

- Command：${evidence.evidenceVerification.command}
- Expected order：${evidence.evidenceVerification.expectedOrder}
- Status：${evidence.evidenceVerification.status}

## 上线状态判定

- Command：${evidence.launchStatus.command}
- Require Go Command：${evidence.launchStatus.requireGoCommand}
- JSON Command：${evidence.launchStatus.jsonCommand}
- Expected decision when external pending：${evidence.launchStatus.expectedDecisionWhenExternalPending}
- Status：${evidence.launchStatus.status}

## 外部上线证据

- 来源：${evidence.externalEvidenceSource}
- 已验证：${evidence.externalEvidenceSummary.verified}/${evidence.externalEvidenceSummary.total}
- 待补齐：${evidence.externalEvidenceSummary.pending}

${evidence.externalEvidence.map(formatExternalEvidenceMarkdown).join('\n')}

## 结论

${evidence.conclusion}
`;

await mkdir(outputDir, { recursive: true });
await writeFile(jsonPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
await writeFile(markdownPath, markdown, 'utf8');

console.log(`PASS release evidence :: ${jsonPath}`);
console.log(`PASS release evidence :: ${markdownPath}`);
