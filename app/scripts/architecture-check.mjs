import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const checks = [];
const add = (name, pass, detail = '') => checks.push({ name, pass, detail });
const read = file => readFileSync(file, 'utf8');
const toPosix = file => file.replace(/\\/g, '/');

function listJsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) return listJsFiles(file);
    return entry.isFile() && file.endsWith('.js') ? [toPosix(file)] : [];
  });
}

function getRelativeImports(file) {
  const text = read(file);
  const imports = [];
  for (const match of text.matchAll(/^import\s+(?:[^'\n]*?from\s*)?['\"]([^'\"]+)['\"]/gm)) {
    imports.push(match[1]);
  }
  return imports;
}

function resolveRelativeImport(importer, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(importer), specifier);
  const candidates = [base, `${base}.js`, join(base, 'index.js')];
  const matched = candidates.find(candidate => existsSync(candidate) && statSync(candidate).isFile());
  return matched ? toPosix(relative(process.cwd(), matched)) : null;
}

const forbiddenLayerImports = {
  'src/api/': ['src/ui/', 'src/repositories/', 'server/'],
  'src/repositories/': ['src/ui/', 'server/'],
  'src/domain/': ['src/api/', 'src/repositories/', 'src/ui/', 'server/'],
  'src/ui/': ['src/api/', 'src/repositories/', 'server/'],
  'src/core/': ['src/ui/', 'server/'],
  'server/': ['src/ui/', 'src/main.js']
};

function layerPrefix(file) {
  return Object.keys(forbiddenLayerImports).find(prefix => file.startsWith(prefix));
}

function layerViolations(file) {
  const prefix = layerPrefix(file);
  if (!prefix) return [];
  const forbidden = forbiddenLayerImports[prefix];
  return getRelativeImports(file)
    .map(specifier => ({ specifier, target: resolveRelativeImport(file, specifier) }))
    .filter(item => item.target && (forbidden.some(blocked => item.target.startsWith(blocked)) || item.target === 'src/main.js'))
    .map(item => `${item.specifier}->${item.target}`);
}

const requiredFiles = [
  'docs/architecture.md',
  'src/main.js',
  'src/api/client.js',
  'src/api/appStateClient.js',
  'src/api/authClient.js',
  'src/api/accountClient.js',
  'src/api/mediaClient.js',
  'src/api/monitoringClient.js',
  'src/api/localStore.js',
  'src/repositories/appStateRepository.js',
  'src/repositories/authRepository.js',
  'src/core/state.js',
  'src/core/migrations.js',
  'src/core/config.js',
  'src/core/monitoring.js',
  'src/core/pwaUpdate.js',
  'src/core/policies.js',
  'src/core/selectors.js',
  'src/core/validation.js',
  'src/core/remoteSync.js',
  'src/domain/checkins.js',
  'src/domain/diagnostics.js',
  'src/domain/consent.js',
  'src/ui/views.js',
  'src/ui/components.js',
  'server/index.js',
  'server/config.js',
  'server/router.js',
  'server/auth.js',
  'server/state.js',
  'server/storage.js',
  'server/media.js',
  'server/health.js',
  'scripts/release-evidence-check.mjs',
  'package.json'
];

for (const file of requiredFiles) {
  add(`architecture file:${file}`, existsSync(file), file);
}

const architecture = existsSync('docs/architecture.md') ? read('docs/architecture.md') : '';
const pkg = JSON.parse(read('package.json'));
const releaseCheckCommand = pkg.scripts?.['release:check'] || '';

const mustMention = [
  '宠伴记生产架构说明',
  'src/api/accountClient.js',
  'src/api/mediaClient.js',
  'src/core/pwaUpdate.js',
  'src/core/remoteSync.js',
  'src/domain/consent.js',
  'src/domain/diagnostics.js',
  'server/storage.js',
  'PET_STORAGE_DRIVER=sqlite',
  'PET_MEDIA_STORAGE_DRIVER=local',
  'scripts/architecture-check.mjs',
  'npm run architecture:check',
  '本地门禁通过，但不能声明真实上线完成'
];

for (const text of mustMention) {
  add(`architecture mentions:${text}`, architecture.includes(text), text);
}

const staleClaims = [
  '前端架构说明',
  '远端 API 客户端骨架',
  '远端账号接口骨架',
  'Node API 雏形',
  '使用本地 JSON 文件作为开发期存储',
  '正式上线时应替换为数据库',
  '当前不会持久化真实 token',
  '后续接真实服务器时',
  '后续接真实账号体系时',
  '上线前后续建议'
];

for (const staleClaim of staleClaims) {
  add(`architecture has no stale claim:${staleClaim}`, !architecture.includes(staleClaim), staleClaim);
}


const layerFiles = [...listJsFiles('src'), ...listJsFiles('server')];
for (const file of layerFiles) {
  const unresolved = getRelativeImports(file)
    .filter(specifier => specifier.startsWith('.'))
    .filter(specifier => !resolveRelativeImport(file, specifier));
  add(`layer imports resolve:${file}`, unresolved.length === 0, unresolved.join(', '));

  if (file !== 'src/main.js') {
    const violations = layerViolations(file);
    add(`layer boundary:${file}`, violations.length === 0, violations.join(', '));
  }
}

add('layer boundary allows main composition only', getRelativeImports('src/main.js').some(specifier => specifier.includes('/ui/')) && getRelativeImports('src/main.js').some(specifier => specifier.includes('/repositories/')) && getRelativeImports('src/main.js').some(specifier => specifier.includes('/domain/')));
add('layer boundary rules documented in architecture', architecture.includes('\u5206\u5c42\u4f9d\u8d56\u95e8\u7981') && architecture.includes('UI \u5c42\u4e0d\u5f97\u76f4\u63a5\u5bfc\u5165 API \u6216 Repository') && architecture.includes('Domain \u5c42\u4e0d\u5f97\u5bfc\u5165 UI\u3001API \u6216 Repository'));

add('package exposes architecture check', pkg.scripts?.['architecture:check'] === 'node ./scripts/architecture-check.mjs');
add('release gate includes architecture check', releaseCheckCommand.includes('npm run architecture:check'));
add('release gate checks architecture before release evidence', releaseCheckCommand.indexOf('npm run architecture:check') > -1 && releaseCheckCommand.indexOf('npm run architecture:check') < releaseCheckCommand.indexOf('npm run artifact:manifest'));
add('architecture doc is copied by build', read('scripts/build.mjs').includes("'docs'"));
add('audit validates architecture check', read('scripts/audit.mjs').includes('architecture-check.mjs'));

const failed = checks.filter(check => !check.pass);
for (const check of checks) {
  console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
}

if (failed.length) {
  console.error(`\n${failed.length} architecture checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} architecture checks passed.`);
