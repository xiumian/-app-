import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const outputDir = 'output';
const jsonPath = `${outputDir}/10am-signoff-sheet.json`;
const markdownPath = `${outputDir}/10am-signoff-sheet.md`;
const htmlPath = `${outputDir}/10am-signoff-sheet.html`;

const OWNER_GROUPS = {
  ops: ['domainTls', 'productionEnv', 'persistentStorage', 'objectStorage', 'monitoringAlerts', 'platformBackups'],
  legal: ['legalApproval'],
  qa: ['manualDeviceAcceptance']
};

const OWNER_COMMANDS = {
  ops: 'npm.cmd run external:evidence:next:ops',
  legal: 'npm.cmd run external:evidence:next:legal',
  qa: 'npm.cmd run external:evidence:next:qa'
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
  return { ok: result.status === 0 && value && !parseError, value, parseError, exitCode: result.status };
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

function ownerGroupFor(id) {
  for (const [group, ids] of Object.entries(OWNER_GROUPS)) {
    if (ids.includes(id)) return group;
  }
  return 'release';
}

function ownerCommand(group) {
  return OWNER_COMMANDS[group] || 'npm.cmd run external:evidence:next -- --commands';
}

function statusText(status) {
  if (status === 'verified') return 'verified';
  if (status === 'provided') return 'provided, needs review';
  return 'pending';
}

function buildOwnerRows(blockers) {
  return Object.keys(OWNER_GROUPS).map(group => {
    const items = blockers.filter(item => ownerGroupFor(item.id) === group);
    return {
      group,
      command: ownerCommand(group),
      blockerCount: items.length,
      blockerIds: items.map(item => item.id),
      signoffRequired: items.length > 0,
      signoffStatus: items.length > 0 ? 'pending' : 'not_required',
      signerName: '',
      evidenceRefs: '',
      reviewedAt: '',
      notes: items.length > 0 ? 'Need masked evidenceRef and proofRefs before verified.' : 'No blocker assigned.'
    };
  });
}

async function main() {
  const generatedAt = new Date();
  const launchResult = runLaunchStatus();
  const launch = launchResult.value || {};
  const evidence = await readJson('output/production-evidence.json');
  const latestZip = await readJson('output/10am-acceptance-bundle-latest.json');
  const blockers = Array.isArray(launch.external && launch.external.blockers) ? launch.external.blockers : [];
  const allItems = Array.isArray(evidence && evidence.items) ? evidence.items : blockers;
  const ownerRows = buildOwnerRows(blockers);
  const externalVerified = launch.external && launch.external.verified != null ? launch.external.verified : 0;
  const externalTotal = launch.external && launch.external.total != null ? launch.external.total : allItems.length;

  const sheet = {
    schema: 'pet-companion-10am-signoff-sheet-v1',
    generatedAt: generatedAt.toISOString(),
    generatedAtLocal: formatChinaTime(generatedAt),
    launchDecision: launch.decision || 'UNKNOWN',
    externalEvidence: {
      verified: externalVerified,
      total: externalTotal,
      blockers
    },
    latestAcceptanceBundle: {
      path: latestZip && latestZip.latestZipPath ? latestZip.latestZipPath : 'output/10am-acceptance-bundle-latest.zip',
      sha256: latestZip && latestZip.sha256 ? latestZip.sha256 : '',
      bytes: latestZip && latestZip.bytes != null ? latestZip.bytes : null
    },
    ownerRows,
    finalReleaseOwner: {
      signerName: '',
      decision: launch.decision === 'GO' ? 'GO candidate' : 'NO_GO confirmed',
      notes: 'Final release owner must keep NO_GO until launch:status reports GO and external evidence is fully verified.'
    },
    boundary: [
      'This sheet is local-only and does not deploy or upload.',
      'Do not paste passwords, tokens, cookies, private keys, TLS PEM blocks, production.env values, or object-storage secrets.',
      'Only record masked ticket ids, screenshot paths, dashboard links, document links, or acceptance record ids.'
    ],
    commands: [
      'npm.cmd run launch:status',
      'npm.cmd run acceptance:decision',
      'npm.cmd run external:evidence:next:ops',
      'npm.cmd run external:evidence:next:legal',
      'npm.cmd run external:evidence:next:qa',
      'npm.cmd run acceptance:final'
    ]
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(sheet, null, 2)}\n`, 'utf8');

  const ownerTable = ownerRows.map(row => `| ${escapePipes(row.group)} | ${row.blockerCount} | ${escapePipes(row.blockerIds.join(', ') || 'none')} | ${escapePipes(row.command)} | ${row.signoffStatus} | __________ | __________ |`);
  const blockerTable = blockers.map(item => `| ${escapePipes(ownerGroupFor(item.id))} | \`${escapePipes(item.id)}\` | ${escapePipes(statusText(item.status))} | ${escapePipes(item.label)} |`);
  const markdown = `# Pet Companion 10am Signoff Sheet

- Generated at: ${sheet.generatedAtLocal}
- Generated at UTC: ${sheet.generatedAt}
- Launch decision: **${sheet.launchDecision}**
- External evidence: **${externalVerified}/${externalTotal} verified**
- Latest acceptance bundle: \`${sheet.latestAcceptanceBundle.path}\`
- Bundle SHA-256: \`${sheet.latestAcceptanceBundle.sha256 || 'missing'}\`

## Signoff rule

Final release stays **NO_GO** until every owner row is signed with masked evidence references and \`npm.cmd run launch:status\` reports GO.

## Owner signoff rows

| Owner group | Blockers | IDs | Shortcut command | Status | Signer | Evidence refs |
| --- | ---: | --- | --- | --- | --- | --- |
${ownerTable.join('\n')}

## Final release owner

| Field | Value |
| --- | --- |
| Release owner signer | __________ |
| Decision | ${escapePipes(sheet.finalReleaseOwner.decision)} |
| Notes | ${escapePipes(sheet.finalReleaseOwner.notes)} |

## External blockers

${blockerTable.length ? `| Owner | ID | Status | Item |\n| --- | --- | --- | --- |\n${blockerTable.join('\n')}` : 'No external blockers.'}

## Boundary

${sheet.boundary.map(item => `- ${item}`).join('\n')}

## Commands

\`\`\`powershell
${sheet.commands.join('\n')}
\`\`\`
`;
  await writeFile(markdownPath, markdown, 'utf8');

  const ownerHtml = ownerRows.map(row => `<tr><td>${escapeHtml(row.group)}</td><td>${row.blockerCount}</td><td><code>${escapeHtml(row.blockerIds.join(', ') || 'none')}</code></td><td><code>${escapeHtml(row.command)}</code></td><td>${escapeHtml(row.signoffStatus)}</td><td class="blank"></td><td class="blank"></td></tr>`).join('');
  const blockerHtml = blockers.map(item => `<tr><td>${escapeHtml(ownerGroupFor(item.id))}</td><td><code>${escapeHtml(item.id)}</code></td><td>${escapeHtml(statusText(item.status))}</td><td>${escapeHtml(item.label)}</td></tr>`).join('');
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pet Companion 10am Signoff Sheet</title>
  <style>
    :root{--bg:#f7efe3;--card:#fffaf2;--text:#49372a;--muted:#8f7a6b;--line:#e7d8c8;--coffee:#8f6545;--bad:#ce675e;--ok:#3aa866}
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 10% 0,#fff8e8,transparent 30%),var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;line-height:1.6}
    main{max-width:1080px;margin:0 auto;padding:28px 18px 46px}.hero,.card{background:rgba(255,250,242,.96);border:1px solid rgba(255,255,255,.84);border-radius:26px;box-shadow:0 18px 45px rgba(92,64,42,.12)}
    .hero{padding:28px;margin-bottom:16px}.card{padding:18px;margin:14px 0}h1{margin:0 0 8px;font-size:32px}h2{margin:0 0 10px;font-size:21px}.muted{color:var(--muted)}.bad{color:var(--bad);font-weight:900}.ok{color:var(--ok);font-weight:900}
    table{width:100%;border-collapse:collapse;background:#fffdf8;border-radius:16px;overflow:hidden}th,td{border-bottom:1px solid var(--line);padding:10px;text-align:left;vertical-align:top}th{background:#f2e6d8}code{background:#f5eadc;border-radius:8px;padding:2px 6px}.blank{min-width:130px;background:repeating-linear-gradient(90deg,#fffdf8,#fffdf8 8px,#f3e7d8 9px)}pre{white-space:pre-wrap;background:#2b211a;color:#fff7eb;border-radius:16px;padding:12px;overflow:auto}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <h1>Pet Companion 10am Signoff Sheet</h1>
    <p class="muted">Generated at: ${escapeHtml(sheet.generatedAtLocal)} | Source of truth: <code>npm.cmd run launch:status</code></p>
    <p>Launch decision: <strong class="${sheet.launchDecision === 'GO' ? 'ok' : 'bad'}">${escapeHtml(sheet.launchDecision)}</strong> | External evidence: <strong>${externalVerified}/${externalTotal} verified</strong></p>
    <p>Latest bundle: <code>${escapeHtml(sheet.latestAcceptanceBundle.path)}</code> | SHA-256: <code>${escapeHtml(sheet.latestAcceptanceBundle.sha256 || 'missing')}</code></p>
    <p><strong>Rule:</strong> Final release stays <span class="bad">NO_GO</span> until every owner row is signed with masked evidence references and launch:status reports GO.</p>
  </section>
  <section class="card"><h2>Owner signoff rows</h2><table><thead><tr><th>Owner</th><th>Blockers</th><th>IDs</th><th>Shortcut</th><th>Status</th><th>Signer</th><th>Evidence refs</th></tr></thead><tbody>${ownerHtml}</tbody></table></section>
  <section class="card"><h2>Final release owner</h2><table><tbody><tr><th>Release owner signer</th><td class="blank"></td></tr><tr><th>Decision</th><td>${escapeHtml(sheet.finalReleaseOwner.decision)}</td></tr><tr><th>Notes</th><td>${escapeHtml(sheet.finalReleaseOwner.notes)}</td></tr></tbody></table></section>
  <section class="card"><h2>External blockers</h2><table><thead><tr><th>Owner</th><th>ID</th><th>Status</th><th>Item</th></tr></thead><tbody>${blockerHtml || '<tr><td colspan="4">No external blockers.</td></tr>'}</tbody></table></section>
  <section class="card"><h2>Boundary</h2><ul>${sheet.boundary.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul><h2>Commands</h2><pre>${escapeHtml(sheet.commands.join('\n'))}</pre></section>
</main>
</body>
</html>
`;
  await writeFile(htmlPath, html, 'utf8');

  console.log(`PASS 10am signoff sheet :: ${jsonPath}`);
  console.log(`PASS 10am signoff sheet :: ${markdownPath}`);
  console.log(`PASS 10am signoff sheet :: ${htmlPath}`);
  console.log(`10am signoff sheet: ${sheet.launchDecision}, external ${externalVerified}/${externalTotal} verified`);
}

main().catch(error => {
  console.error(`FAIL 10am signoff sheet :: ${error.message}`);
  process.exit(1);
});
