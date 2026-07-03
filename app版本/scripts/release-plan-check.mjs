import { existsSync, readFileSync } from 'node:fs';

const checks = [];
const add = (name, pass, detail = '') => checks.push({ name, pass, detail });

function read(path) {
  return readFileSync(path, 'utf8');
}

const requiredFiles = [
  'docs/release-runbook.md',
  'docs/rollback.md',
  'docs/security.md',
  'docs/deployment.md',
  'docs/operations.md',
  'docs/production-readiness.md',
  'docs/release-evidence.md',
  'docs/architecture.md',
  'docs/external-evidence.md',
  'docs/ci.md',
  '.github/workflows/release-gate.yml',
  'deploy/docker-compose.production.yml',
  'deploy/alert-rules.example.json',
  'deploy/production-evidence.example.json',
  'deploy/production.env.example',
  'package.json'
];

for (const file of requiredFiles) {
  add(`release plan file:${file}`, existsSync(file), file);
}

const releaseRunbook = existsSync('docs/release-runbook.md') ? read('docs/release-runbook.md') : '';
const rollback = existsSync('docs/rollback.md') ? read('docs/rollback.md') : '';
const security = existsSync('docs/security.md') ? read('docs/security.md') : '';
const deployment = read('docs/deployment.md');
const operations = read('docs/operations.md');
const productionReadiness = read('docs/production-readiness.md');
const releaseEvidenceDoc = read('docs/release-evidence.md');
const architectureDoc = read('docs/architecture.md');
const externalEvidenceDoc = read('docs/external-evidence.md');
const ciDoc = read('docs/ci.md');
const ciWorkflow = read('.github/workflows/release-gate.yml');
const compose = read('deploy/docker-compose.production.yml');
const alertRulesExample = read('deploy/alert-rules.example.json');
const productionEvidenceExample = read('deploy/production-evidence.example.json');
const envExample = read('deploy/production.env.example');
const pkg = read('package.json');
const packageJson = JSON.parse(pkg);
const releaseCheckCommand = packageJson.scripts?.['release:check'] || '';
const actionableReleaseDocs = {
  'docs/release-runbook.md': releaseRunbook,
  'docs/rollback.md': rollback,
  'docs/deployment.md': deployment,
  'docs/operations.md': operations,
  'docs/production-readiness.md': productionReadiness,
  'deploy/alert-rules.example.json': alertRulesExample
};

function hasActionablePlaceholderUrl(text) {
  return /https:\/\/[^\s`'"]*example\.com|support@example\.com/i.test(text);
}

add('release runbook has go no-go gate', releaseRunbook.includes('Go / No-Go') && releaseRunbook.includes('Do not release') && releaseRunbook.includes('go decision'));
add('release runbook requires full local gates', ['npm run release:check', 'npm run deploy:check:production', 'npm run server:check:production', 'npm run backup:drill'].every(item => releaseRunbook.includes(item)));
add('release runbook requires secret hygiene gate', releaseRunbook.includes('npm run secrets:check') && releaseRunbook.includes('docs/security.md'));
add('release runbook requires production smoke and ops checks', releaseRunbook.includes('npm run smoke:production') && releaseRunbook.includes('npm run ops:check') && releaseRunbook.includes('PET_PROD_APP_URL') && releaseRunbook.includes('PET_PROD_API_BASE_URL'));
add('release runbook requires runtime and secret review', releaseRunbook.includes('runtime-config.js') && releaseRunbook.includes('production.env') && releaseRunbook.includes('real secrets') && releaseRunbook.includes('TLS'));
add('release runbook has manual acceptance', releaseRunbook.includes('real iPhone') && releaseRunbook.includes('real Android') && releaseRunbook.includes('remote account') && releaseRunbook.includes('image upload'));
add('release runbook includes manual acceptance gate', releaseRunbook.includes('npm run manual:acceptance:check') && releaseRunbook.includes('manual acceptance template checks'));

add('rollback doc has rollback triggers', rollback.includes('Rollback triggers') && rollback.includes('white screen') && rollback.includes('/ready') && rollback.includes('data corruption'));
add('rollback doc has docker compose rollback steps', rollback.includes('APP_VERSION') && rollback.includes('docker compose -f deploy/docker-compose.production.yml') && rollback.includes('up -d'));
add('rollback doc preserves persistent data', rollback.includes('pet_companion_data') && rollback.includes('Do not delete') && rollback.includes('/data'));
add('rollback doc covers verification after rollback', rollback.includes('npm run smoke:production') && rollback.includes('npm run ops:check') && rollback.includes('/ready'));
add('rollback doc covers backup restore escalation', rollback.includes('backup restore') && rollback.includes('restore owner') && rollback.includes('backup:drill'));
add('security doc covers secret hygiene', security.includes('Pet Companion Security Release Notes') && security.includes('npm run secrets:check') && security.includes('deploy/production.env') && security.includes('private key'));

add('compose supports versioned api image', compose.includes('image: pet-companion-api:${APP_VERSION:-0.4.0}') && envExample.includes('APP_VERSION=0.4.0'));
add('deployment references release runbook and rollback', deployment.includes('docs/release-runbook.md') && deployment.includes('docs/rollback.md') && deployment.includes('release:plan:check'));
add('operations references rollback runbook', operations.includes('docs/rollback.md') && operations.includes('rollback'));
add('production readiness separates local gates and external blockers', productionReadiness.includes('npm.cmd run release:check') && productionReadiness.includes('真实上线前仍需外部配置') && productionReadiness.includes('不能声明真实上线完成'));
add('architecture doc is production-current', architectureDoc.includes('宠伴记生产架构说明') && architectureDoc.includes('PET_STORAGE_DRIVER=sqlite') && architectureDoc.includes('scripts/architecture-check.mjs') && !architectureDoc.includes('Node API 雏形'));
add('release runbook references evidence package', releaseRunbook.includes('npm run release:evidence') && releaseRunbook.includes('npm run release:evidence:check') && releaseRunbook.includes('output/release-evidence.json') && releaseRunbook.includes('docs/release-evidence.md'));
add('release runbook references artifact manifest', releaseRunbook.includes('npm run artifact:manifest') && releaseRunbook.includes('npm run artifact:verify') && releaseRunbook.includes('output/release-artifacts.json'));
add('release evidence docs explain handoff', releaseEvidenceDoc.includes('发布评审') && releaseEvidenceDoc.includes('output/release-evidence.md') && releaseEvidenceDoc.includes('output/release-artifacts.json') && releaseEvidenceDoc.includes('pending_external_evidence'));
add('release runbook references external evidence', releaseRunbook.includes('npm run external:evidence:check') && releaseRunbook.includes('output/production-evidence.json') && releaseRunbook.includes('docs/external-evidence.md'));
add('external evidence docs explain validation', externalEvidenceDoc.includes('npm run external:evidence:check') && externalEvidenceDoc.includes('verified') && externalEvidenceDoc.includes('真实上线前'));
add('external evidence template includes all owners', productionEvidenceExample.includes('ops-owner') && productionEvidenceExample.includes('legal-owner') && productionEvidenceExample.includes('qa-owner'));
add('release runbook references ci gate', releaseRunbook.includes('Pet Companion Release Gate') && releaseRunbook.includes('npm run ci:check') && releaseRunbook.includes('docs/ci.md'));
add('ci workflow is non-deploying release gate', ciWorkflow.includes('permissions:') && ciWorkflow.includes('contents: read') && ciWorkflow.includes('workflow_dispatch') && ciWorkflow.includes('npm run ci:check'));
add('ci docs explain trigger and limits', ciDoc.includes('Pull Request') && ciDoc.includes('推送到 `main`') && ciDoc.includes('CI 不部署、不发布'));
add('package exposes release plan check', pkg.includes('"release:plan:check"') && pkg.includes('scripts/release-plan-check.mjs'));
add('release gate includes release plan check', pkg.includes('npm run release:plan:check'));
add('release gate includes manual acceptance check', pkg.includes('"manual:acceptance:check"') && releaseCheckCommand.includes('npm run manual:acceptance:check'));
add('release gate includes readiness check', pkg.includes('npm run readiness:check'));
add('release gate includes architecture check', pkg.includes('npm run architecture:check'));
add('release gate includes public bundle check', pkg.includes('npm run public:bundle:check'));
add('release gate includes pwa cache check', pkg.includes('npm run pwa:cache:check'));
add('release gate includes external evidence check', pkg.includes('npm run external:evidence:check'));
add('release gate includes artifact manifest', releaseCheckCommand.includes('npm run artifact:manifest'));
add('release gate includes artifact verify', releaseCheckCommand.includes('npm run artifact:verify'));
add('release gate includes release evidence', releaseCheckCommand.includes('npm run release:evidence'));
add('release gate includes release evidence check', releaseCheckCommand.includes('npm run release:evidence:check'));
add('release gate checks public bundle before server gates', releaseCheckCommand.indexOf('npm run deploy:check') < releaseCheckCommand.indexOf('npm run public:bundle:check') && releaseCheckCommand.indexOf('npm run public:bundle:check') < releaseCheckCommand.indexOf('npm run server:test'));
add('release gate checks pwa cache before server gates', releaseCheckCommand.indexOf('npm run public:bundle:check') < releaseCheckCommand.indexOf('npm run pwa:cache:check') && releaseCheckCommand.indexOf('npm run pwa:cache:check') < releaseCheckCommand.indexOf('npm run server:test'));
add('release gate generates and verifies evidence after local gates', releaseCheckCommand.indexOf('npm run readiness:check') < releaseCheckCommand.indexOf('npm run architecture:check') && releaseCheckCommand.indexOf('npm run architecture:check') < releaseCheckCommand.indexOf('npm run external:evidence:check') && releaseCheckCommand.indexOf('npm run external:evidence:check') < releaseCheckCommand.indexOf('npm run secrets:check') && releaseCheckCommand.indexOf('npm run secrets:check') < releaseCheckCommand.indexOf('npm run accessibility:check') && releaseCheckCommand.indexOf('npm run accessibility:check') < releaseCheckCommand.indexOf('npm run artifact:manifest') && releaseCheckCommand.indexOf('npm run artifact:manifest') < releaseCheckCommand.indexOf('npm run artifact:verify') && releaseCheckCommand.indexOf('npm run artifact:verify') < releaseCheckCommand.indexOf('npm run release:evidence') && releaseCheckCommand.indexOf('npm run release:evidence') < releaseCheckCommand.indexOf('npm run release:evidence:check') && releaseRunbook.includes('runs after the local gates'));
add('release gate includes secrets check', releaseCheckCommand.includes('npm run secrets:check'));
for (const [file, text] of Object.entries(actionableReleaseDocs)) {
  add(`no actionable placeholder url:${file}`, !hasActionablePlaceholderUrl(text), file);
}

const failed = checks.filter(check => !check.pass);
for (const check of checks) {
  console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
}

if (failed.length) {
  console.error(`\n${failed.length} release plan checks failed.`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} release plan checks passed.`);
