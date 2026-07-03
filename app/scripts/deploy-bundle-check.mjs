import { existsSync, readFileSync } from 'node:fs';

const checks = [];
const add = (name, pass, detail = '') => checks.push({ name, pass, detail });
const read = file => existsSync(file) ? readFileSync(file, 'utf8') : '';

const compose = read('deploy/docker-compose.production.yml');
const nginx = read('deploy/nginx.conf');
const envExample = read('deploy/production.env.example');
const targetExample = read('deploy/target.example.json');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

for (const file of ['deploy/docker-compose.production.yml', 'deploy/nginx.conf', 'deploy/production.env.example', 'deploy/target.example.json']) {
  add(`deploy file:${file}`, existsSync(file), file);
}

add('compose defines api and web services', compose.includes('pet-api:') && compose.includes('pet-web:') && compose.includes('nginx:1.27-alpine'));
add('compose builds api from production Dockerfile', compose.includes('context: ..') && compose.includes('dockerfile: Dockerfile'));
add('compose uses production sqlite and media volume', compose.includes('PET_STORAGE_DRIVER: sqlite') && compose.includes('PET_SQLITE_FILE: /data/pet-companion.sqlite') && compose.includes('PET_MEDIA_STORAGE_DRIVER: local') && compose.includes('PET_MEDIA_LOCAL_DIR: /data/media') && compose.includes('pet_companion_data:/data'));
add('compose gates web on api health', compose.includes('condition: service_healthy') && compose.includes('/health'));
add('compose exposes http and https', compose.includes('"80:80"') && compose.includes('"443:443"'));
add('compose mounts dist read-only', compose.includes('../dist:/usr/share/nginx/html:ro'));
add('compose uses env file not inline secrets', compose.includes('./production.env') && !compose.includes('PET_MEDIA_S3_SECRET_ACCESS_KEY='));
add('compose has no-new-privileges', compose.includes('no-new-privileges:true'));

add('nginx redirects http to https', nginx.includes('return 301 https://$host$request_uri'));
add('nginx serves pwa fallback', nginx.includes('try_files $uri $uri/ /index.html'));
add('nginx proxies api prefix', nginx.includes('location /api/') && nginx.includes('proxy_pass http://pet-api:8787/'));
add('nginx has tls placeholders', nginx.includes('ssl_certificate') && nginx.includes('fullchain.pem') && nginx.includes('privkey.pem'));
add('nginx keeps runtime config uncached', nginx.includes('location = /runtime-config.js') && nginx.includes('no-store'));
add('nginx keeps service worker fresh', nginx.includes('location = /service-worker.js') && nginx.includes('no-cache'));
add('nginx sends security headers', ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options', 'Permissions-Policy'].every(item => nginx.includes(item)));
add('nginx health endpoint exists', nginx.includes('/healthz'));

for (const key of [
  'PET_CORS_ORIGIN',
  'PET_AUTH_SECRET',
  'PET_REFRESH_TOKEN_TTL_MS',
  'PET_BACKUP_RETENTION_MAX',
  'PET_MONITORING_RATE_LIMIT_MAX',
  'PET_MONITORING_RATE_LIMIT_WINDOW_MS',
  'PET_SERVER_REQUEST_TIMEOUT_MS',
  'PET_SERVER_HEADERS_TIMEOUT_MS',
  'PET_SERVER_KEEP_ALIVE_TIMEOUT_MS',
  'PET_MEDIA_STORAGE_DRIVER=local',
  'PET_MEDIA_LOCAL_DIR=/data/media',
  'PET_MEDIA_PUBLIC_BASE_URL',
  'PET_MEDIA_S3_ENDPOINT',
  'PET_MEDIA_S3_REGION',
  'PET_MEDIA_S3_BUCKET'
]) {
  add(`env example includes ${key}`, envExample.includes(key), key);
}
add('env example contains placeholders only', envExample.includes('replace-with-random-auth-secret') && envExample.includes('Optional future upgrade'));
add('env example does not contain obvious real secrets', !/(AKIA[0-9A-Z]{16}|secret.{0,8}=[A-Za-z0-9+/]{30,})/i.test(envExample));
add('deploy target example uses app-owned paths', targetExample.includes('pet-companion-deploy-target-v1') && targetExample.includes('/opt/pet-companion') && targetExample.includes('/srv/pet-companion'));
add('deploy target example warns against homepage roots', targetExample.includes('/var/www/html') && targetExample.includes('/usr/share/nginx/html') && targetExample.includes('/www/wwwroot'));
add('package exposes deploy bundle check', pkg.scripts?.['deploy:bundle:check'] === 'node ./scripts/deploy-bundle-check.mjs');
add('package exposes deploy target check', pkg.scripts?.['deploy:target:check'] === 'node ./scripts/deploy-target-check.mjs');
add('package exposes deploy transfer plan', pkg.scripts?.['deploy:transfer:plan'] === 'node ./scripts/deploy-transfer-plan.mjs');
add('package exposes production env checks', pkg.scripts?.['production:env:example:check']?.includes('production-env-check.mjs') && pkg.scripts?.['production:env:self-test']?.includes('--self-test') && pkg.scripts?.['production:env:check']?.includes('--production'));
add('release gate includes deploy bundle check', pkg.scripts?.['release:check']?.includes('npm run deploy:bundle:check'));
add('release gate includes deploy transfer plan', pkg.scripts?.['release:check']?.includes('npm run deploy:transfer:plan'));
add('release gate includes production env template checks', pkg.scripts?.['release:check']?.includes('npm run production:env:example:check') && pkg.scripts?.['release:check']?.includes('npm run production:env:self-test'));
add('release gate includes deploy target check before bundle check', pkg.scripts?.['release:check']?.indexOf('npm run deploy:target:check') > -1 && pkg.scripts?.['release:check']?.indexOf('npm run deploy:target:check') < pkg.scripts?.['release:check']?.indexOf('npm run deploy:bundle:check'));
add('release gate includes deploy transfer plan after bundle check', pkg.scripts?.['release:check']?.indexOf('npm run deploy:bundle:check') > -1 && pkg.scripts?.['release:check']?.indexOf('npm run deploy:bundle:check') < pkg.scripts?.['release:check']?.indexOf('npm run deploy:transfer:plan'));

const failed = checks.filter(check => !check.pass);
for (const check of checks) {
  console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
}

if (failed.length) {
  console.error(`
${failed.length} deploy bundle check(s) failed.`);
  process.exit(1);
}

console.log(`
All ${checks.length} deploy bundle checks passed.`);
