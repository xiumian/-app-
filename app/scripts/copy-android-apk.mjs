import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const sourceApk = 'android/app/build/outputs/apk/debug/app-debug.apk';
const outputDir = 'output';
const targetApk = `${outputDir}/pet-companion-android-debug.apk`;
const targetSha = `${targetApk}.sha256.txt`;
const targetJson = `${outputDir}/pet-companion-android-debug.json`;

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

async function main() {
  if (!existsSync(sourceApk)) {
    throw new Error(`missing APK: ${sourceApk}; run npm.cmd run android:debug first`);
  }
  await mkdir(outputDir, { recursive: true });
  await copyFile(sourceApk, targetApk);
  const buffer = await readFile(targetApk);
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  await writeFile(targetSha, `${sha256}  ${targetApk}\n`, 'utf8');
  const payload = {
    schema: 'pet-companion-android-debug-apk-v1',
    generatedAt: new Date().toISOString(),
    generatedAtLocal: formatChinaTime(),
    sourceApk,
    apkPath: targetApk,
    sha256Path: targetSha,
    bytes: buffer.byteLength,
    sha256,
    installNote: 'Debug APK for local device installation and acceptance only; not a signed app-store release build.'
  };
  await writeFile(targetJson, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`PASS android debug apk :: ${targetApk}`);
  console.log(`PASS android debug apk sha256 :: ${targetSha}`);
  console.log(`APK bytes: ${payload.bytes}`);
  console.log(`APK sha256: ${sha256}`);
}

main().catch(error => {
  console.error(`FAIL android apk copy :: ${error.message}`);
  process.exit(1);
});
