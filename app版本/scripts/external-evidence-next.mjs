#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';

const evidencePath = existsSync('output/production-evidence.json')
  ? 'output/production-evidence.json'
  : 'deploy/production-evidence.example.json';

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const withCommands = args.has('--commands');
const OWNER_GROUPS = {
  ops: ['domainTls', 'productionEnv', 'persistentStorage', 'objectStorage', 'monitoringAlerts', 'platformBackups'],
  legal: ['legalApproval'],
  qa: ['manualDeviceAcceptance']
};

function optionValue(name) {
  const index = rawArgs.indexOf(name);
  if (index === -1) return '';
  const value = rawArgs[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return value.trim();
}

function readEvidence() {
  return JSON.parse(readFileSync(evidencePath, 'utf8').replace(/^\uFEFF/, ''));
}

function isBlocked(item) {
  return item.status !== 'verified';
}

function looksGeneric(value) {
  return /example|placeholder|todo|待定|ops-owner|legal-owner|qa-owner|public HTTPS app endpoint|deployment host path|volume\/database|server media directory|monitoring dashboard|backup job|legal approval ticket|docs\/manual-device-acceptance/i.test(String(value || ''));
}

function commandFor(item, status = 'provided') {
  const owner = item.owner && !looksGeneric(item.owner) ? item.owner : '<owner-id>';
  const evidenceRef = item.evidenceRef && !looksGeneric(item.evidenceRef)
    ? item.evidenceRef
    : `<evidence-ref-${item.id}>`;
  const requiredProof = Array.isArray(item.requiredProof) && item.requiredProof.length ? item.requiredProof : ['proof'];
  const proofRefs = requiredProof
    .map((_, index) => ` --proof-ref "<proofref-${index + 1}-for-${item.id}>"`)
    .join('');
  return `npm.cmd run external:evidence:update -- --id ${item.id} --status ${status} --owner "${owner}" --evidence-ref "${evidenceRef}"${proofRefs}`;
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

try {
  const filterId = optionValue('--id');
  const ownerGroup = optionValue('--owner');
  if (ownerGroup && !OWNER_GROUPS[ownerGroup]) {
    console.error(`FAIL external evidence next :: unknown owner group: ${ownerGroup}; expected ops, legal, or qa`);
    process.exit(1);
  }
  const data = readEvidence();
  const items = Array.isArray(data?.items) ? data.items : [];
  const ownerIds = ownerGroup ? new Set(OWNER_GROUPS[ownerGroup]) : null;
  const scopedItems = items
    .filter(item => !filterId || item.id === filterId)
    .filter(item => !ownerIds || ownerIds.has(item.id));

  if (filterId && scopedItems.length === 0) {
    console.error(`FAIL external evidence next :: unknown evidence id: ${filterId}`);
    process.exit(1);
  }

  const pendingItems = scopedItems.filter(isBlocked);

  console.log(`外部证据进展（来源：${evidencePath}）`);
  if (filterId) console.log(`聚焦项：${filterId}`);
  if (ownerGroup) console.log(`负责人分组：${ownerGroup}`);
  console.log(`总项：${scopedItems.length}，未完成：${pendingItems.length}`);

  if (!pendingItems.length) {
    console.log('✓ 全部已验证，可继续走人工验收与上线决策。');
    process.exit(0);
  }

  for (const [index, item] of pendingItems.entries()) {
    const requiredCount = Array.isArray(item.requiredProof) ? item.requiredProof.length : 0;
    const proofCount = Array.isArray(item.proofRefs) ? item.proofRefs.length : 0;
    const proofNeed = Math.max(requiredCount - proofCount, 0);
    console.log(`\n${index + 1}. ${item.label}`);
    console.log(`   状态: ${item.status}`);
    console.log(`   负责人: ${item.owner || '待补充'}`);
    console.log(`   证据入口: ${item.evidenceRef || '待补充'}`);
    if (requiredCount) {
      console.log(`   需要证据块: ${requiredCount} 项（当前 ${proofCount} 个已登记）`);
    }
    if (proofNeed > 0) {
      console.log(`   缺口: ${proofNeed} 个 proofRef`);
    }
    if (Array.isArray(item.requiredProof) && item.requiredProof.length) {
      console.log(`   核对项:`);
      item.requiredProof.forEach((proof, idx) => {
        const linked = item.proofRefs?.[idx] ? ` (${item.proofRefs[idx]})` : '（未提交）';
        console.log(`     ${idx + 1}. ${proof}${linked}`);
      });
    }

    if (withCommands) {
      console.log('   建议命令:');
      const collectorCommand = collectorCommandFor(item);
      if (collectorCommand) {
        console.log(`     ${collectorCommand}`);
      }
      console.log(`     ${commandFor(item, 'provided')}`);
      console.log(`     ${commandFor(item, 'verified')}`);
    }
  }

  if (withCommands) {
    console.log('\n更多证据项，补齐后可统一标记为 verified（需要 proofRefs 覆盖 requiredProof 个数，且 checkedAt 不超过 90 天）。');
  }
} catch (error) {
  console.error(`FAIL external evidence next :: ${error.message}`);
  process.exit(1);
}
