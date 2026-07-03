import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const outputDir = 'output';
const jsonPath = `${outputDir}/10am-meeting-minutes.json`;
const markdownPath = `${outputDir}/10am-meeting-minutes.md`;
const htmlPath = `${outputDir}/10am-meeting-minutes.html`;

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

function actionFor(item) {
  const owner = ownerGroupFor(item.id);
  return {
    id: item.id,
    owner,
    title: item.label || item.id,
    status: item.status || 'pending',
    command: ownerCommand(owner),
    due: 'before GO decision',
    assignee: '',
    evidenceRef: item.evidenceRef || '',
    nextStep: `Collect masked evidence refs for ${item.id}, review proofRefs, then update external evidence.`
  };
}

async function main() {
  const generatedAt = new Date();
  const launchResult = runLaunchStatus();
  const launch = launchResult.value || {};
  const latestZip = await readJson('output/10am-acceptance-bundle-latest.json');
  const signoff = await readJson('output/10am-signoff-sheet.json');
  const blockers = Array.isArray(launch.external && launch.external.blockers) ? launch.external.blockers : [];
  const externalVerified = launch.external && launch.external.verified != null ? launch.external.verified : 0;
  const externalTotal = launch.external && launch.external.total != null ? launch.external.total : 0;
  const actions = blockers.map(actionFor);
  const grouped = Object.fromEntries(Object.keys(OWNER_GROUPS).map(group => [group, actions.filter(item => item.owner === group).length]));
  const minutes = {
    schema: 'pet-companion-10am-meeting-minutes-v1',
    generatedAt: generatedAt.toISOString(),
    generatedAtLocal: formatChinaTime(generatedAt),
    meeting: {
      title: 'Pet Companion 10am acceptance meeting',
      chair: '',
      attendees: '',
      decision: launch.decision || 'UNKNOWN',
      conclusion: launch.decision === 'GO' ? 'GO candidate, final human release approval required.' : 'NO_GO confirmed until external evidence reaches 8/8 verified.'
    },
    externalEvidence: { verified: externalVerified, total: externalTotal, blockers, grouped },
    latestAcceptanceBundle: {
      path: latestZip && latestZip.latestZipPath ? latestZip.latestZipPath : 'output/10am-acceptance-bundle-latest.zip',
      sha256: latestZip && latestZip.sha256 ? latestZip.sha256 : '',
      bytes: latestZip && latestZip.bytes != null ? latestZip.bytes : null
    },
    signoffSheet: {
      path: 'output/10am-signoff-sheet.html',
      exists: existsSync('output/10am-signoff-sheet.html'),
      ownerRows: Array.isArray(signoff && signoff.ownerRows) ? signoff.ownerRows.length : 0
    },
    actions,
    decisions: [
      'Local acceptance materials are ready for review.',
      'Do not claim production launch while launch:status is NO_GO.',
      'Do not deploy, upload, or modify the server homepage from this meeting pack.',
      'Only masked evidence references may be recorded in minutes and signoff sheets.'
    ],
    commands: [
      'npm.cmd run launch:status',
      'npm.cmd run acceptance:signoff',
      'npm.cmd run acceptance:decision',
      'npm.cmd run external:evidence:next:ops',
      'npm.cmd run external:evidence:next:legal',
      'npm.cmd run external:evidence:next:qa',
      'npm.cmd run acceptance:final'
    ]
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(minutes, null, 2)}\n`, 'utf8');

  const actionRows = actions.map(item => `| ${escapePipes(item.owner)} | \`${escapePipes(item.id)}\` | ${escapePipes(item.status)} | ${escapePipes(item.title)} | ${escapePipes(item.command)} | ${escapePipes(item.due)} | __________ |`);
  const markdown = `# Pet Companion 10am Meeting Minutes

- Generated at: ${minutes.generatedAtLocal}
- Generated at UTC: ${minutes.generatedAt}
- Meeting: ${minutes.meeting.title}
- Chair: __________
- Attendees: __________
- Decision: **${minutes.meeting.decision}**
- Conclusion: ${minutes.meeting.conclusion}
- External evidence: **${externalVerified}/${externalTotal} verified**
- Acceptance bundle: \`${minutes.latestAcceptanceBundle.path}\`
- Bundle SHA-256: \`${minutes.latestAcceptanceBundle.sha256 || 'missing'}\`
- Signoff sheet: \`${minutes.signoffSheet.path}\`

## Decisions recorded

${minutes.decisions.map(item => `- ${item}`).join('\n')}

## Action tracker

| Owner | ID | Status | Item | Command | Due | Assignee |
| --- | --- | --- | --- | --- | --- | --- |
${actionRows.length ? actionRows.join('\n') : '| release | none | verified | No external blocker | npm.cmd run launch:status | before release | __________ |'}

## Owner summary

| Owner | Open actions | Shortcut |
| --- | ---: | --- |
${Object.keys(OWNER_GROUPS).map(group => `| ${group} | ${grouped[group] || 0} | ${ownerCommand(group)} |`).join('\n')}

## Follow-up commands

\`\`\`powershell
${minutes.commands.join('\n')}
\`\`\`

## Boundary

- Local-only meeting record; no deploy, no upload, no server homepage change.
- Record only masked ticket ids, screenshot paths, dashboard links, document links, or acceptance record ids.
- Do not record passwords, tokens, cookies, private keys, TLS PEM blocks, production.env values, or object-storage secrets.
`;
  await writeFile(markdownPath, markdown, 'utf8');

  const actionHtmlRows = actions.map(item => `<tr><td>${escapeHtml(item.owner)}</td><td><code>${escapeHtml(item.id)}</code></td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.title)}</td><td><code>${escapeHtml(item.command)}</code></td><td>${escapeHtml(item.due)}</td><td class="blank"></td></tr>`).join('');
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pet Companion 10am Meeting Minutes</title>
  <style>
    :root{--bg:#f7efe3;--card:#fffaf2;--text:#49372a;--muted:#8f7a6b;--line:#e7d8c8;--coffee:#8f6545;--bad:#ce675e;--ok:#3aa866}
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 10% 0,#fff8e8,transparent 30%),var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;line-height:1.6}
    main{max-width:1080px;margin:0 auto;padding:28px 18px 46px}.hero,.card{background:rgba(255,250,242,.96);border:1px solid rgba(255,255,255,.84);border-radius:26px;box-shadow:0 18px 45px rgba(92,64,42,.12)}
    .hero{padding:28px;margin-bottom:16px}.card{padding:18px;margin:14px 0}h1{margin:0 0 8px;font-size:32px}.muted{color:var(--muted)}.bad{color:var(--bad);font-weight:900}.ok{color:var(--ok);font-weight:900}
    table{width:100%;border-collapse:collapse;background:#fffdf8;border-radius:16px;overflow:hidden}th,td{border-bottom:1px solid var(--line);padding:10px;text-align:left;vertical-align:top}th{background:#f2e6d8}code{background:#f5eadc;border-radius:8px;padding:2px 6px}.blank{min-width:120px;background:repeating-linear-gradient(90deg,#fffdf8,#fffdf8 8px,#f3e7d8 9px)}pre{white-space:pre-wrap;background:#2b211a;color:#fff7eb;border-radius:16px;padding:12px;overflow:auto}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <h1>Pet Companion 10am Meeting Minutes</h1>
    <p class="muted">Generated at: ${escapeHtml(minutes.generatedAtLocal)}</p>
    <p>Decision: <strong class="${minutes.meeting.decision === 'GO' ? 'ok' : 'bad'}">${escapeHtml(minutes.meeting.decision)}</strong> | External evidence: <strong>${externalVerified}/${externalTotal} verified</strong></p>
    <p>Conclusion: ${escapeHtml(minutes.meeting.conclusion)}</p>
    <p>Chair: ____________________ | Attendees: ____________________</p>
  </section>
  <section class="card"><h2>Decisions recorded</h2><ul>${minutes.decisions.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>
  <section class="card"><h2>Action tracker</h2><table><thead><tr><th>Owner</th><th>ID</th><th>Status</th><th>Item</th><th>Command</th><th>Due</th><th>Assignee</th></tr></thead><tbody>${actionHtmlRows || '<tr><td colspan="7">No external blocker.</td></tr>'}</tbody></table></section>
  <section class="card"><h2>Owner summary</h2><table><thead><tr><th>Owner</th><th>Open actions</th><th>Shortcut</th></tr></thead><tbody>${Object.keys(OWNER_GROUPS).map(group => `<tr><td>${group}</td><td>${grouped[group] || 0}</td><td><code>${escapeHtml(ownerCommand(group))}</code></td></tr>`).join('')}</tbody></table></section>
  <section class="card"><h2>Follow-up commands</h2><pre>${escapeHtml(minutes.commands.join('\n'))}</pre><p class="muted">Local-only meeting record; no deploy, no upload, no server homepage change. Record masked evidence references only.</p></section>
</main>
</body>
</html>
`;
  await writeFile(htmlPath, html, 'utf8');

  console.log(`PASS 10am meeting minutes :: ${jsonPath}`);
  console.log(`PASS 10am meeting minutes :: ${markdownPath}`);
  console.log(`PASS 10am meeting minutes :: ${htmlPath}`);
  console.log(`10am meeting minutes: ${minutes.meeting.decision}, actions ${actions.length}`);
}

main().catch(error => {
  console.error(`FAIL 10am meeting minutes :: ${error.message}`);
  process.exit(1);
});
