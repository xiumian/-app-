# 宠伴记生产就绪清单

本清单用于区分“仓库已具备的上线能力”和“真实发布前必须由运营/基础设施补齐的外部事项”。它不替代 `npm run release:check`，也不替代真机人工验收。

## 本仓库已具备的上线能力

- 前端为 H5/PWA，包含 manifest、Service Worker、离线导航回退和受控 PWA 更新入口。
- UI 已按暖色宠物 App 风格实现：首页、百科、附近、我的、宠物档案详情、成长胶囊、打卡管理、健康提醒管理。
- 前端代码已拆分为 `api`、`repositories`、`core`、`domain`、`ui` 和入口编排层。
- 后端包含无第三方依赖 Node API，支持远端注册/登录、token 刷新、云端状态、云备份、媒体上传、账号导出与注销、监控事件、健康检查和就绪检查。
- 生产配置门禁会拒绝不安全默认值：生产必须显式配置 CORS、SQLite、本地媒体持久化目录、access token / refresh token TTL、请求体大小和认证限流。
- 部署材料包含 Dockerfile、Docker Compose、Nginx HTTPS 反代、服务器目标目录模板、静态安全头、运行时配置生成、发布 Runbook、回滚 Runbook、密钥扫描、备份恢复演练和运维 Runbook。
- 自动发布门禁包含构建、单测、浏览器 E2E、远端浏览器 E2E、生产烟测自测、运维检查自测、部署检查、后端测试、备份恢复演练、容器检查、服务器目标目录检查、部署编排检查、真机验收模板检查、发布计划检查、密钥扫描、可访问性/离线检查和发布产物 SHA-256 清单。
- CI 门禁已提供 `.github/workflows/release-gate.yml`，在 PR、`main/master` 推送和手动触发时执行 `npm run ci:check`。

## 真实上线前仍需外部配置

这些事项不能在本地仓库内伪造完成，必须由真实上线环境提供证据：

1. 公网 HTTPS 入口、TLS 证书和网关（域名或 IP）。
2. `deploy/production.env` 中的真实生产环境变量；该文件不得提交到仓库。
3. 持久化 SQLite 数据卷或正式托管数据库迁移方案。
4. 服务器本地媒体持久化目录、挂载数据卷和图片上传/读取验收记录。
5. 生产监控端点、告警接收人和告警规则启用记录。
6. 平台级定时备份、异地保存、保留周期和恢复责任人。
7. 真实运营主体、客服渠道、隐私政策、用户协议和地区法务确认。
8. iPhone/Android 真机多尺寸验收，包括离线刷新、PWA 更新、注册登录、图片上传、云同步、备份恢复和账号注销；验收模板见 `docs/manual-device-acceptance.md`。

## Go/No-Go 判定

轻量查看当前上线结论：

```powershell
npm.cmd run launch:status
```

当仍是 `NO_GO` 时，`launch:status` 会同时输出 Ops / Legal / QA 负责人快捷命令，便于现场直接分派外部证据补齐任务：

```powershell
npm.cmd run external:evidence:next:ops
npm.cmd run external:evidence:next:legal
npm.cmd run external:evidence:next:qa
```

10 点现场最短入口：

```powershell
npm.cmd run acceptance:10am
```

执行后优先打开 `output/10am-acceptance.html`，如需纯文本版再看 `output/10am-acceptance.md`。该入口会刷新预检和现场口径，并生成可复制交付的 `output/10am-acceptance-bundle` 目录；不部署、不上传、不读取真实密钥、不改服务器首页。

10 点前一键刷新完整验收包：

```powershell
npm.cmd run acceptance:ready
```

该命令会顺序执行外部证据采集器自检、发布证据自检与刷新、10 点预检、资料包校验、最终摘要校验和 `launch:status`。它适合验收前最后一次本地刷新；不部署、不上传、不读取真实密钥、不改服务器首页。若外部生产证据仍未 verified，命令会保留 `NO_GO` 判定。

复制资料包前可执行：

```powershell
npm.cmd run acceptance:bundle:check
```

它会校验资料包关键文件、入口 JSON/HTML、禁止出现的生产 env/私钥/证书文件名，以及明显密钥块，并生成 `output/10am-acceptance-bundle/MANIFEST.md` / `.json`。

如果需要生成可发送的 ZIP 包：

```powershell
npm.cmd run acceptance:bundle:zip
```

该命令会先刷新 `acceptance:10am`，再执行 `acceptance:bundle:check`，最后输出 `output/10am-acceptance-bundle-*.zip` 和 SHA-256 校验文件。

临近验收前生成最终摘要：

```powershell
npm.cmd run acceptance:final
```

该命令会刷新 ZIP 包、轻量复核生产就绪索引和 `launch:status`，并输出 `output/10am-final-summary.md` / `.json` / `.txt`；仍不部署、不上传、不读取真实密钥、不改服务器首页。真实上线仍以 `launch:status` 为准。

生成 10 点验收交接包（只汇总本地证据、外部缺口和传输边界，不部署、不上传、不读取密钥）：

```powershell
npm.cmd run acceptance:handoff
```

10 点前一键预检并刷新验收记录：

```powershell
npm.cmd run acceptance:preflight
```

该命令会顺序执行产物清单校验、发布证据包校验、生产就绪检查、外部证据格式校验、外部证据负责人填报表刷新、外部证据指挥台刷新、Ops/Legal/QA 脱敏请求包刷新、传输计划刷新、真机验收记录表刷新、验收交接包刷新、10 点验收口径一页纸刷新和上线状态读取；输出 `output/acceptance-preflight.md` / `.json`。它不部署、不上传、不读取真实密钥、不改服务器首页。若需要把外部证据未通过也作为命令失败，使用 `-- --strict-go`。

单独生成 10 点验收口径一页纸：

```powershell
npm.cmd run acceptance:brief
```

输出 `output/acceptance-brief.md` / `.json`，用于现场说明“可以验收什么、不能宣称什么、还差哪些外部证据”。

单独生成外部证据负责人填报表：

```powershell
npm.cmd run external:evidence:worksheet
```

输出 `output/external-evidence-worksheet.md` / `.json`，用于分派公网 HTTPS/TLS、生产 env、持久化数据、媒体目录、监控告警、平台备份、法务确认和真机验收 8 个外部证据项。

单独生成真机验收记录表：

```powershell
npm.cmd run manual:acceptance:record
```

输出 `output/manual-device-acceptance-record.md` / `.json`，用于补齐 `manualDeviceAcceptance` 所需的设备矩阵、核心流程截图、离线/PWA 更新/账号注销和复验结论证据。

如果需要给发布窗口或自动化脚本强制阻断 No-Go：

```powershell
npm.cmd run launch:status -- --require-go
```

Strict final gate before real publish/deploy:

```powershell
npm.cmd run release:go
```

`release:go` runs the full local `release:check`, then runs `launch:status -- --require-go`; any pending/provided external evidence must block release.

可以进入发布窗口的最低条件：

```powershell
npm.cmd run release:check
npm.cmd run public:bundle:check
npm.cmd run pwa:cache:check
npm.cmd run readiness:check
npm.cmd run ci:check
npm.cmd run architecture:check
npm.cmd run deploy:target:check
npm.cmd run manual:acceptance:check
npm.cmd run external:evidence:check
npm.cmd run artifact:manifest
npm.cmd run artifact:verify
npm.cmd run release:evidence:self-test
npm.cmd run release:evidence
npm.cmd run release:evidence:check
```

上线后必须补充：

```powershell
$env:PET_PROD_APP_URL='https://app.your-real-domain.cn'
$env:PET_PROD_API_BASE_URL='https://api.your-real-domain.cn'
npm.cmd run smoke:production
npm.cmd run ops:check
```

如果任一外部配置缺少证据，状态应判定为“本地门禁通过，但不能声明真实上线完成”。

`output/production-evidence.json` 用于记录真实外部证据，格式参考 `deploy/production-evidence.example.json`。
`launch:status -- --require-go` treats a missing, malformed, duplicate, or incomplete `output/production-evidence.json` as `NO_GO`, so external evidence cannot be skipped by deleting the file.
It also blocks placeholder owner/evidenceRef values, possible secrets, mojibake markers, missing requiredProof, and invalid verified checkedAt timestamps.
If release evidence or production evidence JSON is malformed, `launch:status` reports `NO_GO` with a parse-error blocker instead of crashing silently.
`npm.cmd run public:bundle:check` 用于确认公网 `dist` 不包含内部需求文档、API 合同、部署 Runbook、真机验收清单、部署目标、脚本、后端代码或输出证据，只保留运行资源和用户可见法务文本。
`npm.cmd run pwa:cache:check` 用于确认 Service Worker 缓存名包含当前 App 版本、核心前端模块都进入预缓存、且 `runtime-config.js` 不会被旧缓存锁死。
`npm.cmd run deploy:target:check` 用于确认私有 `deploy/target.json` 或示例目标只指向 App 专属目录，避免误上传到服务器首页根目录或系统目录。
`npm.cmd run manual:acceptance:check` 用于确认 `docs/manual-device-acceptance.md` 覆盖真机设备矩阵、核心流程、支持/投诉、脱敏截图和复验结论；它不替代真实真机验收，只防止验收模板漏项。
`docs/architecture.md` 用于记录当前生产分层；`npm.cmd run architecture:check` 用于防止架构文档落后于代码和发布门禁。
`output/release-artifacts.json` 和 `output/release-artifacts.md` 用于记录 `dist` 全量产物 SHA-256；`npm.cmd run artifact:verify` 用于反向校验当前 `dist` 是否与清单一致，便于交付校验和回滚排查。
`output/release-evidence.json` 和 `output/release-evidence.md` 可作为发布评审附件；`npm.cmd run release:evidence:check` 用于校验证据包没有与发布步骤或产物清单漂移；其中外部证据项必须由真实生产环境补齐。

- `10am GO/NO_GO decision card refresh`: `npm.cmd run acceptance:decision` generates `output/10am-decision-card.html` for launch-status-based acceptance wording.

- `10am owner signoff sheet refresh`: `npm.cmd run acceptance:signoff` generates `output/10am-signoff-sheet.html` for Ops/Legal/QA owner confirmation and masked evidence references.

- `10am meeting minutes refresh`: `npm.cmd run acceptance:minutes` generates `output/10am-meeting-minutes.html` for acceptance decisions, action owners, and follow-up commands.

- `10am snapshot lock refresh`: `npm.cmd run acceptance:snapshot` generates `output/10am-snapshot-lock.html` with hashes for the exact acceptance material set.
