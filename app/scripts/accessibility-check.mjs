import { readFileSync } from 'node:fs';

const checks = [];
const add = (name, pass, detail = '') => checks.push({ name, pass, detail });

function read(file) {
  return readFileSync(file, 'utf8');
}

const index = read('index.html');
const styles = read('styles.css');
const compactStyles = styles.replace(/\s+/g, '');
const views = read('src/ui/views.js');
const sw = read('service-worker.js');
const manifest = read('manifest.webmanifest');
const pkg = read('package.json');
const pkgJson = JSON.parse(pkg);
const deployment = read('docs/deployment.md');
const requirements = read('docs/requirements.md');
const releaseRunbook = read('docs/release-runbook.md');

add('html language is Chinese', index.includes('<html lang="zh-CN">'));
add('viewport and theme metadata exist', index.includes('name="viewport"') && index.includes('name="theme-color"'));
add('skip link targets main app', index.includes('class="skip-link"') && index.includes('href="#app"') && index.includes('id="app"') && index.includes('tabindex="-1"'));
add('toast status is announced politely', index.includes('id="toast"') && index.includes('aria-live="polite"') && index.includes('role="status"'));
add('main app is not a noisy live region', !index.includes('<main id="app" aria-live='));
add('manifest remains installable', manifest.includes('"display": "standalone"') && manifest.includes('"start_url"') && manifest.includes('"icons"'));

add('global focus-visible style exists', styles.includes(':focus-visible') && styles.includes('outline'));
add('skip link has visible focus state', styles.includes('.skip-link:focus-visible') && compactStyles.includes('transform:translateY(0)'));
add('screen reader utility exists', styles.includes('.sr-only') && compactStyles.includes('clip:rect(0000)'));
add('primary touch targets are at least 44px', compactStyles.includes('.icon-btn,.ghost-btn,.primary-btn,.danger-btn') && compactStyles.includes('min-height:44px'));

add('bottom nav has accessible labels', views.includes('aria-label="${label}"') && views.includes('aria-current="page"'));
add('checkin cards are native buttons', views.includes('<button type="button" class="checkin-card') && !views.includes('role="button" aria-label="${escapeHTML(item.title)}'));
add('checkin dialog is announced', views.includes('role="dialog"') && views.includes('aria-modal="true"') && views.includes('checkin-sheet-title'));
add('checkin sheet custom fields have labels', ['打卡标题', '打卡图标', '打卡时间'].every(label => views.includes(`>${label}</label>`)));
add('reminder sheet custom fields have labels', ['提醒名称', '提醒类型', '提醒图标', '提醒日期', '提醒备注'].every(label => views.includes(`>${label}</label>`)));
add('comment input has a screen-reader label', views.includes('评论内容') && views.includes('comment-form'));

add('service worker has offline navigation fallback', sw.includes("event.request.mode === 'navigate'") && sw.includes("caches.match('./index.html')"));
add(
  'service worker cache version matches app version',
  new RegExp(`pet-companion-v${pkgJson.version}-assets-[a-f0-9]{12}`).test(sw),
  `expected pet-companion-v${pkgJson.version}-assets-<hash>`
);
add('runtime config is not precached', !sw.includes('runtime-config.js'));

add('package exposes accessibility gate', pkg.includes('"accessibility:check"') && pkg.includes('scripts/accessibility-check.mjs'));
add('release gate includes accessibility check', pkg.includes('npm run accessibility:check'));
add('deployment checklist documents accessibility check', deployment.includes('npm run accessibility:check') && deployment.includes('离线导航回退'));
add('requirements include accessibility offline gate', requirements.includes('可访问性与离线可用门禁') && requirements.includes('npm run accessibility:check'));
add('release runbook includes accessibility evidence', releaseRunbook.includes('accessibility:check') && releaseRunbook.includes('offline navigation fallback'));

const failed = checks.filter(check => !check.pass);
for (const check of checks) {
  console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` - ${check.detail}` : ''}`);
}

if (failed.length) {
  console.error(`\n${failed.length} accessibility/offline check(s) failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} accessibility/offline checks passed.`);
