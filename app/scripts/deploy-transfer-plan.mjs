import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const outputDir = 'output';
const jsonPath = join(outputDir, 'deploy-transfer-plan.json');
const markdownPath = join(outputDir, 'deploy-transfer-plan.md');
const targetPath = valueAfter('--target')
  || (existsSync('deploy/target.json') ? 'deploy/target.json' : 'deploy/target.example.json');

const REQUIRED_DIST_FILES = [
  'index.html',
  'runtime-config.js',
  'service-worker.js',
  'build-info.json'
];

const DEPLOY_CONFIG_FILES = [
  'deploy/docker-compose.production.yml',
  'deploy/nginx.conf',
  'deploy/production.env.example',
  'deploy/target.example.json'
];

const FORBIDDEN_TRANSFER_FILES = [
  'deploy/production.env',
  'deploy/target.json',
  'deploy/certs/fullchain.pem',
  'deploy/certs/privkey.pem'
];

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : '';
}

function normalizePath(value) {
  return String(value || '').replaceAll('\\\\', '/').replaceAll('\\', '/').replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

function normalizeLocalPath(value) {
  return normalizePath(value).replace(/^\.\//, '');
}

function joinRemotePath(parent, child) {
  return `${normalizePath(parent)}/${normalizePath(child).replace(/^\//, '')}`.replace(/\/+/g, '/');
}

function isInsideRemote(parent, child) {
  const parentPath = normalizePath(parent);
  const childPath = normalizePath(child);
  return childPath === parentPath || childPath.startsWith(`${parentPath}/`);
}

function assertMappingsInside(label, mappings, allowedTarget) {
  const outside = mappings.find(item => !isInsideRemote(allowedTarget, item.remotePath));
  if (outside) {
    fail(`${label} contains a path outside the allowed target: ${outside.localPath} -> ${outside.remotePath}`);
  }
}

async function readJsonFile(path) {
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
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
      const buffer = await readFile(fullPath);
      files.push({
        path: normalizePath(relative('.', fullPath)),
        bytes: buffer.byteLength,
        sha256: sha256(buffer)
      });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function fail(message) {
  console.error(`FAIL deploy transfer plan :: ${message}`);
  process.exit(1);
}

if (!existsSync('dist/index.html')) fail('dist is missing; run npm run build first');

for (const file of REQUIRED_DIST_FILES) {
  if (!existsSync(join('dist', file))) fail(`dist/${file} is missing`);
}

for (const file of DEPLOY_CONFIG_FILES) {
  if (!existsSync(file)) fail(`${file} is missing`);
}

const normalizedTargetPath = normalizeLocalPath(targetPath);
for (const file of FORBIDDEN_TRANSFER_FILES) {
  if (existsSync(file) && normalizeLocalPath(file) !== normalizedTargetPath) {
    fail(`private file must not be included in a transferable plan: ${file}`);
  }
}

const targetCheck = spawnSync(process.execPath, ['./scripts/deploy-target-check.mjs', '--target', targetPath], {
  cwd: process.cwd(),
  encoding: 'utf8'
});
if (targetCheck.status !== 0) {
  process.stdout.write(targetCheck.stdout || '');
  process.stderr.write(targetCheck.stderr || '');
  fail(`target check failed for ${targetPath}`);
}

let target;
try {
  target = await readJsonFile(targetPath);
} catch (error) {
  fail(`${targetPath} is not valid JSON: ${error.message}`);
}

const distFiles = await collectFiles('dist');
const distMappings = distFiles.map(file => ({
  localPath: file.path,
  remotePath: joinRemotePath(target.distTarget, file.path.replace(/^dist\//, '')),
  bytes: file.bytes,
  sha256: file.sha256
}));
const deployConfigMappings = DEPLOY_CONFIG_FILES.map(file => ({
  localPath: file,
  remotePath: joinRemotePath(target.deployConfigTarget, file.replace(/^deploy\//, ''))
}));
assertMappingsInside('dist mappings', distMappings, target.distTarget);
assertMappingsInside('deploy config mappings', deployConfigMappings, target.deployConfigTarget);

const buildInfo = JSON.parse(await readFile('dist/build-info.json', 'utf8'));
const artifactManifest = existsSync('output/release-artifacts.json')
  ? await readJsonFile('output/release-artifacts.json')
  : null;

const totalBytes = distFiles.reduce((sum, file) => sum + file.bytes, 0);
const plan = {
  schema: 'pet-companion-deploy-transfer-plan-v1',
  generatedAt: new Date().toISOString(),
  source: {
    dist: 'dist',
    deployConfigFiles: DEPLOY_CONFIG_FILES,
    privateFilesExcluded: FORBIDDEN_TRANSFER_FILES,
    artifactManifest: artifactManifest ? 'output/release-artifacts.json' : null
  },
  target: {
    file: targetPath,
    hostLabel: target.hostLabel,
    projectRoot: target.projectRoot,
    distTarget: target.distTarget,
    deployConfigTarget: target.deployConfigTarget,
    dataTarget: target.dataTarget,
    mediaTarget: target.mediaTarget
  },
  build: {
    app: buildInfo.name,
    version: buildInfo.version,
    target: buildInfo.target,
    channel: buildInfo.channel,
    pwaCache: buildInfo.pwa?.cacheName || '',
    artifactManifestSha256: artifactManifest?.summary?.manifestSha256 || artifactManifest?.summary?.sha256 || null
  },
  transfer: {
    distFileCount: distFiles.length,
    distTotalBytes: totalBytes,
    distMappings,
    deployConfigMappings,
    steps: [
      `create directories: ${target.projectRoot}, ${target.distTarget}, ${target.deployConfigTarget}, ${target.dataTarget}, ${target.mediaTarget}`,
      `upload local dist/ contents to ${target.distTarget}/`,
      `upload deploy/docker-compose.production.yml and deploy/nginx.conf to ${target.deployConfigTarget}/`,
      'create deploy/production.env on the server from deploy/production.env.example without sending secrets through chat',
      'place TLS certificate files on the server only, outside the public dist directory',
      'run docker compose from the app-owned project root, then run smoke and ops checks'
    ]
  },
  distFiles
};

await mkdir(outputDir, { recursive: true });
await writeFile(jsonPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

const markdown = `# 宠伴记服务器传输计划

- 生成时间：${plan.generatedAt}
- 目标配置：\`${targetPath}\`
- 主机标签：${target.hostLabel}
- 构建版本：${buildInfo.version}
- 发布频道：${buildInfo.channel}
- PWA 缓存：${plan.build.pwaCache}
- dist 文件数：${distFiles.length}
- dist 总大小：${totalBytes} bytes

## 只允许上传到这些目录

- App 根目录：\`${target.projectRoot}\`
- 前端产物目录：\`${target.distTarget}\`
- 部署配置目录：\`${target.deployConfigTarget}\`
- 数据目录：\`${target.dataTarget}\`
- 媒体目录：\`${target.mediaTarget}\`

## 禁止

- 不上传到服务器首页目录，例如 \`/var/www/html\`、\`/usr/share/nginx/html\`、\`/www/wwwroot\`、\`/home/*/public_html\`。
- 不把 \`deploy/production.env\`、\`deploy/target.json\`、TLS 私钥或证书打包进公开产物。
- 不把数据目录或媒体目录放在 \`dist\` 或部署配置目录里面。
- 本脚本只生成本地清单，不执行 SSH、SCP、rsync 或任何远端写入。

## 建议步骤

${plan.transfer.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}

## 产物校验

- Artifact manifest：${plan.build.artifactManifestSha256 || 'not generated yet'}
- Transfer plan JSON：\`${jsonPath}\`

## 精确传输映射

- 前端文件全部映射到 \`${target.distTarget}/\` 下，共 ${distMappings.length} 个文件。
- 部署配置只映射到 \`${target.deployConfigTarget}/\` 下，共 ${deployConfigMappings.length} 个文件。
- 生成器已校验所有 remotePath 都在允许目录内，不会指向服务器首页根目录。
`;

await writeFile(markdownPath, markdown, 'utf8');

const planStat = await stat(jsonPath);
console.log(`PASS deploy transfer plan :: ${jsonPath}`);
console.log(`PASS deploy transfer plan :: ${markdownPath}`);
console.log(`PASS deploy transfer plan :: ${distFiles.length} dist files, ${totalBytes} bytes, plan ${planStat.size} bytes`);
