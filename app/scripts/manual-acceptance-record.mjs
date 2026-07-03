import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const outputDir = 'output';
const jsonPath = `${outputDir}/manual-device-acceptance-record.json`;
const markdownPath = `${outputDir}/manual-device-acceptance-record.md`;
const htmlPath = `${outputDir}/manual-device-acceptance-record.html`;

const DEVICE_MATRIX = [
  {
    id: 'iphone-small',
    label: 'iPhone 小屏',
    example: 'iPhone SE / mini 尺寸',
    osBrowser: 'iOS / Safari',
    network: 'Wi-Fi + 弱网抽测'
  },
  {
    id: 'iphone-mainstream',
    label: 'iPhone 主流屏',
    example: 'iPhone 13/14/15 标准尺寸',
    osBrowser: 'iOS / Safari',
    network: 'Wi-Fi / 4G/5G'
  },
  {
    id: 'iphone-large',
    label: 'iPhone 大屏',
    example: 'Plus / Pro Max 尺寸',
    osBrowser: 'iOS / Safari',
    network: 'Wi-Fi / 4G/5G'
  },
  {
    id: 'android-small',
    label: 'Android 小屏或低端机',
    example: '低内存、较慢 CPU、窄屏',
    osBrowser: 'Android / Chrome 或系统 WebView',
    network: '4G/5G + 弱网抽测'
  },
  {
    id: 'android-mainstream',
    label: 'Android 主流机',
    example: '常见 1080p 屏幕',
    osBrowser: 'Android / Chrome',
    network: 'Wi-Fi / 4G/5G'
  },
  {
    id: 'android-large',
    label: 'Android 大屏或折叠/平板',
    example: '大屏、折叠屏或平板形态',
    osBrowser: 'Android / Chrome 或系统 WebView',
    network: 'Wi-Fi / 离线抽测'
  }
];

const REQUIRED_FLOWS = [
  '首次打开：加载首页、底部导航、空状态和错误提示正常',
  '注册/登录：远端账号注册、登录、刷新后会话保持',
  '宠物档案：新增宠物、编辑宠物、查看详情、切换主宠物',
  '打卡管理：打开底部弹层、新增/删除/完成打卡项，刷新后状态一致',
  '健康提醒：新增提醒、完成提醒、删除提醒，日期和时间显示正确',
  '图片上传：上传宠物图片或动态图片，重新打开后图片可读取',
  '云同步：一台设备写入数据，另一台设备登录同账号后能读取最新状态',
  '云备份：创建备份、恢复备份，恢复后宠物、打卡、提醒和动态一致',
  '离线体验：断网后已缓存页面可打开，重新联网后能恢复远端同步',
  'PWA 更新：旧版本页面保持打开，发布新版本后能检查更新并应用更新',
  '账号导出：导出内容可下载，且不包含 token、cookie、password 或密钥',
  '账号注销：注销后旧 access token 失效，再访问账号数据返回未授权',
  '法务入口：用户协议、隐私政策、同意状态和版本号可查看',
  '可访问性：键盘焦点、弹层关闭、表单标签、按钮触控尺寸可用',
  '支持/投诉：客服入口、问题反馈/投诉入口和脱敏诊断包可找到'
];

const EVIDENCE_GROUPS = [
  {
    id: 'device-matrix',
    label: '设备矩阵',
    mustInclude: '6 类设备、系统/浏览器、网络、验收人、验收时间、App 版本和构建哈希'
  },
  {
    id: 'core-flow-screenshots',
    label: '核心流程截图',
    mustInclude: '首次打开、注册/登录、宠物档案、打卡管理、健康提醒、图片上传、云同步、云备份'
  },
  {
    id: 'offline-pwa-delete',
    label: '离线 / PWA 更新 / 账号注销',
    mustInclude: '离线页面、重新联网同步、PWA 更新应用、账号注销后 token 失效'
  },
  {
    id: 'retest-conclusion',
    label: '复验结论',
    mustInclude: '失败项、修复版本、复验人、复验时间、最终结论'
  }
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

async function readJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
}

function markdownTable(rows) {
  return rows.join('\n');
}

function escapePipes(value) {
  return String(value || '').replace(/\|/g, '\\|');
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function main() {
  const generatedAt = new Date();
  const artifacts = await readJson('output/release-artifacts.json');
  const releaseEvidence = await readJson('output/release-evidence.json');
  const buildInfo = await readJson('dist/build-info.json');
  const appVersion = buildInfo?.version || releaseEvidence?.app?.version || artifacts?.app?.version || '';
  const buildHash = artifacts?.summary?.manifestSha256 || releaseEvidence?.artifacts?.manifestSha256 || '';
  const pwaCache = buildInfo?.pwa?.cacheName || releaseEvidence?.pwa?.cacheName || '';

  const rows = DEVICE_MATRIX.map(device => ({
    deviceId: device.id,
    device: device.label,
    example: device.example,
    osBrowser: device.osBrowser,
    network: device.network,
    tester: '',
    testedAt: '',
    appVersion,
    buildHash,
    result: '待验收',
    evidenceRef: '',
    blockerId: '',
    retestRef: '',
    notes: ''
  }));

  const record = {
    schema: 'pet-companion-manual-device-acceptance-record-v1',
    generatedAt: generatedAt.toISOString(),
    generatedAtLocal: formatChinaTime(generatedAt),
    purpose: '真实上线前 iPhone/Android 多尺寸人工验收记录；只记录脱敏证据引用，不放密码、token、cookie、私钥或生产密钥。',
    app: {
      version: appVersion,
      buildHash,
      pwaCache
    },
    deviceMatrix: DEVICE_MATRIX,
    requiredFlows: REQUIRED_FLOWS,
    evidenceGroups: EVIDENCE_GROUPS,
    rows,
    passCriteria: [
      '6 类设备均有验收记录',
      '所有必验流程均通过，或失败后有修复版本和复验通过记录',
      '证据只使用脱敏截图路径、工单号或验收文档链接',
      '覆盖设备矩阵、核心流程截图、离线/PWA 更新/账号注销记录和复验结论',
      '任一核心流程失败时 launch:status 必须继续保持 NO_GO'
    ],
    suggestedExternalEvidenceCommand: 'npm.cmd run external:evidence:update -- --id manualDeviceAcceptance --status verified --owner <qa-owner> --evidence-ref "<manual-acceptance-ticket-or-doc>" --proof-ref "<device-matrix-proof>" --proof-ref "<core-flow-screenshots-proof>" --proof-ref "<offline-pwa-delete-proof>" --proof-ref "<retest-conclusion-proof>"'
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');

  const deviceRows = rows.map(row => `| ${escapePipes(row.device)} | ${escapePipes(row.example)} | ${escapePipes(row.osBrowser)} | ${escapePipes(row.network)} | ${row.tester || '待填'} | ${row.testedAt || '待填'} | ${row.result} | ${row.evidenceRef || '待填'} | ${row.notes || '-'} |`);
  const flowRows = REQUIRED_FLOWS.map((flow, index) => `| ${index + 1} | ${escapePipes(flow)} | 待验收 | 待填 | - |`);
  const evidenceRows = EVIDENCE_GROUPS.map((group, index) => `| proofRef ${index + 1} | ${escapePipes(group.label)} | ${escapePipes(group.mustInclude)} | 待填 |`);

  const markdown = `# 宠伴记真机验收记录

- 生成时间：${record.generatedAtLocal}
- 生成时间（UTC）：${record.generatedAt}
- App 版本：${appVersion || 'missing'}
- 构建哈希：\`${buildHash || 'missing'}\`
- PWA 缓存：\`${pwaCache || 'missing'}\`

## 填写规则

- 只填写脱敏截图路径、工单号、验收文档链接或记录编号。
- 不填写密码、验证码、token、cookie、私钥、生产密钥或完整个人敏感信息。
- 失败项不要覆盖原记录，应新增修复版本和复验记录。
- 任一核心流程失败时，真实上线结论保持 NO_GO。

## 设备矩阵记录

| 设备 | 建议机型 | 系统/浏览器 | 网络 | 验收人 | 验收时间 | 结果 | 证据 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${markdownTable(deviceRows)}

## 必验流程记录

| # | 流程 | 结果 | 证据 | 备注 |
| ---: | --- | --- | --- | --- |
${markdownTable(flowRows)}

## manualDeviceAcceptance 外部证据 proofRef 对照

| proofRef | 证据组 | 必须包含 | 实际证据引用 |
| --- | --- | --- | --- |
${markdownTable(evidenceRows)}

登记到外部证据的命令骨架：

\`\`\`powershell
${record.suggestedExternalEvidenceCommand}
\`\`\`

## 最终结论

- 验收负责人：
- 复验记录：
- 最终结论：通过 / 不通过 / 需延期
- 外部证据引用：
`;

  await writeFile(markdownPath, markdown, 'utf8');
  const deviceCards = rows.map(row => `<article class="card">
    <p class="eyebrow">${escapeHtml(row.deviceId)}</p>
    <h2>${escapeHtml(row.device)}</h2>
    <p>${escapeHtml(row.example)}</p>
    <p><strong>系统/浏览器：</strong>${escapeHtml(row.osBrowser)}<br><strong>网络：</strong>${escapeHtml(row.network)}</p>
    <p><strong>验收人：</strong><span class="blank">待填</span> ｜ <strong>验收时间：</strong><span class="blank">待填</span></p>
    <p><strong>结果：</strong><span class="pill warn">${escapeHtml(row.result)}</span> ｜ <strong>证据：</strong><span class="blank">待填</span></p>
  </article>`).join('\n');
  const flowRowsHtml = REQUIRED_FLOWS.map((flow, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(flow)}</td><td>待验收</td><td>待填</td><td>-</td></tr>`).join('\n');
  const evidenceRowsHtml = EVIDENCE_GROUPS.map((group, index) => `<tr><td>proofRef ${index + 1}</td><td>${escapeHtml(group.label)}</td><td>${escapeHtml(group.mustInclude)}</td><td>待填</td></tr>`).join('\n');
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>宠伴记真机验收记录</title>
  <style>
    :root{--bg:#f7efe3;--card:#fffaf2;--text:#49372a;--muted:#8f7a6b;--line:#e7d8c8;--coffee:#8f6545;--warn:#b67a22;--bad:#ce675e}
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 8% 0,#fff7e6,transparent 30%),var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;line-height:1.6}
    main{max-width:1120px;margin:0 auto;padding:28px 18px 48px}.hero,.card,.panel{background:rgba(255,250,242,.96);border:1px solid rgba(255,255,255,.85);border-radius:26px;box-shadow:0 18px 45px rgba(92,64,42,.12)}
    .hero,.panel{padding:24px;margin-bottom:16px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}.card{padding:18px}
    h1{margin:0 0 8px;font-size:32px;letter-spacing:-.04em}h2{margin:0 0 8px;font-size:20px}.muted,.eyebrow{color:var(--muted)}.eyebrow{margin:0 0 4px;font-size:13px;font-weight:800}
    .pill{display:inline-flex;border-radius:999px;padding:4px 10px;font-weight:900}.pill.warn{background:#fff5df;color:var(--warn)}.danger{color:var(--bad);font-weight:900}.blank{color:var(--warn);font-weight:800}
    code{background:#f5eadc;border-radius:8px;padding:2px 6px;word-break:break-all}table{width:100%;border-collapse:collapse;background:#fffdf8;border-radius:16px;overflow:hidden}th,td{border-bottom:1px solid var(--line);padding:10px;text-align:left;vertical-align:top}th{background:#f2e6d8}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <h1>宠伴记真机验收记录</h1>
    <p class="muted">生成时间：${escapeHtml(record.generatedAtLocal)} ｜ App 版本：${escapeHtml(appVersion || 'missing')} ｜ PWA：<code>${escapeHtml(pwaCache || 'missing')}</code></p>
    <p>${escapeHtml(record.purpose)}</p>
    <p class="danger">任一核心流程失败时，真实上线结论必须保持 NO_GO。</p>
  </section>
  <section class="panel">
    <h2>设备矩阵</h2>
    <div class="grid">${deviceCards}</div>
  </section>
  <section class="panel">
    <h2>必验流程记录</h2>
    <table><thead><tr><th>#</th><th>流程</th><th>结果</th><th>证据</th><th>备注</th></tr></thead><tbody>${flowRowsHtml}</tbody></table>
  </section>
  <section class="panel">
    <h2>manualDeviceAcceptance proofRef 对照</h2>
    <table><thead><tr><th>proofRef</th><th>证据组</th><th>必须包含</th><th>实际证据引用</th></tr></thead><tbody>${evidenceRowsHtml}</tbody></table>
    <p>登记命令：<code>${escapeHtml(record.suggestedExternalEvidenceCommand)}</code></p>
  </section>
</main>
</body>
</html>
`;
  await writeFile(htmlPath, html, 'utf8');
  console.log(`PASS manual acceptance record :: ${jsonPath}`);
  console.log(`PASS manual acceptance record :: ${markdownPath}`);
  console.log(`PASS manual acceptance record :: ${htmlPath}`);
  console.log(`PASS manual acceptance record :: ${DEVICE_MATRIX.length} devices, ${REQUIRED_FLOWS.length} flows, ${EVIDENCE_GROUPS.length} proof groups`);
}

main().catch(error => {
  console.error(`FAIL manual acceptance record :: ${error.message}`);
  process.exit(1);
});
