import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { APP_BUILD_TARGET, APP_RELEASE_CHANNEL, APP_VERSION } from '../src/core/config.js';

const distDir = 'dist';
const outputDir = 'output';
const jsonPath = join(outputDir, 'release-artifacts.json');
const markdownPath = join(outputDir, 'release-artifacts.md');

const requiredArtifacts = [
  'index.html',
  'runtime-config.js',
  'service-worker.js',
  'manifest.webmanifest',
  '_headers',
  'build-info.json',
  'src/main.js',
  'assets/icon.svg',
  'assets/maskable-icon.svg',
  'docs/privacy.md',
  'docs/terms.md'
];

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

if (!existsSync(join(distDir, 'index.html'))) {
  console.error('FAIL artifact manifest :: dist/index.html missing, run npm run build first');
  process.exit(1);
}

const files = (await collectFiles(distDir))
  .map(file => ({ fullPath: file, path: normalizePath(relative(distDir, file)) }))
  .sort((a, b) => a.path.localeCompare(b.path));

const artifacts = [];
for (const file of files) {
  const [buffer, info] = await Promise.all([readFile(file.fullPath), stat(file.fullPath)]);
  artifacts.push({
    path: file.path,
    bytes: info.size,
    sha256: sha256(buffer)
  });
}

const missingRequired = requiredArtifacts.filter(path => !artifacts.some(item => item.path === path));
const totalBytes = artifacts.reduce((sum, item) => sum + item.bytes, 0);
const manifestHash = sha256(Buffer.from(JSON.stringify(artifacts.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })), null, 2), 'utf8'));

const manifest = {
  schema: 'pet-companion-release-artifacts-v1',
  generatedAt: new Date().toISOString(),
  app: {
    version: APP_VERSION,
    target: APP_BUILD_TARGET,
    channel: APP_RELEASE_CHANNEL
  },
  source: distDir,
  requiredArtifacts,
  missingRequired,
  summary: {
    fileCount: artifacts.length,
    totalBytes,
    manifestSha256: manifestHash
  },
  artifacts
};

const markdown = `# 宠伴记发布产物清单

- 生成时间：${manifest.generatedAt}
- 应用版本：${manifest.app.version}
- 构建目标：${manifest.app.target}
- 发布通道：${manifest.app.channel}
- 来源目录：${manifest.source}
- 文件数量：${manifest.summary.fileCount}
- 总字节数：${manifest.summary.totalBytes}
- 清单 SHA-256：${manifest.summary.manifestSha256}
- 必要产物缺失：${manifest.missingRequired.length ? manifest.missingRequired.join(', ') : '无'}

## 核心产物

${requiredArtifacts.map(path => {
  const item = artifacts.find(artifact => artifact.path === path);
  return item ? `- ${item.path} · ${item.bytes} bytes · ${item.sha256}` : `- ${path} · MISSING`;
}).join('\n')}

## 全量产物

${artifacts.map(item => `- ${item.path} · ${item.bytes} bytes · ${item.sha256}`).join('\n')}
`;

await mkdir(outputDir, { recursive: true });
await writeFile(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await writeFile(markdownPath, markdown, 'utf8');

if (missingRequired.length) {
  console.error(`FAIL artifact manifest :: missing ${missingRequired.join(', ')}`);
  process.exit(1);
}

console.log(`PASS artifact manifest :: ${jsonPath}`);
console.log(`PASS artifact manifest :: ${markdownPath}`);
console.log(`PASS artifact manifest :: ${artifacts.length} files, sha256 ${manifestHash}`);
