import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const outputDir = 'output';
const jsonPath = `${outputDir}/10am-final-summary.json`;
const markdownPath = `${outputDir}/10am-final-summary.md`;
const textPath = `${outputDir}/10am-final-summary.txt`;
const KNOWN_OWNER_SHORTCUTS = [
  { group: 'ops', command: 'npm.cmd run external:evidence:next:ops' },
  { group: 'legal', command: 'npm.cmd run external:evidence:next:legal' },
  { group: 'qa', command: 'npm.cmd run external:evidence:next:qa' }
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

function lastUsefulLine(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(-1)[0] || '';
}

function runStep(id, label, command, args) {
  const startedAt = Date.now();
  const useCmdShim = command.endsWith('.cmd');
  const spawnCommand = useCmdShim ? 'cmd.exe' : command;
  const spawnArgs = useCmdShim ? ['/d', '/s', '/c', command, ...args] : args;
  const result = spawnSync(spawnCommand, spawnArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true
  });
  return {
    id,
    label,
    command: [command, ...args].join(' '),
    ok: result.status === 0,
    exitCode: result.status,
    durationMs: Date.now() - startedAt,
    summary: lastUsefulLine(result.stdout) || lastUsefulLine(result.stderr) || result.error?.message || '',
    stdout: String(result.stdout || ''),
    stdoutTail: String(result.stdout || '').split(/\r?\n/).slice(-12).join('\n').trim(),
    stderrTail: String(result.stderr || '').split(/\r?\n/).slice(-12).join('\n').trim(),
    error: result.error?.message || ''
  };
}

async function readJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
}

function escapePipes(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function mdStatus(ok) {
  return ok ? '通过' : '失败';
}

function runFinalSummaryCheck() {
  const result = spawnSync(process.execPath, ['./scripts/acceptance-final-check.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error(`acceptance-final-check exited ${result.status}`);
  }
  return result;
}

async function main() {
  const generatedAt = new Date();
  const steps = [
    runStep('bundleZip', '刷新并压缩 10 点验收包', 'npm.cmd', ['run', 'acceptance:bundle:zip']),
    runStep('readinessCheck', '生产就绪索引轻量复核', 'npm.cmd', ['run', 'readiness:check']),
    runStep('launchStatus', '最终上线状态复核', process.execPath, ['./scripts/launch-status.mjs', '--json'])
  ];

  const latestZip = await readJson('output/10am-acceptance-bundle-latest.json');
  const preflight = await readJson('output/acceptance-preflight.json');
  const acceptanceEntry = await readJson('output/10am-acceptance.json');
  const bundleManifest = await readJson('output/10am-acceptance-bundle/MANIFEST.json');
  const launchStep = steps.find(step => step.id === 'launchStatus');
  let launch = null;
  let launchParseError = '';
  try {
    launch = JSON.parse(launchStep.stdout || '{}');
  } catch (error) {
    launchParseError = error.message;
  }

  const localOk = steps.every(step => step.ok) && preflight?.localOk === true && bundleManifest?.summary?.failed === 0;
  const launchDecision = launch?.decision || preflight?.launchDecision || 'UNKNOWN';
  const external = {
    verified: launch?.external?.verified != null
      ? launch.external.verified
      : (preflight?.externalEvidence?.verified != null ? preflight.externalEvidence.verified : 0),
    total: launch?.external?.total != null
      ? launch.external.total
      : (preflight?.externalEvidence?.total != null ? preflight.externalEvidence.total : 8),
    blockers: launch?.external?.blockers || preflight?.externalEvidence?.blockers || []
  };
  if (launchStep) {
    launchStep.summary = `Launch decision: ${launchDecision}; External evidence: ${external.verified}/${external.total} verified`;
  }
  const pass = steps.every(step => step.ok) && !launchParseError && localOk;
  const conclusion = pass && launchDecision === 'GO'
    ? 'GO：本地验收包、生产就绪复核和外部证据均已满足。'
    : '本地验收包已生成并复核；真实上线仍必须补齐外部生产证据。';
  const nextExternalAction = acceptanceEntry?.nextExternalAction || null;
  const ownerShortcuts = Array.isArray(launch?.ownerShortcuts) && launch.ownerShortcuts.length
    ? launch.ownerShortcuts
    : KNOWN_OWNER_SHORTCUTS;

  const payload = {
    schema: 'pet-companion-10am-final-summary-v1',
    generatedAt: generatedAt.toISOString(),
    generatedAtLocal: formatChinaTime(generatedAt),
    pass,
    localOk,
    launchDecision,
    conclusion,
    latestZip,
    nextExternalAction,
    ownerShortcuts,
    externalEvidence: external,
    launchParseError,
    steps,
    keyFiles: [
      'output/10am-final-summary.md',
      'output/10am-acceptance-bundle/index.html',
      'output/10am-acceptance.html',
      'output/10am-decision-card.html',
      'output/10am-decision-card.md',
      'output/10am-signoff-sheet.html',
      'output/10am-signoff-sheet.md',
      'output/10am-meeting-minutes.html',
      'output/10am-meeting-minutes.md',
      'output/10am-snapshot-lock.html',
      'output/10am-snapshot-lock.md',
      'output/external-evidence-cockpit.html',
      'output/external-evidence-cockpit.md',
      'output/external-evidence-worksheet.html',
      'output/manual-device-acceptance-record.html',
      'output/manual-device-acceptance-record.md',
      'output/deploy-transfer-plan.md',
      'output/10am-acceptance-bundle-latest.json',
      latestZip?.latestZipPath || 'output/10am-acceptance-bundle-latest.zip',
      'output/10am-acceptance-bundle-latest.sha256.txt',
      'output/10am-acceptance-bundle-latest.zip.sha256.txt',
      latestZip?.zipPath || 'output/10am-acceptance-bundle-*.zip',
      latestZip ? `${latestZip.zipPath}.sha256.txt` : 'output/10am-acceptance-bundle-*.zip.sha256.txt'
    ],
    transferBoundary: '本命令只生成本地验收资料和压缩包；不部署、不上传、不读取真实密钥、不改服务器首页。'
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const stepRows = steps.map(step => `| ${escapePipes(step.label)} | ${mdStatus(step.ok)} | ${step.durationMs}ms | ${escapePipes(step.summary)} |`);
  const blockerRows = external.blockers.map(item => `| \`${escapePipes(item.id)}\` | ${escapePipes(item.status)} | ${escapePipes(item.label)} |`);
  const markdown = `# 宠伴记 10点最终验收摘要

- 生成时间：${payload.generatedAtLocal}
- 本地验收包复核：**${payload.localOk ? 'PASS' : 'FAIL'}**
- 当前上线判定：**${payload.launchDecision}**
- 外部证据：**${external.verified}/${external.total} verified**
- 资料包：\`${latestZip?.zipPath || '未生成'}\`
- 资料包 SHA-256：\`${latestZip?.sha256 || '未生成'}\`

## 结论

${payload.conclusion}

${payload.transferBoundary}

## 现场下一步先做

${nextExternalAction ? `优先推进：**${nextExternalAction.label}**（\`${nextExternalAction.id}\`）

- 建议负责人：${nextExternalAction.suggestedOwnerRole}
- 缺少 proofRef：${nextExternalAction.missingProofCount}
- 详情表：\`${nextExternalAction.reviewFile}\`
- 辅助命令：\`${nextExternalAction.helperCommand}\`
- provided 登记：\`${nextExternalAction.providedCommand}\`
- verified 登记：\`${nextExternalAction.verifiedCommand}\`
` : '外部证据已全部 verified，可继续走最终上线决策。'}

## 负责人快捷命令

${ownerShortcuts.length ? ownerShortcuts.map(item => `- ${item.group}：\`${item.command}\``).join('\n') : '- 外部证据已全部 verified，无需负责人快捷命令。'}

## 现场优先打开

1. \`output/10am-acceptance-bundle/index.html\`
2. \`output/10am-acceptance.html\`
3. \`output/external-evidence-cockpit.html\`
4. \`output/external-evidence-worksheet.html\`
5. \`output/manual-device-acceptance-record.html\`
6. \`output/deploy-transfer-plan.md\`
7. \`output/10am-final-summary.md\`
8. \`${latestZip?.latestZipPath || 'output/10am-acceptance-bundle-latest.zip'}\`
9. \`${latestZip?.zipPath || 'output/10am-acceptance-bundle-*.zip'}\`

## 本次最终复核

| 项目 | 结果 | 耗时 | 摘要 |
| --- | --- | ---: | --- |
${stepRows.join('\n')}

## 外部阻断项

| ID | 状态 | 事项 |
| --- | --- | --- |
${blockerRows.length ? blockerRows.join('\n') : '| 无 | verified | 无 |'}

## 关键文件

${payload.keyFiles.map(file => `- \`${file}\``).join('\n')}
`;

  const text = [
    '宠伴记 10点最终验收摘要',
    `生成时间：${payload.generatedAtLocal}`,
    `本地验收包复核：${payload.localOk ? 'PASS' : 'FAIL'}`,
    `当前上线判定：${payload.launchDecision}`,
    `外部证据：${external.verified}/${external.total} verified`,
    `资料包：${latestZip?.zipPath || '未生成'}`,
    `资料包 SHA-256：${latestZip?.sha256 || '未生成'}`,
    `结论：${payload.conclusion}`,
    nextExternalAction ? `现场下一步：${nextExternalAction.id} / ${nextExternalAction.label} / ${nextExternalAction.helperCommand}` : '现场下一步：外部证据已全部 verified',
    ownerShortcuts.length ? `负责人快捷命令：${ownerShortcuts.map(item => item.command).join('；')}` : '负责人快捷命令：无',
    payload.transferBoundary
  ].join('\n');

  await writeFile(markdownPath, markdown, 'utf8');
  await writeFile(textPath, `${text}\n`, 'utf8');
  const finalCheck = runFinalSummaryCheck();

  console.log(`PASS 10am final summary :: ${markdownPath}`);
  console.log(`PASS 10am final summary json :: ${jsonPath}`);
  console.log(`PASS 10am final summary text :: ${textPath}`);
  console.log(`PASS 10am final summary check :: ${lastUsefulLine(finalCheck.stdout)}`);
  console.log(`Launch decision: ${payload.launchDecision}`);
  console.log(`External evidence: ${external.verified}/${external.total} verified`);
  if (latestZip?.zipPath) console.log(`Acceptance zip: ${latestZip.zipPath}`);
  if (latestZip?.sha256) console.log(`Acceptance zip sha256: ${latestZip.sha256}`);
  if (!pass) process.exit(1);
}

main().catch(error => {
  console.error(`FAIL 10am final summary :: ${error.message}`);
  process.exit(1);
});
