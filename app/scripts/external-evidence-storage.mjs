#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile, stat, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const outputDir = 'output';
const latestJsonPath = `${outputDir}/storage-evidence-latest.json`;
const latestMarkdownPath = `${outputDir}/storage-evidence-latest.md`;
const DEFAULT_DATA_DIR = 'server-data';
const DEFAULT_SQLITE_FILE = 'server-data/pet-companion.sqlite';
const DEFAULT_MEDIA_DIR = 'server-data/media';
const SECRET_TEXT_PATTERN = /(password|secret|token|cookie|private[_-]?key|access[_-]?key|AKIA[0-9A-Z]{16}|-----BEGIN)/i;

function parseArgs(argv) {
  const result = {
    dataDir: DEFAULT_DATA_DIR,
    sqliteFile: DEFAULT_SQLITE_FILE,
    mediaDir: DEFAULT_MEDIA_DIR,
    owner: 'storage-owner'
  };
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
  return `Usage: node ./scripts/external-evidence-storage.mjs [--data-dir <path>] [--sqlite-file <path>] [--media-dir <path>] [--storage-ref <masked-ref>] [--restart-ref <masked-ref>] [--restore-owner-ref <masked-ref>] [--media-mount-ref <masked-ref>] [--media-upload-ref <masked-ref>] [--media-restart-ref <masked-ref>] [--owner <owner-id>]

Examples:
  npm.cmd run external:evidence:storage -- --data-dir /data --sqlite-file /data/pet-companion.sqlite --media-dir /data/media --storage-ref "ops-ticket-789#volume" --restart-ref "ops-ticket-789#restart-retention" --restore-owner-ref "ops-ticket-789#restore-owner" --media-mount-ref "ops-ticket-789#media-volume" --media-upload-ref "qa-ticket-321#upload-read" --media-restart-ref "qa-ticket-321#media-restart" --owner "ops-wang"

This collector records file and directory metadata plus masked operational references only. It does not read database rows, media contents, passwords, tokens, cookies, or production secrets.`;
}

function assertSafeText(label, value, { allowEmpty = false } = {}) {
  const text = String(value || '').trim();
  if (!allowEmpty && !text) throw new Error(`${label} is required`);
  if (SECRET_TEXT_PATTERN.test(text)) throw new Error(`${label} appears to contain a secret; store only a masked ticket/link/record`);
  return text;
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

async function safeStat(path) {
  if (!path || !existsSync(path)) return { exists: false, path, resolvedPath: path ? resolve(path) : '' };
  const info = await stat(path);
  return {
    exists: true,
    path,
    resolvedPath: resolve(path),
    isFile: info.isFile(),
    isDirectory: info.isDirectory(),
    sizeBytes: info.size,
    modifiedAt: info.mtime.toISOString(),
    mode: `0${(info.mode & 0o777).toString(8)}`
  };
}

async function safeDirectorySummary(path) {
  const base = await safeStat(path);
  if (!base.exists || !base.isDirectory) return { ...base, childCount: 0, sampleNames: [] };
  const names = await readdir(path).catch(() => []);
  return {
    ...base,
    childCount: names.length,
    sampleNames: names.slice(0, 8)
  };
}

function sidecarPaths(sqliteFile) {
  return [`${sqliteFile}-wal`, `${sqliteFile}-shm`];
}

function buildUpdateCommand({ id, owner, ready, proofRefs }) {
  if (!ready) return `# ${id} evidence is incomplete; collect required file metadata and masked proof refs before registering`;
  return `npm.cmd run external:evidence:update -- --id ${id} --status verified --owner "${owner}" --evidence-ref "${latestJsonPath}"${proofRefs.map(ref => ` --proof-ref "${ref}"`).join('')}`;
}

function escapePipes(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function coverageRows(items) {
  return items.map((item, index) => `| ${index + 1} | ${escapePipes(item.requiredProof)} | ${item.covered ? 'yes' : 'no'} | ${escapePipes(item.proofRef || 'missing')} |`).join('\n');
}

function markdownFor(payload) {
  return `# storage external evidence result

- Generated at: ${payload.generatedAtLocal}
- Owner: ${payload.owner}
- Data dir: ${payload.inputs.dataDir}
- SQLite file: ${payload.inputs.sqliteFile}
- Media dir: ${payload.inputs.mediaDir}

## Persistent storage summary

| Item | Result |
| --- | --- |
| Data dir exists | ${payload.persistentStorage.dataDir.exists ? 'yes' : 'no'} |
| SQLite file exists | ${payload.persistentStorage.sqliteFile.exists ? 'yes' : 'no'} |
| SQLite size bytes | ${payload.persistentStorage.sqliteFile.sizeBytes == null ? 'unknown' : payload.persistentStorage.sqliteFile.sizeBytes} |
| SQLite sidecars present | ${payload.persistentStorage.sidecars.filter(item => item.exists).length}/${payload.persistentStorage.sidecars.length} |
| Storage reference | ${payload.refs.storageRef || 'missing'} |
| Restart retention reference | ${payload.refs.restartRef || 'missing'} |
| Restore owner reference | ${payload.refs.restoreOwnerRef || 'missing'} |
| Ready for verified | ${payload.summary.persistentReadyForVerified ? 'yes' : 'no'} |

## Object/media storage summary

| Item | Result |
| --- | --- |
| Media dir exists | ${payload.objectStorage.mediaDir.exists ? 'yes' : 'no'} |
| Media dir child count | ${payload.objectStorage.mediaDir.childCount} |
| Media mount reference | ${payload.refs.mediaMountRef || 'missing'} |
| Upload/read reference | ${payload.refs.mediaUploadRef || 'missing'} |
| Media restart reference | ${payload.refs.mediaRestartRef || 'missing'} |
| Ready for verified | ${payload.summary.objectReadyForVerified ? 'yes' : 'no'} |

## persistentStorage requiredProof coverage

| # | requiredProof | covered | proofRef |
| ---: | --- | --- | --- |
${coverageRows(payload.persistentStorage.requiredProofCoverage)}

## objectStorage requiredProof coverage

| # | requiredProof | covered | proofRef |
| ---: | --- | --- | --- |
${coverageRows(payload.objectStorage.requiredProofCoverage)}

## Suggested update commands

~~~powershell
${payload.suggestedCommands.persistentStorage}
${payload.suggestedCommands.objectStorage}
~~~

This file intentionally does not read database rows or media contents and does not contain passwords, tokens, cookies, private keys, or production secrets.
`;
}

async function collect(options) {
  const generatedAt = new Date();
  const owner = assertSafeText('owner', options.owner || 'storage-owner');
  const dataDir = assertSafeText('dataDir', options.dataDir || DEFAULT_DATA_DIR);
  const sqliteFile = assertSafeText('sqliteFile', options.sqliteFile || DEFAULT_SQLITE_FILE);
  const mediaDir = assertSafeText('mediaDir', options.mediaDir || DEFAULT_MEDIA_DIR);
  const refs = {
    storageRef: options.storageRef ? assertSafeText('storageRef', options.storageRef) : '',
    restartRef: options.restartRef ? assertSafeText('restartRef', options.restartRef) : '',
    restoreOwnerRef: options.restoreOwnerRef ? assertSafeText('restoreOwnerRef', options.restoreOwnerRef) : '',
    mediaMountRef: options.mediaMountRef ? assertSafeText('mediaMountRef', options.mediaMountRef) : '',
    mediaUploadRef: options.mediaUploadRef ? assertSafeText('mediaUploadRef', options.mediaUploadRef) : '',
    mediaRestartRef: options.mediaRestartRef ? assertSafeText('mediaRestartRef', options.mediaRestartRef) : ''
  };

  const dataDirStat = await safeDirectorySummary(dataDir);
  const sqliteStat = await safeStat(sqliteFile);
  const sqliteParentStat = await safeDirectorySummary(dirname(sqliteFile));
  const sidecars = await Promise.all(sidecarPaths(sqliteFile).map(path => safeStat(path)));
  const mediaDirStat = await safeDirectorySummary(mediaDir);

  const sqliteMetadataCovered = Boolean(dataDirStat.exists && sqliteParentStat.exists && sqliteStat.exists && sqliteStat.isFile);
  const storageReferenceCovered = Boolean(refs.storageRef);
  const restartCovered = Boolean(refs.restartRef);
  const restoreOwnerCovered = Boolean(refs.restoreOwnerRef);
  const persistentReadyForVerified = sqliteMetadataCovered && storageReferenceCovered && restartCovered && restoreOwnerCovered;

  const mediaConfigCovered = Boolean(mediaDirStat.exists && mediaDirStat.isDirectory);
  const mediaMountCovered = Boolean(mediaDirStat.exists && mediaDirStat.isDirectory && refs.mediaMountRef);
  const mediaUploadCovered = Boolean(refs.mediaUploadRef);
  const mediaRestartCovered = Boolean(refs.mediaRestartRef);
  const objectReadyForVerified = mediaConfigCovered && mediaMountCovered && mediaUploadCovered && mediaRestartCovered;

  const persistentProofRefs = [
    `${latestJsonPath}#sqlite-metadata`,
    refs.restartRef || `${latestJsonPath}#restart-retention`,
    refs.restoreOwnerRef || `${latestJsonPath}#restore-owner`
  ];
  const objectProofRefs = [
    `${latestJsonPath}#media-config`,
    refs.mediaMountRef || `${latestJsonPath}#media-mount`,
    refs.mediaUploadRef || `${latestJsonPath}#media-upload-read`,
    refs.mediaRestartRef || `${latestJsonPath}#media-restart`
  ];

  const payload = {
    schema: 'pet-companion-storage-evidence-v1',
    generatedAt: generatedAt.toISOString(),
    generatedAtLocal: formatChinaTime(generatedAt),
    owner,
    inputs: { dataDir, sqliteFile, mediaDir },
    refs,
    output: {
      latestJsonPath,
      latestMarkdownPath,
      archiveJsonPath: `${outputDir}/storage-evidence-${timestampForPath(generatedAt)}.json`,
      archiveMarkdownPath: `${outputDir}/storage-evidence-${timestampForPath(generatedAt)}.md`
    },
    summary: {
      persistentReadyForProvided: sqliteMetadataCovered,
      persistentReadyForVerified,
      objectReadyForProvided: mediaConfigCovered || mediaDirStat.exists,
      objectReadyForVerified
    },
    persistentStorage: {
      dataDir: dataDirStat,
      sqliteFile: sqliteStat,
      sqliteParentDir: sqliteParentStat,
      sidecars,
      requiredProofCoverage: [
        {
          requiredProof: 'SQLite persistent volume or database instance identifier',
          covered: sqliteMetadataCovered && storageReferenceCovered,
          proofRef: refs.storageRef || `${latestJsonPath}#sqlite-metadata`
        },
        {
          requiredProof: 'Data retention verification after restart',
          covered: restartCovered,
          proofRef: refs.restartRef || ''
        },
        {
          requiredProof: 'Data restore owner record',
          covered: restoreOwnerCovered,
          proofRef: refs.restoreOwnerRef || ''
        }
      ]
    },
    objectStorage: {
      mediaDir: mediaDirStat,
      requiredProofCoverage: [
        {
          requiredProof: 'PET_MEDIA_STORAGE_DRIVER=local and PET_MEDIA_LOCAL_DIR production config record',
          covered: mediaConfigCovered,
          proofRef: `${latestJsonPath}#media-config`
        },
        {
          requiredProof: 'Media directory mounted to persistent server volume',
          covered: mediaMountCovered,
          proofRef: refs.mediaMountRef || ''
        },
        {
          requiredProof: 'Image upload and /media/files read acceptance screenshot',
          covered: mediaUploadCovered,
          proofRef: refs.mediaUploadRef || ''
        },
        {
          requiredProof: 'Image remains accessible after server restart',
          covered: mediaRestartCovered,
          proofRef: refs.mediaRestartRef || ''
        }
      ]
    }
  };
  payload.suggestedCommands = {
    persistentStorage: buildUpdateCommand({ id: 'persistentStorage', owner, ready: persistentReadyForVerified, proofRefs: persistentProofRefs }),
    objectStorage: buildUpdateCommand({ id: 'objectStorage', owner, ready: objectReadyForVerified, proofRefs: objectProofRefs })
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
  const fixtureRoot = `${outputDir}/storage-evidence-fixture`;
  const dataDir = `${fixtureRoot}/data`;
  const sqliteFile = `${dataDir}/pet-companion.sqlite`;
  const mediaDir = `${dataDir}/media`;
  await mkdir(mediaDir, { recursive: true });
  await writeFile(sqliteFile, 'sqlite fixture metadata only', 'utf8');
  await writeFile(`${sqliteFile}-wal`, 'wal fixture', 'utf8');
  await writeFile(`${mediaDir}/sample.txt`, 'media fixture metadata only', 'utf8');
  const payload = await collect({
    dataDir,
    sqliteFile,
    mediaDir,
    owner: 'ops-wang',
    storageRef: 'ops-ticket-789#volume',
    restartRef: 'ops-ticket-789#restart-retention',
    restoreOwnerRef: 'ops-ticket-789#restore-owner',
    mediaMountRef: 'ops-ticket-789#media-volume',
    mediaUploadRef: 'qa-ticket-321#upload-read',
    mediaRestartRef: 'qa-ticket-321#media-restart'
  });
  const json = JSON.stringify(payload);
  const markdown = markdownFor(payload);
  const checks = [];
  const add = (name, pass, detail = '') => checks.push({ name, pass, detail });
  add('persistent storage ready in fixture', payload.summary.persistentReadyForVerified);
  add('object storage ready in fixture', payload.summary.objectReadyForVerified);
  add('collector records sqlite metadata', payload.persistentStorage.sqliteFile.exists && payload.persistentStorage.sqliteFile.sizeBytes > 0);
  add('collector records media directory metadata', payload.objectStorage.mediaDir.exists && payload.objectStorage.mediaDir.childCount > 0);
  add('collector does not include private key or access key blocks', !/(AKIA[0-9A-Z]{16}|-----BEGIN)/i.test(json) && !/(AKIA[0-9A-Z]{16}|-----BEGIN)/i.test(markdown));
  add('builds both update commands', payload.suggestedCommands.persistentStorage.includes('--id persistentStorage') && payload.suggestedCommands.objectStorage.includes('--id objectStorage'));

  let failed = 0;
  for (const check of checks) {
    if (check.pass) console.log(`PASS ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
    else {
      failed += 1;
      console.error(`FAIL ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
    }
  }
  if (failed) throw new Error(`${failed} storage evidence self-test checks failed`);
  console.log(`\nPASS external evidence storage self-test :: ${checks.length} checks passed.`);
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
  console.log(`PASS storage evidence latest json :: ${latestJsonPath}`);
  console.log(`PASS storage evidence latest markdown :: ${latestMarkdownPath}`);
  console.log(`PASS storage evidence archive json :: ${payload.output.archiveJsonPath}`);
  console.log(`PASS storage evidence archive markdown :: ${payload.output.archiveMarkdownPath}`);
  console.log(`persistentStorage readyForProvided: ${payload.summary.persistentReadyForProvided}`);
  console.log(`persistentStorage readyForVerified: ${payload.summary.persistentReadyForVerified}`);
  console.log(`objectStorage readyForProvided: ${payload.summary.objectReadyForProvided}`);
  console.log(`objectStorage readyForVerified: ${payload.summary.objectReadyForVerified}`);
  console.log('Suggested update commands:');
  console.log(payload.suggestedCommands.persistentStorage);
  console.log(payload.suggestedCommands.objectStorage);
}

main().catch(error => {
  console.error(`FAIL external evidence storage :: ${error.message}`);
  process.exit(1);
});
