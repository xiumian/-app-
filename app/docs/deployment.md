# 宠伴记发布准备清单

## 构建命令

```powershell
npm run build
```

构建输出目录：

```text
D:\codex\宠物app\dist
```

## 发布前必须通过

1. `npm run audit`
2. `npm run test`
3. `npm run build`
4. `npm run e2e`
5. `npm run e2e:remote`
6. `npm run smoke:production:self-test`
7. `npm run deploy:check`
8. `npm run public:bundle:check`
9. `npm run pwa:cache:check`
10. `npm run server:test`
11. `npm run backup:drill`
12. `npm run deploy:target:check`
13. `npm run manual:acceptance:check`
14. `npm run release:plan:check`
15. `npm run readiness:check`
16. `npm run architecture:check`
17. `npm run external:evidence:check`
18. `npm run secrets:check`
19. `npm run accessibility:check`
20. `npm run artifact:manifest`
21. `npm run artifact:verify`
22. `npm run release:evidence:self-test`
23. `npm run release:evidence`
24. `npm run release:evidence:check`
25. 如果走代码托管，GitHub Actions `Pet Companion Release Gate` 必须通过
26. 配好服务端生产环境变量后执行 `npm run server:check:production`
27. 部署到线上后执行 `npm run smoke:production`
28. 检查 `dist/build-info.json`
29. 检查 `dist/runtime-config.js`
30. 检查 `output/production-evidence.json`
31. 检查 `output/release-artifacts.json`
32. 检查 `output/release-evidence.json`
33. 用静态服务打开 `dist/index.html`
34. 确认 PWA manifest、Service Worker、图标资源可访问

`npm run build` 内部也会执行 `audit` 和 `test`，避免跳过发布门禁。
`npm run e2e` 会启动本地静态服务并使用本机 Chrome/Edge 对 `dist` 做浏览器回归。
`npm run e2e:remote` 会临时启动本地 API，用自定义 runtime-config 指向该 API，并用真实浏览器验证远端注册、云同步和云备份。
`npm run smoke:production:self-test` 会临时启动本地 API 和生产形态 runtime-config，验证生产冒烟脚本本身。
`npm run deploy:check` 会检查 `dist` 必要文件、运行时配置、PWA manifest、Service Worker、构建信息和静态安全响应头。
`npm run public:bundle:check` 会检查公网发布包只包含运行资源和用户可见法务文本，不把内部 Runbook、API 合同、真机验收清单、部署目标、发布证据、脚本或后端代码发布到 `dist`。
`npm run pwa:cache:check` 会检查 Service Worker 缓存名跟 App 版本一致、预缓存覆盖前端模块、且不预缓存 `runtime-config.js`。
`npm run server:test` 会检查本地 Node API 是否满足当前后端合同主路径。
`npm run backup:drill` 会用隔离 SQLite 数据库演练整库快照、删除原库、恢复快照和重新验证账号/状态/云备份，防止发布前没有恢复证据。
`npm run deploy:target:check` 会校验部署目标目录，防止把产物上传到服务器首页根目录、系统目录或与持久化数据混在一起。
`npm run manual:acceptance:check` 会校验真机验收模板是否覆盖设备矩阵、核心流程、支持/投诉、脱敏截图和复验结论，避免上线前人工验收漏项。
`npm run release:plan:check` 会检查发布 Runbook、回滚 Runbook、Go/No-Go 条件、生产烟测、运维检查和回滚命令是否齐全。
`npm run readiness:check` 会检查生产就绪清单、外部上线项和文档是否仍存在过时的“原型未完成”描述。
`npm run architecture:check` 会检查 `docs/architecture.md` 与当前前端、后端、发布和运维分层一致，避免按旧架构误开发。
`npm run external:evidence:check` 会校验外部上线证据模板和可选真实证据文件，说明见 `docs/external-evidence.md`。
`npm run secrets:check` 会检查仓库工作区内是否误放真实生产 env、TLS 证书、私钥、证书块或疑似非占位密钥。
`npm run accessibility:check` 会检查键盘焦点、弹层语义、输入标签、触控尺寸和离线导航回退。
`npm run artifact:manifest` 会为 `dist` 全量发布产物生成 SHA-256 清单 `output/release-artifacts.json` 和 `output/release-artifacts.md`。
`npm run artifact:verify` 会用产物清单反向校验当前 `dist` 是否缺失、篡改或多出文件。
`npm run release:evidence:self-test` 会先验证证据生成器会拒绝伪造或不安全的外部证据。
`npm run release:evidence` 在上述本地门禁之后生成 `output/release-evidence.json` 和 `output/release-evidence.md`，用于发布评审和交接。
`npm run release:evidence:check` 会校验证据包与 `package.json` 发布步骤、`output/release-artifacts.json` 和外部证据统计一致。
GitHub Actions 会在 PR、`main/master` 推送和手动触发时执行 `npm run ci:check`，说明见 `docs/ci.md`。
`npm run server:check:production` 会检查服务端生产环境变量，避免正式部署时继续使用本地默认数据目录、通配 CORS 或过宽限流。

也可以直接执行完整发布检查：

```powershell
npm run release:check
```

发布执行和回滚操作必须参考：

- `docs/release-runbook.md`
- `docs/rollback.md`
- `docs/security.md`
- `docs/ci.md`
- `docs/external-evidence.md`
- `docs/release-evidence.md`

## 当前发布形态

- 形态：静态 H5/PWA
- 数据：本地体验模式使用浏览器本地存储；配置 API 后使用远端账号、云同步、云备份和媒体上传
- 版本来源：`src/core/config.js`
- 环境参数：`runtime-config.js`
- 缓存策略：Service Worker 预缓存核心静态资源
- 监控：已预留 `MONITORING_ENDPOINT`，未配置时保持本地安全模式且不外发
- 后端接口合同：`docs/api-contract.md`
- 后端 API：`server/`，说明见 `docs/backend.md`
- 云端备份格式：`pet-companion-backup-v1`，不包含 token 和临时弹层状态
- 发布 Runbook：`docs/release-runbook.md`
- 回滚 Runbook：`docs/rollback.md`
- 安全发布说明：`docs/security.md`
- 可访问性与离线可用说明：`docs/accessibility.md`
- 生产就绪清单：`docs/production-readiness.md`
- 用户协议：`docs/terms.md`
- 隐私政策：`docs/privacy.md`

## 生产环境配置

部署到生产环境前，用环境变量生成生产运行时配置：

```powershell
$env:PET_API_BASE_URL='https://api.your-real-domain.cn'
$env:PET_MONITORING_ENDPOINT='https://monitoring.your-real-domain.cn/events'
$env:PET_OPERATOR_NAME='宠伴记运营主体'
$env:PET_SUPPORT_CONTACT_URL='https://support.your-real-domain.cn/pet-companion'
$env:PET_SUPPORT_EMAIL='support@your-real-domain.cn'
npm run runtime:production
```

至少需要确认：

- `APP_RELEASE_CHANNEL` 改为 `production`
- `API_BASE_URL` 指向正式后端
- `API_MOCK_FALLBACK` 改为 `false`
- `MONITORING_ENDPOINT` 指向正式监控接收地址
- `OPERATOR_NAME` 展示真实运营主体
- `SUPPORT_CONTACT_URL` 或 `SUPPORT_EMAIL` 至少配置一个客服/投诉渠道
- 生产 runtime-config 会拒绝 `example.com`、`TODO`、`待定`、`示例` 等占位内容，防止上线后客服/投诉入口不可达

如果部署平台不方便执行脚本，也可以复制 `runtime-config.example.js` 到 `dist/runtime-config.js` 后手动替换，但仍必须执行 `npm run deploy:check:production`。

详细字段见：`docs/runtime-config.md`。

生产参数写入 `dist/runtime-config.js` 后，再执行严格生产检查：

```powershell
npm run deploy:check:production
```

该检查会要求：

- `APP_RELEASE_CHANNEL` 为 `production`
- `API_BASE_URL` 使用 HTTPS
- `API_MOCK_FALLBACK` 为 `false`
- `MONITORING_ENDPOINT` 使用 HTTPS

## 生产部署后冒烟检查

前端和 API 都部署完成后，设置线上地址并执行：

```powershell
$env:PET_PROD_APP_URL='https://app.your-real-domain.cn'
$env:PET_PROD_API_BASE_URL='https://api.your-real-domain.cn'
npm run smoke:production
```

该检查会验证：

- 线上 `index.html` 可访问
- 线上 `runtime-config.js` 是 `production` channel
- `API_MOCK_FALLBACK=false`
- `runtime-config.js` 指向目标 API
- API `/health` 和 `/ready` 返回 200
- 未授权 `/app-state` 返回 401
- `X-Request-ID` 响应头和错误响应体 `requestId` 一致

## 服务端生产配置检查

正式部署服务端前，需要先设置生产环境变量并执行：

```powershell
$env:NODE_ENV='production'
$env:PET_SERVER_HOST='0.0.0.0'
$env:PET_SERVER_PORT='8787'
$env:PET_SERVER_DATA_DIR='D:\pet-companion-data'
$env:PET_STORAGE_DRIVER='sqlite'
$env:PET_SQLITE_FILE='D:\pet-companion-data\pet-companion.sqlite'
$env:PET_CORS_ORIGIN='https://app.your-real-domain.cn'
$env:PET_MEDIA_STORAGE_DRIVER='local'
$env:PET_MEDIA_LOCAL_DIR='D:\pet-companion-data\media'
$env:PET_AUTH_RATE_LIMIT_MAX='30'
$env:PET_AUTH_RATE_LIMIT_WINDOW_MS='300000'
$env:PET_TRUST_PROXY='true'
$env:PET_MONITORING_RATE_LIMIT_MAX='120'
$env:PET_MONITORING_RATE_LIMIT_WINDOW_MS='60000'
$env:PET_BACKUP_RETENTION_MAX='20'
$env:PET_SERVER_REQUEST_TIMEOUT_MS='30000'
$env:PET_SERVER_HEADERS_TIMEOUT_MS='15000'
$env:PET_SERVER_KEEP_ALIVE_TIMEOUT_MS='5000'
$env:PET_ACCESS_TOKEN_TTL_MS='604800000'
$env:PET_REFRESH_TOKEN_TTL_MS='2592000000'
$env:PET_AUTH_SECRET='replace-with-real-random-secret-at-least-32-chars'
$env:PET_MAX_BODY_BYTES='2097152'
npm run server:check:production
```

该检查会要求：

- `NODE_ENV=production`
- 服务端监听地址显式配置且不能是 `127.0.0.1`、`localhost` 或 `::1`
- 数据目录必须显式配置为绝对路径，不能继续使用 `server-data` 默认目录
- `PET_CORS_ORIGIN` 必须是明确的 HTTPS 前端域名，不能是 `*`
- token 有效期、请求体大小、HTTP timeout、认证限流和监控事件限流在生产边界内
- 若 API 通过可信 Nginx/负载均衡暴露，设置 `PET_TRUST_PROXY=true`；否则保持默认 `false`，避免客户端伪造 `X-Forwarded-For` 绕过限流

## 静态安全响应头

仓库提供 `_headers` 作为静态托管平台参考配置，构建时会复制到 `dist/_headers`。如果部署平台不支持 `_headers`，需要在平台控制台手动配置同等响应头：

- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy`
- `Permissions-Policy`
- `Cross-Origin-Opener-Policy`

## 真实上线前仍需外部补齐

仓库已提供本地可验证的前端、后端、容器、部署编排和发布门禁；下列事项必须由真实生产环境提供，不能在仓库内伪造完成：

- HTTPS 域名、TLS 证书和网关/反向代理实际部署。
- `deploy/production.env` 中的真实生产环境变量，且不得提交到仓库。
- SQLite 持久化数据卷或正式托管数据库方案。
- 服务器本地媒体持久化目录、挂载数据卷和图片上传/读取验收记录。
- 平台级备份保存位置、保留周期、异地保存策略和恢复责任人。
- 正式监控平台端点、告警规则和告警接收人。
- 真实运营主体、客服渠道、隐私政策、用户协议和地区法务确认。
- iPhone/Android 真机多尺寸人工验收，验收模板见 `docs/manual-device-acceptance.md`。

具体 Go/No-Go 清单见 `docs/production-readiness.md`。

## 可访问性与离线可用

发布前必须执行：

```powershell
npm run accessibility:check
```

该检查覆盖跳过导航、键盘焦点、底部弹层 dialog 语义、输入标签、44px 触控尺寸、Service Worker 离线导航回退，以及 `runtime-config.js` 不进入预缓存。

## 用户协议与隐私政策

发布前必须确认：

- 登录、注册和演示数据入口都要求勾选《用户协议》和《隐私政策》。
- “我的”页展示协议版本、同意时间和查看条款入口。
- `docs/terms.md` 和 `docs/privacy.md` 已由真实运营主体补齐运营者、联系方式、保存期限和第三方处理方。
- 远端账号导出和注销入口与隐私政策中的用户权利说明一致。

## 支持诊断包

发布前必须确认“我的”页可以导出脱敏诊断包，且诊断包只包含版本、运行环境、存储状态、监控摘要、会话摘要、同意状态和数据量计数，不包含用户昵称、账号、宠物名、图片、动态、评论、token、password、cookie 或密钥。

## API 容器化部署基线

发布前必须额外通过 `npm run container:check`，它会检查 Dockerfile、非 root 运行、持久化数据卷、健康检查和 `.dockerignore`。

```powershell
npm run container:check
docker build -t pet-companion-api:0.4.0 .
docker run -d --name pet-companion-api `
  -p 8787:8787 `
  -v pet-companion-data:/data `
  -e NODE_ENV=production `
  -e PET_SERVER_HOST=0.0.0.0 `
  -e PET_SERVER_PORT=8787 `
  -e PET_SERVER_DATA_DIR=/data `
  -e PET_STORAGE_DRIVER=sqlite `
  -e PET_SQLITE_FILE=/data/pet-companion.sqlite `
  -e PET_CORS_ORIGIN=https://app.your-real-domain.cn `
  -e PET_MEDIA_STORAGE_DRIVER=local `
  -e PET_MEDIA_LOCAL_DIR=/data/media `
  -e PET_AUTH_RATE_LIMIT_MAX=30 `
  -e PET_AUTH_RATE_LIMIT_WINDOW_MS=300000 `
  -e PET_TRUST_PROXY=true `
  -e PET_MONITORING_RATE_LIMIT_MAX=120 `
  -e PET_MONITORING_RATE_LIMIT_WINDOW_MS=60000 `
  -e PET_BACKUP_RETENTION_MAX=20 `
  -e PET_SERVER_REQUEST_TIMEOUT_MS=30000 `
  -e PET_SERVER_HEADERS_TIMEOUT_MS=15000 `
  -e PET_SERVER_KEEP_ALIVE_TIMEOUT_MS=5000 `
  -e PET_ACCESS_TOKEN_TTL_MS=604800000 `
  -e PET_REFRESH_TOKEN_TTL_MS=2592000000 `
  -e PET_MAX_BODY_BYTES=2097152 `
  pet-companion-api:0.4.0
```

容器需使用 `NODE_ENV=production`，监听 `0.0.0.0:8787`，并将 SQLite 数据文件所在目录持久化挂载到 `/data`。

## 生产部署编排

仓库提供 `deploy/docker-compose.production.yml`、`deploy/nginx.conf`、`deploy/production.env.example` 和 `deploy/target.example.json`。

如果要上传到自有服务器，先把 `deploy/target.example.json` 复制为私有的 `deploy/target.json`，只填写 App 专属目录，例如 `/opt/pet-companion` 和 `/srv/pet-companion`。不要把 `dist` 上传到服务器首页根目录，例如 `/var/www/html`、`/usr/share/nginx/html`、`/www/wwwroot` 或 `/home/*/public_html`。`distTarget` 和 `deployConfigTarget` 必须是 `projectRoot` 下的子目录，不能直接使用 `projectRoot` 本身；`dataTarget`、`mediaTarget` 必须在 App 文件目录外并彼此分离，避免数据传输或图片上传覆盖前端产物、配置或服务器首页。`deploy/target.json` 已在 `.gitignore` 中，避免把服务器路径写入仓库。

发布前必须执行：

```powershell
npm run deploy:target:check
npm run deploy:bundle:check
npm run production:env:example:check
npm run production:env:self-test
npm run deploy:transfer:plan
```

部署步骤：

1. 执行 `npm run release:check`，其中包含 `npm run backup:drill`、`npm run deploy:target:check`、`npm run production:env:self-test`、`npm run deploy:transfer:plan`、`npm run release:plan:check` 和 `npm run secrets:check`。
2. 复制 `deploy/target.example.json` 为私有的 `deploy/target.json`，确认只指向 App 专属目录并执行 `npm run deploy:target:check`。
3. 复制 `deploy/production.env.example` 为 `deploy/production.env`，替换所有占位值。
   - 本地检查模板：`npm run production:env:example:check`。
   - 在服务器或私有部署工作区检查真实文件：`npm run production:env:check`。
4. 将 TLS 证书放到 `deploy/certs/fullchain.pem` 和 `deploy/certs/privkey.pem`。
5. 将 `dist/runtime-config.js` 生成为 production channel，并将 `API_BASE_URL` 指向 `https://app.your-real-domain.cn/api` 或正式 API 域名。
6. 在生产机器执行 `docker compose -f deploy/docker-compose.production.yml --env-file deploy/production.env up -d --build`。
7. 部署后执行 `npm run smoke:production`。

已纳入门禁的约束：

- Nginx 必须从 `dist` 只读托管 PWA。
- `/api/` 必须反代到 API 容器。
- API 容器启用 `PET_TRUST_PROXY=true` 时，生产入口必须保证只有可信代理能访问 API 容器，避免客户端直连后伪造代理头。
- `runtime-config.js` 不得被长缓存。
- `service-worker.js` 必须保持可更新。
- 线上 `build-info.json` 必须可访问，且 PWA 缓存名必须匹配预缓存内容哈希。
- 线上 `service-worker.js` 必须包含 `build-info.json` 记录的缓存名。
- Service Worker 新版本必须能通过“我的”页的“检查更新 / 应用更新”完成受控激活，并在激活后清理旧缓存。
- HTTPS、HSTS、CSP、nosniff 等静态安全头必须存在。
- `deploy/production.env`、`deploy/certs/` 和 `deploy/target.json` 不得提交到仓库。
- `output/deploy-transfer-plan.json` 和 `output/deploy-transfer-plan.md` 只作为本地交付清单，列明允许上传的 App 专属路径，不执行 SSH、SCP、rsync 或远端写入。

## Operations checks and alerts

After deployment, run:

```powershell
$env:PET_PROD_APP_URL='https://app.your-real-domain.cn'
$env:PET_PROD_API_BASE_URL='https://app.your-real-domain.cn/api'
$env:PET_OPS_MAX_LATENCY_MS='1500'
npm run ops:check
```

Local checker self-test:

```powershell
npm run ops:check:self-test
```

Operational references:

- Runbook: `docs/operations.md`
- Alert rule example: `deploy/alert-rules.example.json`

`ops:check` is stricter than smoke checks: it validates latency SLO, static security headers, runtime config cache policy, service worker cache policy, `/ready` storage writability, request-id propagation, and monitoring ingest.

## PWA update acceptance

生产静态资源发布后，必须在真实浏览器执行：

1. 打开旧版本页面并保持不关闭。
2. 发布新静态资源和新版 `service-worker.js`。
3. 在“我的”页点击“检查更新”，确认出现可应用的新版本状态。
4. 点击“应用更新”，确认页面刷新后进入新版本。
5. 在 DevTools Application/Cache Storage 中确认仅保留当前 `pet-companion-*` 缓存，旧缓存已被清理。


## Backup and restore drill

发布前必须执行：

```powershell
npm run backup:drill
```

该脚本只使用临时目录，不读取真实生产数据；它会生成 SQLite 服务端数据、复制 SQLite 主文件和 WAL/SHM 旁路文件、删除原始库、从快照恢复，再启动 API 验证账号登录、状态读取和云备份恢复。真实生产环境仍需要平台级定时备份、异地保存和人工恢复演练。
