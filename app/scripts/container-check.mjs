import { existsSync, readFileSync } from 'node:fs';

const checks = [];
const add = (name, pass, detail = '') => checks.push({ name, pass, detail });
const includesAll = (text, items) => items.every(item => text.includes(item));

const dockerfilePath = 'Dockerfile';
const dockerignorePath = '.dockerignore';

add('Dockerfile exists', existsSync(dockerfilePath), dockerfilePath);
add('.dockerignore exists', existsSync(dockerignorePath), dockerignorePath);

const dockerfile = existsSync(dockerfilePath) ? readFileSync(dockerfilePath, 'utf8') : '';
const dockerignore = existsSync(dockerignorePath) ? readFileSync(dockerignorePath, 'utf8') : '';
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

add('container uses current Node LTS-compatible runtime', /^FROM node:24(?:-|\n)/m.test(dockerfile));
add('container sets production env', includesAll(dockerfile, ['ENV NODE_ENV=production', 'PET_SERVER_HOST=0.0.0.0', 'PET_SERVER_DATA_DIR=/data', 'PET_STORAGE_DRIVER=sqlite', 'PET_SQLITE_FILE=/data/pet-companion.sqlite']));
add('container runs from app workdir', dockerfile.includes('WORKDIR /app'));
add('container copies only runtime server files', includesAll(dockerfile, ['COPY --chown=node:node package.json ./', 'COPY --chown=node:node server ./server']) && !dockerfile.includes('COPY . .'));
add('container prepares persistent sqlite data volume', includesAll(dockerfile, ['mkdir -p /data', 'chown -R node:node /data', 'VOLUME ["/data"]', 'PET_SQLITE_FILE=/data/pet-companion.sqlite']));
add('container does not run as root', dockerfile.includes('USER node'));
add('container exposes api port', dockerfile.includes('EXPOSE 8787'));
add('container has healthcheck', includesAll(dockerfile, ['HEALTHCHECK', '/health', 'PET_SERVER_PORT']));
add('container command starts api server', dockerfile.includes('CMD ["npm", "run", "server:start"]'));

for (const ignored of ['node_modules', 'dist', 'output', 'server-data', '.git', '*.log', '*.bak']) {
  add(`dockerignore excludes ${ignored}`, dockerignore.split(/\r?\n/).some(line => line.trim() === ignored), ignored);
}

add('package exposes container check script', packageJson.scripts?.['container:check'] === 'node ./scripts/container-check.mjs');
add('release gate includes container check', packageJson.scripts?.['release:check']?.includes('npm run container:check'));

const failed = checks.filter(check => !check.pass);
for (const check of checks) {
  console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
}

if (failed.length) {
  console.error(`\n${failed.length} container check(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} container checks passed.`);
