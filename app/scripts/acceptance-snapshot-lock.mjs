import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const outputDir = 'output';
const jsonPath = `${outputDir}/10am-snapshot-lock.json`;
const markdownPath = `${outputDir}/10am-snapshot-lock.md`;
const htmlPath = `${outputDir}/10am-snapshot-lock.html`;

const SNAPSHOT_FILES = [
  'output/10am-acceptance.html',
  'output/10am-acceptance.md',
  'output/10am-acceptance.json',
  'output/acceptance-brief.md',
  'output/acceptance-brief.json',
  'output/10am-decision-card.html',
  'output/10am-decision-card.md',
  'output/10am-decision-card.json',
  'output/10am-signoff-sheet.html',
  'output/10am-signoff-sheet.md',
  'output/10am-signoff-sheet.json',
  'output/10am-meeting-minutes.html',
  'output/10am-meeting-minutes.md',
  'output/10am-meeting-minutes.json',
  'output/external-evidence-cockpit.html',
  'output/external-evidence-cockpit.md',
  'output/external-evidence-cockpit.json',
  'output/external-evidence-request-pack.html',
  'output/external-evidence-request-pack.md',
  'output/external-evidence-request-pack.json',
  'output/external-evidence-request-ops.html',
  'output/external-evidence-request-ops.md',
  'output/external-evidence-request-legal.html',
  'output/external-evidence-request-legal.md',
  'output/external-evidence-request-qa.html',
  'output/external-evidence-request-qa.md',
  'output/acceptance-handoff.md',
  'output/acceptance-handoff.json',
  'output/external-evidence-worksheet.html',
  'output/external-evidence-worksheet.md',
  'output/external-evidence-worksheet.json',
  'output/manual-device-acceptance-record.html',
  'output/manual-device-acceptance-record.md',
  'output/manual-device-acceptance-record.json',
  'output/deploy-transfer-plan.md',
  'output/deploy-transfer-plan.json',
  'output/release-evidence.md',
  'output/release-evidence.json',
  'output/release-artifacts.md',
  'output/release-artifacts.json'
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

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function readJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
}

function hasSecretBlock(path, buffer) {
  if (/\.zip$/i.test(path)) return [];
  const text = buffer.toString('utf8');
  return SECRET_BLOCK_PATTERNS.filter(pattern => pattern.test(text)).map(pattern => String(pattern));
}

async function main() {
  const generatedAt = new Date();
  const finalSummary = await readJson('output/10am-final-summary.json');
  const acceptanceEntry = await readJson('output/10am-acceptance.json');
  const artifacts = [];
  const missing = [];
  const secretFindings = [];

  for (const file of SNAPSHOT_FILES) {
    if (!existsSync(file)) {
      missing.push(file);
      continue;
    }
    const buffer = await readFile(file);
    const findings = hasSecretBlock(file, buffer);
    if (findings.length) secretFindings.push({ file, findings });
    artifacts.push({ file, bytes: buffer.byteLength, sha256: sha256(buffer) });
  }

  const combinedSha256 = sha256(Buffer.from(artifacts.map(item => `${item.sha256}  ${item.file}`).join('\n'), 'utf8'));
  const snapshot = {
    schema: 'pet-companion-10am-snapshot-lock-v1',
    generatedAt: generatedAt.toISOString(),
    generatedAtLocal: formatChinaTime(generatedAt),
    decision: acceptanceEntry && acceptanceEntry.launchDecision ? acceptanceEntry.launchDecision : (finalSummary && finalSummary.launchDecision ? finalSummary.launchDecision : 'UNKNOWN'),
    externalEvidence: acceptanceEntry && acceptanceEntry.externalEvidence ? acceptanceEntry.externalEvidence : (finalSummary && finalSummary.externalEvidence ? finalSummary.externalEvidence : { verified: 0, total: 0 }),
    latestAcceptanceBundle: {
      path: 'output/10am-acceptance-bundle-latest.zip',
      sha256: '',
      bytes: null,
      note: 'Archive is generated after this source-artifact snapshot; use output/10am-final-summary.json for the current zip hash.'
    },
    lock: {
      fileCount: artifacts.length,
      missingCount: missing.length,
      combinedSha256,
      secretFindingCount: secretFindings.length
    },
    artifacts,
    missing,
    secretFindings,
    boundary: [
      'This snapshot lock is local-only and does not deploy or upload.',
      'It hashes generated acceptance source artifacts so the meeting can verify one consistent material set.',
      'It excludes zip archives, final summary files, and snapshot files to avoid self-referential checksum drift.',
      'It excludes production.env, deploy target secrets, TLS private keys, cookies, tokens, and server homepage changes.'
    ]
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  const rows = artifacts.map(item => `| \`${item.file}\` | ${item.bytes} | \`${item.sha256}\` |`).join('\n');
  const markdown = `# Pet Companion 10am Snapshot Lock

- Generated at: ${snapshot.generatedAtLocal}
- Generated at UTC: ${snapshot.generatedAt}
- Launch decision: **${snapshot.decision}**
- External evidence: **${snapshot.externalEvidence.verified}/${snapshot.externalEvidence.total} verified**
- Latest acceptance bundle path: \`${snapshot.latestAcceptanceBundle.path}\`
- Archive reference note: ${snapshot.latestAcceptanceBundle.note}
- Snapshot files: ${snapshot.lock.fileCount}
- Missing files: ${snapshot.lock.missingCount}
- Combined SHA-256: \`${snapshot.lock.combinedSha256}\`
- Secret findings: ${snapshot.lock.secretFindingCount}

## Verify command

\`\`\`powershell
npm.cmd run acceptance:snapshot
npm.cmd run acceptance:final:check
npm.cmd run launch:status
\`\`\`

## Snapshot files

| File | bytes | SHA-256 |
| --- | ---: | --- |
${rows}

## Missing files

${missing.length ? missing.map(item => `- \`${item}\``).join('\n') : '- none'}

## Boundary

${snapshot.boundary.map(item => `- ${item}`).join('\n')}
`;
  await writeFile(markdownPath, markdown, 'utf8');

  const htmlRows = artifacts.map(item => `<tr><td><code>${escapeHtml(item.file)}</code></td><td>${item.bytes}</td><td><code>${item.sha256}</code></td></tr>`).join('');
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pet Companion 10am Snapshot Lock</title>
  <style>
    :root{--bg:#f7efe3;--card:#fffaf2;--text:#49372a;--muted:#8f7a6b;--line:#e7d8c8;--bad:#ce675e;--ok:#3aa866}
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 10% 0,#fff8e8,transparent 30%),var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;line-height:1.6}
    main{max-width:1120px;margin:0 auto;padding:28px 18px 46px}.hero,.card{background:rgba(255,250,242,.96);border:1px solid rgba(255,255,255,.84);border-radius:26px;box-shadow:0 18px 45px rgba(92,64,42,.12)}
    .hero{padding:28px;margin-bottom:16px}.card{padding:18px;margin:14px 0}h1{margin:0 0 8px;font-size:32px}.muted{color:var(--muted)}.bad{color:var(--bad);font-weight:900}.ok{color:var(--ok);font-weight:900}
    table{width:100%;border-collapse:collapse;background:#fffdf8;border-radius:16px;overflow:hidden}th,td{border-bottom:1px solid var(--line);padding:10px;text-align:left;vertical-align:top}th{background:#f2e6d8}code{background:#f5eadc;border-radius:8px;padding:2px 6px;word-break:break-all}pre{white-space:pre-wrap;background:#2b211a;color:#fff7eb;border-radius:16px;padding:12px;overflow:auto}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <h1>Pet Companion 10am Snapshot Lock</h1>
    <p class="muted">Generated at: ${escapeHtml(snapshot.generatedAtLocal)}</p>
    <p>Decision: <strong class="${snapshot.decision === 'GO' ? 'ok' : 'bad'}">${escapeHtml(snapshot.decision)}</strong> | External evidence: <strong>${snapshot.externalEvidence.verified}/${snapshot.externalEvidence.total} verified</strong></p>
    <p>Combined SHA-256: <code>${escapeHtml(snapshot.lock.combinedSha256)}</code></p>
    <p>Latest bundle path: <code>${escapeHtml(snapshot.latestAcceptanceBundle.path)}</code></p>
    <p class="muted">${escapeHtml(snapshot.latestAcceptanceBundle.note)}</p>
    <p class="muted">Archive files, final summary files, and snapshot files are not included in the combined hash.</p>
  </section>
  <section class="card"><h2>Verify command</h2><pre>npm.cmd run acceptance:snapshot
npm.cmd run acceptance:final:check
npm.cmd run launch:status</pre></section>
  <section class="card"><h2>Snapshot files</h2><table><thead><tr><th>File</th><th>bytes</th><th>SHA-256</th></tr></thead><tbody>${htmlRows}</tbody></table></section>
  <section class="card"><h2>Boundary</h2><ul>${snapshot.boundary.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>
</main>
</body>
</html>
`;
  await writeFile(htmlPath, html, 'utf8');

  console.log(`PASS 10am snapshot lock :: ${jsonPath}`);
  console.log(`PASS 10am snapshot lock :: ${markdownPath}`);
  console.log(`PASS 10am snapshot lock :: ${htmlPath}`);
  console.log(`10am snapshot lock: ${snapshot.lock.fileCount} files, combined sha256 ${snapshot.lock.combinedSha256}`);
  if (missing.length || secretFindings.length) process.exit(1);
}

main().catch(error => {
  console.error(`FAIL 10am snapshot lock :: ${error.message}`);
  process.exit(1);
});
