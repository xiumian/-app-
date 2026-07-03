import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const outputDir = 'output';
const jsonPath = `${outputDir}/10am-acceptance.json`;
const markdownPath = `${outputDir}/10am-acceptance.md`;
const htmlPath = `${outputDir}/10am-acceptance.html`;
const bundleDir = `${outputDir}/10am-acceptance-bundle`;

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

function runNodeScript(scriptPath, args = []) {
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true
  });
  return {
    scriptPath,
    args,
    ok: result.status === 0,
    exitCode: result.status,
    durationMs: Date.now() - startedAt,
    stdoutTail: String(result.stdout || '').split(/\r?\n/).slice(-8).join('\n').trim(),
    stderrTail: String(result.stderr || '').split(/\r?\n/).slice(-8).join('\n').trim()
  };
}

async function readText(path) {
  return existsSync(path) ? readFile(path, 'utf8') : '';
}

async function readJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
}

async function copyIfExists(from, to) {
  if (!existsSync(from)) return false;
  await copyFile(from, to);
  return true;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusClass(value) {
  if (value === 'GO' || value === true || value === 'PASS') return 'ok';
  if (value === 'NO_GO' || value === false || value === 'FAIL') return 'bad';
  return 'warn';
}

async function main() {
  const generatedAt = new Date();
  const preflightStep = runNodeScript('./scripts/acceptance-preflight.mjs');
  const briefStep = runNodeScript('./scripts/acceptance-brief.mjs');
  const decisionCardStep = runNodeScript('./scripts/acceptance-decision-card.mjs');
  const signoffStep = runNodeScript('./scripts/acceptance-signoff-sheet.mjs');
  const minutesStep = runNodeScript('./scripts/acceptance-meeting-minutes.mjs');
  const cockpitStep = runNodeScript('./scripts/external-evidence-cockpit.mjs');
  const requestPackStep = runNodeScript('./scripts/external-evidence-request-pack.mjs');
  const handoffStep = runNodeScript('./scripts/acceptance-handoff.mjs');
  const launchStep = runNodeScript('./scripts/launch-status.mjs', ['--json']);

  const preflight = await readJson('output/acceptance-preflight.json');
  const brief = await readJson('output/acceptance-brief.json');
  const briefMarkdown = await readText('output/acceptance-brief.md');
  const launch = (() => {
    try {
      const raw = launchStep.stdoutTail.startsWith('{') ? launchStep.stdoutTail : '';
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();

  const launchDecision = brief?.decision || preflight?.launchDecision || launch?.decision || 'UNKNOWN';
  const externalVerified = brief?.externalEvidence?.verified != null
    ? brief.externalEvidence.verified
    : (preflight?.externalEvidence?.verified != null ? preflight.externalEvidence.verified : 0);
  const externalTotal = brief?.externalEvidence?.total != null
    ? brief.externalEvidence.total
    : (preflight?.externalEvidence?.total != null ? preflight.externalEvidence.total : 0);
  const localPass = preflight?.pass === true && preflightStep.ok && briefStep.ok;
  const nextExternalAction = brief?.nextExternalAction || null;
  const nextRequiredProof = Array.isArray(nextExternalAction?.requiredProof) ? nextExternalAction.requiredProof : [];
  const nextProofMarkdown = nextRequiredProof.length
    ? nextRequiredProof.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : '无';
  const nextProofHtml = nextRequiredProof.length
    ? `<ol>${nextRequiredProof.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`
    : '<p>无</p>';
  const payload = {
    schema: 'pet-companion-10am-acceptance-v1',
    generatedAt: generatedAt.toISOString(),
    generatedAtLocal: formatChinaTime(generatedAt),
    localPass,
    launchDecision,
    externalEvidence: {
      verified: externalVerified,
      total: externalTotal
    },
    nextExternalAction,
    openFirst: htmlPath,
    bundleDir,
    keyFiles: [
      'output/10am-acceptance-bundle/README.md',
      'output/10am-acceptance-bundle/index.html',
      'output/10am-acceptance-bundle/10am-acceptance.html',
      'output/10am-acceptance.html',
      'output/10am-acceptance.md',
      'output/acceptance-brief.md',
      'output/10am-decision-card.html',
      'output/10am-decision-card.md',
      'output/10am-signoff-sheet.html',
      'output/10am-signoff-sheet.md',
      'output/10am-meeting-minutes.html',
      'output/10am-meeting-minutes.md',
      'output/10am-snapshot-lock.html',
      'output/10am-snapshot-lock.md',
      'output/acceptance-preflight.md',
      'output/acceptance-handoff.md',
      'output/external-evidence-cockpit.html',
      'output/external-evidence-cockpit.md',
      'output/external-evidence-request-pack.html',
      'output/external-evidence-request-pack.md',
      'output/external-evidence-request-ops.md',
      'output/external-evidence-request-legal.md',
      'output/external-evidence-request-qa.md',
      'output/external-evidence-worksheet.html',
      'output/external-evidence-worksheet.md',
      'output/manual-device-acceptance-record.html',
      'output/manual-device-acceptance-record.md'
    ],
    steps: [preflightStep, briefStep, decisionCardStep, signoffStep, minutesStep, cockpitStep, requestPackStep, handoffStep, launchStep]
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const stepRows = payload.steps.map(step => `| \`${step.scriptPath}${step.args.length ? ` ${step.args.join(' ')}` : ''}\` | ${step.ok ? '通过' : '失败'} | ${step.durationMs}ms |`);
  const markdown = `# 宠伴记 10点验收入口

- 生成时间：${payload.generatedAtLocal}
- 生成时间（UTC）：${payload.generatedAt}
- 本地验收预检：**${payload.localPass ? 'PASS' : 'FAIL'}**
- 当前上线判定：**${payload.launchDecision}**
- 外部证据：**${payload.externalEvidence.verified}/${payload.externalEvidence.total} verified**

## 只看这一页的结论

本地验收材料已刷新；现场优先看本页和下方“10点验收口径”。真实上线仍必须以 \`launch:status\` 为准。当前外部生产证据未 verified，因此真实上线判定保持 **${payload.launchDecision}**。

## 现场下一步先做

${nextExternalAction ? `优先推进：**${nextExternalAction.label}**（\`${nextExternalAction.id}\`）

- 建议负责人：${nextExternalAction.suggestedOwnerRole}
- 缺少 proofRef：${nextExternalAction.missingProofCount}
- 详情表：\`${nextExternalAction.reviewFile}\`
- 辅助命令：\`${nextExternalAction.helperCommand}\`
- provided 登记：\`${nextExternalAction.providedCommand}\`
- verified 登记：\`${nextExternalAction.verifiedCommand}\`

需要现场补齐的证明：

${nextProofMarkdown}
` : '外部证据已全部 verified，可继续走最终上线决策。'}

## 本次自动刷新

| 命令 | 结果 | 耗时 |
| --- | --- | ---: |
${stepRows.join('\n')}

## 关键文件

${payload.keyFiles.map(file => `- \`${file}\``).join('\n')}

---

${briefMarkdown.replace(/^# 宠伴记 10点验收口径\s*/, '# 10点验收口径\n')}
`;

  await writeFile(markdownPath, markdown, 'utf8');
  const blockerRows = (brief?.externalEvidence?.blockers || [])
    .map(item => `<tr><td><code>${escapeHtml(item.id)}</code></td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.label)}</td></tr>`)
    .join('');
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>宠伴记 10点验收入口</title>
  <style>
    :root{--bg:#f7efe3;--card:#fffaf2;--text:#49372a;--muted:#8f7a6b;--line:#e7d8c8;--coffee:#8f6545;--bad:#ce675e;--ok:#3aa866;--warn:#b67a22}
    *{box-sizing:border-box} body{margin:0;background:radial-gradient(circle at 10% 0,#fff8e8,transparent 28%),var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;line-height:1.65}
    main{max-width:1080px;margin:0 auto;padding:28px 18px 46px}.hero,.card{background:rgba(255,250,242,.94);border:1px solid rgba(255,255,255,.8);border-radius:26px;box-shadow:0 18px 45px rgba(92,64,42,.12)}
    .hero{padding:28px;margin-bottom:18px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}.card{padding:18px;margin:14px 0}
    h1{margin:0 0 8px;font-size:32px;letter-spacing:-.04em}h2{margin:0 0 12px;font-size:21px}p{margin:8px 0}.muted{color:var(--muted)}.pill{display:inline-flex;align-items:center;border-radius:999px;padding:7px 12px;font-weight:900;background:#f3eadf;color:var(--coffee);margin:4px 6px 4px 0}.pill.ok{background:#e9faef;color:var(--ok)}.pill.bad{background:#fff0ec;color:var(--bad)}.pill.warn{background:#fff5df;color:var(--warn)}
    table{width:100%;border-collapse:collapse;background:#fffdf8;border-radius:16px;overflow:hidden}th,td{border-bottom:1px solid var(--line);padding:10px;text-align:left;vertical-align:top}th{background:#f2e6d8}code{background:#f5eadc;border-radius:8px;padding:2px 6px}.actions{display:flex;flex-wrap:wrap;gap:10px}.actions a{display:inline-flex;text-decoration:none;background:var(--coffee);color:white;border-radius:999px;padding:10px 14px;font-weight:900}.actions a.secondary{background:#efe2d2;color:var(--coffee)}ul{padding-left:22px}.danger{color:var(--bad);font-weight:900}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <h1>宠伴记 10点验收入口</h1>
    <p class="muted">生成时间：${escapeHtml(payload.generatedAtLocal)} ｜ UTC：${escapeHtml(payload.generatedAt)}</p>
    <span class="pill ${statusClass(payload.localPass)}">本地验收预检：${payload.localPass ? 'PASS' : 'FAIL'}</span>
    <span class="pill ${statusClass(payload.launchDecision)}">上线判定：${escapeHtml(payload.launchDecision)}</span>
    <span class="pill ${payload.externalEvidence.verified === payload.externalEvidence.total ? 'ok' : 'bad'}">外部证据：${payload.externalEvidence.verified}/${payload.externalEvidence.total} verified</span>
    <p><strong>现场一句话：</strong>本地 H5/PWA 产物、发布证据、传输边界、验收表和预检链路已刷新；真实上线仍以 <code>launch:status</code> 为准，当前外部生产证据未 verified，所以保持 <strong class="danger">${escapeHtml(payload.launchDecision)}</strong>。</p>
  </section>

  <section class="grid">
    <div class="card"><h2>产物</h2><p>公开包：${escapeHtml(brief?.app?.artifactCount || '')} 文件 / ${escapeHtml(brief?.app?.artifactBytes || '')} bytes</p><p>SHA-256：<code>${escapeHtml(brief?.app?.artifactSha || 'missing')}</code></p></div>
    <div class="card"><h2>PWA</h2><p>Cache：<code>${escapeHtml(brief?.app?.pwaCache || 'missing')}</code></p><p>runtime-config 不预缓存，便于生产环境替换。</p></div>
    <div class="card"><h2>现场入口</h2><p>优先看本 HTML；需要文本版看 <code>output/10am-acceptance.md</code>。</p></div>
  </section>

  ${nextExternalAction ? `<section class="card">
    <h2>现场下一步先做</h2>
    <p><strong>优先推进：</strong>${escapeHtml(nextExternalAction.label)} <code>${escapeHtml(nextExternalAction.id)}</code></p>
    <p>建议负责人：${escapeHtml(nextExternalAction.suggestedOwnerRole)} ｜ 缺少 proofRef：${escapeHtml(nextExternalAction.missingProofCount)}</p>
    <p>详情表：<code>${escapeHtml(nextExternalAction.reviewFile)}</code></p>
    <p>辅助命令：<code>${escapeHtml(nextExternalAction.helperCommand)}</code></p>
    <h3>必须补齐的证明</h3>
    ${nextProofHtml}
    <h3>登记命令</h3>
    <p>先登记为 provided：<code>${escapeHtml(nextExternalAction.providedCommand)}</code></p>
    <p>复核后登记为 verified：<code>${escapeHtml(nextExternalAction.verifiedCommand)}</code></p>
  </section>` : ''}

  <section class="card">
    <h2>本次自动刷新</h2>
    <table><thead><tr><th>命令</th><th>结果</th><th>耗时</th></tr></thead><tbody>
      ${payload.steps.map(step => `<tr><td><code>${escapeHtml(step.scriptPath)}${step.args.length ? ` ${escapeHtml(step.args.join(' '))}` : ''}</code></td><td>${step.ok ? '通过' : '失败'}</td><td>${step.durationMs}ms</td></tr>`).join('\n')}
    </tbody></table>
  </section>

  <section class="card">
    <h2>可以验收</h2>
    <ul>${(brief?.canAccept || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    <h2>不能宣称</h2>
    <ul>${(brief?.cannotClaim || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
  </section>

  <section class="card">
    <h2>外部阻断项</h2>
    <table><thead><tr><th>ID</th><th>状态</th><th>事项</th></tr></thead><tbody>${blockerRows || '<tr><td colspan="3">无</td></tr>'}</tbody></table>
  </section>

  <section class="card">
    <h2>关键文件</h2>
    <div class="actions">
      ${payload.keyFiles.map((file, index) => `<a class="${index === 0 ? '' : 'secondary'}" href="${escapeHtml(file.replace(/^output\//, './'))}">${escapeHtml(file)}</a>`).join('\n')}
    </div>
  </section>
</main>
</body>
</html>
`;
  await writeFile(htmlPath, html, 'utf8');

  const snapshotStep = runNodeScript('./scripts/acceptance-snapshot-lock.mjs');

  await mkdir(bundleDir, { recursive: true });
  const bundleFiles = [
    '10am-acceptance.html',
    '10am-acceptance.md',
    '10am-acceptance.json',
    'acceptance-brief.md',
    'acceptance-brief.json',
    '10am-decision-card.html',
    '10am-decision-card.md',
    '10am-decision-card.json',
    '10am-signoff-sheet.html',
    '10am-signoff-sheet.md',
    '10am-signoff-sheet.json',
    '10am-meeting-minutes.html',
    '10am-meeting-minutes.md',
    '10am-meeting-minutes.json',
    '10am-snapshot-lock.html',
    '10am-snapshot-lock.md',
    '10am-snapshot-lock.json',
    'acceptance-preflight.md',
    'acceptance-preflight.json',
    'acceptance-handoff.md',
    'acceptance-handoff.json',
    'external-evidence-cockpit.html',
    'external-evidence-cockpit.md',
    'external-evidence-cockpit.json',
    'external-evidence-request-pack.html',
    'external-evidence-request-pack.md',
    'external-evidence-request-pack.json',
    'external-evidence-request-ops.html',
    'external-evidence-request-ops.md',
    'external-evidence-request-ops.json',
    'external-evidence-request-legal.html',
    'external-evidence-request-legal.md',
    'external-evidence-request-legal.json',
    'external-evidence-request-qa.html',
    'external-evidence-request-qa.md',
    'external-evidence-request-qa.json',
    'external-evidence-worksheet.html',
    'external-evidence-worksheet.md',
    'external-evidence-worksheet.json',
    'manual-device-acceptance-record.html',
    'manual-device-acceptance-record.md',
    'manual-device-acceptance-record.json',
    'release-artifacts.md',
    'release-artifacts.json',
    'release-evidence.md',
    'release-evidence.json',
    'deploy-transfer-plan.md',
    'deploy-transfer-plan.json'
  ];
  const copiedFiles = [];
  for (const file of bundleFiles) {
    if (await copyIfExists(`${outputDir}/${file}`, `${bundleDir}/${file}`)) copiedFiles.push(file);
  }
  const listedFiles = ['index.html', ...copiedFiles];
  const bundleReadme = `# 宠伴记 10点验收资料包

- 生成时间：${payload.generatedAtLocal}
- 本地验收预检：${payload.localPass ? 'PASS' : 'FAIL'}
- 当前上线判定：${payload.launchDecision}
- 外部证据：${payload.externalEvidence.verified}/${payload.externalEvidence.total} verified

现场打开顺序：

\`\`\`text
1. index.html                           # 验收资料包总入口
2. 10am-acceptance.html                 # 10点验收入口和结论
3. external-evidence-cockpit.html       # 8项外部上线证据指挥台
4. external-evidence-request-pack.html  # 可转发给 Ops/Legal/QA 的脱敏证据请求包总入口
5. external-evidence-worksheet.html     # 8项外部上线证据填报表
6. manual-device-acceptance-record.html # iPhone/Android 真机验收记录
7. deploy-transfer-plan.md              # 只传指定位置、不改服务器首页的传输边界
\`\`\`

本资料包只包含本地验收材料、发布证据摘要、传输边界和外部证据填报表；不包含真实密码、token、cookie、私钥、TLS 证书正文或生产密钥。

现场快捷命令：

\`\`\`powershell
npm.cmd run external:evidence:next:ops
npm.cmd run external:evidence:next:legal
npm.cmd run external:evidence:next:qa
\`\`\`

文件列表：

${listedFiles.map(file => `- \`${file}\``).join('\n')}
`;
  await writeFile(`${bundleDir}/README.md`, bundleReadme, 'utf8');
  const bundleIndexHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>宠伴记 10点验收资料包总入口</title>
  <style>
    :root{--bg:#f7efe3;--card:#fffaf2;--text:#49372a;--muted:#8f7a6b;--line:#e7d8c8;--coffee:#8f6545;--bad:#ce675e;--ok:#3aa866}
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 8% 0,#fff7e6,transparent 30%),var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;line-height:1.6}
    main{max-width:980px;margin:0 auto;padding:28px 18px 48px}.hero,.card{background:rgba(255,250,242,.96);border:1px solid rgba(255,255,255,.85);border-radius:26px;box-shadow:0 18px 45px rgba(92,64,42,.12)}
    .hero{padding:26px;margin-bottom:16px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}.card{padding:18px;text-decoration:none;color:inherit;display:block}
    h1{margin:0 0 8px;font-size:32px;letter-spacing:-.04em}h2{margin:0 0 8px;font-size:20px}.muted{color:var(--muted)}.pill{display:inline-flex;border-radius:999px;padding:6px 11px;font-weight:900;margin:4px 6px 4px 0}.pill.ok{background:#e9faef;color:var(--ok)}.pill.bad{background:#fff0ec;color:var(--bad)}
    code{background:#f5eadc;border-radius:8px;padding:2px 6px}.card strong{color:var(--coffee)}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <h1>宠伴记 10点验收资料包总入口</h1>
    <p class="muted">生成时间：${escapeHtml(payload.generatedAtLocal)}</p>
    <span class="pill ${payload.localPass ? 'ok' : 'bad'}">本地验收：${payload.localPass ? 'PASS' : 'FAIL'}</span>
    <span class="pill bad">上线判定：${escapeHtml(payload.launchDecision)}</span>
    <span class="pill bad">外部证据：${payload.externalEvidence.verified}/${payload.externalEvidence.total} verified</span>
    <p><strong>边界：</strong>本包只含本地验收材料、发布证据摘要、真机验收表、传输边界、外部证据指挥台和填报表；不包含真实密码、token、cookie、私钥、TLS 证书正文或生产密钥。</p>
  </section>
  <section class="card">
    <h2>现场快捷命令</h2>
    <p>按负责人分组查看缺口和登记命令：</p>
    <p><code>npm.cmd run external:evidence:next:ops</code></p>
    <p><code>npm.cmd run external:evidence:next:legal</code></p>
    <p><code>npm.cmd run external:evidence:next:qa</code></p>
  </section>
  <section class="grid">
    <a class="card" href="10am-acceptance.html"><h2>1. 10am acceptance entry</h2><p>Review local evidence, current NO_GO reason, and next action.</p><p><code>10am-acceptance.html</code></p></a>
    <a class="card" href="10am-decision-card.html"><h2>2. GO / NO_GO decision card</h2><p>Use launch:status to separate what can be accepted from what cannot be claimed.</p><p><code>10am-decision-card.html</code></p></a>
    <a class="card" href="10am-signoff-sheet.html"><h2>3. Owner signoff sheet</h2><p>Record Ops / Legal / QA owner signoff and masked evidence references.</p><p><code>10am-signoff-sheet.html</code></p></a>
    <a class="card" href="10am-meeting-minutes.html"><h2>4. Meeting minutes</h2><p>Record acceptance decisions, action owners, and follow-up commands.</p><p><code>10am-meeting-minutes.html</code></p></a>
    <a class="card" href="10am-snapshot-lock.html"><h2>5. Snapshot lock</h2><p>Verify hashes for the exact 10am acceptance material set.</p><p><code>10am-snapshot-lock.html</code></p></a>
    <a class="card" href="external-evidence-cockpit.html"><h2>6. External evidence cockpit</h2><p>Review all 8 external blockers, collection state, and next commands.</p><p><code>external-evidence-cockpit.html</code></p></a>
    <a class="card" href="external-evidence-request-pack.html"><h2>7. Owner request pack</h2><p>Forward Ops / Legal / QA evidence requests without secrets.</p><p><code>external-evidence-request-pack.html</code></p></a>
    <a class="card" href="external-evidence-worksheet.html"><h2>8. Evidence worksheet</h2><p>Review proofRef gaps and provided / verified commands.</p><p><code>external-evidence-worksheet.html</code></p></a>
    <a class="card" href="manual-device-acceptance-record.html"><h2>9. Device acceptance record</h2><p>Record iPhone / Android device and core-flow acceptance.</p><p><code>manual-device-acceptance-record.html</code></p></a>
    <a class="card" href="deploy-transfer-plan.md"><h2>10. Transfer boundary</h2><p>Confirm transfer targets and server homepage safety boundary.</p><p><code>deploy-transfer-plan.md</code></p></a>
    <a class="card" href="release-evidence.md"><h2>11. Release evidence</h2><p>Review local release evidence, artifacts, and release gate summary.</p><p><code>release-evidence.md</code></p></a>
    <a class="card" href="README.md"><h2>12. File list</h2><p>Read package instructions and file inventory.</p><p><code>README.md</code></p></a>
  </section>
</main>
</body>
</html>
`;
  await writeFile(`${bundleDir}/index.html`, bundleIndexHtml, 'utf8');

  console.log(`PASS acceptance 10am :: ${jsonPath}`);
  console.log(`PASS acceptance 10am :: ${markdownPath}`);
  console.log(`PASS acceptance 10am :: ${htmlPath}`);
  console.log(`PASS acceptance 10am :: ${bundleDir}`);
  console.log(`PASS acceptance 10am :: local ${payload.localPass ? 'PASS' : 'FAIL'}, launch ${payload.launchDecision}, external ${payload.externalEvidence.verified}/${payload.externalEvidence.total} verified`);

  if (!payload.localPass || !snapshotStep.ok) process.exit(1);
}

main().catch(error => {
  console.error(`FAIL acceptance 10am :: ${error.message}`);
  process.exit(1);
});
