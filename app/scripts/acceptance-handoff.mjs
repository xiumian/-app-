import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const outputDir = 'output';
const jsonPath = `${outputDir}/acceptance-handoff.json`;
const markdownPath = `${outputDir}/acceptance-handoff.md`;

async function readJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
}

function runJsonScript(scriptPath, args = []) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    return {
      ok: false,
      error: `${scriptPath} exited ${result.status}`,
      stdout: result.stdout || '',
      stderr: result.stderr || ''
    };
  }
  try {
    return { ok: true, value: JSON.parse(result.stdout) };
  } catch (error) {
    return { ok: false, error: `${scriptPath} did not return JSON: ${error.message}`, stdout: result.stdout || '' };
  }
}

function safe(value, fallback = '') {
  return value === undefined || value === null || value === '' ? fallback : value;
}

function statusOfEvidenceItem(item) {
  if (item.status === 'verified') return '已验证';
  if (item.status === 'provided') return '已提交待复核';
  return '待补齐';
}

function commandForEvidence(item, status = 'provided') {
  const owner = '<owner-id>';
  const evidenceRef = `<evidence-ref-${item.id}>`;
  const proofRefs = (item.requiredProof || ['proof']).map((_, index) => ` --proof-ref "<proofref-${index + 1}-for-${item.id}>"`).join('');
  return `npm.cmd run external:evidence:update -- --id ${item.id} --status ${status} --owner ${owner} --evidence-ref "${evidenceRef}"${proofRefs}`;
}

function markdownTable(rows) {
  return rows.join('\n');
}

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

async function main() {
  const [
    releaseEvidence,
    artifacts,
    productionEvidence,
    transferPlan
  ] = await Promise.all([
    readJson('output/release-evidence.json'),
    readJson('output/release-artifacts.json'),
    readJson('output/production-evidence.json'),
    readJson('output/deploy-transfer-plan.json')
  ]);

  const launchStatus = runJsonScript('./scripts/launch-status.mjs', ['--json']);
  const externalItems = Array.isArray(productionEvidence?.items) ? productionEvidence.items : [];
  const pendingExternal = externalItems.filter(item => item.status !== 'verified');
  const localGateCount = Array.isArray(releaseEvidence?.localGates) ? releaseEvidence.localGates.length : 0;
  const generatedAt = new Date().toISOString();
  const generatedAtLocal = formatChinaTime();
  const launchDecision = launchStatus.ok ? launchStatus.value.decision : 'UNKNOWN';

  const handoff = {
    schema: 'pet-companion-acceptance-handoff-v1',
    generatedAt,
    generatedAtLocal,
    purpose: '10点验收用本地发布交接包；只汇总本地证据和外部缺口，不执行部署、不上传服务器、不读取密钥。',
    decision: launchDecision,
    conclusion: releaseEvidence?.conclusion || '',
    app: {
      name: releaseEvidence?.app?.name || 'pet-companion-app',
      version: releaseEvidence?.app?.version || artifacts?.app?.version || '',
      target: releaseEvidence?.app?.target || artifacts?.app?.target || '',
      channel: releaseEvidence?.app?.channel || artifacts?.app?.channel || ''
    },
    localEvidence: {
      distPresent: releaseEvidence?.build?.distPresent === true,
      buildInfoPresent: releaseEvidence?.build?.buildInfoPresent === true,
      localGateCount,
      releaseCheckMatchesExpected: releaseEvidence?.releaseCheck?.matchesExpected === true,
      artifactFileCount: artifacts?.summary?.fileCount || releaseEvidence?.artifacts?.fileCount || 0,
      artifactTotalBytes: artifacts?.summary?.totalBytes || releaseEvidence?.artifacts?.totalBytes || 0,
      artifactManifestSha256: artifacts?.summary?.manifestSha256 || releaseEvidence?.artifacts?.manifestSha256 || '',
      missingRequiredArtifacts: artifacts?.missingRequired || releaseEvidence?.artifacts?.missingRequired || [],
      pwaCacheName: releaseEvidence?.pwa?.cacheName || '',
      pwaRuntimeConfigPrecached: releaseEvidence?.pwa?.runtimeConfigPrecached != null ? releaseEvidence.pwa.runtimeConfigPrecached : null
    },
    manualDeviceAcceptanceRecord: {
      json: existsSync('output/manual-device-acceptance-record.json'),
      markdown: existsSync('output/manual-device-acceptance-record.md'),
      command: 'npm.cmd run manual:acceptance:record'
    },
    acceptanceBundle: {
      indexHtml: existsSync('output/10am-acceptance-bundle/index.html'),
      latestZip: existsSync('output/10am-acceptance-bundle-latest.zip'),
      latestSha: existsSync('output/10am-acceptance-bundle-latest.sha256.txt'),
      latestZipSha: existsSync('output/10am-acceptance-bundle-latest.zip.sha256.txt'),
      latestZipPath: 'output/10am-acceptance-bundle-latest.zip',
      latestShaPath: 'output/10am-acceptance-bundle-latest.sha256.txt',
      latestZipShaPath: 'output/10am-acceptance-bundle-latest.zip.sha256.txt',
      hashSource: 'output/10am-final-summary.md 或 output/10am-acceptance-bundle-latest.json',
      openFirst: 'index.html',
      command: 'npm.cmd run acceptance:final'
    },
    externalEvidenceCockpit: {
      json: existsSync('output/external-evidence-cockpit.json'),
      markdown: existsSync('output/external-evidence-cockpit.md'),
      html: existsSync('output/external-evidence-cockpit.html'),
      command: 'npm.cmd run external:evidence:cockpit'
    },
    externalEvidenceRequestPack: {
      json: existsSync('output/external-evidence-request-pack.json'),
      markdown: existsSync('output/external-evidence-request-pack.md'),
      html: existsSync('output/external-evidence-request-pack.html'),
      opsMarkdown: existsSync('output/external-evidence-request-ops.md'),
      opsHtml: existsSync('output/external-evidence-request-ops.html'),
      legalMarkdown: existsSync('output/external-evidence-request-legal.md'),
      legalHtml: existsSync('output/external-evidence-request-legal.html'),
      qaMarkdown: existsSync('output/external-evidence-request-qa.md'),
      qaHtml: existsSync('output/external-evidence-request-qa.html'),
      command: 'npm.cmd run external:evidence:request-pack'
    },
    externalEvidenceWorksheet: {
      json: existsSync('output/external-evidence-worksheet.json'),
      markdown: existsSync('output/external-evidence-worksheet.md'),
      command: 'npm.cmd run external:evidence:worksheet'
    },
    acceptanceBrief: {
      json: existsSync('output/acceptance-brief.json'),
      markdown: existsSync('output/acceptance-brief.md'),
      command: 'npm.cmd run acceptance:brief'
    },
    acceptanceDecisionCard: {
      json: existsSync('output/10am-decision-card.json'),
      markdown: existsSync('output/10am-decision-card.md'),
      html: existsSync('output/10am-decision-card.html'),
      command: 'npm.cmd run acceptance:decision'
    },
    acceptanceSignoffSheet: {
      json: existsSync('output/10am-signoff-sheet.json'),
      markdown: existsSync('output/10am-signoff-sheet.md'),
      html: existsSync('output/10am-signoff-sheet.html'),
      command: 'npm.cmd run acceptance:signoff'
    },
    acceptanceMeetingMinutes: {
      json: existsSync('output/10am-meeting-minutes.json'),
      markdown: existsSync('output/10am-meeting-minutes.md'),
      html: existsSync('output/10am-meeting-minutes.html'),
      command: 'npm.cmd run acceptance:minutes'
    },
    acceptanceSnapshotLock: {
      json: existsSync('output/10am-snapshot-lock.json'),
      markdown: existsSync('output/10am-snapshot-lock.md'),
      html: existsSync('output/10am-snapshot-lock.html'),
      command: 'npm.cmd run acceptance:snapshot'
    },
    transferBoundary: {
      source: transferPlan ? 'output/deploy-transfer-plan.json' : 'missing',
      projectRoot: transferPlan?.target?.projectRoot || '',
      distTarget: transferPlan?.target?.distTarget || '',
      deployConfigTarget: transferPlan?.target?.deployConfigTarget || '',
      dataTarget: transferPlan?.target?.dataTarget || '',
      mediaTarget: transferPlan?.target?.mediaTarget || '',
      forbidden: [
        '不上传到 /var/www/html',
        '不上传到 /usr/share/nginx/html',
        '不上传到 /www/wwwroot',
        '不上传 deploy/production.env、deploy/target.json、TLS 私钥或证书进公开产物'
      ]
    },
    externalEvidence: {
      source: productionEvidence ? 'output/production-evidence.json' : 'missing',
      total: externalItems.length,
      verified: externalItems.filter(item => item.status === 'verified').length,
      pending: pendingExternal.length,
      items: externalItems.map(item => ({
        id: item.id,
        label: item.label,
        status: item.status,
        owner: item.owner || '',
        evidenceRef: item.evidenceRef || '',
        requiredProofCount: Array.isArray(item.requiredProof) ? item.requiredProof.length : 0,
        proofRefCount: Array.isArray(item.proofRefs) ? item.proofRefs.length : 0,
        requiredProof: item.requiredProof || [],
        proofRefs: item.proofRefs || [],
        suggestedProvidedCommand: item.status === 'verified' ? '' : commandForEvidence(item, 'provided'),
        suggestedVerifiedCommand: item.status === 'verified' ? '' : commandForEvidence(item, 'verified')
      }))
    },
    recommendedCommands: [
      'npm.cmd run acceptance:ready',
      'npm.cmd run launch:status',
      'npm.cmd run external:evidence:next -- --commands',
      'npm.cmd run external:evidence:next:ops',
      'npm.cmd run external:evidence:next:legal',
      'npm.cmd run external:evidence:next:qa',
      'npm.cmd run external:evidence:cockpit',
      'npm.cmd run external:evidence:request-pack',
      'npm.cmd run external:evidence:worksheet',
      'npm.cmd run acceptance:brief',
      'npm.cmd run acceptance:decision',
      'npm.cmd run acceptance:signoff',
      'npm.cmd run acceptance:minutes',
      'npm.cmd run acceptance:snapshot',
      'npm.cmd run acceptance:final',
      'npm.cmd run deploy:transfer:plan',
      'npm.cmd run artifact:verify',
      'npm.cmd run release:evidence:check'
    ]
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(handoff, null, 2)}\n`, 'utf8');

  const blockerLines = handoff.externalEvidence.items
    .filter(item => item.status !== 'verified')
    .map((item, index) => [
      `### ${index + 1}. ${item.label}`,
      '',
      `- ID：\`${item.id}\``,
      `- 状态：${statusOfEvidenceItem(item)}`,
      `- 负责人：${safe(item.owner, '待补充')}`,
      `- 证据入口：${safe(item.evidenceRef, '待补充')}`,
      `- 证据覆盖：${item.proofRefCount}/${item.requiredProofCount}`,
      '- 必要证明：',
      ...item.requiredProof.map((proof, proofIndex) => `  ${proofIndex + 1}. ${proof}${item.proofRefs[proofIndex] ? `（${item.proofRefs[proofIndex]}）` : '（未登记）'}`),
      '',
      '登记为 provided：',
      '',
      '```powershell',
      item.suggestedProvidedCommand,
      '```',
      '',
      '登记为 verified：',
      '',
      '```powershell',
      item.suggestedVerifiedCommand,
      '```',
      ''
    ].join('\n'));

  const markdown = `# 宠伴记 10点验收交接包

- 生成时间：${generatedAtLocal}
- 生成时间（UTC）：${generatedAt}
- 上线判定：**${handoff.decision}**
- 发布结论：\`${handoff.conclusion || 'missing'}\`
- App：${handoff.app.name} v${handoff.app.version} / ${handoff.app.target} / ${handoff.app.channel}

## 一句话结论

本地构建、产物、PWA、发布证据链已具备验收材料；真实上线仍必须补齐外部生产证据。当前外部证据为 **${handoff.externalEvidence.verified}/${handoff.externalEvidence.total} verified**，所以真实发布结论保持 **${handoff.decision}**。

## 本地可验收证据

| 项目 | 当前值 |
| --- | --- |
${markdownTable([
  `| dist 存在 | ${handoff.localEvidence.distPresent ? '是' : '否'} |`,
  `| build-info 存在 | ${handoff.localEvidence.buildInfoPresent ? '是' : '否'} |`,
  `| 本地发布门禁项 | ${handoff.localEvidence.localGateCount} |`,
  `| release:check 步骤匹配 | ${handoff.localEvidence.releaseCheckMatchesExpected ? '是' : '否'} |`,
  `| 公开包文件数 | ${handoff.localEvidence.artifactFileCount} |`,
  `| 公开包大小 | ${handoff.localEvidence.artifactTotalBytes} bytes |`,
  `| 产物 SHA-256 | \`${handoff.localEvidence.artifactManifestSha256 || 'missing'}\` |`,
  `| PWA cache | \`${handoff.localEvidence.pwaCacheName || 'missing'}\` |`,
  `| runtime-config 是否被预缓存 | ${handoff.localEvidence.pwaRuntimeConfigPrecached === false ? '否' : String(handoff.localEvidence.pwaRuntimeConfigPrecached)} |`
])}

## 10点现场入口

1. \`output/10am-acceptance-bundle/index.html\`：资料包总入口
2. \`output/10am-acceptance.html\`：10点验收结论页
3. \`output/external-evidence-cockpit.html\`：8项外部证据指挥台
4. \`output/external-evidence-request-pack.html\`：可转发给 Ops/Legal/QA 的脱敏证据请求包
5. \`output/external-evidence-worksheet.html\`：负责人填报表
6. \`output/manual-device-acceptance-record.html\`：iPhone/Android 真机验收记录
7. \`output/deploy-transfer-plan.md\`：只传指定位置、不改服务器首页的传输边界

稳定验收包：

- ZIP：${handoff.acceptanceBundle.latestZip ? `\`${handoff.acceptanceBundle.latestZipPath}\`` : '缺失，可执行 `npm.cmd run acceptance:final` 生成'}
- SHA 文件：${handoff.acceptanceBundle.latestSha ? `\`${handoff.acceptanceBundle.latestShaPath}\`` : '缺失，可执行 `npm.cmd run acceptance:final` 生成'}
- 同名 SHA 文件：${handoff.acceptanceBundle.latestZipSha ? `\`${handoff.acceptanceBundle.latestZipShaPath}\`` : '缺失，可执行 `npm.cmd run acceptance:final` 生成'}
- SHA 数值以 \`${handoff.acceptanceBundle.hashSource}\` 为准，避免压缩包包含自身交接文档造成哈希自引用。

## 真机验收记录

- JSON：${handoff.manualDeviceAcceptanceRecord.json ? '`output/manual-device-acceptance-record.json`' : '缺失，可执行 `npm.cmd run manual:acceptance:record` 生成'}
- Markdown：${handoff.manualDeviceAcceptanceRecord.markdown ? '`output/manual-device-acceptance-record.md`' : '缺失，可执行 `npm.cmd run manual:acceptance:record` 生成'}
- 生成命令：\`${handoff.manualDeviceAcceptanceRecord.command}\`

## 外部证据指挥台

- HTML：${handoff.externalEvidenceCockpit.html ? '`output/external-evidence-cockpit.html`' : '缺失，可执行 `npm.cmd run external:evidence:cockpit` 生成'}
- JSON：${handoff.externalEvidenceCockpit.json ? '`output/external-evidence-cockpit.json`' : '缺失，可执行 `npm.cmd run external:evidence:cockpit` 生成'}
- Markdown：${handoff.externalEvidenceCockpit.markdown ? '`output/external-evidence-cockpit.md`' : '缺失，可执行 `npm.cmd run external:evidence:cockpit` 生成'}
- 生成命令：\`${handoff.externalEvidenceCockpit.command}\`

## 外部证据请求包

- HTML：${handoff.externalEvidenceRequestPack.html ? '`output/external-evidence-request-pack.html`' : '缺失，可执行 `npm.cmd run external:evidence:request-pack` 生成'}
- JSON：${handoff.externalEvidenceRequestPack.json ? '`output/external-evidence-request-pack.json`' : '缺失，可执行 `npm.cmd run external:evidence:request-pack` 生成'}
- Markdown：${handoff.externalEvidenceRequestPack.markdown ? '`output/external-evidence-request-pack.md`' : '缺失，可执行 `npm.cmd run external:evidence:request-pack` 生成'}
- Ops：${handoff.externalEvidenceRequestPack.opsMarkdown ? '`output/external-evidence-request-ops.md`' : '缺失，可执行 `npm.cmd run external:evidence:request-pack` 生成'} / ${handoff.externalEvidenceRequestPack.opsHtml ? '`output/external-evidence-request-ops.html`' : '缺失，可执行 `npm.cmd run external:evidence:request-pack` 生成'}
- Legal：${handoff.externalEvidenceRequestPack.legalMarkdown ? '`output/external-evidence-request-legal.md`' : '缺失，可执行 `npm.cmd run external:evidence:request-pack` 生成'} / ${handoff.externalEvidenceRequestPack.legalHtml ? '`output/external-evidence-request-legal.html`' : '缺失，可执行 `npm.cmd run external:evidence:request-pack` 生成'}
- QA：${handoff.externalEvidenceRequestPack.qaMarkdown ? '`output/external-evidence-request-qa.md`' : '缺失，可执行 `npm.cmd run external:evidence:request-pack` 生成'} / ${handoff.externalEvidenceRequestPack.qaHtml ? '`output/external-evidence-request-qa.html`' : '缺失，可执行 `npm.cmd run external:evidence:request-pack` 生成'}
- 生成命令：\`${handoff.externalEvidenceRequestPack.command}\`

## 外部证据负责人填报表

- JSON：${handoff.externalEvidenceWorksheet.json ? '`output/external-evidence-worksheet.json`' : '缺失，可执行 `npm.cmd run external:evidence:worksheet` 生成'}
- Markdown：${handoff.externalEvidenceWorksheet.markdown ? '`output/external-evidence-worksheet.md`' : '缺失，可执行 `npm.cmd run external:evidence:worksheet` 生成'}
- 生成命令：\`${handoff.externalEvidenceWorksheet.command}\`

## 10点验收口径一页纸

- JSON：${handoff.acceptanceBrief.json ? '`output/acceptance-brief.json`' : '缺失，可执行 `npm.cmd run acceptance:brief` 生成'}
- Markdown：${handoff.acceptanceBrief.markdown ? '`output/acceptance-brief.md`' : '缺失，可执行 `npm.cmd run acceptance:brief` 生成'}
- 生成命令：\`${handoff.acceptanceBrief.command}\`

## 服务器传输边界

本交接包不执行部署、不上传服务器、不读取真实密钥。若后续传输，只允许进入 App 专属目录：

- App 根目录：\`${handoff.transferBoundary.projectRoot || 'missing'}\`
- 前端产物：\`${handoff.transferBoundary.distTarget || 'missing'}\`
- 部署配置：\`${handoff.transferBoundary.deployConfigTarget || 'missing'}\`
- 数据目录：\`${handoff.transferBoundary.dataTarget || 'missing'}\`
- 媒体目录：\`${handoff.transferBoundary.mediaTarget || 'missing'}\`

禁止：

${handoff.transferBoundary.forbidden.map(item => `- ${item}`).join('\n')}

## 外部上线证据缺口

${blockerLines.length ? blockerLines.join('\n') : '外部证据已全部 verified。'}

## 10点前建议复核命令

\`\`\`powershell
${handoff.recommendedCommands.join('\n')}
\`\`\`

## 外部证据负责人快捷命令

\`\`\`powershell
npm.cmd run external:evidence:next:ops
npm.cmd run external:evidence:next:legal
npm.cmd run external:evidence:next:qa
\`\`\`

## 验收口径

- 可以验收：本地 H5/PWA 产物、构建信息、PWA 缓存一致性、发布证据包、传输目录边界、真机验收模板、外部证据登记流程。
- 不能声称已真实上线：公网 HTTPS、TLS、生产 env、持久化数据卷、媒体持久化、监控告警、平台备份、法务主体与真机实测还没有外部 verified 证据。
`;

  await writeFile(markdownPath, markdown, 'utf8');
  console.log(`PASS acceptance handoff :: ${jsonPath}`);
  console.log(`PASS acceptance handoff :: ${markdownPath}`);
  console.log(`PASS acceptance handoff :: decision ${handoff.decision}, external ${handoff.externalEvidence.verified}/${handoff.externalEvidence.total} verified`);
}

main().catch(error => {
  console.error(`FAIL acceptance handoff :: ${error.message}`);
  process.exit(1);
});
