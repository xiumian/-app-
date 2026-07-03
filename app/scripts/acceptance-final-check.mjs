import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';

const jsonPath = 'output/10am-final-summary.json';
const markdownPath = 'output/10am-final-summary.md';
const textPath = 'output/10am-final-summary.txt';

const SECRET_BLOCK_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,
  /(password|token|cookie|secret|private[_-]?key)\s*=\s*["']?[A-Za-z0-9+/=_-]{24,}/i
];

const checks = [];

function add(name, pass, detail = '') {
  checks.push({ name, pass, detail });
}

async function readText(path) {
  return existsSync(path) ? readFile(path, 'utf8') : '';
}

async function readJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
}

async function fileSize(path) {
  if (!path || !existsSync(path)) return null;
  return (await stat(path)).size;
}

function hasNoSecretBlocks(text) {
  return !SECRET_BLOCK_PATTERNS.some(pattern => pattern.test(text));
}

async function main() {
  add('final summary json exists', existsSync(jsonPath), jsonPath);
  add('final summary markdown exists', existsSync(markdownPath), markdownPath);
  add('final summary text exists', existsSync(textPath), textPath);

  const [payload, markdown, text] = await Promise.all([
    readJson(jsonPath),
    readText(markdownPath),
    readText(textPath)
  ]);

  add('final summary json parseable', payload?.schema === 'pet-companion-10am-final-summary-v1');
  add('final summary keeps local pass and NO_GO', payload?.localOk === true && payload?.launchDecision === 'NO_GO');
  add('final summary records external evidence count', payload?.externalEvidence?.verified === 0 && payload?.externalEvidence?.total === 8);
  add('final summary records latest zip hash', Boolean(payload?.latestZip?.zipPath) && /^[a-f0-9]{64}$/.test(String(payload?.latestZip?.sha256 || '')));
  add('final summary records bundle open first', payload?.latestZip?.openFirst === 'index.html');
  add('final summary records next external action', payload?.nextExternalAction?.id === 'domainTls' && payload?.nextExternalAction?.helperCommand === 'npm.cmd run external:evidence:next -- --id domainTls --commands');
  add('final summary records owner shortcut commands', Array.isArray(payload?.ownerShortcuts) && payload.ownerShortcuts.some(item => item.command === 'npm.cmd run external:evidence:next:ops') && payload.ownerShortcuts.some(item => item.command === 'npm.cmd run external:evidence:next:legal') && payload.ownerShortcuts.some(item => item.command === 'npm.cmd run external:evidence:next:qa'));
  add('final summary records transfer boundary', String(payload?.transferBoundary || '').includes('不部署') && String(payload?.transferBoundary || '').includes('不改服务器首页'));

  const latestZipPath = payload?.latestZip?.zipPath ? String(payload.latestZip.zipPath) : '';
  const stableLatestZipPath = payload?.latestZip?.latestZipPath ? String(payload.latestZip.latestZipPath) : '';
  const latestZipShaPath = latestZipPath ? `${latestZipPath}.sha256.txt` : '';
  const stableLatestShaPath = 'output/10am-acceptance-bundle-latest.sha256.txt';
  const stableLatestZipShaPath = 'output/10am-acceptance-bundle-latest.zip.sha256.txt';
  const latestZipShaText = await readText(latestZipShaPath);
  const stableLatestShaText = await readText(stableLatestShaPath);
  const stableLatestZipShaText = await readText(stableLatestZipShaPath);
  const latestZipBytes = await fileSize(latestZipPath);
  const stableLatestZipBytes = await fileSize(stableLatestZipPath);
  add('final summary latest zip file exists', Boolean(latestZipPath) && existsSync(latestZipPath), latestZipPath || '<missing>');
  add('final summary latest zip sha file exists', Boolean(latestZipShaPath) && existsSync(latestZipShaPath), latestZipShaPath || '<missing>');
  add('final summary latest zip sha file matches json', Boolean(payload?.latestZip?.sha256) && latestZipShaText.includes(payload.latestZip.sha256) && latestZipShaText.includes(latestZipPath));
  add('final summary latest zip bytes match json', Number.isFinite(payload?.latestZip?.bytes) && latestZipBytes === payload.latestZip.bytes, `${latestZipBytes === null ? '<missing>' : latestZipBytes}`);
  add('final summary stable latest zip exists', stableLatestZipPath === 'output/10am-acceptance-bundle-latest.zip' && existsSync(stableLatestZipPath), stableLatestZipPath || '<missing>');
  add('final summary stable latest zip sha matches json', Boolean(payload?.latestZip?.sha256) && stableLatestShaText.includes(payload.latestZip.sha256) && stableLatestShaText.includes(stableLatestZipPath));
  add('final summary stable latest zip sha alias exists', existsSync(stableLatestZipShaPath) && Boolean(payload?.latestZip?.sha256) && stableLatestZipShaText.includes(payload.latestZip.sha256) && stableLatestZipShaText.includes(stableLatestZipPath), stableLatestZipShaPath);
  add('final summary stable latest zip bytes match timestamp zip', Number.isFinite(payload?.latestZip?.bytes) && stableLatestZipBytes === payload.latestZip.bytes, `${stableLatestZipBytes === null ? '<missing>' : stableLatestZipBytes}`);

  add('final markdown has next action', markdown.includes('现场下一步先做') && markdown.includes('domainTls') && markdown.includes('external:evidence:next -- --id domainTls --commands'));
  add('final markdown has owner shortcuts', markdown.includes('负责人快捷命令') && markdown.includes('external:evidence:next:ops') && markdown.includes('external:evidence:next:legal') && markdown.includes('external:evidence:next:qa'));
  add('final markdown has现场打开顺序', markdown.includes('现场优先打开') && markdown.includes('output/10am-acceptance-bundle/index.html') && markdown.includes('output/10am-acceptance.html') && markdown.includes('output/10am-decision-card.html') && markdown.includes('output/10am-signoff-sheet.html') && markdown.includes('output/10am-meeting-minutes.html') && markdown.includes('output/10am-snapshot-lock.html') && markdown.includes('output/external-evidence-cockpit.html') && markdown.includes('output/external-evidence-worksheet.html') && markdown.includes('output/manual-device-acceptance-record.html') && markdown.includes('output/deploy-transfer-plan.md') && markdown.includes('output/10am-acceptance-bundle-latest.zip'));
  add('final markdown has zip hash', markdown.includes('资料包 SHA-256') && markdown.includes(payload?.latestZip?.sha256 || '<missing>'));
  add('final text has concise next action', text.includes('现场下一步：domainTls') && text.includes('external:evidence:next -- --id domainTls --commands') && text.includes('external:evidence:next:ops'));
  add('final outputs have no obvious secret blocks', hasNoSecretBlocks(markdown) && hasNoSecretBlocks(text) && hasNoSecretBlocks(JSON.stringify(payload || {})));

  for (const check of checks) {
    console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
  }

  const failed = checks.filter(check => !check.pass);
  if (failed.length) {
    console.error(`\n${failed.length} final summary check(s) failed.`);
    process.exit(1);
  }

  console.log(`\nAll ${checks.length} final summary checks passed.`);
}

main().catch(error => {
  console.error(`FAIL final summary check :: ${error.message}`);
  process.exit(1);
});
