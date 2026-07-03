import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const outputDir = 'output';
const jsonPath = `${outputDir}/acceptance-brief.json`;
const markdownPath = `${outputDir}/acceptance-brief.md`;

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

async function readJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
}

function runLaunchStatus() {
  const result = spawnSync(process.execPath, ['./scripts/launch-status.mjs', '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true
  });
  try {
    return JSON.parse(result.stdout || '{}');
  } catch {
    return { decision: 'UNKNOWN', external: { verified: 0, total: 0, blockers: [] } };
  }
}

function row(label, value) {
  return `| ${label} | ${value} |`;
}

function firstNextExternalAction(blockers, worksheet) {
  const firstBlocker = Array.isArray(blockers) ? blockers[0] : null;
  if (!firstBlocker) return null;
  const worksheetItem = Array.isArray(worksheet?.items)
    ? worksheet.items.find(item => item.id === firstBlocker.id)
    : null;
  const requiredProof = Array.isArray(worksheetItem?.requiredProof) ? worksheetItem.requiredProof : [];
  const proofRefs = Array.isArray(worksheetItem?.proofRefs) ? worksheetItem.proofRefs : [];
  return {
    id: firstBlocker.id,
    label: firstBlocker.label,
    status: firstBlocker.status,
    suggestedOwnerRole: worksheetItem?.suggestedOwnerRole || '待指定负责人',
    missingProofCount: Math.max(requiredProof.length - proofRefs.length, 0),
    requiredProof,
    providedCommand: worksheetItem?.providedCommand || `npm.cmd run external:evidence:next -- --id ${firstBlocker.id} --commands`,
    verifiedCommand: worksheetItem?.verifiedCommand || `npm.cmd run external:evidence:next -- --id ${firstBlocker.id} --commands`,
    reviewFile: 'output/external-evidence-worksheet.md',
    helperCommand: `npm.cmd run external:evidence:next -- --id ${firstBlocker.id} --commands`
  };
}

async function main() {
  const generatedAt = new Date();
  const launch = runLaunchStatus();
  const preflight = await readJson('output/acceptance-preflight.json');
  const handoff = await readJson('output/acceptance-handoff.json');
  const worksheet = await readJson('output/external-evidence-worksheet.json');
  const manualRecord = await readJson('output/manual-device-acceptance-record.json');
  const artifacts = await readJson('output/release-artifacts.json');
  const buildInfo = await readJson('dist/build-info.json');

  const blockers = Array.isArray(launch.external?.blockers) ? launch.external.blockers : [];
  const appVersion = buildInfo?.version || handoff?.app?.version || artifacts?.app?.version || '';
  const artifactSha = artifacts?.summary?.manifestSha256 || handoff?.localEvidence?.artifactManifestSha256 || '';
  const artifactBytes = artifacts?.summary?.totalBytes || handoff?.localEvidence?.artifactTotalBytes || 0;
  const artifactCount = artifacts?.summary?.fileCount || handoff?.localEvidence?.artifactFileCount || 0;
  const pwaCache = buildInfo?.pwa?.cacheName || handoff?.localEvidence?.pwaCacheName || '';
  const nextExternalAction = firstNextExternalAction(blockers, worksheet);

  const brief = {
    schema: 'pet-companion-acceptance-brief-v1',
    generatedAt: generatedAt.toISOString(),
    generatedAtLocal: formatChinaTime(generatedAt),
    title: '宠伴记 10点验收口径',
    decision: launch.decision || 'UNKNOWN',
    app: {
      version: appVersion,
      target: buildInfo?.target || handoff?.app?.target || 'h5-pwa',
      channel: buildInfo?.channel || handoff?.app?.channel || '',
      pwaCache,
      artifactSha,
      artifactCount,
      artifactBytes
    },
    localAcceptance: {
      preflight: preflight?.pass === true,
      handoff: Boolean(handoff),
      manualRecord: Boolean(manualRecord),
      worksheet: Boolean(worksheet),
      distPresent: handoff?.localEvidence?.distPresent === true,
      releaseCheckMatchesExpected: handoff?.localEvidence?.releaseCheckMatchesExpected === true
    },
    externalEvidence: {
      verified: launch.external?.verified != null ? launch.external.verified : 0,
      total: launch.external?.total != null ? launch.external.total : 0,
      blockers: blockers.map(item => ({ id: item.id, status: item.status, label: item.label }))
    },
    nextExternalAction,
    canAccept: [
      'H5/PWA 本地构建产物和公开包清单',
      'PWA 缓存版本与 runtime-config 不预缓存策略',
      '发布证据包、产物 SHA-256 和传输目录边界',
      '真机验收记录模板和外部证据负责人填报表',
      '本地预检命令链和 NO_GO 阻断解释'
    ],
    cannotClaim: [
      '不能宣称已经真实上线',
      '不能宣称公网 HTTPS/TLS 已验证',
      '不能宣称生产 deploy/production.env、数据卷、媒体卷、监控告警、备份、法务和真机实测已通过',
      '不能上传到服务器首页目录或把密钥文件放入公开包'
    ],
    reviewFiles: [
      'output/acceptance-preflight.md',
      'output/acceptance-handoff.md',
      'output/external-evidence-worksheet.md',
      'output/manual-device-acceptance-record.md',
      'output/release-artifacts.md',
      'output/release-evidence.md'
    ],
    reviewCommands: [
      'npm.cmd run acceptance:preflight',
      'npm.cmd run acceptance:brief',
      'npm.cmd run launch:status',
      'npm.cmd run external:evidence:next -- --commands',
      'npm.cmd run external:evidence:worksheet',
      'npm.cmd run manual:acceptance:record'
    ]
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(brief, null, 2)}\n`, 'utf8');

  const blockerRows = brief.externalEvidence.blockers.map(item => `| \`${item.id}\` | ${item.status} | ${item.label} |`);
  const fileList = brief.reviewFiles.map(file => `- \`${file}\``).join('\n');
  const commandList = brief.reviewCommands.map(command => `- \`${command}\``).join('\n');
  const nextProofList = nextExternalAction?.requiredProof?.length
    ? nextExternalAction.requiredProof.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : '无';

  const markdown = `# 宠伴记 10点验收口径

- 生成时间：${brief.generatedAtLocal}
- 生成时间（UTC）：${brief.generatedAt}
- App：v${brief.app.version || 'missing'} / ${brief.app.target} / ${brief.app.channel}
- 当前上线判定：**${brief.decision}**
- 外部证据：**${brief.externalEvidence.verified}/${brief.externalEvidence.total} verified**

## 现场一句话

本地 H5/PWA 产物、发布证据、传输边界、验收表和预检链路已经准备好；真实上线仍是 **NO_GO**，原因是 8 项生产外部证据还没有 verified。

## 现场下一步先做

${nextExternalAction ? `优先推进：**${nextExternalAction.label}**（\`${nextExternalAction.id}\`）

- 当前状态：${nextExternalAction.status}
- 建议负责人：${nextExternalAction.suggestedOwnerRole}
- 缺少 proofRef：${nextExternalAction.missingProofCount}
- 详情表：\`${nextExternalAction.reviewFile}\`
- 辅助命令：\`${nextExternalAction.helperCommand}\`

需要补的证明：

${nextProofList}

登记为 provided：

\`\`\`powershell
${nextExternalAction.providedCommand}
\`\`\`

复核通过后登记为 verified：

\`\`\`powershell
${nextExternalAction.verifiedCommand}
\`\`\`
` : '外部证据已全部 verified，可继续走最终上线决策。'}

## 本地验收摘要

| 项目 | 当前值 |
| --- | --- |
${[
  row('预检', brief.localAcceptance.preflight ? 'PASS' : '待刷新'),
  row('交接包', brief.localAcceptance.handoff ? '已生成' : '缺失'),
  row('真机验收记录表', brief.localAcceptance.manualRecord ? '已生成' : '缺失'),
  row('外部证据负责人填报表', brief.localAcceptance.worksheet ? '已生成' : '缺失'),
  row('dist', brief.localAcceptance.distPresent ? '存在' : '缺失'),
  row('release:check 步骤匹配', brief.localAcceptance.releaseCheckMatchesExpected ? '是' : '否'),
  row('公开包文件数', String(brief.app.artifactCount)),
  row('公开包大小', `${brief.app.artifactBytes} bytes`),
  row('产物 SHA-256', `\`${brief.app.artifactSha || 'missing'}\``),
  row('PWA cache', `\`${brief.app.pwaCache || 'missing'}\``)
].join('\n')}

## 可以验收

${brief.canAccept.map(item => `- ${item}`).join('\n')}

## 不能宣称

${brief.cannotClaim.map(item => `- ${item}`).join('\n')}

## 外部阻断项

| ID | 状态 | 事项 |
| --- | --- | --- |
${blockerRows.length ? blockerRows.join('\n') : '| - | - | 无 |'}

## 现场查看文件

${fileList}

## 现场复跑命令

${commandList}
`;

  await writeFile(markdownPath, markdown, 'utf8');
  console.log(`PASS acceptance brief :: ${jsonPath}`);
  console.log(`PASS acceptance brief :: ${markdownPath}`);
  console.log(`PASS acceptance brief :: decision ${brief.decision}, external ${brief.externalEvidence.verified}/${brief.externalEvidence.total} verified`);
}

main().catch(error => {
  console.error(`FAIL acceptance brief :: ${error.message}`);
  process.exit(1);
});
