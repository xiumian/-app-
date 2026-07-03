import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.cwd());
const port = Number(process.env.PORT || 5174);
const host = process.env.HOST || '127.0.0.1';

const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.ico', 'image/x-icon']
]);

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'X-Dev-Server': 'pet-companion-no-cache'
  });
  res.end(body);
}

function safePath(urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0]);
  const clean = normalize(decoded === '/' ? '/index.html' : decoded).replace(/^([/\\])+/, '');
  const full = resolve(join(root, clean));
  return full.startsWith(root) ? full : null;
}

const server = http.createServer((req, res) => {
  const file = safePath(req.url);
  if (!file) return send(res, 403, 'Forbidden');
  if (!existsSync(file) || !statSync(file).isFile()) return send(res, 404, 'Not found');

  const headers = {
    'Content-Type': types.get(extname(file)) || 'application/octet-stream',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'X-Dev-Server': 'pet-companion-no-cache'
  };
  if (file.endsWith('index.html')) {
    headers['Clear-Site-Data'] = '"cache"';
  }
  res.writeHead(200, headers);
  createReadStream(file).pipe(res);
});

server.listen(port, host, () => {
  console.log(`pet companion no-cache dev server: http://${host}:${port}/`);
});
