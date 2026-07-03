import { existsSync, readFileSync } from 'node:fs';

const checks = [];
const add = (name, pass, detail = '') => checks.push({ name, pass, detail });
const read = file => readFileSync(file, 'utf8');

const requiredFiles = [
  'docs/production-readiness.md',
  'docs/deployment.md',
  'docs/operations.md',
  'docs/release-runbook.md',
  'docs/release-evidence.md',
  'docs/architecture.md',
  'docs/external-evidence.md',
  'docs/manual-device-acceptance.md',
  'docs/rollback.md',
  'docs/security.md',
  'docs/privacy.md',
  'docs/terms.md',
  'docs/backend.md',
  'docs/ci.md',
  'docs/api-contract.md',
  '.github/workflows/release-gate.yml',
  'deploy/production-evidence.example.json',
  'deploy/alert-rules.example.json',
  'README.md'
];

for (const file of requiredFiles) {
  add(`readiness file:${file}`, existsSync(file), file);
}

const readiness = read('docs/production-readiness.md');
const deployment = read('docs/deployment.md');
const readme = read('README.md');
const backend = read('docs/backend.md');
const apiContract = read('docs/api-contract.md');
const ciDoc = read('docs/ci.md');
const releaseRunbook = read('docs/release-runbook.md');
const rollback = read('docs/rollback.md');
const releaseEvidenceDoc = read('docs/release-evidence.md');
const architectureDoc = read('docs/architecture.md');
const externalEvidenceDoc = read('docs/external-evidence.md');
const manualDeviceAcceptanceDoc = read('docs/manual-device-acceptance.md');
const ciWorkflow = read('.github/workflows/release-gate.yml');
const productionEvidenceExample = read('deploy/production-evidence.example.json');
const alertRulesExample = read('deploy/alert-rules.example.json');
const pkg = read('package.json');
const packageJson = JSON.parse(pkg);
const releaseCheckCommand = packageJson.scripts?.['release:check'] || '';
const launchDocs = [readme, deployment, backend, apiContract].join('\n');
const actionableDocs = {
  'README.md': readme,
  'docs/production-readiness.md': readiness,
  'docs/deployment.md': deployment,
  'docs/backend.md': backend,
  'docs/release-runbook.md': releaseRunbook,
  'docs/rollback.md': rollback,
  'deploy/alert-rules.example.json': alertRulesExample
};

function hasActionablePlaceholderUrl(text) {
  return /https:\/\/[^\s`'"]*example\.com|support@example\.com/i.test(text);
}

add('readiness documents local release gate', readiness.includes('npm.cmd run release:check') && readiness.includes('npm.cmd run readiness:check'));
add('readiness separates external blockers', readiness.includes('真实上线前仍需外部配置') && readiness.includes('公网 HTTPS 入口') && readiness.includes('TLS') && readiness.includes('本地媒体') && readiness.includes('真机'));
add('readiness links manual device acceptance', readiness.includes('docs/manual-device-acceptance.md') && deployment.includes('docs/manual-device-acceptance.md') && externalEvidenceDoc.includes('manualDeviceAcceptance'));
add('readiness lists production smoke and ops checks', readiness.includes('smoke:production') && readiness.includes('ops:check') && readiness.includes('PET_PROD_APP_URL'));
add('deployment links production readiness', deployment.includes('docs/production-readiness.md') && deployment.includes('真实上线前仍需外部补齐'));
add('readme links production readiness', readme.includes('docs/production-readiness.md') && readme.includes('上线状态边界'));
add('readme exposes 10am acceptance entry', readme.includes('npm.cmd run acceptance:10am') && readme.includes('output/10am-acceptance.html') && readme.includes('output/10am-acceptance.md') && readme.includes('output/10am-acceptance-bundle') && readme.includes('npm.cmd run acceptance:bundle:check') && readme.includes('npm.cmd run acceptance:bundle:zip') && readme.includes('不部署、不上传'));
add('readme reflects current remote backend capability', readme.includes('账号导出/注销') && readme.includes('PWA 更新生命周期') && readme.includes('生产就绪门禁') && readme.includes('output/release-artifacts.json'));
add('backend doc reflects current api scope', backend.includes('账号生命周期接口') && backend.includes('PET_STORAGE_DRIVER=sqlite') && backend.includes('生产图片默认写入服务器本地持久化媒体目录'));
add('api contract has production backend criteria', apiContract.includes('账号数据导出') && apiContract.includes('旧 access token 必须立即失效') && apiContract.includes('本地媒体目录'));
add('package exposes readiness check', pkg.includes('"readiness:check"') && pkg.includes('scripts/readiness-check.mjs'));
add('release gate includes readiness check', pkg.includes('npm run readiness:check'));
add('package exposes release evidence', pkg.includes('"release:evidence"') && pkg.includes('scripts/release-evidence.mjs'));
add('release gate includes release evidence', releaseCheckCommand.includes('npm run release:evidence'));
add('package exposes release evidence check', pkg.includes('"release:evidence:check"') && pkg.includes('scripts/release-evidence-check.mjs'));
add('release gate includes release evidence check', releaseCheckCommand.includes('npm run release:evidence:check'));
add('package exposes architecture check', pkg.includes('"architecture:check"') && pkg.includes('scripts/architecture-check.mjs'));
add('release gate includes architecture check', releaseCheckCommand.includes('npm run architecture:check'));
add('architecture doc reflects production state', architectureDoc.includes('宠伴记生产架构说明') && architectureDoc.includes('server/storage.js') && architectureDoc.includes('PET_STORAGE_DRIVER=sqlite') && !architectureDoc.includes('Node API 雏形'));
add('package exposes public bundle check', pkg.includes('"public:bundle:check"') && pkg.includes('scripts/public-bundle-check.mjs'));
add('release gate includes public bundle check', releaseCheckCommand.includes('npm run public:bundle:check'));
add('package exposes pwa cache check', pkg.includes('"pwa:cache:check"') && pkg.includes('scripts/pwa-cache-check.mjs'));
add('release gate includes pwa cache check', releaseCheckCommand.includes('npm run pwa:cache:check'));
add('package exposes artifact manifest', pkg.includes('"artifact:manifest"') && pkg.includes('scripts/artifact-manifest.mjs'));
add('package exposes artifact verify', pkg.includes('"artifact:verify"') && pkg.includes('scripts/artifact-verify.mjs'));
add('release gate includes artifact manifest', releaseCheckCommand.includes('npm run artifact:manifest'));
add('release gate includes artifact verify', releaseCheckCommand.includes('npm run artifact:verify'));
add('release gate writes and verifies evidence after local checks', releaseCheckCommand.indexOf('npm run architecture:check') < releaseCheckCommand.indexOf('npm run external:evidence:check') && releaseCheckCommand.indexOf('npm run external:evidence:check') < releaseCheckCommand.indexOf('npm run secrets:check') && releaseCheckCommand.indexOf('npm run secrets:check') < releaseCheckCommand.indexOf('npm run accessibility:check') && releaseCheckCommand.indexOf('npm run accessibility:check') < releaseCheckCommand.indexOf('npm run artifact:manifest') && releaseCheckCommand.indexOf('npm run artifact:manifest') < releaseCheckCommand.indexOf('npm run artifact:verify') && releaseCheckCommand.indexOf('npm run artifact:verify') < releaseCheckCommand.indexOf('npm run release:evidence') && releaseCheckCommand.indexOf('npm run release:evidence') < releaseCheckCommand.indexOf('npm run release:evidence:check') && releaseEvidenceDoc.includes('本地门禁之后') && releaseEvidenceDoc.includes('release:evidence:check') && releaseEvidenceDoc.includes('output/release-artifacts.json'));
add('package exposes external evidence check', pkg.includes('"external:evidence:check"') && pkg.includes('scripts/external-evidence-check.mjs'));
add('package exposes external evidence init', pkg.includes('"external:evidence:init"') && pkg.includes('scripts/external-evidence-init.mjs') && externalEvidenceDoc.includes('npm run external:evidence:init'));
add('package exposes external evidence next actions', pkg.includes('"external:evidence:next"') && pkg.includes('scripts/external-evidence-next.mjs') && externalEvidenceDoc.includes('npm run external:evidence:next -- --commands'));
add('package exposes external evidence worksheet', pkg.includes('"external:evidence:worksheet"') && pkg.includes('scripts/external-evidence-worksheet.mjs') && externalEvidenceDoc.includes('external-evidence-worksheet.md') && readiness.includes('npm.cmd run external:evidence:worksheet'));
add('package exposes external evidence status', pkg.includes('"external:evidence:status"') && pkg.includes('scripts/external-evidence-status.mjs') && externalEvidenceDoc.includes('npm run external:evidence:status') && externalEvidenceDoc.includes('--require-verified'));
add('package exposes launch status', pkg.includes('"launch:status"') && pkg.includes('scripts/launch-status.mjs') && readiness.includes('npm.cmd run launch:status') && readiness.includes('--require-go'));
add('package exposes 10am acceptance entry', pkg.includes('"acceptance:10am"') && pkg.includes('scripts/acceptance-10am.mjs') && readiness.includes('npm.cmd run acceptance:10am') && readiness.includes('output/10am-acceptance.html') && readiness.includes('output/10am-acceptance.md') && readiness.includes('output/10am-acceptance-bundle'));
add('package exposes acceptance bundle check', pkg.includes('"acceptance:bundle:check"') && pkg.includes('scripts/acceptance-bundle-check.mjs') && readiness.includes('npm.cmd run acceptance:bundle:check') && readiness.includes('MANIFEST.md'));
add('package exposes acceptance bundle zip', pkg.includes('"acceptance:bundle:zip"') && pkg.includes('scripts/acceptance-bundle-zip.mjs') && readiness.includes('npm.cmd run acceptance:bundle:zip') && readiness.includes('SHA-256'));
add('package exposes acceptance final summary', pkg.includes('"acceptance:final"') && pkg.includes('scripts/acceptance-final.mjs') && readiness.includes('npm.cmd run acceptance:final') && readiness.includes('output/10am-final-summary.md') && readme.includes('npm.cmd run acceptance:final') && readme.includes('不部署、不上传'));
add('package exposes acceptance brief', pkg.includes('"acceptance:brief"') && pkg.includes('scripts/acceptance-brief.mjs') && readiness.includes('npm.cmd run acceptance:brief') && readiness.includes('acceptance-brief.md'));
add('package exposes acceptance handoff', pkg.includes('"acceptance:handoff"') && pkg.includes('scripts/acceptance-handoff.mjs') && readiness.includes('npm.cmd run acceptance:handoff'));
add('package exposes acceptance preflight', pkg.includes('"acceptance:preflight"') && pkg.includes('scripts/acceptance-preflight.mjs') && readiness.includes('npm.cmd run acceptance:preflight') && readiness.includes('acceptance-preflight.md'));
add('package exposes manual acceptance record', pkg.includes('"manual:acceptance:record"') && pkg.includes('scripts/manual-acceptance-record.mjs') && readiness.includes('npm.cmd run manual:acceptance:record') && manualDeviceAcceptanceDoc.includes('manual-device-acceptance-record.md'));
add('release gate includes external evidence check', pkg.includes('npm run external:evidence:check'));
add('package exposes ci check', pkg.includes('"ci:check"') && pkg.includes('npm run release:check'));
add('ci workflow runs release gate', ciWorkflow.includes('Pet Companion Release Gate') && ciWorkflow.includes('windows-latest') && ciWorkflow.includes('npm run ci:check'));
add('ci doc explains safe gate', ciDoc.includes('CI 不读取真实生产密钥') && ciDoc.includes('不部署、不发布') && ciDoc.includes('npm run ci:check'));
add('release evidence doc explains external evidence', releaseEvidenceDoc.includes('output/release-evidence.json') && releaseEvidenceDoc.includes('pending_external_evidence') && releaseEvidenceDoc.includes('不能声明真实上线完成'));
add('external evidence doc explains template', externalEvidenceDoc.includes('deploy/production-evidence.example.json') && externalEvidenceDoc.includes('output/production-evidence.json') && externalEvidenceDoc.includes('不得出现疑似 password'));
add('external evidence template has required schema', productionEvidenceExample.includes('pet-companion-production-evidence-v1') && productionEvidenceExample.includes('domainTls') && productionEvidenceExample.includes('manualDeviceAcceptance'));
for (const [file, text] of Object.entries(actionableDocs)) {
  add(`no actionable placeholder url:${file}`, !hasActionablePlaceholderUrl(text), file);
}
add('manual device acceptance checklist exists', manualDeviceAcceptanceDoc.includes('设备矩阵') && manualDeviceAcceptanceDoc.includes('PWA 更新') && manualDeviceAcceptanceDoc.includes('账号注销') && manualDeviceAcceptanceDoc.includes('token、cookie、password'));
add('package exposes manual acceptance check', pkg.includes('"manual:acceptance:check"') && pkg.includes('scripts/manual-acceptance-check.mjs'));
add('release gate includes manual acceptance check', releaseCheckCommand.includes('npm run manual:acceptance:check') && readiness.includes('npm.cmd run manual:acceptance:check'));

const staleClaims = [
  '当前数据仍为 `localStorage`，后续上线需要接正式后端',
  '真实推送、账号体系、权限、云同步尚未接入',
  '正式上线前需实现 `docs/api-contract.md` 中的服务端接口',
  '将本地 Node API 雏形替换/升级为正式后端服务',
  '后续正式后端实现参考',
  '生产环境需要按本文档替换为正式服务端实现'
];

for (const staleClaim of staleClaims) {
  add(`no stale readiness claim:${staleClaim}`, !launchDocs.includes(staleClaim), staleClaim);
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
  console.error(`\n${failed} production readiness checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} production readiness checks passed.`);
