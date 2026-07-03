import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const bundleDir = 'output/10am-acceptance-bundle';
const manifestPath = join(bundleDir, 'MANIFEST.json');
const manifestMarkdownPath = join(bundleDir, 'MANIFEST.md');

const REQUIRED_FILES = [
  'README.md',
  'index.html',
  '10am-acceptance.html',
  '10am-acceptance.md',
  '10am-acceptance.json',
  'acceptance-brief.md',
  '10am-decision-card.html',
  '10am-decision-card.md',
  '10am-signoff-sheet.html',
  '10am-signoff-sheet.md',
  '10am-meeting-minutes.html',
  '10am-meeting-minutes.md',
  '10am-snapshot-lock.html',
  '10am-snapshot-lock.md',
  'acceptance-preflight.md',
  'acceptance-handoff.md',
  'external-evidence-cockpit.html',
  'external-evidence-cockpit.md',
  'external-evidence-request-pack.html',
  'external-evidence-request-pack.md',
  'external-evidence-request-ops.html',
  'external-evidence-request-ops.md',
  'external-evidence-request-legal.html',
  'external-evidence-request-legal.md',
  'external-evidence-request-qa.html',
  'external-evidence-request-qa.md',
  'external-evidence-worksheet.html',
  'external-evidence-worksheet.md',
  'manual-device-acceptance-record.html',
  'manual-device-acceptance-record.md',
  'release-artifacts.md',
  'release-evidence.md',
  'deploy-transfer-plan.md'
];

const ALLOWED_FILES = new Set([
  ...REQUIRED_FILES,
  'acceptance-brief.json',
  '10am-decision-card.json',
  '10am-signoff-sheet.json',
  '10am-meeting-minutes.json',
  '10am-snapshot-lock.json',
  'acceptance-preflight.json',
  'acceptance-handoff.json',
  'external-evidence-cockpit.json',
  'external-evidence-request-pack.json',
  'external-evidence-request-ops.json',
  'external-evidence-request-legal.json',
  'external-evidence-request-qa.json',
  'external-evidence-worksheet.json',
  'manual-device-acceptance-record.json',
  'release-artifacts.json',
  'release-evidence.json',
  'deploy-transfer-plan.json',
  'MANIFEST.json',
  'MANIFEST.md'
]);

const FORBIDDEN_FILE_NAMES = [
  'production.env',
  'target.json',
  'privkey.pem',
  'fullchain.pem',
  'id_rsa',
  'id_ed25519'
];

const SECRET_BLOCK_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,
  /(password|token|cookie|secret|private[_-]?key)\s*=\s*["']?[A-Za-z0-9+/=_-]{24,}/i
];

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

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const child of await listFiles(full)) files.push(`${entry.name}/${child}`);
    } else if (entry.isFile()) {
      files.push(entry.name);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function add(checks, name, pass, detail = '') {
  checks.push({ name, pass, detail });
}

async function main() {
  const checks = [];
  add(checks, 'bundle directory exists', existsSync(bundleDir), bundleDir);
  if (!existsSync(bundleDir)) {
    for (const check of checks) console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name} :: ${check.detail}`);
    process.exit(1);
  }

  const files = await listFiles(bundleDir);
  for (const file of REQUIRED_FILES) {
    add(checks, `bundle has ${file}`, files.includes(file), file);
  }

  const unexpectedFiles = files.filter(file => !ALLOWED_FILES.has(file));
  add(checks, 'bundle has no unexpected files', unexpectedFiles.length === 0, unexpectedFiles.join(', '));

  for (const forbidden of FORBIDDEN_FILE_NAMES) {
    add(checks, `bundle excludes ${forbidden}`, !files.some(file => file.toLowerCase().endsWith(forbidden.toLowerCase())), forbidden);
  }

  const artifacts = [];
  let secretFindings = [];
  for (const file of files) {
    const buffer = await readFile(join(bundleDir, file));
    const text = buffer.toString('utf8');
    artifacts.push({ path: file, bytes: buffer.byteLength, sha256: sha256(buffer) });
    for (const pattern of SECRET_BLOCK_PATTERNS) {
      if (pattern.test(text)) secretFindings.push(`${file}: ${pattern}`);
    }
  }

  const indexHtml = await readFile(join(bundleDir, 'index.html'), 'utf8').catch(() => '');
  const html = await readFile(join(bundleDir, '10am-acceptance.html'), 'utf8').catch(() => '');
  const cockpitHtml = await readFile(join(bundleDir, 'external-evidence-cockpit.html'), 'utf8').catch(() => '');
  const cockpitMarkdown = await readFile(join(bundleDir, 'external-evidence-cockpit.md'), 'utf8').catch(() => '');
  const requestPackHtml = await readFile(join(bundleDir, 'external-evidence-request-pack.html'), 'utf8').catch(() => '');
  const requestPackMarkdown = await readFile(join(bundleDir, 'external-evidence-request-pack.md'), 'utf8').catch(() => '');
  const requestOpsMarkdown = await readFile(join(bundleDir, 'external-evidence-request-ops.md'), 'utf8').catch(() => '');
  const requestLegalMarkdown = await readFile(join(bundleDir, 'external-evidence-request-legal.md'), 'utf8').catch(() => '');
  const requestQaMarkdown = await readFile(join(bundleDir, 'external-evidence-request-qa.md'), 'utf8').catch(() => '');
  const evidenceHtml = await readFile(join(bundleDir, 'external-evidence-worksheet.html'), 'utf8').catch(() => '');
  const manualHtml = await readFile(join(bundleDir, 'manual-device-acceptance-record.html'), 'utf8').catch(() => '');
  const acceptanceMarkdown = await readFile(join(bundleDir, '10am-acceptance.md'), 'utf8').catch(() => '');
  const decisionCardHtml = await readFile(join(bundleDir, '10am-decision-card.html'), 'utf8').catch(() => '');
  const decisionCardMarkdown = await readFile(join(bundleDir, '10am-decision-card.md'), 'utf8').catch(() => '');
  const signoffHtml = await readFile(join(bundleDir, '10am-signoff-sheet.html'), 'utf8').catch(() => '');
  const signoffMarkdown = await readFile(join(bundleDir, '10am-signoff-sheet.md'), 'utf8').catch(() => '');
  const minutesHtml = await readFile(join(bundleDir, '10am-meeting-minutes.html'), 'utf8').catch(() => '');
  const minutesMarkdown = await readFile(join(bundleDir, '10am-meeting-minutes.md'), 'utf8').catch(() => '');
  const snapshotHtml = await readFile(join(bundleDir, '10am-snapshot-lock.html'), 'utf8').catch(() => '');
  const snapshotMarkdown = await readFile(join(bundleDir, '10am-snapshot-lock.md'), 'utf8').catch(() => '');
  const briefMarkdown = await readFile(join(bundleDir, 'acceptance-brief.md'), 'utf8').catch(() => '');
  const handoffMarkdown = await readFile(join(bundleDir, 'acceptance-handoff.md'), 'utf8').catch(() => '');
  const readme = await readFile(join(bundleDir, 'README.md'), 'utf8').catch(() => '');
  const entryJson = JSON.parse(await readFile(join(bundleDir, '10am-acceptance.json'), 'utf8').catch(() => '{}'));

  add(checks, 'html entry mentions NO_GO', html.includes('NO_GO') && html.includes('外部证据：0/8 verified'));
  add(checks, 'bundle index is one-click entry', indexHtml.includes('宠伴记 10点验收资料包总入口') && indexHtml.includes('10am-acceptance.html') && indexHtml.includes('10am-decision-card.html') && indexHtml.includes('10am-signoff-sheet.html') && indexHtml.includes('10am-meeting-minutes.html') && indexHtml.includes('10am-snapshot-lock.html') && indexHtml.includes('external-evidence-cockpit.html') && indexHtml.includes('external-evidence-request-pack.html') && indexHtml.includes('external-evidence-worksheet.html') && indexHtml.includes('manual-device-acceptance-record.html') && indexHtml.includes('deploy-transfer-plan.md') && indexHtml.includes('不包含真实密码') && indexHtml.includes('external:evidence:next:ops') && indexHtml.includes('external:evidence:next:legal') && indexHtml.includes('external:evidence:next:qa'));
  add(checks, 'html entry has next external action', html.includes('现场下一步先做') && html.includes('domainTls') && html.includes('external:evidence:next -- --id domainTls --commands') && html.includes('必须补齐的证明') && html.includes('生产访问入口 HTTPS 可访问') && html.includes('登记命令'));
  add(checks, 'markdown entry has next external action', acceptanceMarkdown.includes('现场下一步先做') && acceptanceMarkdown.includes('domainTls') && acceptanceMarkdown.includes('external:evidence:update -- --id domainTls') && acceptanceMarkdown.includes('需要现场补齐的证明') && acceptanceMarkdown.includes('生产访问入口 HTTPS 可访问'));
  add(checks, 'brief markdown has next external action', briefMarkdown.includes('现场下一步先做') && briefMarkdown.includes('公网 HTTPS 入口') && briefMarkdown.includes('external:evidence:next -- --id domainTls --commands'));
  add(checks, 'readme has open first instruction', readme.includes('现场打开顺序') && readme.includes('index.html') && readme.includes('10am-acceptance.html') && readme.includes('10am-decision-card.html') && readme.includes('10am-signoff-sheet.html') && readme.includes('10am-meeting-minutes.html') && readme.includes('10am-snapshot-lock.html') && readme.includes('external-evidence-cockpit.html') && readme.includes('external-evidence-request-pack.html') && readme.includes('external-evidence-worksheet.html') && readme.includes('manual-device-acceptance-record.html') && readme.includes('deploy-transfer-plan.md') && readme.includes('不包含真实密码') && readme.includes('external:evidence:next:ops') && readme.includes('external:evidence:next:legal') && readme.includes('external:evidence:next:qa'));
  add(checks, 'entry json parseable and local pass', entryJson.schema === 'pet-companion-10am-acceptance-v1' && entryJson.localPass === true);
  add(checks, 'entry json records next external action', entryJson.nextExternalAction?.id === 'domainTls' && entryJson.nextExternalAction?.helperCommand === 'npm.cmd run external:evidence:next -- --id domainTls --commands');
  add(checks, 'decision card records go no-go boundary', decisionCardHtml.includes('NO_GO') && decisionCardHtml.includes('0/8 verified') && decisionCardHtml.includes('launch:status returns GO') && decisionCardHtml.includes('do not deploy, upload, or modify server homepage') && decisionCardMarkdown.includes('production.env') && decisionCardMarkdown.includes('launch:status returns GO'));
  add(checks, 'signoff sheet records owner confirmation rows', signoffHtml.includes('Pet Companion 10am Signoff Sheet') && signoffHtml.includes('Owner signoff rows') && signoffHtml.includes('Final release stays') && signoffMarkdown.includes('Owner signoff rows') && signoffMarkdown.includes('npm.cmd run external:evidence:next:ops') && signoffMarkdown.includes('NO_GO'));
  add(checks, 'meeting minutes records action tracker', minutesHtml.includes('Pet Companion 10am Meeting Minutes') && minutesHtml.includes('Action tracker') && minutesMarkdown.includes('Action tracker') && minutesMarkdown.includes('Do not claim production launch') && minutesMarkdown.includes('npm.cmd run acceptance:signoff'));
  add(checks, 'snapshot lock records material hashes', snapshotHtml.includes('Pet Companion 10am Snapshot Lock') && snapshotHtml.includes('Combined SHA-256') && snapshotMarkdown.includes('Snapshot files') && snapshotMarkdown.includes('10am-acceptance-bundle-latest.zip') && snapshotMarkdown.includes('npm.cmd run acceptance:snapshot'));
  add(checks, 'external evidence cockpit has all blockers', cockpitHtml.includes('Pet Companion External Evidence Cockpit') && cockpitHtml.includes('domainTls') && cockpitHtml.includes('productionEnv') && cockpitHtml.includes('persistentStorage') && cockpitHtml.includes('objectStorage') && cockpitHtml.includes('monitoringAlerts') && cockpitHtml.includes('platformBackups') && cockpitHtml.includes('legalApproval') && cockpitHtml.includes('manualDeviceAcceptance') && cockpitHtml.includes('NO_GO') && cockpitHtml.includes('does not deploy, upload, or modify the server homepage'));
  add(checks, 'external evidence cockpit markdown has collector commands', cockpitMarkdown.includes('external:evidence:domain-tls') && cockpitMarkdown.includes('external:evidence:production-env') && cockpitMarkdown.includes('external:evidence:storage') && cockpitMarkdown.includes('external:evidence:ops') && cockpitMarkdown.includes('external:evidence:release-approval') && cockpitMarkdown.includes('Keep NO_GO until all 8/8 items are verified'));
  add(checks, 'external evidence request pack has owner sections', requestPackHtml.includes('Pet Companion External Evidence Request Pack') && requestPackHtml.includes('Ops / deployment owner') && requestPackHtml.includes('Legal / operator owner') && requestPackHtml.includes('QA / device acceptance owner') && requestPackHtml.includes('does not deploy, upload, access servers, or modify the server homepage') && requestPackHtml.includes('10am owner handoff message') && requestPackHtml.includes('Owner return checklist'));
  add(checks, 'external evidence request pack markdown has all collectors', requestPackMarkdown.includes('external:evidence:domain-tls') && requestPackMarkdown.includes('external:evidence:production-env') && requestPackMarkdown.includes('external:evidence:storage') && requestPackMarkdown.includes('external:evidence:ops') && requestPackMarkdown.includes('external:evidence:release-approval') && requestPackMarkdown.includes('Keep NO_GO until all 8/8 items are verified') && requestPackMarkdown.includes('10am owner handoff message') && requestPackMarkdown.includes('Owner return checklist'));
  add(checks, 'external evidence request pack has per-owner files', requestOpsMarkdown.includes('Ops / deployment owner Evidence Request') && requestOpsMarkdown.includes('domainTls') && requestOpsMarkdown.includes('platformBackups') && requestLegalMarkdown.includes('Legal / operator owner Evidence Request') && requestLegalMarkdown.includes('legalApproval') && requestQaMarkdown.includes('QA / device acceptance owner Evidence Request') && requestQaMarkdown.includes('manualDeviceAcceptance') && requestOpsMarkdown.includes('Run this shortcut first') && requestLegalMarkdown.includes('Owner return checklist') && requestQaMarkdown.includes('external:evidence:next:qa'));
  add(checks, 'handoff points to cockpit and stable zip sha', handoffMarkdown.includes('10点现场入口') && handoffMarkdown.includes('external-evidence-cockpit.html') && handoffMarkdown.includes('10am-acceptance-bundle-latest.zip') && handoffMarkdown.includes('10am-acceptance-bundle-latest.zip.sha256.txt') && handoffMarkdown.includes('external:evidence:next:ops') && handoffMarkdown.includes('external:evidence:next:legal') && handoffMarkdown.includes('external:evidence:next:qa') && handoffMarkdown.includes('不上传服务器') && handoffMarkdown.includes('不改服务器首页'));
  add(checks, 'external evidence html has all blocker cards', evidenceHtml.includes('宠伴记外部上线证据看板') && evidenceHtml.includes('domainTls') && evidenceHtml.includes('productionEnv') && evidenceHtml.includes('manualDeviceAcceptance') && evidenceHtml.includes('仍阻断上线') && evidenceHtml.includes('不放密码'));
  add(checks, 'manual acceptance html has device and flow board', manualHtml.includes('宠伴记真机验收记录') && manualHtml.includes('设备矩阵') && manualHtml.includes('必验流程记录') && manualHtml.includes('manualDeviceAcceptance proofRef 对照') && manualHtml.includes('真实上线结论必须保持 NO_GO'));
  add(checks, 'bundle has no obvious secret blocks', secretFindings.length === 0, secretFindings.join('; '));

  const failed = checks.filter(check => !check.pass);
  const manifest = {
    schema: 'pet-companion-acceptance-bundle-manifest-v1',
    generatedAt: new Date().toISOString(),
    generatedAtLocal: formatChinaTime(),
    bundleDir,
    summary: {
      fileCount: artifacts.length,
      totalBytes: artifacts.reduce((sum, item) => sum + item.bytes, 0),
      checks: checks.length,
      failed: failed.length
    },
    artifacts,
    checks
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await writeFile(manifestMarkdownPath, `# 宠伴记 10点验收资料包清单

- 生成时间：${manifest.generatedAtLocal}
- 文件数：${manifest.summary.fileCount}
- 总大小：${manifest.summary.totalBytes} bytes
- 检查：${manifest.summary.checks - manifest.summary.failed}/${manifest.summary.checks} 通过

| 文件 | bytes | SHA-256 |
| --- | ---: | --- |
${artifacts.map(item => `| \`${item.path}\` | ${item.bytes} | \`${item.sha256}\` |`).join('\n')}
`, 'utf8');

  for (const check of checks) {
    console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
  }
  if (failed.length) {
    console.error(`\n${failed.length} acceptance bundle check(s) failed.`);
    process.exit(1);
  }
  console.log(`\nAll ${checks.length} acceptance bundle checks passed.`);
  console.log(`PASS acceptance bundle manifest :: ${manifestPath}`);
  console.log(`PASS acceptance bundle manifest :: ${manifestMarkdownPath}`);
}

main().catch(error => {
  console.error(`FAIL acceptance bundle check :: ${error.message}`);
  process.exit(1);
});
