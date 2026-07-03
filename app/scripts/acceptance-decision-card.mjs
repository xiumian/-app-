import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const outputDir = 'output';
const jsonPath = `${outputDir}/10am-decision-card.json`;
const markdownPath = `${outputDir}/10am-decision-card.md`;
const htmlPath = `${outputDir}/10am-decision-card.html`;

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
  let value = null;
  let parseError = '';
  try {
    value = JSON.parse(result.stdout || '{}');
  } catch (error) {
    parseError = error.message;
  }
  return {
    ok: result.status === 0 && value && !parseError,
    exitCode: result.status,
    value,
    parseError,
    stderr: result.stderr || ''
  };
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapePipes(value) {
  return String(value == null ? '' : value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function decisionReason(launch) {
  if (launch?.decision === 'GO') return '全部本地门禁和外部上线证据均已满足，可进入最终人工发布确认。';
  const verified = launch?.external?.verified != null ? launch.external.verified : 0;
  const total = launch?.external?.total != null ? launch.external.total : 0;
  return `外部上线证据只有 ${verified}/${total} verified；公网入口、生产配置、持久化、监控、备份、法务或真机验收仍未形成可审计证据。`;
}

function ownerGroupFor(id) {
  if (['domainTls', 'productionEnv', 'persistentStorage', 'objectStorage', 'monitoringAlerts', 'platformBackups'].includes(id)) return 'ops';
  if (id === 'legalApproval') return 'legal';
  if (id === 'manualDeviceAcceptance') return 'qa';
  return 'release';
}

function ownerCommandFor(group) {
  if (group === 'ops') return 'npm.cmd run external:evidence:next:ops';
  if (group === 'legal') return 'npm.cmd run external:evidence:next:legal';
  if (group === 'qa') return 'npm.cmd run external:evidence:next:qa';
  return 'npm.cmd run external:evidence:next -- --commands';
}

function statusText(status) {
  if (status === 'verified') return '已验证';
  if (status === 'provided') return '已提交待复核';
  return '待补齐';
}

async function main() {
  const generatedAt = new Date();
  const launchResult = runLaunchStatus();
  const launch = launchResult.value || {};
  const releaseEvidence = await readJson('output/release-evidence.json');
  const artifacts = await readJson('output/release-artifacts.json');
  const bundle = await readJson('output/10am-acceptance-bundle-latest.json');
  const blockers = Array.isArray(launch?.external?.blockers) ? launch.external.blockers : [];
  const decision = launch?.decision || 'UNKNOWN';
  const goAllowed = decision === 'GO' && launchResult.ok;
  const externalVerified = launch?.external?.verified != null ? launch.external.verified : 0;
  const externalTotal = launch?.external?.total != null ? launch.external.total : 0;
  const blockerGroups = blockers.reduce((acc, item) => {
    const group = ownerGroupFor(item.id);
    acc[group] = (acc[group] || 0) + 1;
    return acc;
  }, {});
  const firstBlocker = blockers[0] || null;
  const nextAction = firstBlocker ? {
    id: firstBlocker.id,
    label: firstBlocker.label,
    ownerGroup: ownerGroupFor(firstBlocker.id),
    command: ownerCommandFor(ownerGroupFor(firstBlocker.id))
  } : null;
  const card = {
    schema: 'pet-companion-10am-decision-card-v1',
    generatedAt: generatedAt.toISOString(),
    generatedAtLocal: formatChinaTime(generatedAt),
    decision,
    goAllowed,
    reason: decisionReason(launch),
    sourceOfTruth: 'npm.cmd run launch:status',
    localEvidence: {
      conclusion: releaseEvidence?.conclusion || '',
      artifactSha256: artifacts?.summary?.manifestSha256 || releaseEvidence?.artifacts?.manifestSha256 || '',
      pwaCacheName: releaseEvidence?.pwa?.cacheName || '',
      latestAcceptanceZip: bundle?.latestZipPath || 'output/10am-acceptance-bundle-latest.zip',
      latestAcceptanceZipSha256: bundle?.sha256 || '',
      latestAcceptanceZipBytes: bundle?.bytes || null
    },
    externalEvidence: {
      verified: externalVerified,
      total: externalTotal,
      blockers,
      blockerGroups
    },
    nextAction,
    decisionRules: [
      { rule: 'launch:status returns GO', current: decision, pass: decision === 'GO' },
      { rule: 'external evidence is 8/8 verified', current: `${externalVerified}/${externalTotal}`, pass: externalTotal > 0 && externalVerified === externalTotal },
      { rule: 'acceptance bundle exists with SHA-256', current: bundle?.sha256 ? 'present' : 'missing', pass: Boolean(bundle?.sha256) },
      { rule: 'do not deploy, upload, or modify server homepage from this card', current: 'local-only', pass: true }
    ],
    allowedClaims: [
      '本地 H5/PWA 验收资料包已刷新',
      '本地 release evidence、artifact manifest、PWA cache 与传输边界可供验收',
      '外部证据缺口已按 Ops / Legal / QA 分组并可转发补齐'
    ],
    blockedClaims: [
      '不能宣称已经真实上线',
      '不能宣称公网 HTTPS/TLS 已验证',
      '不能宣称生产 env、持久化、媒体目录、监控、备份、法务和真机验收已完成'
    ],
    commands: [
      'npm.cmd run launch:status',
      'npm.cmd run external:evidence:next:ops',
      'npm.cmd run external:evidence:next:legal',
      'npm.cmd run external:evidence:next:qa',
      'npm.cmd run acceptance:final'
    ]
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(card, null, 2)}\n`, 'utf8');

  const blockerRows = blockers.map(item => `| \`${escapePipes(item.id)}\` | ${escapePipes(statusText(item.status))} | ${escapePipes(ownerGroupFor(item.id))} | ${escapePipes(item.label)} |`);
  const ruleRows = card.decisionRules.map(item => `| ${escapePipes(item.rule)} | ${escapePipes(item.current)} | ${item.pass ? 'PASS' : 'BLOCKED'} |`);
  const markdown = `# 宠伴记 10点现场决策卡

- 生成时间：${card.generatedAtLocal}
- 生成时间（UTC）：${card.generatedAt}
- 决策来源：\`${card.sourceOfTruth}\`
- 当前结论：**${card.decision}**
- 外部证据：**${externalVerified}/${externalTotal} verified**

## 一句话结论

${card.reason}

## 决策规则

| 规则 | 当前值 | 结果 |
| --- | --- | --- |
${ruleRows.join('\n')}

## 现场下一步

${nextAction ? `优先找 **${nextAction.ownerGroup}** 补齐：**${nextAction.label}**（\`${nextAction.id}\`）

\`\`\`powershell
${nextAction.command}
\`\`\`` : '外部证据已全部 verified，可进入最终人工发布确认。'}

## 可对外验收的说法

${card.allowedClaims.map(item => `- ${item}`).join('\n')}

## 不能宣称

${card.blockedClaims.map(item => `- ${item}`).join('\n')}

## 本地证据摘要

- release conclusion：\`${card.localEvidence.conclusion || 'missing'}\`
- artifact SHA-256：\`${card.localEvidence.artifactSha256 || 'missing'}\`
- PWA cache：\`${card.localEvidence.pwaCacheName || 'missing'}\`
- 最新验收包：\`${card.localEvidence.latestAcceptanceZip}\`
- 验收包 SHA-256：\`${card.localEvidence.latestAcceptanceZipSha256 || 'missing'}\`

## 外部阻断项

${blockerRows.length ? `| ID | 状态 | 负责人组 | 事项 |\n| --- | --- | --- | --- |\n${blockerRows.join('\n')}` : '无外部阻断项。'}

## 现场复核命令

\`\`\`powershell
${card.commands.join('\n')}
\`\`\`

## 边界

此决策卡只读取本地验收证据和外部证据登记状态；不部署、不上传、不读取真实密钥、不改服务器首页。
`;
  await writeFile(markdownPath, markdown, 'utf8');

  const blockerHtmlRows = blockers.map(item => `<tr><td><code>${escapeHtml(item.id)}</code></td><td>${escapeHtml(statusText(item.status))}</td><td>${escapeHtml(ownerGroupFor(item.id))}</td><td>${escapeHtml(item.label)}</td></tr>`).join('');
  const ruleHtmlRows = card.decisionRules.map(item => `<tr><td>${escapeHtml(item.rule)}</td><td><code>${escapeHtml(item.current)}</code></td><td><strong class="${item.pass ? 'ok' : 'bad'}">${item.pass ? 'PASS' : 'BLOCKED'}</strong></td></tr>`).join('');
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>宠伴记 10点现场决策卡</title>
  <style>
    :root{--bg:#f7efe3;--card:#fffaf2;--text:#49372a;--muted:#8f7a6b;--line:#e7d8c8;--coffee:#8f6545;--bad:#ce675e;--ok:#3aa866;--warn:#b67a22}
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 10% 0,#fff8e8,transparent 30%),var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;line-height:1.65}
    main{max-width:1040px;margin:0 auto;padding:28px 18px 46px}.hero,.card{background:rgba(255,250,242,.96);border:1px solid rgba(255,255,255,.84);border-radius:26px;box-shadow:0 18px 45px rgba(92,64,42,.12)}
    .hero{padding:28px;margin-bottom:16px}.card{padding:18px;margin:14px 0}h1{margin:0 0 8px;font-size:32px;letter-spacing:-.04em}h2{margin:0 0 10px;font-size:21px}.muted{color:var(--muted)}
    .pill{display:inline-flex;border-radius:999px;padding:7px 12px;font-weight:900;margin:4px 6px 4px 0}.pill.bad{background:#fff0ec;color:var(--bad)}.pill.ok{background:#e9faef;color:var(--ok)}.bad{color:var(--bad)}.ok{color:var(--ok)}
    table{width:100%;border-collapse:collapse;background:#fffdf8;border-radius:16px;overflow:hidden}th,td{border-bottom:1px solid var(--line);padding:10px;text-align:left;vertical-align:top}th{background:#f2e6d8}code{background:#f5eadc;border-radius:8px;padding:2px 6px}pre{white-space:pre-wrap;background:#2b211a;color:#fff7eb;border-radius:16px;padding:12px;overflow:auto}ul{padding-left:22px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <h1>宠伴记 10点现场决策卡</h1>
    <p class="muted">生成时间：${escapeHtml(card.generatedAtLocal)} ｜ 决策来源：<code>${escapeHtml(card.sourceOfTruth)}</code></p>
    <span class="pill ${card.goAllowed ? 'ok' : 'bad'}">当前结论：${escapeHtml(card.decision)}</span>
    <span class="pill ${externalVerified === externalTotal && externalTotal > 0 ? 'ok' : 'bad'}">外部证据：${externalVerified}/${externalTotal} verified</span>
    <p><strong>一句话：</strong>${escapeHtml(card.reason)}</p>
  </section>
  <section class="card"><h2>决策规则</h2><table><thead><tr><th>规则</th><th>当前值</th><th>结果</th></tr></thead><tbody>${ruleHtmlRows}</tbody></table></section>
  ${nextAction ? `<section class="card"><h2>现场下一步</h2><p>优先找 <strong>${escapeHtml(nextAction.ownerGroup)}</strong> 补齐：${escapeHtml(nextAction.label)} <code>${escapeHtml(nextAction.id)}</code></p><pre>${escapeHtml(nextAction.command)}</pre></section>` : ''}
  <section class="grid"><div class="card"><h2>可验收</h2><ul>${card.allowedClaims.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div><div class="card"><h2>不能宣称</h2><ul>${card.blockedClaims.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div></section>
  <section class="card"><h2>本地证据摘要</h2><p>artifact SHA-256：<code>${escapeHtml(card.localEvidence.artifactSha256 || 'missing')}</code></p><p>PWA cache：<code>${escapeHtml(card.localEvidence.pwaCacheName || 'missing')}</code></p><p>验收包：<code>${escapeHtml(card.localEvidence.latestAcceptanceZip)}</code></p><p>验收包 SHA-256：<code>${escapeHtml(card.localEvidence.latestAcceptanceZipSha256 || 'missing')}</code></p></section>
  <section class="card"><h2>外部阻断项</h2><table><thead><tr><th>ID</th><th>状态</th><th>负责人组</th><th>事项</th></tr></thead><tbody>${blockerHtmlRows || '<tr><td colspan="4">无</td></tr>'}</tbody></table></section>
  <section class="card"><h2>现场复核命令</h2><pre>${escapeHtml(card.commands.join('\n'))}</pre><p class="muted">本卡只读本地验收证据和外部证据登记状态；不部署、不上传、不读取真实密钥、不改服务器首页。</p></section>
</main>
</body>
</html>
`;
  await writeFile(htmlPath, html, 'utf8');

  console.log(`PASS 10am decision card :: ${jsonPath}`);
  console.log(`PASS 10am decision card :: ${markdownPath}`);
  console.log(`PASS 10am decision card :: ${htmlPath}`);
  console.log(`10am decision card: ${decision}, external ${externalVerified}/${externalTotal} verified`);
}

main().catch(error => {
  console.error(`FAIL 10am decision card :: ${error.message}`);
  process.exit(1);
});
