import { getServerRuntimeChecks } from '../server/config.js';

const checks = getServerRuntimeChecks({ requireProduction: true });

for (const check of checks) {
  console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
}

const failed = checks.filter(check => !check.pass);
if (failed.length) {
  console.error(`\n${failed.length} server production config check(s) failed.`);
  process.exit(1);
}

console.log('\nServer production config checks passed.');
