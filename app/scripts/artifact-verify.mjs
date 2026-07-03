import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const args = process.argv.slice(2);
const sourceIndex = args.indexOf('--source');
const manifestIndex = args.indexOf('--manifest');
const distDir = sourceIndex >= 0 ? args[sourceIndex + 1] : 'dist';
const manifestPath = manifestIndex >= 0 ? args[manifestIndex + 1] : 'output/release-artifacts.json';

function normalizePath(path) {
  return path.replaceAll('\\\\', '/').replaceAll('\\', '/');
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function fail(message) {
  console.error(`FAIL artifact verify :: ${message}`);
  process.exit(1);
}

if (!existsSync(manifestPath)) fail(`${manifestPath} missing, run npm run artifact:manifest first`);
if (!existsSync(distDir)) fail(`${distDir} missing, run npm run build first`);

let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch (error) {
  fail(`cannot parse manifest: ${error.message}`);
}

if (manifest.schema !== 'pet-companion-release-artifacts-v1') fail('schema mismatch');
if (!Array.isArray(manifest.artifacts)) fail('artifacts array missing');
if (!manifest.summary || typeof manifest.summary.manifestSha256 !== 'string') fail('summary hash missing');

const currentFiles = (await collectFiles(distDir))
  .map(file => ({ fullPath: file, path: normalizePath(relative(distDir, file)) }))
  .sort((a, b) => a.path.localeCompare(b.path));

const currentArtifacts = [];
for (const file of currentFiles) {
  const [buffer, info] = await Promise.all([readFile(file.fullPath), stat(file.fullPath)]);
  currentArtifacts.push({
    path: file.path,
    bytes: info.size,
    sha256: sha256(buffer)
  });
}

const expected = new Map(manifest.artifacts.map(item => [item.path, item]));
const actual = new Map(currentArtifacts.map(item => [item.path, item]));
const missing = manifest.artifacts.filter(item => !actual.has(item.path)).map(item => item.path);
const extra = currentArtifacts.filter(item => !expected.has(item.path)).map(item => item.path);
const changed = currentArtifacts
  .filter(item => expected.has(item.path))
  .filter(item => expected.get(item.path).bytes !== item.bytes || expected.get(item.path).sha256 !== item.sha256)
  .map(item => item.path);

const currentManifestSha256 = sha256(Buffer.from(JSON.stringify(currentArtifacts.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })), null, 2), 'utf8'));
const summaryMismatch = currentManifestSha256 !== manifest.summary.manifestSha256;

if (missing.length || extra.length || changed.length || summaryMismatch) {
  if (missing.length) console.error(`missing: ${missing.join(', ')}`);
  if (extra.length) console.error(`extra: ${extra.join(', ')}`);
  if (changed.length) console.error(`changed: ${changed.join(', ')}`);
  if (summaryMismatch) console.error(`summary sha256 mismatch: ${currentManifestSha256} !== ${manifest.summary.manifestSha256}`);
  process.exit(1);
}

console.log(`PASS artifact verify :: ${manifestPath}`);
console.log(`PASS artifact verify :: ${currentArtifacts.length} files match ${distDir}`);
console.log(`PASS artifact verify :: sha256 ${currentManifestSha256}`);
