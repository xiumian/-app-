#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

const outputDir = 'output';
const latestJsonPath = `${outputDir}/ops-evidence-latest.json`;
const latestMarkdownPath = `${outputDir}/ops-evidence-latest.md`;
const ALERT_RULES_PATH = 'deploy/alert-rules.example.json';
const OPERATIONS_DOC = 'docs/operations.md';
const SECRET_TEXT_PATTERN = /(password|secret|token|cookie|private[_-]?key|access[_-]?key|AKIA[0-9A-Z]{16}|-----BEGIN)/i;
const PLACEHOLDER_PATTERN = /example\.com|your-real-domain|placeholder|todo/i;

function parseArgs(argv) {
  const result = { owner: 'ops-owner' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      result.help = true;
      continue;
    }
    if (arg === '--self-test') {
      result.selfTest = true;
      continue;
    }
    if (!arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
    result[key] = value.trim();
    index += 1;
  }
  return result;
}

function usage() {
  return `Usage: node ./scripts/external-evidence-ops.mjs [--monitoring-url <https-url>] [--alert-ref <masked-ref>] [--recipient-ref <masked-ref>] [--backup-job-ref <masked-ref>] [--retention-ref <masked-ref>] [--restore-drill-ref <masked-ref>] [--restore-owner-ref <masked-ref>] [--owner <owner-id>]

Examples:
  npm.cmd run external:evidence:ops -- --monitoring-url "https://monitoring.example.invalid/dashboard/pet-companion" --alert-ref "ops-ticket-901#alerts-enabled" --recipient-ref "ops-ticket-901#oncall-route" --backup-job-ref "ops-ticket-902#backup-job" --retention-ref "ops-ticket-902#retention-offsite" --restore-drill-ref "ops-ticket-902#restore-drill" --restore-owner-ref "ops-ticket-902#restore-owner" --owner "ops-wang"

This collector records runbook metadata and masked operational references only. It does not call production monitoring systems, backup systems, or secret stores.`;
}

function assertSafeText(label, value, { allowEmpty = false } = {}) {
  const text = String(value || '').trim();
  if (!allowEmpty && !text) throw new Error(`${label} is required`);
  if (SECRET_TEXT_PATTERN.test(text)) throw new Error(`${label} appears to contain a secret; store only a masked ticket/link/record`);
  return text;
}

function isHttpsUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !PLACEHOLDER_PATTERN.test(value);
  } catch {
    return false;
  }
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return { ok: false, error: 'missing', data: null };
  try {
    return { ok: true, error: '', data: JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')) };
  } catch (error) {
    return { ok: false, error: error.message, data: null };
  }
}

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
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

function alertRulesSummary() {
  const read = readJsonIfExists(ALERT_RULES_PATH);
  if (!read.ok) return { path: ALERT_RULES_PATH, exists: existsSync(ALERT_RULES_PATH), parseable: false, error: read.error, alertCount: 0, alertIds: [], hasCriticalReady: false, hasMonitoringIngest: false };
  const alerts = Array.isArray(read.data.alerts) ? read.data.alerts : [];
  return {
    path: ALERT_RULES_PATH,
    exists: true,
    parseable: true,
    error: '',
    service: read.data.service || '',
    version: read.data.version || '',
    evaluationWindowMinutes: read.data.evaluationWindowMinutes || null,
    alertCount: alerts.length,
    alertIds: alerts.map(item => item.id).filter(Boolean),
    hasCriticalReady: alerts.some(item => item.id === 'api-not-ready' && item.severity === 'critical'),
    hasMonitoringIngest: alerts.some(item => item.id === 'monitoring-ingest-failed'),
    hasRunbooks: alerts.every(item => typeof item.runbook === 'string' && item.runbook.includes('docs/operations.md'))
  };
}

function operationsDocSummary() {
  const text = existsSync(OPERATIONS_DOC) ? readFileSync(OPERATIONS_DOC, 'utf8') : '';
  return {
    path: OPERATIONS_DOC,
    exists: Boolean(text),
    hasOpsCheck: text.includes('npm run ops:check'),
    hasAlertRules: text.includes('deploy/alert-rules.example.json'),
    hasBackupDrill: text.includes('npm run backup:drill'),
    hasRetentionNote: text.includes('offsite retention') || text.includes('retention'),
    hasRestoreOwnerNote: text.includes('restore owner') || text.includes('named restore owner'),
    hasMonitoringIngestRunbook: text.includes('monitoring-ingest-failed')
  };
}

function buildUpdateCommand({ id, owner, ready, proofRefs }) {
  if (!ready) return `# ${id} evidence is incomplete; collect required masked proof refs before registering`;
  return `npm.cmd run external:evidence:update -- --id ${id} --status verified --owner "${owner}" --evidence-ref "${latestJsonPath}"${proofRefs.map(ref => ` --proof-ref "${ref}"`).join('')}`;
}

function escapePipes(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function coverageRows(items) {
  return items.map((item, index) => `| ${index + 1} | ${escapePipes(item.requiredProof)} | ${item.covered ? 'yes' : 'no'} | ${escapePipes(item.proofRef || 'missing')} |`).join('\n');
}

function markdownFor(payload) {
  return `# ops external evidence result

- Generated at: ${payload.generatedAtLocal}
- Owner: ${payload.owner}
- Monitoring URL: ${payload.refs.monitoringUrl || 'missing'}

## Monitoring and alert summary

| Item | Result |
| --- | --- |
| Alert rules file | ${payload.alertRules.exists ? 'present' : 'missing'} |
| Alert rules parseable | ${payload.alertRules.parseable ? 'yes' : 'no'} |
| Alert count | ${payload.alertRules.alertCount} |
| Alert ids | ${payload.alertRules.alertIds.join(', ') || 'none'} |
| Operations runbook exists | ${payload.operationsDoc.exists ? 'yes' : 'no'} |
| Monitoring URL HTTPS | ${payload.summary.monitoringUrlHttps ? 'yes' : 'no'} |
| Alert reference | ${payload.refs.alertRef || 'missing'} |
| Recipient reference | ${payload.refs.recipientRef || 'missing'} |
| Ready for verified | ${payload.summary.monitoringReadyForVerified ? 'yes' : 'no'} |

## Platform backup summary

| Item | Result |
| --- | --- |
| Local drill documented | ${payload.operationsDoc.hasBackupDrill ? 'yes' : 'no'} |
| Backup job reference | ${payload.refs.backupJobRef || 'missing'} |
| Retention/offsite reference | ${payload.refs.retentionRef || 'missing'} |
| Restore drill reference | ${payload.refs.restoreDrillRef || 'missing'} |
| Restore owner reference | ${payload.refs.restoreOwnerRef || 'missing'} |
| Ready for verified | ${payload.summary.backupReadyForVerified ? 'yes' : 'no'} |

## monitoringAlerts requiredProof coverage

| # | requiredProof | covered | proofRef |
| ---: | --- | --- | --- |
${coverageRows(payload.monitoringAlerts.requiredProofCoverage)}

## platformBackups requiredProof coverage

| # | requiredProof | covered | proofRef |
| ---: | --- | --- | --- |
${coverageRows(payload.platformBackups.requiredProofCoverage)}

## Suggested update commands

~~~powershell
${payload.suggestedCommands.monitoringAlerts}
${payload.suggestedCommands.platformBackups}
~~~

This file intentionally does not call production monitoring or backup systems and does not contain passwords, tokens, cookies, private keys, or production secrets.
`;
}

async function collect(options) {
  const generatedAt = new Date();
  const owner = assertSafeText('owner', options.owner || 'ops-owner');
  const refs = {
    monitoringUrl: options.monitoringUrl ? assertSafeText('monitoringUrl', options.monitoringUrl) : '',
    alertRef: options.alertRef ? assertSafeText('alertRef', options.alertRef) : '',
    recipientRef: options.recipientRef ? assertSafeText('recipientRef', options.recipientRef) : '',
    backupJobRef: options.backupJobRef ? assertSafeText('backupJobRef', options.backupJobRef) : '',
    retentionRef: options.retentionRef ? assertSafeText('retentionRef', options.retentionRef) : '',
    restoreDrillRef: options.restoreDrillRef ? assertSafeText('restoreDrillRef', options.restoreDrillRef) : '',
    restoreOwnerRef: options.restoreOwnerRef ? assertSafeText('restoreOwnerRef', options.restoreOwnerRef) : ''
  };
  const alertRules = alertRulesSummary();
  const operationsDoc = operationsDocSummary();
  const monitoringUrlHttps = isHttpsUrl(refs.monitoringUrl);
  const alertRulesCovered = alertRules.parseable && alertRules.hasCriticalReady && alertRules.hasMonitoringIngest && alertRules.hasRunbooks && operationsDoc.hasAlertRules && operationsDoc.hasMonitoringIngestRunbook;
  const alertRouteCovered = alertRulesCovered && Boolean(refs.alertRef);
  const recipientCovered = Boolean(refs.recipientRef);
  const monitoringReadyForVerified = monitoringUrlHttps && alertRouteCovered && recipientCovered;

  const backupJobCovered = Boolean(refs.backupJobRef);
  const retentionCovered = Boolean(refs.retentionRef) && operationsDoc.hasRetentionNote;
  const restoreDrillCovered = Boolean(refs.restoreDrillRef) && operationsDoc.hasBackupDrill;
  const restoreOwnerCovered = Boolean(refs.restoreOwnerRef) && operationsDoc.hasRestoreOwnerNote;
  const backupReadyForVerified = backupJobCovered && retentionCovered && restoreDrillCovered && restoreOwnerCovered;

  const monitoringProofRefs = [
    refs.monitoringUrl || `${latestJsonPath}#monitoring-url`,
    refs.alertRef || `${latestJsonPath}#alert-rules`,
    refs.recipientRef || `${latestJsonPath}#alert-recipient`
  ];
  const backupProofRefs = [
    refs.backupJobRef || `${latestJsonPath}#backup-job`,
    refs.retentionRef || `${latestJsonPath}#retention-offsite`,
    refs.restoreDrillRef || `${latestJsonPath}#restore-drill`,
    refs.restoreOwnerRef || `${latestJsonPath}#restore-owner`
  ];

  const payload = {
    schema: 'pet-companion-ops-evidence-v1',
    generatedAt: generatedAt.toISOString(),
    generatedAtLocal: formatChinaTime(generatedAt),
    owner,
    refs,
    output: {
      latestJsonPath,
      latestMarkdownPath,
      archiveJsonPath: `${outputDir}/ops-evidence-${timestampForPath(generatedAt)}.json`,
      archiveMarkdownPath: `${outputDir}/ops-evidence-${timestampForPath(generatedAt)}.md`
    },
    alertRules,
    operationsDoc,
    summary: {
      monitoringReadyForProvided: alertRulesCovered || monitoringUrlHttps,
      monitoringReadyForVerified,
      backupReadyForProvided: operationsDoc.hasBackupDrill || backupJobCovered,
      backupReadyForVerified,
      monitoringUrlHttps,
      alertRulesCovered,
      alertRouteCovered,
      recipientCovered,
      backupJobCovered,
      retentionCovered,
      restoreDrillCovered,
      restoreOwnerCovered
    },
    monitoringAlerts: {
      requiredProofCoverage: [
        {
          requiredProof: 'Monitoring endpoint or dashboard link',
          covered: monitoringUrlHttps,
          proofRef: refs.monitoringUrl || ''
        },
        {
          requiredProof: 'Alert rules enabled record',
          covered: alertRouteCovered,
          proofRef: refs.alertRef || `${latestJsonPath}#alert-rules`
        },
        {
          requiredProof: 'Alert recipient or on-call channel record',
          covered: recipientCovered,
          proofRef: refs.recipientRef || ''
        }
      ]
    },
    platformBackups: {
      requiredProofCoverage: [
        {
          requiredProof: 'Backup job configuration record',
          covered: backupJobCovered,
          proofRef: refs.backupJobRef || ''
        },
        {
          requiredProof: 'Retention period and offsite storage description',
          covered: retentionCovered,
          proofRef: refs.retentionRef || ''
        },
        {
          requiredProof: 'Recent restore drill record',
          covered: restoreDrillCovered,
          proofRef: refs.restoreDrillRef || ''
        }
      ],
      restoreOwner: {
        covered: restoreOwnerCovered,
        proofRef: refs.restoreOwnerRef || ''
      }
    }
  };
  payload.suggestedCommands = {
    monitoringAlerts: buildUpdateCommand({ id: 'monitoringAlerts', owner, ready: monitoringReadyForVerified, proofRefs: monitoringProofRefs }),
    platformBackups: buildUpdateCommand({ id: 'platformBackups', owner, ready: backupReadyForVerified, proofRefs: backupProofRefs })
  };
  return payload;
}

async function writeOutputs(payload) {
  await mkdir(outputDir, { recursive: true });
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  const markdown = markdownFor(payload);
  await writeFile(payload.output.archiveJsonPath, json, 'utf8');
  await writeFile(payload.output.archiveMarkdownPath, markdown, 'utf8');
  await writeFile(latestJsonPath, json, 'utf8');
  await writeFile(latestMarkdownPath, markdown, 'utf8');
}

async function runSelfTest() {
  const payload = await collect({
    owner: 'ops-wang',
    monitoringUrl: 'https://monitoring.example.invalid/dashboard/pet-companion',
    alertRef: 'ops-ticket-901#alerts-enabled',
    recipientRef: 'ops-ticket-901#oncall-route',
    backupJobRef: 'ops-ticket-902#backup-job',
    retentionRef: 'ops-ticket-902#retention-offsite',
    restoreDrillRef: 'ops-ticket-902#restore-drill',
    restoreOwnerRef: 'ops-ticket-902#restore-owner'
  });
  const json = JSON.stringify(payload);
  const markdown = markdownFor(payload);
  const checks = [];
  const add = (name, pass, detail = '') => checks.push({ name, pass, detail });
  add('monitoring evidence ready in fixture', payload.summary.monitoringReadyForVerified);
  add('backup evidence ready in fixture', payload.summary.backupReadyForVerified);
  add('collector sees alert rules', payload.alertRules.alertCount >= 4 && payload.alertRules.hasCriticalReady && payload.alertRules.hasMonitoringIngest);
  add('collector sees operations runbook', payload.operationsDoc.hasOpsCheck && payload.operationsDoc.hasBackupDrill);
  add('collector does not include private key or access key blocks', !/(AKIA[0-9A-Z]{16}|-----BEGIN)/i.test(json) && !/(AKIA[0-9A-Z]{16}|-----BEGIN)/i.test(markdown));
  add('builds both update commands', payload.suggestedCommands.monitoringAlerts.includes('--id monitoringAlerts') && payload.suggestedCommands.platformBackups.includes('--id platformBackups'));

  let failed = 0;
  for (const check of checks) {
    if (check.pass) console.log(`PASS ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
    else {
      failed += 1;
      console.error(`FAIL ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
    }
  }
  if (failed) throw new Error(`${failed} ops evidence self-test checks failed`);
  console.log(`\nPASS external evidence ops self-test :: ${checks.length} checks passed.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (options.selfTest) {
    await runSelfTest();
    return;
  }
  const payload = await collect(options);
  await writeOutputs(payload);
  console.log(`PASS ops evidence latest json :: ${latestJsonPath}`);
  console.log(`PASS ops evidence latest markdown :: ${latestMarkdownPath}`);
  console.log(`PASS ops evidence archive json :: ${payload.output.archiveJsonPath}`);
  console.log(`PASS ops evidence archive markdown :: ${payload.output.archiveMarkdownPath}`);
  console.log(`monitoringAlerts readyForProvided: ${payload.summary.monitoringReadyForProvided}`);
  console.log(`monitoringAlerts readyForVerified: ${payload.summary.monitoringReadyForVerified}`);
  console.log(`platformBackups readyForProvided: ${payload.summary.backupReadyForProvided}`);
  console.log(`platformBackups readyForVerified: ${payload.summary.backupReadyForVerified}`);
  console.log('Suggested update commands:');
  console.log(payload.suggestedCommands.monitoringAlerts);
  console.log(payload.suggestedCommands.platformBackups);
}

main().catch(error => {
  console.error(`FAIL external evidence ops :: ${error.message}`);
  process.exit(1);
});
