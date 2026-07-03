# 宠伴记 Node 后端 API

当前仓库包含一个无第三方依赖的 Node.js API，用于本地联调、发布门禁、生产前容器化部署和后续扩展参考。

## 启动

```powershell
npm run server:start
```

默认地址：

```text
http://127.0.0.1:8787
```

## 自动测试

```powershell
npm run server:test
npm run backup:drill
```

生产配置门禁：

```powershell
npm run server:check:production
```

测试覆盖：

- `GET /health`
- `GET /ready`
- `POST /auth/register`
- `POST /auth/sign-in`
- `POST /auth/refresh`
- `POST /auth/sign-out`
- `GET /account/export`
- `DELETE /account`
- `GET /app-state`
- `PUT /app-state`
- `POST /app-state/backups`
- `GET /app-state/backups`
- `POST /app-state/backups/{backupId}/restore`
- `POST /monitoring/events`
- 带正文的 JSON 接口必须使用 `application/json` 或 `+json` Content-Type，非 JSON 正文返回 `UNSUPPORTED_MEDIA_TYPE`
- CORS 允许 `GET,POST,PUT,DELETE,OPTIONS`，保证浏览器可调用账号注销等 DELETE 接口
- 状态和备份写入时拒绝跨用户 `ownerId`、`petId`、`authorId`
- 账号密码使用带盐哈希保存，错误密码不签发会话
- access token 和 refresh token 仅以哈希形式落库，生产使用 `PET_AUTH_SECRET` 做 HMAC-SHA256 token 哈希
- access token 和 refresh token 的哈希匹配使用常量时间比较，避免通过响应耗时推断 token 哈希前缀
- refresh token 有独立有效期；刷新成功后会轮换 refresh token，旧 refresh token 立即失效
- 需要登录的写入和上传接口先校验 token，再解析 JSON body，未登录坏 JSON 会直接返回 `UNAUTHORIZED`
- 注册、登录、刷新、退出、账号注销密码确认和前端监控事件接口带 IP 维度内存限流，超限返回 `RATE_LIMITED`，并通过 `Retry-After` 响应头提示退避秒数；CORS 暴露该响应头，方便前端读取
- 默认不信任客户端传入的 `X-Forwarded-For`；只有部署在可信反向代理后并显式设置 `PET_TRUST_PROXY=true` 时才用代理转发的真实客户端 IP 做限流桶
- 账号导出只返回当前用户数据且不包含密码哈希或 token；账号注销要求当前密码确认，错误尝试进入限流，成功后会删除当前用户、会话、状态、云备份和可从状态/备份引用到的媒体文件
- `/health` 用于存活检查，`/ready` 会做数据存储写入探测和媒体存储 ready 探针，用于上线后的就绪检查
- 进程收到 `SIGTERM` 或 `SIGINT` 时会执行优雅关闭，停止接收新连接并等待现有请求结束，超时后返回失败退出码
- 本地 JSON 存储使用临时文件原子替换，并保留 `.bak` 备份；主文件损坏时会尝试从备份恢复
- SQLite 生产形态可通过 `npm run backup:drill` 做隔离整库快照、删除原库、恢复快照和重新验证

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PET_SERVER_HOST` | `127.0.0.1` | 监听地址 |
| `PET_SERVER_PORT` | `8787` | 监听端口 |
| `PET_SERVER_DATA_DIR` | `server-data` | 本地 JSON 数据目录 |
| `PET_ACCESS_TOKEN_TTL_MS` | 7 天 | access token 有效期 |
| `PET_REFRESH_TOKEN_TTL_MS` | 30 天 | refresh token 有效期，生产必须不短于 access token |
| `PET_AUTH_SECRET` | 空 | 生产 token HMAC 哈希密钥，至少 32 字符且不能是占位值 |
| `PET_CORS_ORIGIN` | `*` | CORS 来源 |
| `PET_MAX_BODY_BYTES` | 2MB | 最大 JSON 请求体 |
| `PET_AUTH_RATE_LIMIT_WINDOW_MS` | 5 分钟 | 认证接口限流窗口 |
| `PET_AUTH_RATE_LIMIT_MAX` | 30 | 同一 IP 每条认证接口在窗口内最大请求数 |
| `PET_TRUST_PROXY` | `false` | 是否信任 `X-Forwarded-For` 作为限流客户端 IP；仅在可信反向代理后设置为 `true` |
| `PET_MONITORING_RATE_LIMIT_WINDOW_MS` | 60 秒 | 前端监控事件接口限流窗口 |
| `PET_MONITORING_RATE_LIMIT_MAX` | 120 | 同一 IP 在窗口内最大监控事件数 |
| `PET_BACKUP_RETENTION_MAX` | 20 | 每个用户服务端最多保留的云备份数量，生产建议 3-100 |
| `PET_SERVER_REQUEST_TIMEOUT_MS` | 30000 | Node HTTP 请求总超时，生产建议 5-120 秒 |
| `PET_SERVER_HEADERS_TIMEOUT_MS` | 15000 | Node HTTP 请求头超时，必须不大于 request timeout |
| `PET_SERVER_KEEP_ALIVE_TIMEOUT_MS` | 5000 | Node HTTP keep-alive 空闲超时，必须不大于 request timeout |
| `PET_SERVER_LOG_LEVEL` | `info` | 服务端结构化日志级别，可选 `info`、`error`、`off` |

生产部署时必须显式设置 `NODE_ENV=production`、`PET_SERVER_HOST`、`PET_SERVER_DATA_DIR` 和 `PET_CORS_ORIGIN`，并运行 `npm run server:check:production`。该检查会拒绝通配 CORS、本地默认数据目录、loopback 监听地址、不合理认证/监控限流参数、不合理 refresh token 有效期、不合理 Node HTTP request/header/keep-alive 超时和占位 token 哈希密钥。
如果直接以 `NODE_ENV=production` 启动 `npm run server:start`，服务端入口也会执行同一套生产配置校验；配置不合规时启动会失败，避免误把本地默认配置带到正式环境。

## 请求追踪与日志

- 客户端可传 `X-Request-ID`，服务端会原样返回合法的请求 ID。
- 未传请求 ID 时，服务端会生成 `req_...`。
- 错误响应体中的 `requestId` 与响应头 `X-Request-ID` 一致。
- 默认输出结构化 JSON 访问日志：`event=api_request`，包含 `requestId`、`method`、`path`、`statusCode`、`durationMs`。
- JSON API 响应默认返回 `Cache-Control: no-store`、`Pragma: no-cache` 和 `Vary: Origin`，避免账号资料、token 响应、云端状态或错误详情被浏览器/代理缓存。
- JSON API 和本地媒体响应默认带 `X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy` 和 `Cross-Origin-Opener-Policy`，与静态资源安全头保持同级基线。
- 生产入口会显式配置 Node HTTP request/header/keep-alive 超时，降低慢连接长时间占用连接的风险。
- 测试或本地安静模式可设置 `PET_SERVER_LOG_LEVEL=off`。

## 前端联调

1. 启动后端：

```powershell
npm run server:start
```

2. 修改 `runtime-config.js`：

```js
window.PET_COMPANION_CONFIG = {
  APP_RELEASE_CHANNEL: 'local-api',
  API_BASE_URL: 'http://127.0.0.1:8787',
  API_TIMEOUT_MS: 8000,
  API_MOCK_FALLBACK: false,
  MONITORING_ENDPOINT: 'http://127.0.0.1:8787/monitoring/events',
  MONITORING_SAMPLE_RATE: 1
};
```

3. 启动前端：

```powershell
npm run start
```

## 生产注意事项

这个后端是轻量生产前 API，已覆盖账号、会话、状态、备份、媒体、监控、健康检查、就绪检查和账号生命周期接口。正式上线前必须确认：

- 生产使用 `PET_STORAGE_DRIVER=sqlite`，并把 `PET_SQLITE_FILE` 放在持久化数据卷；中长期可按并发量迁移到托管数据库。
- 本地 JSON 只用于开发；当前实现已做原子写入和 `.bak` 恢复，但生产不得使用 JSON 作为主存储。
- token 已做 HMAC 哈希存储、常量时间哈希比较、refresh token 独立有效期、刷新轮换和吊销边界；如接入第三方登录/短信登录，需要保持同等会话失效和审计能力。
- 所有状态写入必须继续通过服务端所有权校验。
- 云备份必须继续通过服务端所有权校验，并受 `PET_BACKUP_RETENTION_MAX` 限制，只保留每个用户最新 N 份，避免 SQLite 数据文件无限增长。
- 生产图片默认写入服务器本地持久化媒体目录；`/ready` 会检查媒体目录可写，重启后图片仍可访问需要由外部验收记录证明。
- 监控事件必须接入正式告警平台。
- 服务必须放到 HTTPS、反向代理和限流后面。
- 反向代理或容器平台健康检查接到 `/health`，就绪检查接到 `/ready`。
- 容器平台滚动发布、重启或缩容时依赖 `SIGTERM` 优雅关闭；如接入真实数据库，还要在同一生命周期里关闭数据库连接池。
- 多实例部署时将内存限流替换为 Redis、网关或托管 WAF 限流；若 API 放在 Nginx/负载均衡后，需要确认代理会覆盖 `X-Forwarded-For` 并设置 `PET_TRUST_PROXY=true`。

## 容器化运行

API 服务端可以用仓库根目录的 `Dockerfile` 构建为独立容器：

```powershell
npm run container:check
docker build -t pet-companion-api:0.4.0 .
docker run -d --name pet-companion-api -p 8787:8787 -v pet-companion-data:/data `
  -e NODE_ENV=production `
  -e PET_SERVER_HOST=0.0.0.0 `
  -e PET_SERVER_DATA_DIR=/data `
  -e PET_STORAGE_DRIVER=sqlite `
  -e PET_SQLITE_FILE=/data/pet-companion.sqlite `
  -e PET_CORS_ORIGIN=https://app.your-real-domain.cn `
  pet-companion-api:0.4.0
```

容器内默认使用 `/data` 作为 `PET_SERVER_DATA_DIR`，必须绑定命名卷或宿主机目录，避免重建容器后丢失账号、状态和备份数据。镜像内置 `/health` 健康检查，并以非 root 用户运行 Node API。

## 存储驱动

本地开发默认使用 `PET_STORAGE_DRIVER=json`，数据写入 `PET_SERVER_DATA_DIR/pet-companion-server.json`，并保留 `.bak` 恢复文件。

正式环境必须使用 `PET_STORAGE_DRIVER=sqlite`，并将 `PET_SQLITE_FILE` 设置为持久化绝对路径，例如：

```powershell
$env:PET_STORAGE_DRIVER='sqlite'
$env:PET_SQLITE_FILE='D:\pet-companion-data\pet-companion.sqlite'
```

SQLite 驱动使用 Node 24 内置 `node:sqlite`，开启 WAL，并通过 `/ready` 写入探针验证可写性。发布前运行 `npm run backup:drill` 验证 SQLite 主文件及 WAL/SHM 快照恢复链路。

## 备份与恢复演练

```powershell
npm run backup:drill
```

该脚本会在临时目录启动 SQLite 形态 API，创建账号、状态和云备份，复制 SQLite 主文件及 WAL/SHM 旁路文件，删除原数据后从快照恢复，并重新启动 API 验证登录、状态读取和备份恢复。它不接触真实生产数据；上线后还需要按平台配置自动定时备份、异地保存、保留周期和人工恢复责任人。

## 媒体上传与服务器本地存储

本地开发默认使用 `PET_MEDIA_STORAGE_DRIVER=local`，文件写入 `PET_MEDIA_LOCAL_DIR` 或 `PET_SERVER_DATA_DIR/media`，并通过 `/media/files/...` 读取。

自有服务器正式环境默认使用本地持久化媒体目录：

```powershell
$env:PET_MEDIA_STORAGE_DRIVER='local'
$env:PET_MEDIA_LOCAL_DIR='D:\pet-companion-data\media'
```

`POST /media/uploads` 需要远端登录 token，服务端会校验图片类型和大小，并把返回 URL 保存到头像或成长胶囊。`DELETE /media/files/{mediaKey}` 同样需要远端登录 token，只允许删除当前用户自己的媒体文件；前端删除单张成长胶囊、删除宠物档案或注销账号时会同步清理可识别的远端媒体。生产配置检查会要求本地媒体目录显式配置为绝对路径；`/ready` 会同时返回 `checks.media`，用于发现本地媒体目录不可写或 S3 配置缺失。

