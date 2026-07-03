import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
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

const useDist = process.argv.includes('--dist');
const targetDir = resolve(useDist ? 'dist' : '.');
const outputDir = resolve('output', 'e2e');
const profileDir = resolve('output', 'chrome-e2e-profile');
const browserPath = BROWSER_PATHS.find(existsSync);

if (!browserPath) {
  console.error('未找到 Chrome 或 Edge，无法执行浏览器 E2E。');
  process.exit(1);
}

if (!existsSync(join(targetDir, 'index.html'))) {
  console.error(`未找到 ${join(targetDir, 'index.html')}，请先执行 npm run build。`);
  process.exit(1);
}

await mkdir(outputDir, { recursive: true });
rmSync(profileDir, { recursive: true, force: true });
await mkdir(profileDir, { recursive: true });

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
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

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const appPort = server.address().port;
const debugPort = 9400 + Math.floor(Math.random() * 500);
const appUrl = `http://127.0.0.1:${appPort}/index.html`;

const browser = spawn(browserPath, [
  '--headless=new',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run',
  '--disable-gpu',
  '--window-size=430,900',
  'about:blank'
], { stdio: 'ignore' });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitJson(url) {
  for (let index = 0; index < 70; index += 1) {
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

  const loginTitle = await evaluate(cdp, `document.body.innerText`);
  assert.ok(loginTitle.includes('宠物照护助手'), '首屏应显示正式登录品牌');
  assert.ok(loginTitle.includes('把宠物的日常'), '首屏应显示正式产品主张');
  assert.ok(loginTitle.includes('游客体验'), '首屏应提供游客体验入口');

  await evaluate(cdp, `(() => {
    document.querySelector('[name="legalConsent"]').checked = true;
    document.querySelector('[data-action="seed-demo"]').click();
  })()`);
  await sleep(350);
  const homeText = await evaluate(cdp, `document.body.innerText`);
  assert.ok(homeText.includes('照护进度'), '游客体验后应进入首页照护进度');
  assert.ok(homeText.includes('健康提醒'), '首页应显示健康提醒');

  await evaluate(cdp, `document.querySelector('[data-action="open-checkin-sheet"]').click()`);
  await sleep(300);
  const sheetText = await evaluate(cdp, `document.querySelector('.checkin-sheet').innerText`);
  for (const token of ['打卡管理', '完成率', '今日项目', '全部完成', '全部待办', '快速加入', '自定义项目']) {
    assert.ok(sheetText.includes(token), `打卡弹层缺少：${token}`);
  }

  await evaluate(cdp, `document.querySelector('[data-action="complete-all-checkins"]').click()`);
  await sleep(300);
  const completedText = await evaluate(cdp, `document.querySelector('.checkin-sheet').innerText`);
  assert.ok(completedText.includes('100%'), '全部完成后应显示 100%');

  await evaluate(cdp, `document.querySelector('[data-action="close-sheet"]').click()`);
  await sleep(250);
  await evaluate(cdp, `document.querySelector('[data-tab="pets"]').click()`);
  await sleep(250);
  const petsText = await evaluate(cdp, `document.body.innerText`);
  assert.ok(petsText.includes('宠物档案'), '宠物页应可打开');
  assert.ok(petsText.includes('成长胶囊'), '宠物页应显示成长胶囊');

  await evaluate(cdp, `document.querySelector('[data-tab="care"]').click()`);
  await sleep(250);
  const careText = await evaluate(cdp, `document.body.innerText`);
  assert.ok(careText.includes('记录与提醒'), '记录页应可打开');
  assert.ok(careText.includes('健康提醒'), '记录页应显示提醒模块');

  await evaluate(cdp, `document.querySelector('[data-tab="admin"]').click()`);
  await sleep(250);
  const adminText = await evaluate(cdp, `document.body.innerText`);
  assert.ok(adminText.includes('应用更新'), '我的页应保留用户可理解的更新入口');
  assert.equal(adminText.includes('发布状态：验收候选版'), false, '我的页不应展示内部发布状态');
  assert.equal(adminText.includes('配置状态：已读取运行配置'), false, '我的页不应展示运行配置状态');
  assert.equal(adminText.includes('云服务：本机体验'), false, '我的页不应展示内部云服务状态');
  assert.equal(adminText.includes('local-production-ready'), false, '我的页不应暴露内部发布通道值');
  assert.equal(adminText.includes('mock fallback'), false, '我的页不应暴露内部 mock fallback 文案');
  assert.equal(adminText.includes('可观测性'), false, '我的页不应显示内部监控状态');
  assert.ok(adminText.includes('客服与反馈'), '我的页应显示客户可用的客服反馈入口');
  assert.ok(adminText.includes('同步与备份'), '我的页应显示同步备份状态');
  assert.equal(adminText.includes('账号会话'), false, '我的页不应显示内部会话信息');
  const adminLayout = await evaluate(cdp, `(() => {
    const grid = document.querySelector('.account-service-grid');
    const first = grid?.querySelector('.account-service-card');
    if (!grid || !first) return null;
    return {
      display: getComputedStyle(grid).display,
      gridWidth: grid.getBoundingClientRect().width,
      firstWidth: first.getBoundingClientRect().width
    };
  })()`);
  assert.ok(adminLayout, '我的页应使用常用服务卡片面板');
  assert.equal(adminLayout.display, 'grid', '我的页常用服务应使用 CSS grid');
  assert.ok(adminLayout.firstWidth <= adminLayout.gridWidth + 1, '我的页服务卡不应横向溢出');

  const screenshot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true
  });
  const screenshotPath = join(outputDir, 'e2e-admin.png');
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  cdp.close();
  return screenshotPath;
}

try {
  const screenshotPath = await runFlow();
  console.log(`PASS browser e2e :: ${appUrl}`);
  console.log(`Screenshot: ${screenshotPath}`);
} finally {
  browser.kill();
  server.close();
}
