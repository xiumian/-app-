import { existsSync, readFileSync } from 'node:fs';

const evidencePath = existsSync('output/production-evidence.json')
  ? 'output/production-evidence.json'
  : 'deploy/production-evidence.example.json';
const args = new Set(process.argv.slice(2));
const requireVerified = args.has('--require-verified');
const jsonOutput = args.has('--json');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
}

const payload = readJson(evidencePath);
const items = Array.isArray(payload.items) ? payload.items : [];
const summary = {
  source: evidencePath,
  total: items.length,
  verified: items.filter(item => item.status === 'verified').length,
  provided: items.filter(item => item.status === 'provided').length,
  pending: items.filter(item => item.status === 'pending').length,
  blockers: items
    .filter(item => item.status !== 'verified')
    .map(item => ({
      id: item.id,
      label: item.label,
      status: item.status,
      owner: item.owner || '',
      evidenceRef: item.evidenceRef || '',
      requiredProof: Array.isArray(item.requiredProof) ? item.requiredProof : [],
      proofRefs: Array.isArray(item.proofRefs) ? item.proofRefs : []
    }))
};

if (jsonOutput) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(`External evidence source: ${summary.source}`);
  console.log(`Verified: ${summary.verified}/${summary.total}`);
  console.log(`Provided: ${summary.provided}`);
  console.log(`Pending: ${summary.pending}`);
  if (summary.blockers.length) {
    console.log('\nGo/No-Go blockers:');
    for (const item of summary.blockers) {
      console.log(`- ${item.id} [${item.status}] ${item.label}`);
      console.log(`  owner: ${item.owner || 'missing'}`);
      console.log(`  evidenceRef: ${item.evidenceRef || 'missing'}`);
      if (item.requiredProof.length) {
        console.log(`  requiredProof: ${item.requiredProof.join('；')}`);
      }
      if (item.proofRefs.length) {
        console.log(`  proofRefs: ${item.proofRefs.join('；')}`);
      }
    }
  } else {
    console.log('\nGo/No-Go blockers: none');
  }
}

if (requireVerified && summary.blockers.length) {
  console.error(`\nFAIL external evidence status :: ${summary.blockers.length} item(s) are not verified`);
  process.exit(1);
}

if (!jsonOutput) {
  console.log(`\nPASS external evidence status :: ${summary.verified}/${summary.total} verified`);
}
