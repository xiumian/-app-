import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const evidencePath = existsSync('output/production-evidence.json')
  ? 'output/production-evidence.json'
  : 'deploy/production-evidence.example.json';
const outputDir = 'output';
const jsonPath = `${outputDir}/external-evidence-worksheet.json`;
const markdownPath = `${outputDir}/external-evidence-worksheet.md`;
const htmlPath = `${outputDir}/external-evidence-worksheet.html`;

const PRIORITY = [
  'domainTls',
  'productionEnv',
  'persistentStorage',
  'objectStorage',
  'monitoringAlerts',
  'platformBackups',
  'legalApproval',
  'manualDeviceAcceptance'
];

const OWNER_HINTS = {
  domainTls: '运维 / 网关负责人',
  productionEnv: '运维 / 发布负责人',
  persistentStorage: '运维 / 数据负责人',
  objectStorage: '运维 / 媒体存储负责人',
  monitoringAlerts: '运维 / 值班负责人',
  platformBackups: '运维 / 备份恢复负责人',
  legalApproval: '运营主体 / 法务 / 客服负责人',
  manualDeviceAcceptance: 'QA / 真机验收负责人'
};

const REVIEW_HINTS = {
  domainTls: '先用 external:evidence:domain-tls 采集 HTTPS/TLS 摘要，再补网关/反代工单，确认正式前端和 API 均指向生产。',
  productionEnv: '先用 external:evidence:production-env 生成脱敏摘要，再登记文件路径、权限记录和配置审查工单；真实 deploy/production.env 不进仓库、不进聊天。',
  persistentStorage: '先用 external:evidence:storage 采集 SQLite/数据卷脱敏摘要，再补重启保留和恢复责任人证据。',
  objectStorage: '先用 external:evidence:storage 采集媒体目录脱敏摘要，再补持久化挂载、上传读取和重启后访问证据。',
  monitoringAlerts: '先用 external:evidence:ops 生成监控/告警脱敏摘要，再补监控入口、告警规则和接收人证据。',
  platformBackups: '先用 external:evidence:ops 生成备份/恢复脱敏摘要，再补备份任务、异地保留和恢复演练证据。',
  legalApproval: '先用 external:evidence:release-approval 生成法务/政策脱敏摘要，再补运营主体、客服渠道、政策版本和地区法务意见。',
  manualDeviceAcceptance: '先用 manual:acceptance:record 生成记录表，再用 external:evidence:release-approval 登记 6 类设备和 15 个流程的脱敏证据。'
};

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
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
}

function statusLabel(status) {
  if (status === 'verified') return '已验证';
  if (status === 'provided') return '已提交待复核';
  return '待补齐';
}

function placeholderOwner(id) {
  if (id === 'legalApproval') return '<legal-owner>';
  if (id === 'manualDeviceAcceptance') return '<qa-owner>';
  return '<ops-owner>';
}

function proofRefName(id, index) {
  return `<${id}-proof-${index + 1}>`;
}

function commandFor(item, status = 'provided') {
  const owner = placeholderOwner(item.id);
  const evidenceRef = `<${item.id}-ticket-or-doc>`;
  const proofRefs = (item.requiredProof || ['proof'])
    .map((_, index) => ` --proof-ref "${proofRefName(item.id, index)}"`)
    .join('');
  return `npm.cmd run external:evidence:update -- --id ${item.id} --status ${status} --owner ${owner} --evidence-ref "${evidenceRef}"${proofRefs}`;
}

function collectorCommandFor(item) {
  if (item.id === 'productionEnv') {
    return 'npm.cmd run external:evidence:production-env -- --file deploy/production.env --review-ref "<masked-env-review-ticket>" --owner "<owner-id>"';
  }
  if (item.id === 'persistentStorage' || item.id === 'objectStorage') {
    return 'npm.cmd run external:evidence:storage -- --data-dir /data --sqlite-file /data/pet-companion.sqlite --media-dir /data/media --storage-ref "<volume-or-db-ticket>" --restart-ref "<restart-retention-ticket>" --restore-owner-ref "<restore-owner-ticket>" --media-mount-ref "<media-volume-ticket>" --media-upload-ref "<upload-read-ticket>" --media-restart-ref "<media-restart-ticket>" --owner "<owner-id>"';
  }
  if (item.id === 'monitoringAlerts' || item.id === 'platformBackups') {
    return 'npm.cmd run external:evidence:ops -- --monitoring-url "https://<monitoring-dashboard-or-endpoint>" --alert-ref "<alert-rule-ticket>" --recipient-ref "<oncall-recipient-ticket>" --backup-job-ref "<backup-job-ticket>" --retention-ref "<retention-offsite-ticket>" --restore-drill-ref "<restore-drill-ticket>" --restore-owner-ref "<restore-owner-ticket>" --owner "<owner-id>"';
  }
  if (item.id === 'legalApproval' || item.id === 'manualDeviceAcceptance') {
    return 'npm.cmd run external:evidence:release-approval -- --operator-ref "<operator-ticket>" --support-ref "<support-channel-ticket>" --policy-version-ref "<policy-version-ticket>" --legal-review-ref "<regional-legal-review-ticket>" --device-matrix-ref "<device-matrix-ticket>" --core-flow-ref "<core-flow-screenshots-ticket>" --offline-pwa-delete-ref "<offline-pwa-delete-ticket>" --retest-conclusion-ref "<final-retest-ticket>" --owner "<owner-id>"';
  }
  if (item.id !== 'domainTls') return '';
  return 'npm.cmd run external:evidence:domain-tls -- --url "https://<production-app-url>" --api-health-url "https://<production-app-url>/api/health" --gateway-ref "<gateway-or-nginx-ticket>" --owner "<owner-id>"';
}

function escapePipes(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function mdRows(rows) {
  return rows.join('\n');
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusClass(status) {
  if (status === 'verified') return 'ok';
  if (status === 'provided') return 'warn';
  return 'bad';
}

async function main() {
  const generatedAt = new Date();
  const payload = await readJson(evidencePath);
  const items = Array.isArray(payload.items) ? payload.items : [];
  const orderedItems = [...items].sort((a, b) => {
    const left = PRIORITY.indexOf(a.id);
    const right = PRIORITY.indexOf(b.id);
    return (left === -1 ? 999 : left) - (right === -1 ? 999 : right);
  });

  const worksheetItems = orderedItems.map((item, index) => {
    const requiredProof = Array.isArray(item.requiredProof) ? item.requiredProof : [];
    const proofRefs = Array.isArray(item.proofRefs) ? item.proofRefs : [];
    return {
      order: index + 1,
      id: item.id,
      label: item.label,
      status: item.status,
      statusLabel: statusLabel(item.status),
      suggestedOwnerRole: OWNER_HINTS[item.id] || '待指定负责人',
      currentOwner: item.owner || '',
      currentEvidenceRef: item.evidenceRef || '',
      requiredProof,
      proofRefs,
      missingProofCount: Math.max(requiredProof.length - proofRefs.length, 0),
      reviewHint: REVIEW_HINTS[item.id] || '',
      collectorCommand: collectorCommandFor(item),
      providedCommand: item.status === 'verified' ? '' : commandFor(item, 'provided'),
      verifiedCommand: item.status === 'verified' ? '' : commandFor(item, 'verified')
    };
  });

  const worksheet = {
    schema: 'pet-companion-external-evidence-worksheet-v1',
    generatedAt: generatedAt.toISOString(),
    generatedAtLocal: formatChinaTime(generatedAt),
    source: evidencePath,
    purpose: '真实上线外部证据负责人填报表；只登记脱敏证据引用，不放密码、token、cookie、私钥、证书正文或生产密钥。',
    summary: {
      total: worksheetItems.length,
      verified: worksheetItems.filter(item => item.status === 'verified').length,
      provided: worksheetItems.filter(item => item.status === 'provided').length,
      pending: worksheetItems.filter(item => item.status === 'pending').length,
      blocked: worksheetItems.filter(item => item.status !== 'verified').length
    },
    items: worksheetItems
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(worksheet, null, 2)}\n`, 'utf8');

  const summaryRows = worksheetItems.map(item => `| ${item.order} | \`${escapePipes(item.id)}\` | ${escapePipes(item.label)} | ${item.statusLabel} | ${escapePipes(item.suggestedOwnerRole)} | ${item.proofRefs.length}/${item.requiredProof.length} |`);
  const detailSections = worksheetItems.map(item => {
    const proofRows = item.requiredProof.map((proof, index) => `| ${index + 1} | ${escapePipes(proof)} | ${escapePipes(item.proofRefs[index] || proofRefName(item.id, index))} | ${item.proofRefs[index] ? '已登记' : '待填'} |`);
    return `### ${item.order}. ${item.label}

- ID：\`${item.id}\`
- 当前状态：${item.statusLabel}
- 建议负责人：${item.suggestedOwnerRole}
- 当前 owner：${item.currentOwner || '待填'}
- 当前 evidenceRef：${item.currentEvidenceRef || '待填'}
- 复核提示：${item.reviewHint}
${item.collectorCommand ? `
采集外部证据摘要：

\`\`\`powershell
${item.collectorCommand}
\`\`\`
` : ''}

| # | requiredProof | proofRef 填写位置 | 状态 |
| ---: | --- | --- | --- |
${mdRows(proofRows)}

登记为 provided：

\`\`\`powershell
${item.providedCommand || '# 已 verified，无需登记'}
\`\`\`

登记为 verified：

\`\`\`powershell
${item.verifiedCommand || '# 已 verified，无需登记'}
\`\`\`
`;
  });

  const markdown = `# 宠伴记外部上线证据负责人填报表

- 生成时间：${worksheet.generatedAtLocal}
- 生成时间（UTC）：${worksheet.generatedAt}
- 来源：\`${evidencePath}\`
- 用途：${worksheet.purpose}

## 总览

- 总项：${worksheet.summary.total}
- verified：${worksheet.summary.verified}
- provided：${worksheet.summary.provided}
- pending：${worksheet.summary.pending}
- 仍阻断上线：${worksheet.summary.blocked}

| 优先级 | ID | 事项 | 状态 | 建议负责人 | proofRef 覆盖 |
| ---: | --- | --- | --- | --- | --- |
${mdRows(summaryRows)}

## 填写规则

- 只填工单号、脱敏截图路径、验收文档链接或记录编号。
- 不填 password、token、cookie、private key、TLS 私钥、证书正文、对象存储密钥或完整个人敏感信息。
- \`provided\` 表示证据已提交待复核；\`verified\` 表示证据已复核通过。
- \`verified\` 必须让 proofRef 数量覆盖 requiredProof 数量。

## 逐项填报

${detailSections.join('\n')}
`;

  await writeFile(markdownPath, markdown, 'utf8');
  const cardHtml = worksheetItems.map(item => {
    const proofItems = item.requiredProof.map((proof, index) => {
      const proofRef = item.proofRefs[index] || proofRefName(item.id, index);
      const done = Boolean(item.proofRefs[index]);
      return `<li><strong>${escapeHtml(proof)}</strong><br><span class="${done ? 'ok-text' : 'muted'}">${done ? '已登记' : '待填'}：<code>${escapeHtml(proofRef)}</code></span></li>`;
    }).join('');
    return `<article class="card">
      <div class="card-head">
        <div><p class="eyebrow">#${item.order} · ${escapeHtml(item.id)}</p><h2>${escapeHtml(item.label)}</h2></div>
        <span class="pill ${statusClass(item.status)}">${escapeHtml(item.statusLabel)}</span>
      </div>
      <p><strong>建议负责人：</strong>${escapeHtml(item.suggestedOwnerRole)} ｜ <strong>proofRef：</strong>${item.proofRefs.length}/${item.requiredProof.length} ｜ <strong>缺口：</strong>${item.missingProofCount}</p>
      <p class="muted">${escapeHtml(item.reviewHint)}</p>
      ${item.collectorCommand ? `<div class="command"><strong>先采集：</strong><code>${escapeHtml(item.collectorCommand)}</code></div>` : ''}
      <h3>必须补齐的证明</h3>
      <ol>${proofItems}</ol>
      <h3>登记命令</h3>
      <p>provided：<code>${escapeHtml(item.providedCommand || '# 已 verified，无需登记')}</code></p>
      <p>verified：<code>${escapeHtml(item.verifiedCommand || '# 已 verified，无需登记')}</code></p>
    </article>`;
  }).join('\n');
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>宠伴记外部上线证据看板</title>
  <style>
    :root{--bg:#f7efe3;--card:#fffaf2;--text:#49372a;--muted:#8f7a6b;--line:#e7d8c8;--coffee:#8f6545;--bad:#ce675e;--ok:#3aa866;--warn:#b67a22}
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 8% 0,#fff7e6,transparent 30%),var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;line-height:1.6}
    main{max-width:1120px;margin:0 auto;padding:28px 18px 48px}.hero,.card{background:rgba(255,250,242,.96);border:1px solid rgba(255,255,255,.85);border-radius:26px;box-shadow:0 18px 45px rgba(92,64,42,.12)}
    .hero{padding:28px;margin-bottom:16px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}.card{padding:18px}.card-head{display:flex;gap:12px;align-items:flex-start;justify-content:space-between}
    h1{margin:0 0 8px;font-size:32px;letter-spacing:-.04em}h2{margin:0;font-size:20px}h3{margin:14px 0 8px}.muted{color:var(--muted)}.eyebrow{margin:0 0 4px;color:var(--muted);font-size:13px;font-weight:800}
    .pill{display:inline-flex;align-items:center;white-space:nowrap;border-radius:999px;padding:7px 12px;font-weight:900}.pill.ok{background:#e9faef;color:var(--ok)}.pill.bad{background:#fff0ec;color:var(--bad)}.pill.warn{background:#fff5df;color:var(--warn)}
    .stats{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}.stat{border-radius:18px;background:#f3eadf;padding:12px 14px;min-width:128px}.stat strong{font-size:24px;display:block}
    code{background:#f5eadc;border-radius:8px;padding:2px 6px;word-break:break-all}li{margin:8px 0}.ok-text{color:var(--ok);font-weight:800}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <h1>宠伴记外部上线证据看板</h1>
    <p class="muted">生成时间：${escapeHtml(worksheet.generatedAtLocal)} ｜ 来源：<code>${escapeHtml(evidencePath)}</code></p>
    <p>${escapeHtml(worksheet.purpose)}</p>
    <div class="stats">
      <div class="stat"><strong>${worksheet.summary.total}</strong>总项</div>
      <div class="stat"><strong>${worksheet.summary.verified}</strong>verified</div>
      <div class="stat"><strong>${worksheet.summary.provided}</strong>provided</div>
      <div class="stat"><strong>${worksheet.summary.pending}</strong>pending</div>
      <div class="stat"><strong>${worksheet.summary.blocked}</strong>仍阻断上线</div>
    </div>
  </section>
  <section class="grid">
${cardHtml}
  </section>
</main>
</body>
</html>
`;
  await writeFile(htmlPath, html, 'utf8');
  console.log(`PASS external evidence worksheet :: ${jsonPath}`);
  console.log(`PASS external evidence worksheet :: ${markdownPath}`);
  console.log(`PASS external evidence worksheet :: ${htmlPath}`);
  console.log(`PASS external evidence worksheet :: ${worksheet.summary.verified}/${worksheet.summary.total} verified, ${worksheet.summary.blocked} blocked`);
}

main().catch(error => {
  console.error(`FAIL external evidence worksheet :: ${error.message}`);
  process.exit(1);
});
