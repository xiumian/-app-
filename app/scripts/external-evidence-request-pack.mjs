import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const outputDir = 'output';
const evidencePath = `${outputDir}/production-evidence.json`;
const templatePath = 'deploy/production-evidence.example.json';
const jsonPath = `${outputDir}/external-evidence-request-pack.json`;
const markdownPath = `${outputDir}/external-evidence-request-pack.md`;
const htmlPath = `${outputDir}/external-evidence-request-pack.html`;
const OWNER_OUTPUT_FILES = [
  'output/external-evidence-request-ops.md',
  'output/external-evidence-request-ops.html',
  'output/external-evidence-request-ops.json',
  'output/external-evidence-request-legal.md',
  'output/external-evidence-request-legal.html',
  'output/external-evidence-request-legal.json',
  'output/external-evidence-request-qa.md',
  'output/external-evidence-request-qa.html',
  'output/external-evidence-request-qa.json'
];

function groupPaths(groupId) {
  return {
    jsonPath: `${outputDir}/external-evidence-request-${groupId}.json`,
    markdownPath: `${outputDir}/external-evidence-request-${groupId}.md`,
    htmlPath: `${outputDir}/external-evidence-request-${groupId}.html`
  };
}

const OWNER_GROUPS = {
  ops: {
    label: 'Ops / deployment owner',
    itemIds: ['domainTls', 'productionEnv', 'persistentStorage', 'objectStorage', 'monitoringAlerts', 'platformBackups']
  },
  legal: {
    label: 'Legal / operator owner',
    itemIds: ['legalApproval']
  },
  qa: {
    label: 'QA / device acceptance owner',
    itemIds: ['manualDeviceAcceptance']
  }
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

const SAFE_BOUNDARY = [
  'Only provide masked ticket ids, screenshot paths, dashboard links, document links, or acceptance record ids.',
  'Do not provide passwords, tokens, cookies, private keys, TLS PEM blocks, production env values, or object-storage secrets.',
  'This request pack does not deploy, upload, access servers, or modify the server homepage.'
];

const OWNER_SHORTCUT_COMMANDS = {
  ops: 'npm.cmd run external:evidence:next:ops',
  legal: 'npm.cmd run external:evidence:next:legal',
  qa: 'npm.cmd run external:evidence:next:qa'
};

const OWNER_RETURN_CHECKLIST = [
  'For every item, return one evidenceRef and proofRefs matching every requiredProof row.',
  'Use only masked ticket ids, screenshot paths, dashboard/document links, or acceptance record ids.',
  'Mark provided first; mark verified only after the release owner has reviewed all proofRefs.',
  'Keep Launch decision as NO_GO until launch:status reports 8/8 verified.'
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

function buildProofRefs(item) {
  const requiredProof = Array.isArray(item.requiredProof) ? item.requiredProof : [];
  return requiredProof.map((_, index) => ` --proof-ref "<${item.id}-proof-${index + 1}>"`).join('');
}

function buildUpdateCommand(item, status) {
  return `npm.cmd run external:evidence:update -- --id ${item.id} --status ${status} --owner "<owner-id>" --evidence-ref "<${item.id}-evidence-ticket-or-doc>"${buildProofRefs(item)}`;
}

function normalizeItem(item) {
  const requiredProof = Array.isArray(item.requiredProof) ? item.requiredProof : [];
  const proofRefs = Array.isArray(item.proofRefs) ? item.proofRefs : [];
  return {
    id: item.id,
    label: item.label || item.id,
    status: item.status || 'pending',
    owner: item.owner || '',
    evidenceRef: item.evidenceRef || '',
    requiredProof,
    proofRefs,
    missingProofCount: Math.max(requiredProof.length - proofRefs.length, 0),
    collectorCommand: COLLECTOR_COMMANDS[item.id] || '',
    providedCommand: buildUpdateCommand(item, 'provided'),
    verifiedCommand: buildUpdateCommand(item, 'verified')
  };
}

function markdownSectionForGroup(group) {
  const handoff = group.handoffMessage ? `### 10am owner handoff message\n\nShortcut command: \`${group.shortcutCommand || ''}\`\n\nHandoff text:\n\n${group.handoffMessage}\n\nOwner return checklist:\n\n${(group.returnChecklist || []).map(item => `- ${item}`).join('\n')}\n\n` : '';
  const rows = group.items.map(item => `| \`${escapePipes(item.id)}\` | ${escapePipes(item.label)} | ${escapePipes(item.status)} | ${item.proofRefs.length}/${item.requiredProof.length} |`);
  const details = group.items.map(item => {
    const proofLines = item.requiredProof.length
      ? item.requiredProof.map((proof, index) => `${index + 1}. ${proof}${item.proofRefs[index] ? ` (${item.proofRefs[index]})` : ' (missing)'}`).join('\n')
      : 'No requiredProof registered.';
    return `### ${item.label}

- ID: \`${item.id}\`
- Current status: **${item.status}**
- Current proofRefs: ${item.proofRefs.length}/${item.requiredProof.length}

Requested proof:

${proofLines}

Collector command:

\`\`\`powershell
${item.collectorCommand || '# no collector command available'}
\`\`\`

Register as provided:

\`\`\`powershell
${item.providedCommand}
\`\`\`

Register as verified after human review:

\`\`\`powershell
${item.verifiedCommand}
\`\`\`
`;
  });
  return `## ${group.label}

${handoff}| ID | Item | Status | proofRefs |
| --- | --- | --- | --- |
${rows.join('\n')}

${details.join('\n')}
`;
}

function htmlFor(pack) {
  const groupCards = pack.groups.map(group => {
    const handoff = group.handoffMessage ? `<div class="handoff"><h3>10am owner handoff message</h3><p><strong>Shortcut command:</strong> <code>${escapeHtml(group.shortcutCommand || '')}</code></p><pre>${escapeHtml(group.handoffMessage)}</pre><h4>Owner return checklist</h4><ul>${(group.returnChecklist || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : '';
    const itemCards = group.items.map(item => {
      const proofs = item.requiredProof.map((proof, index) => `<li>${escapeHtml(proof)} <code>${escapeHtml(item.proofRefs[index] || 'missing')}</code></li>`).join('');
      return `<article class="item"><h3>${escapeHtml(item.label)}</h3><p><code>${escapeHtml(item.id)}</code> <span class="pill">${escapeHtml(item.status)}</span> proofRefs ${item.proofRefs.length}/${item.requiredProof.length}</p><h4>Requested proof</h4><ol>${proofs}</ol><h4>Collector command</h4><pre>${escapeHtml(item.collectorCommand || '# no collector command available')}</pre><h4>Update command</h4><pre>${escapeHtml(item.providedCommand)}</pre></article>`;
    }).join('\n');
    return `<section class="card"><h2>${escapeHtml(group.label)}</h2>${handoff}${itemCards}</section>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pet Companion External Evidence Request Pack</title>
  <style>
    :root{--bg:#f7efe3;--card:#fffaf2;--text:#49372a;--muted:#8f7a6b;--line:#e7d8c8;--coffee:#8f6545;--bad:#ce675e}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;line-height:1.6}
    main{max-width:1080px;margin:0 auto;padding:28px 18px 48px}.hero,.card,.item{background:rgba(255,250,242,.96);border:1px solid rgba(255,255,255,.8);border-radius:24px;box-shadow:0 18px 45px rgba(92,64,42,.1)}
    .hero{padding:26px;margin-bottom:16px}.card{padding:18px;margin:16px 0}.item{padding:16px;margin:14px 0;box-shadow:none;border-color:var(--line)}
    h1{margin:0 0 8px;font-size:31px}h2{margin:0 0 8px}h3{margin:0 0 6px}.muted{color:var(--muted)}.pill{display:inline-flex;border-radius:999px;padding:4px 9px;background:#fff0ec;color:var(--bad);font-weight:900}
    code{background:#f5eadc;border-radius:8px;padding:2px 6px}pre{white-space:pre-wrap;background:#2b211a;color:#fff7eb;border-radius:16px;padding:12px;overflow:auto}li{margin:6px 0}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <h1>Pet Companion External Evidence Request Pack</h1>
    <p class="muted">Generated at: ${escapeHtml(pack.generatedAtLocal)} | Source: <code>${escapeHtml(pack.source)}</code></p>
    <p>Verified: <strong>${pack.summary.verified}/${pack.summary.total}</strong> | Pending: <strong>${pack.summary.pending}</strong></p>
    <p>This pack is for masked evidence collection only. It does not deploy, upload, access servers, or modify the server homepage.</p>
  </section>
  ${groupCards}
</main>
</body>
</html>
`;
}

function htmlForGroup(pack, group) {
  const handoff = group.handoffMessage ? `<div class="handoff"><h2>10am owner handoff message</h2><p><strong>Shortcut command:</strong> <code>${escapeHtml(group.shortcutCommand || '')}</code></p><pre>${escapeHtml(group.handoffMessage)}</pre><h3>Owner return checklist</h3><ul>${(group.returnChecklist || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : '';
  const itemCards = group.items.map(item => {
    const proofs = item.requiredProof.map((proof, index) => `<li>${escapeHtml(proof)} <code>${escapeHtml(item.proofRefs[index] || 'missing')}</code></li>`).join('');
    return `<article class="item"><h3>${escapeHtml(item.label)}</h3><p><code>${escapeHtml(item.id)}</code> <span class="pill">${escapeHtml(item.status)}</span> proofRefs ${item.proofRefs.length}/${item.requiredProof.length}</p><h4>Requested proof</h4><ol>${proofs}</ol><h4>Collector command</h4><pre>${escapeHtml(item.collectorCommand || '# no collector command available')}</pre><h4>Register as provided</h4><pre>${escapeHtml(item.providedCommand)}</pre><h4>Register as verified after review</h4><pre>${escapeHtml(item.verifiedCommand)}</pre></article>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(group.label)} Evidence Request</title>
  <style>
    :root{--bg:#f7efe3;--card:#fffaf2;--text:#49372a;--muted:#8f7a6b;--line:#e7d8c8;--bad:#ce675e}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;line-height:1.6}
    main{max-width:980px;margin:0 auto;padding:28px 18px 48px}.hero,.item,.handoff{background:rgba(255,250,242,.96);border:1px solid rgba(255,255,255,.8);border-radius:24px;box-shadow:0 18px 45px rgba(92,64,42,.1)}
    .hero{padding:26px;margin-bottom:16px}.handoff,.item{padding:16px;margin:14px 0;border-color:var(--line);box-shadow:none}
    h1{margin:0 0 8px;font-size:30px}.muted{color:var(--muted)}.pill{display:inline-flex;border-radius:999px;padding:4px 9px;background:#fff0ec;color:var(--bad);font-weight:900}
    code{background:#f5eadc;border-radius:8px;padding:2px 6px}pre{white-space:pre-wrap;background:#2b211a;color:#fff7eb;border-radius:16px;padding:12px;overflow:auto}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <h1>${escapeHtml(group.label)} Evidence Request</h1>
    <p class="muted">Generated at: ${escapeHtml(pack.generatedAtLocal)} | Source: <code>${escapeHtml(pack.source)}</code></p>
    <p>Items: <strong>${group.items.length}</strong>. Return masked evidence references only.</p>
    <p>This file does not deploy, upload, access servers, or modify the server homepage.</p>
  </section>
  ${handoff}
  ${itemCards}
</main>
</body>
</html>
`;
}

function handoffMessageForGroup(group) {
  const labels = group.items.map(item => `${item.id}: ${item.label}`).join('\n- ');
  return `Please complete the external launch evidence for ${group.label} before the 10am acceptance review.

Run this shortcut first: ${group.shortcutCommand || ''}

Items to return:
- ${labels}

Return only masked evidenceRef and proofRef values, such as ticket ids, screenshot paths, dashboard links, document links, or acceptance record ids. Do not return passwords, tokens, cookies, private keys, TLS PEM blocks, production.env values, or object-storage secrets.`;
}

function markdownForGroup(pack, group) {
  return `# ${group.label} Evidence Request

- Generated at: ${pack.generatedAtLocal}
- Generated at UTC: ${pack.generatedAt}
- Source: \`${pack.source}\`
- Items: ${group.items.length}

## Safety boundary

${SAFE_BOUNDARY.map(item => `- ${item}`).join('\n')}

## Return format

- Return only masked ticket ids, screenshot paths, dashboard links, document links, or acceptance record ids.
- Do not paste secrets, env values, private keys, certificate PEM blocks, cookies, or tokens.
- After evidence is reviewed, register with the provided \`external:evidence:update\` command.

${markdownSectionForGroup(group)}
`;
}

async function main() {
  const generatedAt = new Date();
  const source = existsSync(evidencePath) ? evidencePath : templatePath;
  const evidence = await readJson(source);
  const rawItems = Array.isArray(evidence?.items) ? evidence.items : [];
  const itemById = new Map(rawItems.map(item => [item.id, normalizeItem(item)]));
  const groups = Object.entries(OWNER_GROUPS).map(([id, group]) => {
    const built = {
      id,
      label: group.label,
      output: groupPaths(id),
      shortcutCommand: OWNER_SHORTCUT_COMMANDS[id],
      returnChecklist: OWNER_RETURN_CHECKLIST,
      items: group.itemIds.map(itemId => itemById.get(itemId)).filter(Boolean)
    };
    built.handoffMessage = handoffMessageForGroup(built);
    return built;
  });
  const items = groups.flatMap(group => group.items);
  const pack = {
    schema: 'pet-companion-external-evidence-request-pack-v1',
    generatedAt: generatedAt.toISOString(),
    generatedAtLocal: formatChinaTime(generatedAt),
    source,
    output: { jsonPath, markdownPath, htmlPath, ownerFiles: OWNER_OUTPUT_FILES },
    boundary: SAFE_BOUNDARY,
    summary: {
      total: items.length,
      verified: items.filter(item => item.status === 'verified').length,
      provided: items.filter(item => item.status === 'provided').length,
      pending: items.filter(item => item.status !== 'verified').length
    },
    groups
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(pack, null, 2)}\n`, 'utf8');

  const markdown = `# Pet Companion External Evidence Request Pack

- Generated at: ${pack.generatedAtLocal}
- Generated at UTC: ${pack.generatedAt}
- Source: \`${source}\`
- Verified: ${pack.summary.verified}/${pack.summary.total}
- Pending: ${pack.summary.pending}

## Safety boundary

${SAFE_BOUNDARY.map(item => `- ${item}`).join('\n')}

## How to use

1. Send each owner section to the matching Ops, Legal, or QA owner.
2. Ask owners to return masked evidence references only.
3. Run the collector command when the required external target is available.
4. Register only reviewed evidence with \`external:evidence:update\`.
5. Re-run \`npm.cmd run launch:status\`; Keep NO_GO until all 8/8 items are verified.

${pack.groups.map(markdownSectionForGroup).join('\n')}
`;
  await writeFile(markdownPath, markdown, 'utf8');
  await writeFile(htmlPath, htmlFor(pack), 'utf8');
  for (const group of pack.groups) {
    await writeFile(group.output.jsonPath, `${JSON.stringify({ ...pack, groups: [group] }, null, 2)}\n`, 'utf8');
    await writeFile(group.output.markdownPath, markdownForGroup(pack, group), 'utf8');
    await writeFile(group.output.htmlPath, htmlForGroup(pack, group), 'utf8');
  }

  console.log(`PASS external evidence request pack :: ${jsonPath}`);
  console.log(`PASS external evidence request pack :: ${markdownPath}`);
  console.log(`PASS external evidence request pack :: ${htmlPath}`);
  for (const group of pack.groups) {
    console.log(`PASS external evidence request ${group.id} :: ${group.output.markdownPath}`);
    console.log(`PASS external evidence request ${group.id} :: ${group.output.htmlPath}`);
  }
  console.log(`external evidence request pack pending: ${pack.summary.pending}/${pack.summary.total}`);
}

main().catch(error => {
  console.error(`FAIL external evidence request pack :: ${error.message}`);
  process.exit(1);
});
