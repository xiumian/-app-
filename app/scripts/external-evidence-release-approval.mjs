#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

const outputDir = 'output';
const latestJsonPath = `${outputDir}/release-approval-evidence-latest.json`;
const latestMarkdownPath = `${outputDir}/release-approval-evidence-latest.md`;
const PRIVACY_PATH = 'docs/privacy.md';
const TERMS_PATH = 'docs/terms.md';
const MANUAL_DOC_PATH = 'docs/manual-device-acceptance.md';
const MANUAL_RECORD_PATH = 'output/manual-device-acceptance-record.json';
const SECRET_TEXT_PATTERN = /(password|secret|token|cookie|private[_-]?key|access[_-]?key|AKIA[0-9A-Z]{16}|-----BEGIN)/i;

function parseArgs(argv) {
  const result = { owner: 'release-owner' };
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
  return `Usage: node ./scripts/external-evidence-release-approval.mjs [--operator-ref <masked-ref>] [--support-ref <masked-ref>] [--policy-version-ref <masked-ref>] [--legal-review-ref <masked-ref>] [--device-matrix-ref <masked-ref>] [--core-flow-ref <masked-ref>] [--offline-pwa-delete-ref <masked-ref>] [--retest-conclusion-ref <masked-ref>] [--owner <owner-id>]

Examples:
  npm.cmd run external:evidence:release-approval -- --operator-ref "legal-ticket-100#operator" --support-ref "support-ticket-100#channel" --policy-version-ref "legal-ticket-100#policy-version" --legal-review-ref "legal-ticket-100#region-review" --device-matrix-ref "qa-ticket-200#device-matrix" --core-flow-ref "qa-ticket-200#core-flows" --offline-pwa-delete-ref "qa-ticket-200#offline-pwa-delete" --retest-conclusion-ref "qa-ticket-200#final-signoff" --owner "release-wang"

This collector records document coverage and masked approval references only. It does not store personal data, passwords, tokens, cookies, or production secrets.`;
}

function assertSafeText(label, value, { allowEmpty = false } = {}) {
  const text = String(value || '').trim();
  if (!allowEmpty && !text) throw new Error(`${label} is required`);
  if (SECRET_TEXT_PATTERN.test(text)) throw new Error(`${label} appears to contain a secret; store only a masked ticket/link/record`);
  return text;
}

function readText(path) {
  return existsSync(path) ? readFileSync(path, 'utf8').replace(/^\uFEFF/, '') : '';
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
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

function docSummary() {
  const privacy = readText(PRIVACY_PATH);
  const terms = readText(TERMS_PATH);
  const manual = readText(MANUAL_DOC_PATH);
  return {
    privacy: {
      path: PRIVACY_PATH,
      exists: Boolean(privacy),
      hasExport: privacy.includes('GET /account/export'),
      hasDelete: privacy.includes('DELETE /account'),
      hasRemoteMedia: privacy.includes('/media') || privacy.includes('token'),
      hasHealthDisclaimer: privacy.length > 200
    },
    terms: {
      path: TERMS_PATH,
      exists: Boolean(terms),
      hasScope: terms.length > 100,
      hasConsentVersion: terms.includes('token') || terms.includes('consent') || terms.length > 100,
      hasHealthDisclaimer: terms.length > 100
    },
    manual: {
      path: MANUAL_DOC_PATH,
      exists: Boolean(manual),
      hasDeviceMatrix: manual.includes('manualDeviceAcceptance') || manual.includes('device'),
      hasRequiredFlows: manual.includes('15') || manual.includes('flow'),
      hasPassCriteria: manual.length > 500
    }
  };
}

function manualRecordSummary() {
  const record = readJson(MANUAL_RECORD_PATH);
  const rows = Array.isArray(record?.rows) ? record.rows : [];
  const requiredFlows = Array.isArray(record?.requiredFlows) ? record.requiredFlows : [];
  const evidenceGroups = Array.isArray(record?.evidenceGroups) ? record.evidenceGroups : [];
  const completedRows = rows.filter(row => String(row.result || '').toLowerCase().includes('pass'));
  const evidenceRows = rows.filter(row => String(row.evidenceRef || '').trim());
  return {
    path: MANUAL_RECORD_PATH,
    exists: Boolean(record),
    schema: record?.schema || '',
    appVersion: record?.app?.version || '',
    buildHash: record?.app?.buildHash || '',
    deviceRows: rows.length,
    completedRows: completedRows.length,
    rowsWithEvidence: evidenceRows.length,
    requiredFlows: requiredFlows.length,
    evidenceGroups: evidenceGroups.length
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
  return `# release approval external evidence result

- Generated at: ${payload.generatedAtLocal}
- Owner: ${payload.owner}

## Legal approval summary

| Item | Result |
| --- | --- |
| Privacy doc exists | ${payload.docs.privacy.exists ? 'yes' : 'no'} |
| Terms doc exists | ${payload.docs.terms.exists ? 'yes' : 'no'} |
| Operator reference | ${payload.refs.operatorRef || 'missing'} |
| Support reference | ${payload.refs.supportRef || 'missing'} |
| Policy version reference | ${payload.refs.policyVersionRef || 'missing'} |
| Legal review reference | ${payload.refs.legalReviewRef || 'missing'} |
| Ready for verified | ${payload.summary.legalReadyForVerified ? 'yes' : 'no'} |

## Manual device acceptance summary

| Item | Result |
| --- | --- |
| Manual template exists | ${payload.docs.manual.exists ? 'yes' : 'no'} |
| Manual record exists | ${payload.manualRecord.exists ? 'yes' : 'no'} |
| Device rows | ${payload.manualRecord.deviceRows} |
| Required flows | ${payload.manualRecord.requiredFlows} |
| Evidence groups | ${payload.manualRecord.evidenceGroups} |
| Device matrix reference | ${payload.refs.deviceMatrixRef || 'missing'} |
| Core flow reference | ${payload.refs.coreFlowRef || 'missing'} |
| Offline/PWA/delete reference | ${payload.refs.offlinePwaDeleteRef || 'missing'} |
| Retest conclusion reference | ${payload.refs.retestConclusionRef || 'missing'} |
| Ready for verified | ${payload.summary.manualReadyForVerified ? 'yes' : 'no'} |

## legalApproval requiredProof coverage

| # | requiredProof | covered | proofRef |
| ---: | --- | --- | --- |
${coverageRows(payload.legalApproval.requiredProofCoverage)}

## manualDeviceAcceptance requiredProof coverage

| # | requiredProof | covered | proofRef |
| ---: | --- | --- | --- |
${coverageRows(payload.manualDeviceAcceptance.requiredProofCoverage)}

## Suggested update commands

~~~powershell
${payload.suggestedCommands.legalApproval}
${payload.suggestedCommands.manualDeviceAcceptance}
~~~

This file intentionally contains masked evidence references only. Do not place personal data, passwords, tokens, cookies, private keys, or production secrets here.
`;
}

async function collect(options) {
  const generatedAt = new Date();
  const owner = assertSafeText('owner', options.owner || 'release-owner');
  const refs = {
    operatorRef: options.operatorRef ? assertSafeText('operatorRef', options.operatorRef) : '',
    supportRef: options.supportRef ? assertSafeText('supportRef', options.supportRef) : '',
    policyVersionRef: options.policyVersionRef ? assertSafeText('policyVersionRef', options.policyVersionRef) : '',
    legalReviewRef: options.legalReviewRef ? assertSafeText('legalReviewRef', options.legalReviewRef) : '',
    deviceMatrixRef: options.deviceMatrixRef ? assertSafeText('deviceMatrixRef', options.deviceMatrixRef) : '',
    coreFlowRef: options.coreFlowRef ? assertSafeText('coreFlowRef', options.coreFlowRef) : '',
    offlinePwaDeleteRef: options.offlinePwaDeleteRef ? assertSafeText('offlinePwaDeleteRef', options.offlinePwaDeleteRef) : '',
    retestConclusionRef: options.retestConclusionRef ? assertSafeText('retestConclusionRef', options.retestConclusionRef) : ''
  };
  const docs = docSummary();
  const manualRecord = manualRecordSummary();

  const legalDocsCovered = docs.privacy.exists && docs.privacy.hasExport && docs.privacy.hasDelete && docs.terms.exists && docs.terms.hasScope && docs.terms.hasConsentVersion;
  const operatorCovered = Boolean(refs.operatorRef && refs.supportRef);
  const policyCovered = Boolean(refs.policyVersionRef && legalDocsCovered);
  const reviewCovered = Boolean(refs.legalReviewRef);
  const legalReadyForVerified = operatorCovered && policyCovered && reviewCovered;

  const manualTemplateCovered = docs.manual.exists && docs.manual.hasDeviceMatrix && docs.manual.hasRequiredFlows && docs.manual.hasPassCriteria;
  const manualRecordCovered = manualRecord.exists && manualRecord.deviceRows >= 6 && manualRecord.requiredFlows >= 15 && manualRecord.evidenceGroups >= 4;
  const deviceMatrixCovered = manualRecordCovered && Boolean(refs.deviceMatrixRef);
  const coreFlowCovered = manualRecordCovered && Boolean(refs.coreFlowRef);
  const offlineCovered = manualRecordCovered && Boolean(refs.offlinePwaDeleteRef);
  const retestCovered = manualRecordCovered && Boolean(refs.retestConclusionRef);
  const manualReadyForVerified = manualTemplateCovered && deviceMatrixCovered && coreFlowCovered && offlineCovered && retestCovered;

  const legalProofRefs = [
    refs.operatorRef || `${latestJsonPath}#operator-support`,
    refs.policyVersionRef || `${latestJsonPath}#policy-version`,
    refs.legalReviewRef || `${latestJsonPath}#legal-review`
  ];
  const manualProofRefs = [
    refs.deviceMatrixRef || `${latestJsonPath}#device-matrix`,
    refs.coreFlowRef || `${latestJsonPath}#core-flows`,
    refs.offlinePwaDeleteRef || `${latestJsonPath}#offline-pwa-delete`,
    refs.retestConclusionRef || `${latestJsonPath}#retest-conclusion`
  ];

  const payload = {
    schema: 'pet-companion-release-approval-evidence-v1',
    generatedAt: generatedAt.toISOString(),
    generatedAtLocal: formatChinaTime(generatedAt),
    owner,
    refs,
    output: {
      latestJsonPath,
      latestMarkdownPath,
      archiveJsonPath: `${outputDir}/release-approval-evidence-${timestampForPath(generatedAt)}.json`,
      archiveMarkdownPath: `${outputDir}/release-approval-evidence-${timestampForPath(generatedAt)}.md`
    },
    docs,
    manualRecord,
    summary: {
      legalReadyForProvided: legalDocsCovered,
      legalReadyForVerified,
      manualReadyForProvided: manualTemplateCovered && manualRecordCovered,
      manualReadyForVerified,
      legalDocsCovered,
      operatorCovered,
      policyCovered,
      reviewCovered,
      manualTemplateCovered,
      manualRecordCovered,
      deviceMatrixCovered,
      coreFlowCovered,
      offlineCovered,
      retestCovered
    },
    legalApproval: {
      requiredProofCoverage: [
        {
          requiredProof: 'Real operator and support channel record',
          covered: operatorCovered,
          proofRef: refs.operatorRef || refs.supportRef || ''
        },
        {
          requiredProof: 'Privacy policy and user agreement version record',
          covered: policyCovered,
          proofRef: refs.policyVersionRef || `${latestJsonPath}#policy-docs`
        },
        {
          requiredProof: 'Regional legal review record',
          covered: reviewCovered,
          proofRef: refs.legalReviewRef || ''
        }
      ]
    },
    manualDeviceAcceptance: {
      requiredProofCoverage: [
        {
          requiredProof: 'iPhone and Android device matrix',
          covered: deviceMatrixCovered,
          proofRef: refs.deviceMatrixRef || ''
        },
        {
          requiredProof: 'Core flow acceptance screenshots',
          covered: coreFlowCovered,
          proofRef: refs.coreFlowRef || ''
        },
        {
          requiredProof: 'Offline, PWA update, and account deletion acceptance record',
          covered: offlineCovered,
          proofRef: refs.offlinePwaDeleteRef || ''
        },
        {
          requiredProof: 'Manual device acceptance retest conclusion',
          covered: retestCovered,
          proofRef: refs.retestConclusionRef || ''
        }
      ]
    }
  };
  payload.suggestedCommands = {
    legalApproval: buildUpdateCommand({ id: 'legalApproval', owner, ready: legalReadyForVerified, proofRefs: legalProofRefs }),
    manualDeviceAcceptance: buildUpdateCommand({ id: 'manualDeviceAcceptance', owner, ready: manualReadyForVerified, proofRefs: manualProofRefs })
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
    owner: 'release-wang',
    operatorRef: 'legal-ticket-100#operator',
    supportRef: 'support-ticket-100#channel',
    policyVersionRef: 'legal-ticket-100#policy-version',
    legalReviewRef: 'legal-ticket-100#region-review',
    deviceMatrixRef: 'qa-ticket-200#device-matrix',
    coreFlowRef: 'qa-ticket-200#core-flows',
    offlinePwaDeleteRef: 'qa-ticket-200#offline-pwa-delete',
    retestConclusionRef: 'qa-ticket-200#final-signoff'
  });
  const json = JSON.stringify(payload);
  const markdown = markdownFor(payload);
  const checks = [];
  const add = (name, pass, detail = '') => checks.push({ name, pass, detail });
  add('legal evidence ready in fixture', payload.summary.legalReadyForVerified);
  add('manual evidence has template and record', payload.summary.manualReadyForProvided);
  add('manual evidence ready with refs', payload.summary.manualReadyForVerified);
  add('collector sees policy docs', payload.docs.privacy.exists && payload.docs.terms.exists);
  add('collector sees manual acceptance record shape', payload.manualRecord.deviceRows >= 6 && payload.manualRecord.requiredFlows >= 15);
  add('collector does not include private key or access key blocks', !/(AKIA[0-9A-Z]{16}|-----BEGIN)/i.test(json) && !/(AKIA[0-9A-Z]{16}|-----BEGIN)/i.test(markdown));
  add('builds both update commands', payload.suggestedCommands.legalApproval.includes('--id legalApproval') && payload.suggestedCommands.manualDeviceAcceptance.includes('--id manualDeviceAcceptance'));

  let failed = 0;
  for (const check of checks) {
    if (check.pass) console.log(`PASS ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
    else {
      failed += 1;
      console.error(`FAIL ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
    }
  }
  if (failed) throw new Error(`${failed} release approval evidence self-test checks failed`);
  console.log(`\nPASS external evidence release approval self-test :: ${checks.length} checks passed.`);
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
  console.log(`PASS release approval evidence latest json :: ${latestJsonPath}`);
  console.log(`PASS release approval evidence latest markdown :: ${latestMarkdownPath}`);
  console.log(`PASS release approval evidence archive json :: ${payload.output.archiveJsonPath}`);
  console.log(`PASS release approval evidence archive markdown :: ${payload.output.archiveMarkdownPath}`);
  console.log(`legalApproval readyForProvided: ${payload.summary.legalReadyForProvided}`);
  console.log(`legalApproval readyForVerified: ${payload.summary.legalReadyForVerified}`);
  console.log(`manualDeviceAcceptance readyForProvided: ${payload.summary.manualReadyForProvided}`);
  console.log(`manualDeviceAcceptance readyForVerified: ${payload.summary.manualReadyForVerified}`);
  console.log('Suggested update commands:');
  console.log(payload.suggestedCommands.legalApproval);
  console.log(payload.suggestedCommands.manualDeviceAcceptance);
}

main().catch(error => {
  console.error(`FAIL external evidence release approval :: ${error.message}`);
  process.exit(1);
});
