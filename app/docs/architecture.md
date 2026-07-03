# 宠伴记生产架构说明

## 目标

宠伴记当前按可上线 H5/PWA + Node API 形态组织。架构目标是让 UI、领域逻辑、状态、远端 API、发布门禁和运维材料保持分层，后续扩功能时不回到单文件堆叠。

## 前端分层

```text
index.html
├─ runtime-config.js
└─ src/main.js
   ├─ api/
   │  ├─ client.js
   │  ├─ appStateClient.js
   │  ├─ authClient.js
   │  ├─ accountClient.js
   │  ├─ mediaClient.js
   │  ├─ monitoringClient.js
   │  └─ localStore.js
   ├─ repositories/
   │  ├─ appStateRepository.js
   │  └─ authRepository.js
   ├─ core/
   │  ├─ state.js
   │  ├─ migrations.js
   │  ├─ config.js
   │  ├─ monitoring.js
   │  ├─ pwaUpdate.js
   │  ├─ policies.js
   │  ├─ selectors.js
   │  ├─ validation.js
   │  ├─ remoteSync.js
   │  └─ utils.js
   ├─ domain/
   │  ├─ users.js
   │  ├─ sessions.js
   │  ├─ pets.js
   │  ├─ checkins.js
   │  ├─ reminders.js
   │  ├─ records.js
   │  ├─ capsules.js
   │  ├─ posts.js
   │  ├─ backups.js
   │  ├─ consent.js
   │  └─ diagnostics.js
   └─ ui/
      ├─ views.js
      ├─ components.js
      ├─ charts.js
      └─ toast.js
```

关键路径必须保持可审查：`src/api/accountClient.js`、`src/api/mediaClient.js`、`src/core/pwaUpdate.js`、`src/core/remoteSync.js`、`src/domain/consent.js`、`src/domain/diagnostics.js`。

### 入口层：`src/main.js`

入口层负责事件绑定、表单数据收集、领域动作编排、保存状态、重新渲染、全局错误边界和 PWA 更新入口。入口层不得直接绕过领域层拼装复杂业务对象，也不得直接操作远端 token。

### API 层：`src/api/`

API 层负责所有外部接口边界：

- `client.js`：统一超时、错误、mock fallback 和 `ApiError`。
- `authClient.js`：远端注册、登录、刷新和退出。
- `appStateClient.js`：云端状态、云备份创建、列表和恢复。
- `accountClient.js`：账号数据导出和账号注销。
- `mediaClient.js`：远端媒体上传。
- `monitoringClient.js`：前端监控上报；未配置端点时保持本地安全模式。
- `localStore.js`：本地状态适配、旧 key 兼容和损坏数据恢复。

所有远端请求必须经过 `apiRequest()`；未配置后端时不得误发外部请求。

### Repository 层：`src/repositories/`

Repository 层隔离 UI/状态和具体存储实现：

- `appStateRepository.js`：统一 `load/save/clear/status`，并提供远端拉取、上传、云备份、本地备份和备份恢复边界。
- `authRepository.js`：隔离本地会话、远端登录、刷新、登出和账号状态。

状态层不得直接依赖 `localStorage` 或远端 API 细节。

### Core 层：`src/core/`

Core 层负责可复用的应用基础能力：

- `state.js`：默认状态、状态归一化、持久化入口和 UI 临时状态。
- `migrations.js`：Schema 版本迁移和字段修复。
- `config.js`：版本、构建目标、发布通道、API、监控和运行时配置读取。
- `monitoring.js`：渲染异常、交互异常、全局错误和 Promise 错误监控边界。
- `pwaUpdate.js`：Service Worker 更新检查、等待激活和受控刷新。
- `policies.js`：宠物和资源所有权策略。
- `selectors.js`：当前用户、当前宠物、今日打卡、提醒等派生数据。
- `validation.js`：文本、日期、数值和图片输入校验。
- `remoteSync.js`：远端同步时 refresh token 重试边界。
- `utils.js`：日期、ID、HTML 转义和纯工具函数。

### Domain 层：`src/domain/`

Domain 层负责业务对象和规则：

- `users.js`、`sessions.js`：用户和会话规则。
- `pets.js`：宠物档案和演示宠物。
- `checkins.js`：打卡预设、今日打卡、完成率、批量操作、删除和去重。
- `reminders.js`：提醒预设、自定义提醒、完成和去重。
- `records.js`：护理记录和体重记录。
- `capsules.js`：成长胶囊创建和筛选。
- `posts.js`：暖窝动态、评论和点赞。
- `backups.js`：备份格式、脱敏快照、结构校验和摘要。
- `consent.js`：用户协议和隐私政策同意记录。
- `diagnostics.js`：脱敏诊断包导出和敏感字段扫描。

### UI 层：`src/ui/`

UI 层只负责展示和轻量组件组合：

- `views.js`：页面、卡片、底部弹层和表单 HTML。
- `components.js`：统一空状态和运行时错误保护视图。
- `charts.js`：Canvas 图表。
- `toast.js`：暖色全局提示。

所有用户输入输出必须经过 HTML 转义或校验后进入状态层。

### 分层依赖门禁

`npm run architecture:check` 会扫描 `src/` 和 `server/` 的相对 import，作为上线前防漂移门禁：

- `src/main.js` 是唯一允许同时编排 UI、Domain、Repository、API 和 Core 的入口层。
- UI 层不得直接导入 API 或 Repository，避免视图绕过状态和仓储边界。
- Domain 层不得导入 UI、API 或 Repository，业务规则必须保持可复用、可测试。
- API 层不得导入 UI 或 Repository，外部请求边界不能反向依赖上层。
- Repository 层不得导入 UI，仓储只负责连接 API、本地适配器和领域数据格式。
- Core 层不得导入 UI 或 `server/`，服务端不得导入前端 UI。
- 所有相对 import 必须能解析到真实文件，防止发布包里出现构建期遗漏。

## 后端分层

```text
server/index.js
├─ lifecycle.js
├─ config.js
├─ http.js
├─ router.js
├─ auth.js
├─ state.js
├─ storage.js
├─ media.js
├─ health.js
├─ rateLimit.js
└─ logger.js
```

- `index.js`：生产启动入口；`NODE_ENV=production` 时执行 fail-fast 配置校验。
- `lifecycle.js`：处理 `SIGTERM/SIGINT` 优雅关闭。
- `config.js`：服务端端口、CORS、SQLite、本地媒体/S3、限流、body 大小和生产配置检查。
- `http.js`：JSON body、错误响应、CORS、`X-Request-ID` 和请求上下文。
- `router.js`：路由分发，覆盖 auth、account、app-state、backup、media、monitoring、health、ready。
- `auth.js`：注册、登录、刷新、登出、密码哈希、token 哈希、账号导出和账号注销。
- `state.js`：当前用户的云状态、云备份、恢复和所有权校验。
- `storage.js`：开发 JSON 原子写入/备份恢复；生产 SQLite WAL 存储和 ready 可写探针。
- `media.js`：本地媒体、S3 兼容媒体存储边界和媒体 ready 探针。
- `rateLimit.js`：认证接口限流。
- `health.js`：`/health` 与 `/ready`，ready 同时探测数据存储和媒体存储状态。
- `logger.js`：可关闭的结构化访问日志。

服务端存储边界由 `server/storage.js` 维护。

自有服务器生产环境必须使用 `PET_STORAGE_DRIVER=sqlite` 和 `PET_MEDIA_STORAGE_DRIVER=local`，并将 `PET_MEDIA_LOCAL_DIR` 指向持久化绝对路径；后续升级对象存储时可切换为 `s3`。

## 发布与运维分层

- `scripts/audit.mjs`：静态审查，覆盖文件、语法、PWA、UI、分层、后端、部署和文档门禁。
- `scripts/test.mjs`：前端领域/仓储/渲染烟测。
- `scripts/e2e.mjs`：生产构建浏览器回归。
- `scripts/e2e-remote.mjs`：本地 API + 生产形态 runtime 的远端注册、云同步、云备份回归。
- `scripts/build.mjs`：生产构建，先执行 `audit` 和 `test`。
- `scripts/deploy-check.mjs`：`dist`、PWA、runtime-config 和静态安全头检查。
- `scripts/public-bundle-check.mjs`：公网发布包边界检查，防止内部文档、脚本、后端代码和输出证据进入 `dist`。
- `scripts/pwa-cache-check.mjs`：PWA 缓存版本和预缓存清单检查，确保缓存名跟 App 版本一致且不预缓存 `runtime-config.js`。
- `scripts/server-test.mjs`：后端 API 合同烟测。
- `scripts/server-production-check.mjs`：服务端生产环境变量门禁。
- `scripts/container-check.mjs`：Dockerfile、非 root、数据卷和 healthcheck 门禁。
- `scripts/deploy-bundle-check.mjs`：Docker Compose、Nginx、TLS 占位和只读 dist 挂载门禁。
- `scripts/backup-restore-drill.mjs`：SQLite 备份恢复演练。
- `scripts/ops-check.mjs`：部署后线上 health、ready、监控、SLO、缓存和请求追踪检查。
- `scripts/release-plan-check.mjs`：发布/回滚 Runbook 检查。
- `scripts/readiness-check.mjs`：生产就绪文档和外部证据边界检查。
- `scripts/external-evidence-check.mjs`：真实外部证据模板和可选证据文件校验。
- `scripts/artifact-manifest.mjs` / `scripts/artifact-verify.mjs`：发布产物 SHA-256 清单和反向校验。
- `scripts/release-evidence.mjs` / `scripts/release-evidence-check.mjs`：发布证据包生成和自校验。
- `scripts/architecture-check.mjs`：架构文档与当前代码分层的漂移校验。

## 生产发布边界

仓库内可以证明：代码分层、PWA、后端 API、容器基线、部署模板、本地发布门禁、发布证据包和回滚材料齐全。

仓库内不能伪造：生产入口、生产 `deploy/production.env`、持久化生产数据卷、本地媒体目录挂载与图片验收、监控平台告警、平台级备份、法务确认、真机验收。缺少这些外部证据时，状态只能是“本地门禁通过，但不能声明真实上线完成”。

## 变更原则

1. 新 UI 优先放 `src/ui/views.js` 和 `src/ui/components.js`。
2. 新业务规则优先放 `src/domain/`。
3. 新状态字段必须更新 `src/core/migrations.js` 和 `src/core/state.js`。
4. 新远端接口必须先补 `docs/api-contract.md`，再补 `src/api/` 和 `server/`。
5. 新生产能力必须接入 `scripts/audit.mjs`、发布门禁和对应 Runbook。
6. 文档描述不得落后于当前代码；架构变化后必须执行 `npm run architecture:check`。
