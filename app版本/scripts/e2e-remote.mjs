import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png'
};

const BROWSER_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
];

const targetDir = resolve('dist');
const outputDir = resolve('output', 'e2e-remote');
const browserPath = BROWSER_PATHS.find(existsSync);

if (!browserPath) {
  console.error('未找到 Chrome 或 Edge，无法执行远端浏览器 E2E。');
  process.exit(1);
}

if (!existsSync(join(targetDir, 'index.html'))) {
  console.error(`未找到 ${join(targetDir, 'index.html')}，请先执行 npm run build。`);
  process.exit(1);
}

await mkdir(outputDir, { recursive: true });
const profileDir = await mkdtemp(join(outputDir, 'chrome-profile-'));

const dataDir = await mkdtemp(join(tmpdir(), 'pet-companion-remote-e2e-'));
process.env.PET_SERVER_DATA_DIR = dataDir;
process.env.PET_SERVER_HOST = '127.0.0.1';
process.env.PET_CORS_ORIGIN = '*';
process.env.PET_AUTH_RATE_LIMIT_MAX = '50';
process.env.PET_SERVER_LOG_LEVEL = 'off';

const { createPetCompanionServer } = await import('../server/index.js');
const apiServer = createPetCompanionServer();
await new Promise(resolve => apiServer.listen(0, '127.0.0.1', resolve));
const apiPort = apiServer.address().port;
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;

const appServer = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/runtime-config.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      response.end(`window.PET_COMPANION_CONFIG = {
  APP_RELEASE_CHANNEL: 'remote-e2e',
  API_BASE_URL: '${apiBaseUrl}',
  API_TIMEOUT_MS: 8000,
  API_MOCK_FALLBACK: false,
  MONITORING_ENDPOINT: '${apiBaseUrl}/monitoring/events',
  MONITORING_SAMPLE_RATE: 1
};`);
      return;
    }

    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const filePath = resolve(join(targetDir, pathname));
    if (!filePath.startsWith(targetDir)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    const fileStat = await stat(filePath);
    const finalPath = fileStat.isDirectory() ? join(filePath, 'index.html') : filePath;
    const body = await readFile(finalPath);
    response.writeHead(200, { 'Content-Type': MIME_TYPES[extname(finalPath)] || 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('Not Found');
  }
});

await new Promise(resolve => appServer.listen(0, '127.0.0.1', resolve));
const appPort = appServer.address().port;
const appUrl = `http://127.0.0.1:${appPort}/index.html`;

async function getFreePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

const debugPort = await getFreePort();

const browser = spawn(browserPath, [
  '--headless=new',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run',
  '--disable-gpu',
  '--window-size=430,900',
  'about:blank'
], { stdio: 'ignore' });

let browserExit = null;
browser.once('exit', (code, signal) => {
  browserExit = { code, signal };
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function stopBrowser() {
  if (browserExit) return;
  browser.kill();
  await Promise.race([
    new Promise(resolve => browser.once('exit', resolve)),
    sleep(1500)
  ]);
}

async function waitJson(url) {
  for (let index = 0; index < 70; index += 1) {
    if (browserExit) {
      throw new Error(`浏览器进程提前退出：code=${browserExit.code} signal=${browserExit.signal}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {}
    await sleep(100);
  }
  throw new Error(`等待浏览器调试端口超时：${url}`);
}

class CdpClient {
  constructor(wsUrl) {
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.ws = new WebSocket(wsUrl);
    this.ws.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result || {});
        return;
      }
      if (message.method) this.events.push(message);
    };
  }

  ready() {
    return new Promise((resolveReady, rejectReady) => {
      this.ws.onopen = resolveReady;
      this.ws.onerror = rejectReady;
    });
  }

  send(method, params = {}) {
    const id = this.id + 1;
    this.id = id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend });
    });
  }

  async waitEvent(method) {
    for (let index = 0; index < 100; index += 1) {
      const eventIndex = this.events.findIndex(event => event.method === method);
      if (eventIndex >= 0) return this.events.splice(eventIndex, 1)[0];
      await sleep(100);
    }
    throw new Error(`等待浏览器事件超时：${method}`);
  }

  close() {
    this.ws.close();
  }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || '浏览器脚本执行失败');
  }
  return result.result ? result.result.value : undefined;
}

async function waitForText(cdp, text, label = text) {
  for (let index = 0; index < 50; index += 1) {
    const bodyText = await evaluate(cdp, 'document.body.innerText');
    if (bodyText.includes(text)) return bodyText;
    await sleep(120);
  }
  throw new Error(`等待页面文字超时：${label}`);
}

async function runFlow() {
  const tabs = await waitJson(`http://127.0.0.1:${debugPort}/json`);
  const tab = tabs.find(item => item.type === 'page');
  assert.ok(tab, '应能获取浏览器页面');

  const cdp = new CdpClient(tab.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 430,
    height: 900,
    deviceScaleFactor: 1,
    mobile: true
  });

  await cdp.send('Page.navigate', { url: appUrl });
  await cdp.waitEvent('Page.loadEventFired');
  await evaluate(cdp, `(async () => {
    localStorage.clear();
    if ('caches' in window) {
      await caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))));
    }
  })()`);
  await cdp.send('Page.reload', { ignoreCache: true });
  await cdp.waitEvent('Page.loadEventFired');
  await sleep(350);

  const loginText = await waitForText(cdp, '远端账号');
  assert.ok(loginText.includes('注册并登录'), '配置 API 后应显示远端注册入口');

  const account = `remote-e2e-${Date.now()}@example.com`;
  await evaluate(cdp, `(() => {
    const form = document.querySelector('#remote-register-form');
    form.querySelector('[name="name"]').value = '主人';
    form.querySelector('[name="account"]').value = ${JSON.stringify(account)};
    form.querySelector('[name="password"]').value = 'RemotePass123';
    form.querySelector('[name="legalConsent"]').checked = true;
    form.requestSubmit();
  })()`);

  await waitForText(cdp, '今天照护进度', '远端注册后首页');
  const sessionStatus = await evaluate(cdp, `JSON.parse(localStorage.getItem('pet_companion_state_v3')).session`);
  assert.equal(sessionStatus.authMode, 'remote');
  assert.ok(sessionStatus.accessToken.startsWith('pat_'));

  await evaluate(cdp, `document.querySelector('[data-tab="admin"]').click()`);
  await sleep(250);
  await waitForText(cdp, '上传云端');
  await evaluate(cdp, `document.querySelector('[data-action="seed-demo"]').click()`);
  await sleep(350);
  await evaluate(cdp, `document.querySelector('[data-tab="admin"]').click()`);
  await sleep(250);

  const adminText = await waitForText(cdp, '已持有远端 token');
  for (const token of ['同步与备份', '上传云端', '拉取云端', '创建云备份']) {
    assert.ok(adminText.includes(token), `远端同步页缺少：${token}`);
  }

  await evaluate(cdp, `document.querySelector('[data-action="push-remote-state"]').click()`);
  await waitForText(cdp, '本地数据已上传云端', '上传云端 toast');

  await evaluate(cdp, `document.querySelector('[data-action="create-remote-backup"]').click()`);
  await waitForText(cdp, '云备份已创建', '创建云备份 toast');

  const screenshot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true
  });
  const screenshotPath = join(outputDir, 'e2e-remote-admin.png');
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  cdp.close();
  return { screenshotPath, account };
}

try {
  const { screenshotPath, account } = await runFlow();
  const db = JSON.parse(await readFile(join(dataDir, 'pet-companion-server.json'), 'utf8'));
  const user = db.users.find(item => item.account === account);
  assert.ok(user, '后端应创建远端用户');
  assert.equal(user.password, undefined, '后端不得明文保存密码');
  assert.ok(user.passwordHash.startsWith('scrypt:'));
  assert.equal(db.sessions[0].accessToken, undefined, '后端不得明文保存 access token');
  assert.equal(db.sessions[0].refreshToken, undefined, '后端不得明文保存 refresh token');
  assert.ok(db.states[user.id], '上传云端后应有用户状态');
  assert.equal(db.states[user.id].session.accessToken, null, '云端状态不得保存 access token');
  assert.equal(db.states[user.id].session.refreshToken, null, '云端状态不得保存 refresh token');
  assert.ok((db.backups[user.id] || []).length >= 1, '创建云备份后应有备份记录');
  console.log(`PASS remote browser e2e :: ${appUrl}`);
  console.log(`API: ${apiBaseUrl}`);
  console.log(`Screenshot: ${screenshotPath}`);
} finally {
  await stopBrowser();
  appServer.close();
  apiServer.close();
  await rm(dataDir, { recursive: true, force: true });
  await rm(profileDir, { recursive: true, force: true }).catch(() => {});
}
