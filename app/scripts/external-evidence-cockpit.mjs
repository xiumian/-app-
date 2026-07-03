import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const outputDir = 'output';
const evidencePath = `${outputDir}/production-evidence.json`;
const templatePath = 'deploy/production-evidence.example.json';
const jsonPath = `${outputDir}/external-evidence-cockpit.json`;
const markdownPath = `${outputDir}/external-evidence-cockpit.md`;
const htmlPath = `${outputDir}/external-evidence-cockpit.html`;

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

const COLLECTOR_FILES = {
  domainTls: 'output/domain-tls-evidence-latest.json',
  productionEnv: 'output/production-env-evidence-latest.json',
  persistentStorage: 'output/storage-evidence-latest.json',
  objectStorage: 'output/storage-evidence-latest.json',
  monitoringAlerts: 'output/ops-evidence-latest.json',
  platformBackups: 'output/ops-evidence-latest.json',
  legalApproval: 'output/release-approval-evidence-latest.json',
  manualDeviceAcceptance: 'output/release-approval-evidence-latest.json'
};

const COLLECTOR_COMMANDS = {
  domainTls: 'npm.cmd run external:evidence:domain-tls -- --url "https://<production-app-url>" --api-health-url "https://<production-app-url>/api/health" --gateway-ref "<gateway-or-nginx-ticket>" --owner "<owner-id>"',
  productionEnv: 'npm.cmd run external:evidence:production-env -- --file deploy/production.env --review-ref "<masked-env-review-ticket>" --owner "<owner-id>"',
  persistentStorage: 'npm.cmd run external:evidence:storage -- --data-dir /data --sqlite-file /data/pet-companion.sqlite --media-dir /data/media --storage-ref "<volume-or-db-ticket>" --restart-ref "<restart-retention-ticket>" --restore-owner-ref "<restore-owner-ticket>" --media-mount-ref "<media-volume-ticket>" --media-upload-ref "<upload-read-ticket>" --media-restart-ref "<media-restart-ticket>" --owner "<owner-id>"',
  objectStorage: 'npm.cmd run external:evidence:storage -- --data-dir /data --sqlite-file /data/pet-companion.sqlite --media-dir /data/media --storage-ref "<volume-or-db-ticket>" --restart-ref "<restart-retention-ticket>" --restore-owner-ref "<restore-owner-ticket>" --media-mount-ref "<media-volume-ticket>" --media-upload-ref "<upload-read-ticket>" --media-restart-ref "<media-restart-ticket>" --owner "<owner-id>"',
  monitoringAlerts: 'npm.cmd run external:evidence:ops -- --monitoring-url "https://<monitoring-dashboard-or-endpoint>" --alert-ref "<alert-rule-ticket>" --recipient-ref "<oncall-recipient-ticket>" --backup-job-ref "<backup-job-ticket>" --retention-ref "<retention-offsite-ticket>" --restore-drill-ref "<restore-drill-ticket>" --restore-owner-ref "<restore-owner-ticket>" --owner "<owner-id>"',
  platformBackups: 'npm.cmd run external:evidence:ops -- --monitoring-url "https://<monitoring-dashboard-or-endpoint>" --alert-ref "<alert-rule-ticket>" --recipient-ref "<oncall-recipient-ticket>" --backup-job-ref "<backup-job-ticket>" --retention-ref "<retention-offsite-ticket>" --restore-drill-ref "<restore-drill-ticket>" --restore-owner-ref "<restore-owner-ticket>" --owner "<owner-id>"',
  legalApproval: 'npm.cmd run external:evidence:release-approval -- --operator-ref "<operator-ticket>" --support-ref "<support-channel-ticket>" --policy-version-ref "<policy-version-ticket>" --legal-review-ref "<regional-legal-review-ticket>" --device-matrix-ref "<device-matrix-ticket>" --core-flow-ref "<core-flow-screenshots-ticket>" --offline-pwa-delete-ref "<offline-pwa-delete-ticket>" --retest-conclusion-ref "<final-retest-ticket>" --owner "<owner-id>"',
  manualDeviceAcceptance: 'npm.cmd run external:evidence:release-approval -- --operator-ref "<operator-ticket>" --support-ref "<support-channel-ticket>" --policy-version-ref "<policy-version-ticket>" --legal-review-ref "<regional-legal-review-ticket>" --device-matrix-ref "<device-matrix-ticket>" --core-flow-ref "<core-flow-screenshots-ticket>" --offline-pwa-delete-ref "<offline-pwa-delete-ticket>" --retest-conclusion-ref "<final-retest-ticket>" --owner "<owner-id>"'
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

async function readText(path) {
  if (!existsSync(path)) return '';
  return readFile(path, 'utf8');
}

async function readJson(path) {
  const text = await readText(path);
  if (!text) return null;
  return JSON.parse(text.replace(/^\uFEFF/, ''));
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

function statusLabel(status) {
  if (status === 'verified') return 'verified';
  if (status === 'provided') return 'provided';
  return 'pending';
}

function statusClass(status) {
  if (status === 'verified') return 'ok';
  if (status === 'provided') return 'warn';
  return 'bad';
}

function boolLabel(value) {
  return value === true ? 'yes' : 'no';
}

function getCollectorReadiness(id, collector) {
  if (!collector) return { latestExists: false, generatedAt: '', readyForProvided: false, readyForVerified: false, note: 'latest collector output missing' };
  const summary = collector.summary || {};
  const map = {
    domainTls: ['readyForProvided', 'readyForVerified'],
    productionEnv: ['readyForProvided', 'readyForVerified'],
    persistentStorage: ['persistentReadyForProvided', 'persistentReadyForVerified'],
    objectStorage: ['objectReadyForProvided', 'objectReadyForVerified'],
    monitoringAlerts: ['monitoringReadyForProvided', 'monitoringReadyForVerified'],
    platformBackups: ['backupReadyForProvided', 'backupReadyForVerified'],
    legalApproval: ['legalReadyForProvided', 'legalReadyForVerified'],
    manualDeviceAcceptance: ['manualReadyForProvided', 'manualReadyForVerified']
  };
  const keys = map[id] || ['readyForProvided', 'readyForVerified'];
  return {
    latestExists: true,
    generatedAt: collector.generatedAt || '',
    generatedAtLocal: collector.generatedAtLocal || '',
    readyForProvided: summary[keys[0]] === true,
    readyForVerified: summary[keys[1]] === true,
    note: collector.schema || 'collector output'
  };
}

function getCoverage(id, collector) {
  if (!collector) return [];
  if (Array.isArray(collector.requiredProofCoverage)) return collector.requiredProofCoverage;
  const section = collector[id] || {};
  if (Array.isArray(section.requiredProofCoverage)) return section.requiredProofCoverage;
  return [];
}

function getSuggestedCommand(id, collector) {
  if (!collector) return COLLECTOR_COMMANDS[id] || '';
  if (typeof collector.suggestedUpdateCommand === 'string') return collector.suggestedUpdateCommand;
  if (collector.suggestedCommands && typeof collector.suggestedCommands[id] === 'string') return collector.suggestedCommands[id];
  return COLLECTOR_COMMANDS[id] || '';
}

function buildUpdateCommand(item, status) {
  const owner = item.owner && !item.owner.includes('owner') ? item.owner : '<owner-id>';
  const evidenceRef = item.evidenceRef && !item.evidenceRef.includes('ticket') ? item.evidenceRef : '<evidence-ticket-or-doc-link>';
  const requiredProof = Array.isArray(item.requiredProof) ? item.requiredProof : [];
  const refs = requiredProof.map((_, index) => ` --proof-ref "<${item.id}-proof-${index + 1}>"`).join('');
  return `npm.cmd run external:evidence:update -- --id ${item.id} --status ${status} --owner "${owner}" --evidence-ref "${evidenceRef}"${refs}`;
}

async function main() {
  const generatedAt = new Date();
  const evidenceSource = existsSync(evidencePath) ? evidencePath : templatePath;
  const productionEvidence = await readJson(evidenceSource);
  const collectorCache = new Map();
  for (const id of PRIORITY) {
    const file = COLLECTOR_FILES[id];
    if (!collectorCache.has(file)) collectorCache.set(file, await readJson(file));
  }

  const rawItems = Array.isArray(productionEvidence && productionEvidence.items) ? productionEvidence.items : [];
  const itemById = new Map(rawItems.map(item => [item.id, item]));
  const items = PRIORITY.map((id, index) => {
    const item = itemById.get(id) || { id, label: id, status: 'pending', requiredProof: [] };
    const collectorPath = COLLECTOR_FILES[id];
    const collector = collectorCache.get(collectorPath);
    const readiness = getCollectorReadiness(id, collector);
    const coverage = getCoverage(id, collector);
    const registeredProofRefs = Array.isArray(item.proofRefs) ? item.proofRefs : [];
    const requiredProof = Array.isArray(item.requiredProof) ? item.requiredProof : [];
    return {
      order: index + 1,
      id,
      label: item.label || id,
      status: statusLabel(item.status),
      owner: item.owner || '',
      evidenceRef: item.evidenceRef || '',
      checkedAt: item.checkedAt || '',
      requiredProof,
      registeredProofRefs,
      registeredProofCoverage: `${registeredProofRefs.length}/${requiredProof.length}`,
      missingRegisteredProofCount: Math.max(requiredProof.length - registeredProofRefs.length, 0),
      collector: {
        path: collectorPath,
        command: COLLECTOR_COMMANDS[id] || '',
        suggestedUpdateCommand: getSuggestedCommand(id, collector),
        coverage,
        coveredCount: coverage.filter(proof => proof && proof.covered === true).length,
        coverageCount: coverage.length,
        ...readiness
      },
      providedCommand: buildUpdateCommand(item, 'provided'),
      verifiedCommand: buildUpdateCommand(item, 'verified')
    };
  });

  const summary = {
    total: items.length,
    verified: items.filter(item => item.status === 'verified').length,
    provided: items.filter(item => item.status === 'provided').length,
    pending: items.filter(item => item.status === 'pending').length,
    blocked: items.filter(item => item.status !== 'verified').length,
    collectorsReadyForProvided: items.filter(item => item.collector.readyForProvided).length,
    collectorsReadyForVerified: items.filter(item => item.collector.readyForVerified).length
  };

  const cockpit = {
    schema: 'pet-companion-external-evidence-cockpit-v1',
    generatedAt: generatedAt.toISOString(),
    generatedAtLocal: formatChinaTime(generatedAt),
    source: evidenceSource,
    output: { jsonPath, markdownPath, htmlPath },
    summary,
    purpose: 'One-page release window cockpit for the eight external launch blockers. It stores masked evidence references only and never stores passwords, tokens, cookies, private keys, TLS PEM, or production secret values.',
    items
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(cockpit, null, 2)}\n`, 'utf8');

  const summaryRows = items.map(item => `| ${item.order} | \`${escapePipes(item.id)}\` | ${escapePipes(item.label)} | ${item.status} | ${boolLabel(item.collector.latestExists)} | ${boolLabel(item.collector.readyForProvided)} | ${boolLabel(item.collector.readyForVerified)} | ${item.registeredProofCoverage} |`);
  const detailSections = items.map(item => {
    const coverageRows = item.collector.coverage.length
      ? item.collector.coverage.map((proof, index) => `| ${index + 1} | ${escapePipes(proof.requiredProof || '')} | ${boolLabel(proof.covered === true)} | ${escapePipes(proof.proofRef || '')} |`).join('\n')
      : '| 1 | latest collector output missing | no |  |';
    return `### ${item.order}. ${item.label}

- ID: \`${item.id}\`
- Registered status: **${item.status}**
- Registered proofRefs: ${item.registeredProofCoverage}
- Collector latest: \`${item.collector.path}\` (${item.collector.latestExists ? 'exists' : 'missing'})
- Collector readyForProvided: ${boolLabel(item.collector.readyForProvided)}
- Collector readyForVerified: ${boolLabel(item.collector.readyForVerified)}

Collector command:

\`\`\`powershell
${item.collector.command}
\`\`\`

Suggested update from collector:

\`\`\`powershell
${item.collector.suggestedUpdateCommand || '# collect evidence first'}
\`\`\`

Manual registration skeleton:

\`\`\`powershell
${item.providedCommand}
${item.verifiedCommand}
\`\`\`

Collector coverage:

| # | requiredProof | covered | proofRef |
| ---: | --- | --- | --- |
${coverageRows}
`;
  });

  const markdown = `# Pet Companion External Evidence Cockpit

- Generated at: ${cockpit.generatedAtLocal}
- Generated at UTC: ${cockpit.generatedAt}
- Source: \`${cockpit.source}\`
- Outputs: \`${jsonPath}\` / \`${markdownPath}\` / \`${htmlPath}\`

## Decision

- External evidence verified: ${summary.verified}/${summary.total}
- Still blocking launch: ${summary.blocked}
- Collector readyForProvided: ${summary.collectorsReadyForProvided}/${summary.total}
- Collector readyForVerified: ${summary.collectorsReadyForVerified}/${summary.total}
- The real launch decision must still come from \`npm.cmd run launch:status\`. Keep NO_GO until all 8/8 items are verified.

## Overview

| Priority | ID | Item | Registered status | Latest collector | Ready provided | Ready verified | Registered proofRefs |
| ---: | --- | --- | --- | --- | --- | --- | --- |
${summaryRows.join('\n')}

## Details

${detailSections.join('\n')}

## Boundary

This cockpit only aggregates masked evidence references and local output paths. It does not contain passwords, tokens, cookies, private keys, TLS certificate PEM blocks, or production secret values. It does not deploy, upload, or modify the server homepage.
`;
  await writeFile(markdownPath, markdown, 'utf8');

  const rows = items.map(item => `<tr><td>${item.order}</td><td><code>${escapeHtml(item.id)}</code></td><td>${escapeHtml(item.label)}</td><td><span class="pill ${statusClass(item.status)}">${escapeHtml(item.status)}</span></td><td>${escapeHtml(item.registeredProofCoverage)}</td><td>${boolLabel(item.collector.latestExists)}</td><td>${boolLabel(item.collector.readyForProvided)}</td><td>${boolLabel(item.collector.readyForVerified)}</td></tr>`).join('\n');
  const cards = items.map(item => {
    const coverage = item.collector.coverage.length
      ? item.collector.coverage.map(proof => `<li><strong>${proof.covered === true ? 'yes' : 'no'}</strong> - ${escapeHtml(proof.requiredProof || '')}<br><code>${escapeHtml(proof.proofRef || 'missing')}</code></li>`).join('')
      : '<li><strong>no</strong> - latest collector output missing</li>';
    return `<section class="card"><h2>${item.order}. ${escapeHtml(item.label)}</h2><p><code>${escapeHtml(item.id)}</code> <span class="pill ${statusClass(item.status)}">${escapeHtml(item.status)}</span></p><p>Registered proofRefs: <strong>${escapeHtml(item.registeredProofCoverage)}</strong> | Collector readyForVerified: <strong>${boolLabel(item.collector.readyForVerified)}</strong></p><p>Collector latest: <code>${escapeHtml(item.collector.path)}</code></p><details><summary>Collector command</summary><pre>${escapeHtml(item.collector.command)}</pre></details><details><summary>Registration command</summary><pre>${escapeHtml(item.collector.suggestedUpdateCommand || item.verifiedCommand)}</pre></details><ul>${coverage}</ul></section>`;
  }).join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pet Companion External Evidence Cockpit</title>
  <style>
    :root{--bg:#f7efe3;--card:#fffaf2;--text:#49372a;--muted:#8f7a6b;--line:#e7d8c8;--coffee:#8f6545;--bad:#ce675e;--ok:#3aa866;--warn:#b67a22}
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 8% 0,#fff7e6,transparent 32%),var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;line-height:1.62}
    main{max-width:1120px;margin:0 auto;padding:28px 18px 52px}.hero,.card{background:rgba(255,250,242,.96);border:1px solid rgba(255,255,255,.82);border-radius:26px;box-shadow:0 18px 45px rgba(92,64,42,.12)}.hero{padding:28px;margin-bottom:16px}.card{padding:18px;margin:14px 0}
    h1{margin:0 0 8px;font-size:32px;letter-spacing:-.04em}h2{margin:0 0 8px;font-size:20px}.muted{color:var(--muted)}.pill{display:inline-flex;border-radius:999px;padding:5px 10px;font-weight:900;background:#f3eadf;color:var(--coffee);margin:3px}.pill.ok{background:#e9faef;color:var(--ok)}.pill.bad{background:#fff0ec;color:var(--bad)}.pill.warn{background:#fff5df;color:var(--warn)}
    table{width:100%;border-collapse:collapse;background:#fffdf8;border-radius:16px;overflow:hidden}th,td{border-bottom:1px solid var(--line);padding:10px;text-align:left;vertical-align:top}th{background:#f2e6d8}code{background:#f5eadc;border-radius:8px;padding:2px 6px}pre{white-space:pre-wrap;background:#2b211a;color:#fff7eb;border-radius:16px;padding:12px;overflow:auto}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}.danger{color:var(--bad);font-weight:900}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <h1>Pet Companion External Evidence Cockpit</h1>
    <p class="muted">Generated at: ${escapeHtml(cockpit.generatedAtLocal)} | Source: <code>${escapeHtml(cockpit.source)}</code></p>
    <span class="pill ${summary.verified === summary.total ? 'ok' : 'bad'}">verified: ${summary.verified}/${summary.total}</span>
    <span class="pill ${summary.blocked === 0 ? 'ok' : 'bad'}">blocked: ${summary.blocked}</span>
    <span class="pill warn">collector readyForVerified: ${summary.collectorsReadyForVerified}/${summary.total}</span>
    <p><strong>Decision:</strong> Keep <strong class="danger">NO_GO</strong> until all 8/8 external evidence items are verified. This page only coordinates evidence work; it does not deploy, upload, or modify the server homepage.</p>
  </section>
  <section class="card"><h2>Eight-item overview</h2><table><thead><tr><th>#</th><th>ID</th><th>Item</th><th>Status</th><th>proofRefs</th><th>Collector</th><th>Provided</th><th>Verified</th></tr></thead><tbody>${rows}</tbody></table></section>
  <section class="grid">${cards}</section>
</main>
</body>
</html>
`;
  await writeFile(htmlPath, html, 'utf8');

  console.log(`PASS external evidence cockpit :: ${jsonPath}`);
  console.log(`PASS external evidence cockpit :: ${markdownPath}`);
  console.log(`PASS external evidence cockpit :: ${htmlPath}`);
  console.log(`external evidence verified: ${summary.verified}/${summary.total}`);
  console.log(`external evidence blocked: ${summary.blocked}`);
}

main().catch(error => {
  console.error(`FAIL external evidence cockpit :: ${error.message}`);
  process.exit(1);
});
