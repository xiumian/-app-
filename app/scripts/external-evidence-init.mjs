import { existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const templatePath = 'deploy/production-evidence.example.json';
const targetPath = 'output/production-evidence.json';
const backupDir = 'output/evidence-backups';
const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const dryRun = args.has('--dry-run');

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function backupPathForTarget(path) {
  return `${backupDir}/${path.split('/').pop().replace(/\.json$/, '')}.${timestampForPath()}.json`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
}

if (!existsSync(templatePath)) {
  console.error(`FAIL external evidence init :: missing template ${templatePath}`);
  process.exit(1);
}

const targetExists = existsSync(targetPath);
const backupPath = targetExists ? backupPathForTarget(targetPath) : '';

if (targetExists && !force) {
  console.error(`FAIL external evidence init :: ${targetPath} already exists; use --force to overwrite; existing file will be backed up automatically`);
  process.exit(1);
}

const payload = readJson(templatePath);
payload.updatedAt = new Date().toISOString();
for (const item of payload.items || []) {
  item.status = 'pending';
  item.checkedAt = '';
}

if (dryRun) {
  if (targetExists && force) console.log(`PASS external evidence init dry-run :: would backup ${targetPath} to ${backupPath}`);
  console.log(`PASS external evidence init dry-run :: would write ${targetPath}`);
  process.exit(0);
}

if (targetExists && force) {
  await mkdir(dirname(backupPath), { recursive: true });
  await copyFile(targetPath, backupPath);
  console.log(`PASS external evidence init backup :: ${backupPath}`);
}

await mkdir(dirname(targetPath), { recursive: true });
await writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

console.log(`PASS external evidence init :: ${targetPath}`);
