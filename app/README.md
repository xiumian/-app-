# 宠伴记

暖色系宠物日记 + 宠物健康照护 H5/PWA。

## 10点验收入口

现场只需要先执行：

```powershell
npm.cmd run acceptance:10am
```

然后优先打开：

```text
output/10am-acceptance.html
```

如需纯文本版，再打开 `output/10am-acceptance.md`。这个入口会刷新本地验收预检、验收口径、交接包、外部证据负责人填报表、真机验收记录表和上线状态；不部署、不上传、不读取真实密钥、不改服务器首页。当前真实上线结论以 `npm.cmd run launch:status` 为准，外部证据未 verified 时必须保持 `NO_GO`。

如果要发给验收/运营/运维人员，复制这个目录即可：

```text
output/10am-acceptance-bundle
```

复制前可自检资料包完整性：

```powershell
npm.cmd run acceptance:bundle:check
```

如果要直接发一个压缩包：

```powershell
npm.cmd run acceptance:bundle:zip
```

压缩包会输出到 `output/10am-acceptance-bundle-*.zip`，并生成对应 SHA-256 校验文件。

临近验收前可跑最终摘要：

```powershell
npm.cmd run acceptance:final
```

它会刷新 ZIP 包、轻量复核生产就绪索引和上线状态，并输出 `output/10am-final-summary.md` / `.json` / `.txt`；仍然不部署、不上传、不读取真实密钥、不改服务器首页。

## 本地运行

```powershell
npm run start
```

如果 PowerShell 禁止运行 `npm.ps1`，使用：

```powershell
npm.cmd run start
```

访问：

```text
http://127.0.0.1:5174/index.html
```

## 自动审查

```powershell
npm run audit
```

## 自动测试

```powershell
npm run test
```

当前测试覆盖：表单校验、本地存储恢复、迁移、仓储边界、账号会话、权限策略、打卡管理领域动作、底部弹层渲染烟测、协议同意、脱敏诊断包和 PWA 更新入口。
配置 `API_BASE_URL` 后，登录页会切换为远端注册/登录入口；未配置 API 时保持本地体验模式。
远端账号登录后，“我的”页会提供上传云端、拉取云端和创建云备份操作，且同步体不会携带 token。
如果云同步遇到 access token 过期，前端会调用 refresh 接口刷新会话并重试一次，并保存服务端轮换后的新 refresh token。
同时覆盖监控边界：未配置监控端点时不外发，运行错误可被捕获并进入状态统计。

## 浏览器回归

```powershell
npm run e2e
npm run e2e:remote
```

浏览器回归会使用本机 Chrome/Edge 打开 `dist/index.html`，验证演示登录、首页、打卡管理弹层、宠物页、记录页和我的页，并输出截图到 `D:\codex\宠物app\output\e2e`。
远端浏览器联调会临时启动本地 API，用自定义 runtime-config 指向该 API，验证远端注册、上传云端和创建云备份，并检查后端落库不含明文密码/token。

## 部署前检查

```powershell
npm run deploy:check
```

部署前检查会验证 `dist` 文件完整性、运行时配置、PWA manifest、Service Worker、构建信息和静态安全响应头。生产参数写入 `dist/runtime-config.js` 后可执行：

```powershell
npm run deploy:check:production
```

## 本地后端 API

```powershell
npm run server:start
npm run server:test
```

当前后端是无第三方依赖的 Node API，覆盖注册/密码登录、token 刷新、状态同步、云端备份、媒体上传、账号导出/注销、监控接收、健康检查和就绪检查。自有服务器生产环境必须使用 SQLite 持久化、本地媒体持久化目录、明确 CORS、安全环境变量、refresh token 独立有效期和轮换。

## 生产构建

```powershell
npm run build
```

生产构建会先执行 `audit` 和 `test` 两道门禁，通过后才输出 `dist`。
生产 API、监控和发布通道通过 `runtime-config.js` 配置，不需要为不同环境改源码重构建。

生成生产运行时配置：

```powershell
$env:PET_API_BASE_URL='https://api.your-real-domain.cn'
$env:PET_MONITORING_ENDPOINT='https://monitoring.your-real-domain.cn/events'
npm run runtime:production
npm run deploy:check:production
```

构建产物会输出到：

```text
D:\codex\宠物app\dist
```

或：

```powershell
node .\scripts\audit.mjs
```

当前审查覆盖：

- 必要文件存在
- ES Module 入口
- JS 语法检查
- 中文乱码检查
- 正式 App 不出现顶部黑色胶囊/灵动岛装饰
- 打卡管理底部弹层
- 打卡预设完整
- 宠物档案详情底部弹层
- 成长胶囊领域模块
- 健康提醒管理底部弹层
- 健康提醒预设完整
- 状态层包含打卡数据
- 正式测试脚本和构建门禁
- 浏览器 E2E 发布回归脚本
- 运行时错误监控边界
- 协议同意门禁、脱敏诊断包、PWA 更新生命周期
- 容器、部署编排、备份恢复、密钥扫描和生产就绪门禁

## 代码分层

- `src/main.js`：应用入口、事件绑定、业务动作编排
- `src/api/client.js`：远端 API 客户端骨架、超时、错误类型、mock fallback
- `src/api/authClient.js`：远端登录、刷新、退出接口骨架
- `src/api/appStateClient.js`：云端状态同步和备份接口客户端
- `src/api/monitoringClient.js`：监控上报客户端，未配置端点时保持本地安全模式
- `src/api/localStore.js`：本地数据适配层，后续替换真实后端的边界
- `src/repositories/appStateRepository.js`：应用状态仓储边界，后续接 API/云同步优先改这里
- `src/repositories/authRepository.js`：账号会话仓储边界，后续接真实登录优先改这里
- `src/core/state.js`：状态、本地存储、迁移
- `src/core/policies.js`：当前用户所有权和访问控制策略
- `src/core/config.js`：版本号、构建目标、发布通道
- `src/core/migrations.js`：Schema 版本迁移、字段修复、迁移报告
- `src/core/monitoring.js`：运行时错误捕获、脱敏摘要和监控状态
- `src/core/pwaUpdate.js`：PWA 注册、检查更新和受控激活
- `src/core/remoteSync.js`：远端同步 401 自动刷新会话并重试
- `src/core/selectors.js`：选择器
- `src/core/utils.js`：通用工具
- `src/core/validation.js`：统一表单校验、图片容量限制、校验错误类型
- `src/domain/users.js`：用户登录/创建领域逻辑
- `src/domain/backups.js`：备份格式、脱敏快照和备份校验
- `src/domain/sessions.js`：本地会话、会话状态、迁移会话领域逻辑
- `src/domain/pets.js`：宠物档案领域逻辑
- `src/domain/capsules.js`：成长胶囊领域逻辑
- `src/domain/checkins.js`：打卡领域逻辑
- `src/domain/reminders.js`：健康提醒领域逻辑
- `src/domain/records.js`：护理记录领域逻辑
- `src/domain/posts.js`：暖窝动态/评论/点赞领域逻辑
- `src/ui/views.js`：页面/组件模板
- `src/ui/components.js`：统一空状态、运行时错误保护视图
- `src/ui/charts.js`：图表
- `src/ui/toast.js`：提示
- `scripts/e2e.mjs`：无第三方依赖的 Chrome/Edge 浏览器回归
- `scripts/e2e-remote.mjs`：远端注册、云同步和云备份浏览器联调
- `scripts/deploy-check.mjs`：部署前 dist、PWA、运行时配置和安全响应头检查
- `scripts/write-runtime-config.mjs`：根据环境变量生成生产 `dist/runtime-config.js`
- `scripts/public-bundle-check.mjs`：校验公网发布包不包含内部文档、脚本、后端代码或输出证据
- `scripts/pwa-cache-check.mjs`：校验/更新 Service Worker 缓存版本、预缓存清单和 runtime-config 排除策略
- `scripts/architecture-check.mjs`：校验 `docs/architecture.md` 与当前代码分层一致
- `scripts/external-evidence-check.mjs`：校验外部上线证据模板和可选真实证据文件
- `scripts/artifact-manifest.mjs`：生成 `dist` 全量产物 SHA-256 清单 `output/release-artifacts.json`
- `scripts/artifact-verify.mjs`：校验当前 `dist` 是否匹配发布产物清单
- `scripts/release-evidence.mjs`：生成发布证据包 `output/release-evidence.json`
- `scripts/release-evidence-check.mjs`：校验发布证据包与发布步骤、产物清单和外部证据统计一致
- `.github/workflows/release-gate.yml`：PR / 主分支推送 / 手动触发的 CI 发布门禁
- `server/`：无依赖 Node 后端 API
- `scripts/server-test.mjs`：后端 API 合同烟测
- `scripts/readiness-check.mjs`：生产就绪说明和外部上线项门禁
- `runtime-config.js`：部署时运行时配置

## 上线状态边界

- 本地体验模式仍可使用 `localStorage`，配置 `API_BASE_URL` 后会走远端注册、登录、云同步、云备份、媒体上传、账号导出和注销。
- 生产环境必须生成 `dist/runtime-config.js`，并关闭 mock fallback。
- 生产环境必须提供 SQLite 持久化、本地媒体持久化目录、CORS、监控端点、平台级备份和生产入口配置。
- 发布交接时必须同时保留 `output/release-artifacts.json` 和 `output/release-evidence.json`，并通过 `npm.cmd run release:evidence:check` 核对线上文件、发布步骤与本次构建一致。
- 公网 `dist` 只应包含运行资源和用户可见法务文本；执行 `npm.cmd run public:bundle:check` 可防止内部 Runbook、API 合同、脚本和后端代码进入静态发布包。
- PWA 发布前执行 `npm.cmd run pwa:cache:check`，确保缓存名包含当前版本和预缓存内容哈希、核心模块已预缓存且 `runtime-config.js` 不被旧缓存锁死；改动静态资源后可先执行 `npm.cmd run pwa:cache:update` 自动刷新缓存名。
- 法务文本中的运营主体、联系方式、保存期限、第三方服务商和适用地区必须由真实运营方确认。
- 真正上线完成还需要 `npm.cmd run release:check`、`npm.cmd run readiness:check`、`npm.cmd run architecture:check`、CI `npm run ci:check`、生产 `smoke:production`、生产 `ops:check` 和真机人工验收全部通过。

发布准备详见：`docs/deployment.md`。
生产就绪清单详见：`docs/production-readiness.md`。
CI 门禁详见：`docs/ci.md`。
外部上线证据详见：`docs/external-evidence.md`。
发布证据包详见：`docs/release-evidence.md`。
运行时配置详见：`docs/runtime-config.md`。
后端接口详见：`docs/api-contract.md`。
本地后端详见：`docs/backend.md`。
