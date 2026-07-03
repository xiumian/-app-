import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const outputDir = 'output';
const bundleDir = `${outputDir}/10am-acceptance-bundle`;
const latestZipPath = `${outputDir}/10am-acceptance-bundle-latest.zip`;
const latestJsonPath = `${outputDir}/10am-acceptance-bundle-latest.json`;
const latestShaPath = `${outputDir}/10am-acceptance-bundle-latest.sha256.txt`;
const latestZipShaPath = `${outputDir}/10am-acceptance-bundle-latest.zip.sha256.txt`;

function stamp(date = new Date()) {
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

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function runNode(scriptPath, args = []) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error(`${scriptPath} exited ${result.status}`);
  }
  return result;
}

async function main() {
  const generatedAt = new Date();
  runNode('./scripts/acceptance-10am.mjs');
  runNode('./scripts/acceptance-bundle-check.mjs');

  if (!existsSync(bundleDir)) throw new Error(`${bundleDir} is missing`);
  await mkdir(outputDir, { recursive: true });

  const zipPath = `${outputDir}/10am-acceptance-bundle-${stamp(generatedAt)}.zip`;
  const absoluteBundle = resolve(bundleDir);
  const absoluteZip = resolve(zipPath);
  const command = [
    '-NoProfile',
    '-Command',
    `Compress-Archive -LiteralPath ${JSON.stringify(absoluteBundle)} -DestinationPath ${JSON.stringify(absoluteZip)} -CompressionLevel Optimal`
  ];
  const zipResult = spawnSync('powershell', command, {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true
  });
  if (zipResult.status !== 0) {
    process.stdout.write(zipResult.stdout || '');
    process.stderr.write(zipResult.stderr || '');
    throw new Error(`Compress-Archive exited ${zipResult.status}`);
  }

  const zipBuffer = await readFile(zipPath);
  const hash = sha256(zipBuffer);
  const shaPath = `${zipPath}.sha256.txt`;
  const summary = {
    schema: 'pet-companion-acceptance-bundle-zip-v1',
    generatedAt: generatedAt.toISOString(),
    generatedAtLocal: formatChinaTime(generatedAt),
    bundleDir,
    zipPath,
    latestZipPath,
    latestShaPath,
    latestZipShaPath,
    bytes: zipBuffer.byteLength,
    sha256: hash,
    openFirst: 'index.html',
    sourceCheck: 'npm.cmd run acceptance:bundle:check'
  };

  await writeFile(shaPath, `${hash}  ${zipPath.replaceAll('\\', '/')}\n`, 'utf8');
  await copyFile(zipPath, latestZipPath);
  await writeFile(latestShaPath, `${hash}  ${latestZipPath.replaceAll('\\', '/')}\n`, 'utf8');
  await writeFile(latestZipShaPath, `${hash}  ${latestZipPath.replaceAll('\\', '/')}\n`, 'utf8');
  await writeFile(latestJsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  console.log(`PASS acceptance bundle zip :: ${zipPath}`);
  console.log(`PASS acceptance bundle zip stable latest :: ${latestZipPath}`);
  console.log(`PASS acceptance bundle zip sha256 :: ${hash}`);
  console.log(`PASS acceptance bundle zip bytes :: ${zipBuffer.byteLength}`);
  console.log(`PASS acceptance bundle zip latest :: ${latestJsonPath}`);
}

main().catch(error => {
  console.error(`FAIL acceptance bundle zip :: ${error.message}`);
  process.exit(1);
});
