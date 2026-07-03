import { existsSync, readFileSync } from 'node:fs';

const checks = [];
const add = (name, pass, detail = '') => checks.push({ name, pass, detail });
const read = file => existsSync(file) ? readFileSync(file, 'utf8') : '';

const manual = read('docs/manual-device-acceptance.md');
const productionEvidenceExample = read('deploy/production-evidence.example.json');
const releaseRunbook = read('docs/release-runbook.md');
const productionReadiness = read('docs/production-readiness.md');
const deployment = read('docs/deployment.md');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const releaseCheck = pkg.scripts?.['release:check'] || '';

for (const file of [
  'docs/manual-device-acceptance.md',
  'deploy/production-evidence.example.json',
  'docs/release-runbook.md',
  'docs/production-readiness.md',
  'docs/deployment.md'
]) {
  add(`manual acceptance file:${file}`, existsSync(file), file);
}

const deviceMatrix = [
  'iPhone 小屏',
  'iPhone 主流屏',
  'iPhone 大屏',
  'Android 小屏',
  'Android 主流机',
  'Android 大屏'
];

const requiredFlows = [
  '首次打开',
  '注册/登录',
  '宠物档案',
  '打卡管理',
  '健康提醒',
  '图片上传',
  '云同步',
  '云备份',
  '离线体验',
  'PWA 更新',
  '账号导出',
  '账号注销',
  '法务入口',
  '可访问性',
  '支持/投诉'
];

const requiredEvidence = [
  '设备矩阵',
  '核心流程',
  '离线',
  'PWA 更新',
  '账号注销',
  '复验结论'
];

add('manual acceptance has device matrix coverage', deviceMatrix.every(item => manual.includes(item)));
add('manual acceptance covers complaint-prone flows', requiredFlows.every(item => manual.includes(item)));
add('manual acceptance records environment and build', ['设备型号', '系统版本', '网络环境', 'App 版本', '构建哈希'].every(item => manual.includes(item)));
add('manual acceptance requires sanitized screenshots', ['token', 'cookie', 'password', '私钥', '生产密钥'].every(item => manual.includes(item)));
add('manual acceptance has defect and retest policy', manual.includes('阻塞级缺陷') && manual.includes('修复后复验') && manual.includes('不能声明真实上线完成'));
add('manual acceptance includes structured result table', manual.includes('| 设备 | 系统/浏览器 | 网络 | 流程 | 结果 | 证据 | 备注 |'));
add('manual acceptance includes final sign-off', manual.includes('验收结论') && manual.includes('验收负责人') && manual.includes('复验记录'));
add('manual acceptance documents record generator', manual.includes('npm.cmd run manual:acceptance:record') && manual.includes('manual-device-acceptance-record.md') && manual.includes('manual-device-acceptance-record.json'));

let evidence = null;
try {
  evidence = JSON.parse(productionEvidenceExample);
  add('production evidence example parseable', true);
} catch (error) {
  add('production evidence example parseable', false, error.message);
}

const manualEvidence = Array.isArray(evidence?.items)
  ? evidence.items.find(item => item.id === 'manualDeviceAcceptance')
  : null;

add('manual acceptance external evidence item exists', Boolean(manualEvidence));
add('manual acceptance evidence stays pending in template', manualEvidence?.status === 'pending');
add('manual acceptance evidence has required proof', requiredEvidence.every(item => JSON.stringify(manualEvidence?.requiredProof || []).includes(item)));
add('release runbook requires manual acceptance check', releaseRunbook.includes('npm run manual:acceptance:check') && releaseRunbook.includes('real iPhone') && releaseRunbook.includes('real Android'));
add('production readiness references manual acceptance gate', productionReadiness.includes('npm.cmd run manual:acceptance:check') && productionReadiness.includes('docs/manual-device-acceptance.md'));
add('deployment checklist references manual acceptance gate', deployment.includes('npm run manual:acceptance:check') && deployment.includes('docs/manual-device-acceptance.md'));
add('package exposes manual acceptance check', pkg.scripts?.['manual:acceptance:check'] === 'node ./scripts/manual-acceptance-check.mjs');
add('package exposes manual acceptance record generator', pkg.scripts?.['manual:acceptance:record'] === 'node ./scripts/manual-acceptance-record.mjs');
add('release gate includes manual acceptance check', releaseCheck.includes('npm run manual:acceptance:check'));

const failed = checks.filter(check => !check.pass);
for (const check of checks) {
  console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
}

if (failed.length) {
  console.error(`\n${failed.length} manual acceptance check(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} manual acceptance checks passed.`);
