# 宠伴记后端 API 合同 v1

本文档定义 H5/PWA 接正式后端时需要满足的最小接口。当前前端默认 `API_BASE_URL = ''`，不会向外部地址发送请求；配置后端后，所有远端请求统一从 `src/api/client.js` 进入。

仓库内 `server/` 已提供一个无第三方依赖的 Node API，用于本地联调、合同烟测和生产前容器化部署；真实上线仍需要生产入口、持久化存储、本地媒体目录、监控告警和平台级备份证据。

## 通用约定

- Base URL：`API_BASE_URL`
- 配置来源：`runtime-config.js` 中的 `window.PET_COMPANION_CONFIG.API_BASE_URL`
- Content-Type：有请求体的 JSON 接口必须使用 `application/json` 或 `+json` 类型；非 JSON 类型返回 `UNSUPPORTED_MEDIA_TYPE`。
- 鉴权：正式环境使用 `Authorization: Bearer <accessToken>`
- 鉴权顺序：需要登录的写入/上传接口必须先校验 token，再解析 JSON body，避免未登录请求消耗 body 解析资源。
- 请求追踪：前端 API 客户端会为请求自动生成 `X-Request-ID`；调用方显式传入时不覆盖。服务端所有响应都会返回 `X-Request-ID`，错误响应体里的 `requestId` 与响应头一致。
- CORS：必须允许 `GET,POST,PUT,DELETE,OPTIONS`，支持账号注销等跨域 DELETE 预检。
- JSON 响应：默认返回 `Cache-Control: no-store`、`Pragma: no-cache` 和 `Vary: Origin`，避免账号、token 和状态数据被浏览器或代理缓存。
- 安全响应头：JSON API 必须返回 `X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy` 和 `Cross-Origin-Opener-Policy`。
- 服务端运行时：生产环境必须显式设置 request/header/keep-alive timeouts，减少慢连接长时间占用连接的风险。
- 时间：ISO 8601 字符串
- 错误格式：

```json
{
  "code": "VALIDATION_ERROR",
  "message": "请求参数不正确",
  "requestId": "req_..."
}
```

常见错误码：`VALIDATION_ERROR`、`INVALID_JSON`、`UNSUPPORTED_MEDIA_TYPE`、`UNAUTHORIZED`、`FORBIDDEN_RESOURCE`、`RATE_LIMITED`。注册、登录、刷新、退出、账号注销密码确认和监控事件接口触发限流时统一返回 `RATE_LIMITED`，并带 `Retry-After` 响应头提示客户端退避秒数；CORS 会暴露 `Retry-After`，前端 API 客户端会保留为 `ApiError.retryAfterSeconds`，UI 会提示用户等待后再试。
非限流 API 错误会保留服务端返回的 `message`，前端 UI 可直接展示这类已脱敏、面向用户的错误文案，例如登录失败、权限不足或请求参数错误。
前端 API 客户端会保留响应头或响应体中的 `requestId`；即使网络异常或请求超时导致没有服务端响应，也会沿用本次请求生成的 `X-Request-ID`。前端遇到 5xx、网络异常或请求超时时，会在显示用户提示的同时把 `requestId` 带入前端监控边界，便于正式上线后串联客户端错误、API 响应和服务端访问日志。

### GET `/health`

用于负载均衡或容器存活检查。正常响应：

```json
{
  "ok": true,
  "service": "pet-companion-api",
  "status": "live",
  "version": "0.4.0",
  "startedAt": "2026-06-29T00:00:00.000Z",
  "uptimeSeconds": 12
}
```

### GET `/ready`

用于上线后的就绪检查，必须验证关键依赖可用。当前 Node API 会验证数据目录和媒体目录可写；接入托管数据库或对象存储时应扩展为数据库连通性、迁移状态和对象存储等依赖检查。

```json
{
  "ok": true,
  "service": "pet-companion-api",
  "status": "ready",
  "version": "0.4.0",
  "checks": {
    "storage": { "ok": true, "driver": "json-file", "writable": true }
  }
}
```

认证接口如果短时间请求过多，返回：

```json
{
  "code": "RATE_LIMITED",
  "message": "请求过于频繁，请稍后再试",
  "requestId": "req_..."
}
```

## 账号会话

### POST `/auth/register`

请求：

```json
{
  "account": "13800000000",
  "name": "主人",
  "password": "至少 8 位密码"
}
```

响应：

```json
{
  "user": { "id": "usr_1", "name": "主人", "account": "13800000000" },
  "session": {
    "authMode": "remote",
    "accessToken": "access-token",
    "refreshToken": "refresh-token",
    "expiresAt": "2026-07-29T00:00:00.000Z",
    "refreshExpiresAt": "2026-08-28T00:00:00.000Z"
  }
}
```

### POST `/auth/sign-in`

请求：

```json
{
  "account": "13800000000",
  "password": "至少 8 位密码"
}
```

响应：

```json
{
  "user": { "id": "usr_1", "name": "主人", "account": "13800000000" },
  "session": {
    "authMode": "remote",
    "accessToken": "access-token",
    "refreshToken": "refresh-token",
    "expiresAt": "2026-07-29T00:00:00.000Z",
    "refreshExpiresAt": "2026-08-28T00:00:00.000Z"
  }
}
```

服务端要求：

- 不得明文保存密码。
- 密码需要带盐哈希保存。
- 不得明文保存 access token 和 refresh token，服务端仅保存 token 哈希。
- token 哈希比对必须使用常量时间比较，避免把 access/refresh token 是否接近真实值暴露给时序侧信道。
- refresh token 必须有独立有效期；刷新成功后必须轮换 refresh token，旧 refresh token 立即失效。
- 登录失败不能签发 session。
- 重复注册同一账号必须返回 `ACCOUNT_EXISTS`。
- 注册、登录、刷新、退出、账号注销密码确认和监控事件接口必须有服务端限流，避免暴力尝试或事件刷写。

### POST `/auth/refresh`

请求：

```json
{ "refreshToken": "refresh-token" }
```

响应同 `session`，且必须返回轮换后的新 `refreshToken` 和 `refreshExpiresAt`。

前端要求：

- 云同步、云备份和云端恢复请求遇到 401 时，允许使用当前 `refreshToken` 调用此接口刷新会话并重试一次。
- 刷新成功后前端必须保存新的 `refreshToken`，不能继续使用旧 refresh token。
- 刷新失败时必须要求用户重新登录。

### POST `/auth/sign-out`

请求：

```json
{ "refreshToken": "refresh-token" }
```

响应：

```json
{ "ok": true }
```

## 账号数据生命周期

### GET `/account/export`

需要 `Authorization: Bearer <accessToken>`。用于用户主动导出自己的云端账号资料、当前应用状态和云备份。

响应：

```json
{
  "exportVersion": 1,
  "exportedAt": "2026-06-29T00:00:00.000Z",
  "user": { "id": "usr_1", "name": "主人", "account": "13800000000" },
  "state": {},
  "backups": []
}
```

要求：

- 导出内容只能包含当前登录用户的数据。
- `user` 不得包含 `passwordHash`。
- 导出体不得包含 access token、refresh token、cookie 或服务端 token 哈希。

### DELETE `/account`

需要 `Authorization: Bearer <accessToken>`，并要求用户再次输入密码确认。

请求：

```json
{ "password": "当前账号密码" }
```

响应：

```json
{
  "ok": true,
  "deletedAt": "2026-06-29T00:00:00.000Z",
  "media": {
    "ok": true,
    "storageDriver": "local",
    "deletedFiles": 3,
    "deletedDirectory": true,
    "scannedReferences": 3
  }
}
```

要求：

- 密码错误返回 `INVALID_CREDENTIALS`。
- 成功后删除当前用户、当前用户所有会话、当前用户云端状态、当前用户云备份，以及可从状态/备份引用到的当前用户媒体文件。
- 成功后旧 access token 必须立即失效。
- 不得删除其他用户的数据。

## 应用状态同步

### GET `/app-state`

返回当前用户的云端状态：

```json
{
  "state": {
    "schemaVersion": 4,
    "users": [],
    "pets": [],
    "reminders": [],
    "records": [],
    "photos": [],
    "posts": [],
    "checkins": [],
    "session": null,
    "ui": { "sheet": null, "detailPetId": null }
  },
  "updatedAt": "2026-06-29T00:00:00.000Z"
}
```

### PUT `/app-state`

请求：

```json
{
  "state": {
    "schemaVersion": 4,
    "pets": [],
    "reminders": [],
    "records": [],
    "photos": [],
    "posts": [],
    "checkins": []
  }
}
```

响应：

```json
{
  "ok": true,
  "updatedAt": "2026-06-29T00:00:00.000Z"
}
```

服务端要求：

- 必须按当前登录用户隔离数据。
- 必须校验宠物、提醒、记录、打卡、照片和动态的所有权。
- 不接受前端提交的其他用户资源。
- 不保存 `ui.sheet` 等临时弹层状态。

## 云端备份

### POST `/app-state/backups`

前端提交 `pet-companion-backup-v1` 格式：

```json
{
  "backupVersion": 1,
  "appVersion": "0.3.7",
  "schemaVersion": 4,
  "createdAt": "2026-06-29T00:00:00.000Z",
  "counts": {
    "users": 1,
    "pets": 1,
    "reminders": 2,
    "records": 4,
    "photos": 0,
    "posts": 1,
    "checkins": 3
  },
  "state": {}
}
```

响应：

```json
{
  "backupId": "bak_1",
  "createdAt": "2026-06-29T00:00:00.000Z"
}
```

备份要求：

- `session.accessToken` 和 `session.refreshToken` 必须为空。
- `ui.sheet` 和 `ui.detailPetId` 必须重置为空。
- 服务端必须再次执行所有权校验，并按 `PET_BACKUP_RETENTION_MAX` 对每个用户做云备份保留上限，只保留最新 N 份。
- 图片 Data URL 体积较大，正式环境应上传到服务端媒体接口，并写入服务器持久化媒体目录。

### GET `/app-state/backups`

响应：

```json
[
  {
    "backupId": "bak_1",
    "appVersion": "0.3.7",
    "schemaVersion": 4,
    "createdAt": "2026-06-29T00:00:00.000Z",
    "counts": { "pets": 1, "records": 4 }
  }
]
```

### POST `/app-state/backups/{backupId}/restore`

响应：

```json
{
  "ok": true,
  "state": {},
  "restoredAt": "2026-06-29T00:00:00.000Z"
}
```

## 监控

### POST `/monitoring/events`

当 `MONITORING_ENDPOINT` 配置为此地址时启用。事件内容由 `src/core/monitoring.js` 生成，仅包含错误摘要、版本、页面路径和浏览器信息，不包含账号明文、token 或完整业务数据。

服务端会输出结构化 JSON 访问日志，包含 `requestId`、方法、路径、状态码和耗时；生产排查时可用 `X-Request-ID` 串联前端报错、API 响应和服务端日志。

## 上线判定

后端发布前必须具备并验证：

1. 账号注册、登录、刷新、退出和 token 哈希存储。
2. 当前用户应用状态读写，且必须保留服务端所有权校验，跨用户资源必须拒绝。
3. 备份创建、列表和恢复。
4. 媒体上传在自有服务器生产环境使用本地持久化媒体目录，`/ready` 暴露媒体存储探针，云同步体不得保存大体积 Data URL。
5. 账号数据导出和账号注销，注销后旧 access token 必须立即失效。
6. `/health`、`/ready`、结构化访问日志和 `X-Request-ID` 追踪。
7. 监控事件接收，并在真实生产环境接入告警平台。

本仓库的 Node API 已覆盖上述接口的本地门禁；真实上线还需要生产入口、持久化数据卷/数据库、本地媒体目录、监控告警和备份策略的外部证据。

## 媒体上传接口

### POST `/media/uploads`

用于成长胶囊等图片上传。需要 `Authorization: Bearer <accessToken>`。

请求体：

```json
{
  "dataUrl": "data:image/png;base64,...",
  "fileName": "photo.png",
  "title": "\u7b2c\u4e00\u6b21\u56de\u5bb6"
}
```

### DELETE `/media/files/{mediaKey}`

用于删除当前用户上传的头像或成长胶囊图片。需要 `Authorization: Bearer <accessToken>`。

要求：

- 只能删除 `mediaKey` 归属当前用户的媒体文件；跨用户媒体返回 `MEDIA_FORBIDDEN`。
- 本地存储下，重复删除同一个文件返回 200，`deleted=false`，方便前端幂等重试。
- 删除不存在的文件不影响账号状态；读取已删除文件返回 `MEDIA_NOT_FOUND`。

响应：

```json
{
  "ok": true,
  "mediaId": "usr_xxx/file.png",
  "storageDriver": "local",
  "deleted": true,
  "deletedAt": "2026-06-29T00:00:00.000Z"
}
```

响应体：

```json
{
  "mediaId": "usr_xxx/file.png",
  "url": "/media/files/usr_xxx/file.png",
  "mimeType": "image/png",
  "size": 12345,
  "storageDriver": "local",
  "uploadedAt": "2026-06-29T00:00:00.000Z"
}
```

要求：

- 只允许 jpg、png、webp、gif。
- 自有服务器生产环境使用本地媒体持久化目录时，必须把目录挂载到持久化数据卷，不得只写入一次性容器文件系统。
- 云同步体和备份只保存图片 URL，不保存大体积 Data URL。

