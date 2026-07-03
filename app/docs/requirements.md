# 宠伴记 App 需求文档 v2.0

## 1. 产品定位

**宠伴记** 是一款暖色系宠物日记 + 宠物健康照护 App。

首版重点不是做复杂后台，而是让养宠用户可以：

- 建立宠物档案
- 做每日照护打卡
- 管理健康提醒
- 记录体重、喂食、洗澡、便便等日常事项
- 保存宠物相册和成长胶囊
- 进入轻社区“暖窝”交流附近约遛和养宠动态

## 2. 视觉方向

采用用户确认的 **V5 暖色系方向**。

### 2.1 风格关键词

- 奶油米色背景
- 咖啡棕主色
- 暖白圆角卡片
- 胶囊按钮
- 轻阴影
- 底部弹层手感
- 温暖、柔和、生活化
- 像宠物日记，不像后台表格

### 2.2 明确不要

- 不要顶部黑色胶囊/灵动岛装饰
- 不要冷色医疗后台感
- 不要大面积表格化信息
- 不要直接照搬参考图结构
- 不要过度幼稚卡通化

### 2.3 设计组件

- 宠物状态卡：展示主宠物、品种、年龄、今日状态
- 今日照护环：展示今日待完成数量和照护进度
- 打卡卡片：饮水、铲屎、晚餐、洗澡、梳毛等
- 暖色健康提醒卡：驱虫、吃药、就医、疫苗等
- 成长胶囊：第一次回家、第一次洗澡等里程碑
- 暖窝动态卡：轻社区、附近约遛、有用交流
- 暖色底部导航：档案、百科、附近、我的

## 3. 平台与技术方案

- 形式：H5/PWA
- 前端：原生 HTML + CSS + JavaScript
- 数据：浏览器 `localStorage`
- 运行：可直接打开 `index.html`，推荐用本地静态服务
- 配置：通过 `runtime-config.js` 在部署时配置 API、监控和发布通道
- 暂不接真实后端、真实账号、真实推送、真实支付

## 4. 首版功能范围

### 4.1 用户登录/注册

- 用户输入昵称和账号
- 本地创建或登录
- 登录状态持久化
- 支持退出登录

### 4.2 宠物档案

字段：

- 宠物名
- 头像/宠物标识
- 类型
- 品种
- 性别
- 生日
- 体重
- 头像色
- 备注

功能：

- 新增宠物
- 多宠物切换
- 删除宠物
- 主宠物优先展示

### 4.3 今日照护打卡

记录类型：

- 喂食
- 体重
- 洗澡
- 便便
- 其他

要求：

- 首页展示今日照护进度
- 支持快速新增护理记录
- 最近记录展示为暖色卡片流
- 体重记录进入趋势图

### 4.4 健康提醒

提醒类型：

- 疫苗
- 驱虫
- 体检
- 洗澡
- 自定义

功能：

- 新增提醒
- 标记完成
- 删除提醒
- 首页展示最近待办
- 已完成提醒不计入待办

### 4.5 宠物相册 / 成长胶囊

- 上传少量本地图片
- 添加照片标题
- 按当前宠物展示
- 用成长胶囊卡片呈现，不做冷冰冰图库

### 4.6 暖窝社区

- 发布宠物动态
- 关联宠物
- 点赞
- 评论
- 投诉/举报动态和评论
- 展示成长记录和附近交流感

### 4.7 本地管理页

- 查看用户数、宠物数、提醒数、记录数、动态数
- 一键填充演示数据
- 清空数据必须二次确认

### 4.8 数据统计

- 体重趋势图
- 记录类型分布
- 提醒完成状态
- 图表保持暖色系，不使用冷后台风

## 5. 验收标准

1. 无 JS 语法错误。
2. 中文无乱码。
3. 页面中不出现顶部黑色胶囊/灵动岛装饰。
4. 首页视觉为暖色宠物状态卡，而不是后台表格。
5. 登录、宠物档案、提醒、护理记录、相册、动态、评论、点赞可正常使用。
6. 刷新后本地数据保留。
7. 危险操作有确认弹窗。
8. 手机宽度下布局可用。

## 6. 当前执行目标

按本需求文档直接重构正式 H5/PWA 版本，并完成自动审查。

## 7. 上线级代码分层要求

正式 App 不再继续使用单个巨大脚本堆功能。前端代码按以下层级组织：

- `src/main.js`：应用入口、事件绑定、业务动作编排
- `src/api/client.js`：远端 API 客户端骨架、超时控制、统一错误、mock fallback
- `src/api/appStateClient.js`：云端状态同步、备份创建、备份列表和恢复接口客户端
- `src/api/authClient.js`：远端登录、刷新、退出接口骨架
- `src/api/localStore.js`：本地数据适配层，作为以后接真实后端的边界
- `src/api/monitoringClient.js`：监控上报客户端，未配置端点时保持本地安全模式
- `src/repositories/appStateRepository.js`：应用状态仓储层，隔离本地存储和未来远端 API
- `src/repositories/authRepository.js`：账号会话仓储层，隔离本地登录和未来真实登录
- `src/core/state.js`：本地状态、持久化、迁移和 UI 状态
- `src/core/policies.js`：当前用户所有权和访问控制策略
- `src/core/config.js`：App 版本号、构建目标、发布通道
- `src/core/migrations.js`：Schema 版本迁移、字段修复、迁移报告
- `src/core/monitoring.js`：运行时错误捕获、摘要和监控状态
- `src/core/selectors.js`：当前用户、当前宠物、今日打卡、提醒等选择器
- `src/core/utils.js`：日期、ID、HTML 转义、数值解析等纯工具
- `src/core/validation.js`：必填、长度、日期、数字、图片类型和本地容量校验
- `src/domain/users.js`：用户创建、登录资料更新
- `src/domain/backups.js`：备份格式、脱敏快照、备份校验和备份摘要
- `src/domain/sessions.js`：本地会话创建、迁移、清理和状态输出
- `src/domain/pets.js`：宠物档案对象创建和演示数据
- `src/domain/records.js`：护理记录、体重记录对象创建
- `src/domain/posts.js`：暖窝动态、评论、点赞领域逻辑
- `src/domain/checkins.js`：打卡预设、打卡对象创建和今日去重
- `src/domain/reminders.js`：健康提醒预设、提醒对象创建和待办去重
- `src/domain/capsules.js`：成长胶囊对象创建和最近胶囊查询
- `src/ui/views.js`：页面渲染和组件模板
- `src/ui/components.js`：统一空状态、运行时错误保护视图
- `src/ui/charts.js`：Canvas 图表绘制
- `src/ui/toast.js`：全局提示
- `scripts/audit.mjs`：自动审查脚本
- `scripts/test.mjs`：正式烟测脚本
- `scripts/e2e.mjs`：浏览器回归脚本，验证生产构建主要路径
- `scripts/e2e-remote.mjs`：远端浏览器联调脚本，验证远端注册、云同步和云备份闭环
- `scripts/deploy-check.mjs`：部署前检查脚本，验证 dist、PWA、运行时配置和安全响应头
- `scripts/public-bundle-check.mjs`：公网发布包边界检查脚本，防止内部文档、脚本和运维材料进入 `dist`
- `scripts/pwa-cache-check.mjs`：PWA 缓存清单和缓存版本检查脚本
- `scripts/architecture-check.mjs`：架构文档漂移检查脚本，确保 `docs/architecture.md` 与当前代码分层一致
- `scripts/write-runtime-config.mjs`：按环境变量生成生产 `dist/runtime-config.js`
- `scripts/server-test.mjs`：后端 API 合同烟测
- 发布门禁必须覆盖 SQLite 驱动读写回归和媒体存储 ready 探针。
- `scripts/release-plan-check.mjs`：发布/回滚计划检查脚本
- `scripts/secrets-check.mjs`：发布前密钥泄漏检查脚本
- `scripts/build.mjs`：生产构建脚本，输出 `dist`
- `server/`：本地 Node 后端 API 雏形
- `runtime-config.js`：运行时配置，部署后可调整 API/监控参数

约束：

1. 入口使用 ES Module。
2. UI 渲染和状态存储分离。
3. 业务动作不直接散落在模板内。
4. 新功能优先按模块归类，不回到单文件堆叠。
5. 所有用户输入进入状态层前必须做统一校验，错误用暖色 Toast 给出明确操作提示。
6. 渲染异常不能直接白屏，必须进入可重试的保护视图。
7. 无数据场景必须使用统一空状态组件，避免零散文案和临时样式。
8. 本地状态必须有版本号、迁移函数和损坏数据备份机制。
9. 发布前必须能生成 `dist` 构建产物和 `build-info.json`，构建过程必须内嵌 `audit`、`test` 和 `pwa:cache:check` 门禁，且构建信息必须记录 PWA 缓存名、预缓存内容哈希和 runtime-config 预缓存状态。
10. 状态层不得直接依赖具体存储实现，必须通过 repository 边界读写。
11. 真实后端未配置前不得误发外部请求，API 客户端必须支持本地 mock fallback。
12. 账号登录必须通过 auth repository 生成会话；真实 token 接入前不在 UI 中直接处理 token。
13. 宠物、提醒、记录、打卡、照片和动态访问必须经过 ownership policy，避免多用户本地数据串号。
14. 发布前必须通过 `npm run audit`、`npm run test`、`npm run build` 和 `npm run e2e`。
15. 运行时错误必须进入监控边界；未配置监控端点时不得产生外部请求。
16. 云端同步和备份必须有明确 API 合同；备份不得包含 access token、refresh token 和临时弹层状态；服务端必须按 `PET_BACKUP_RETENTION_MAX` 限制每个用户云备份数量，只保留最新 N 份。
17. 生产 API、监控和发布通道必须支持运行时配置，不能为了切换环境修改业务源码。
18. 部署前必须能自动检查 `dist` 完整性、PWA manifest、Service Worker、运行时配置和静态安全响应头。
19. 后端 API 合同必须至少有本地可运行雏形和自动烟测，覆盖账号、状态同步、备份和监控接收。
20. 生产 `runtime-config.js` 必须可由脚本生成；生产模式必须强制 HTTPS API、HTTPS 监控、`production` 通道、关闭 mock fallback、配置真实运营主体和至少一个客服/投诉渠道。
21. 服务端状态与备份写入必须拒绝跨用户宠物、提醒、记录、照片、打卡、动态和评论。
22. 服务端账号必须注册和登录分离；密码、access token、refresh token 不得明文落库，token 哈希匹配必须使用常量时间比较；登录失败不得签发会话；refresh token 必须有独立有效期并在刷新时轮换，旧 refresh token 立即失效。
23. 服务端认证接口、账号注销密码确认接口和前端监控事件接口必须有限流保护；超限返回 `RATE_LIMITED` 且带可被浏览器读取的 `Retry-After` 响应头；限流默认不得信任客户端传入的 `X-Forwarded-For`，只有在可信反向代理后显式启用 `PET_TRUST_PROXY=true`；生产多实例需替换为共享限流。
24. 前端在配置 `API_BASE_URL` 后必须提供远端注册/登录入口；未配置 API 时保留本地体验模式且不得误发账号请求。
25. 远端账号登录后必须提供手动上传云端、拉取云端和创建云备份入口；同步请求体和备份不得包含 access token、refresh token 或临时弹层状态；云备份创建后必须执行服务端保留上限。
26. 远端同步/备份请求遇到 access token 过期时，前端必须使用 refresh token 刷新会话并重试一次；刷新成功后必须保存服务端返回的新 refresh token 和 refreshExpiresAt。
27. 发布门禁必须包含真实浏览器远端联调，验证远端注册、上传云端、创建云备份和后端脱敏落库。
28. 服务端正式部署前必须执行生产环境变量门禁，拒绝通配 CORS、本地默认数据目录、loopback 监听地址、过宽认证限流、不合理 refresh token 有效期和不合理的 HTTP 超时；Node 服务必须显式设置 HTTP request/header/keep-alive 超时。
29. 服务端生产入口必须处理 `SIGTERM` 和 `SIGINT`，执行优雅关闭，避免滚动发布或容器缩容时直接硬断请求。
30. 服务端在 `NODE_ENV=production` 启动时必须执行生产配置 fail-fast 校验，不允许绕过生产环境变量门禁直接启动。
31. 服务端本地 JSON 存储必须使用原子写入和上一版本备份，主数据文件损坏时应能从 `.bak` 恢复，降低单实例雏形的数据损坏风险。
32. 服务端 API 必须支持 `X-Request-ID` 请求追踪，所有响应返回同名响应头，错误响应体 requestId 与响应头一致，并输出可关闭的结构化访问日志；有正文的 JSON 接口必须拒绝非 JSON Content-Type 并返回 `UNSUPPORTED_MEDIA_TYPE`；JSON API 响应必须默认 `Cache-Control: no-store`，并返回 `X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy`、`Cross-Origin-Opener-Policy`；生产配置必须拒绝不合理的 HTTP 超时。
33. 发布流程必须提供部署后生产冒烟检查，验证线上前端 runtime-config、build-info、PWA 缓存证据、API health/ready、未授权保护和 `X-Request-ID` 追踪链路。
34. 发布门禁必须包含 SQLite 备份恢复演练，覆盖创建数据、生成快照、删除原库、恢复快照、重新登录、读取状态和恢复云备份。
35. 发布流程必须提供发布 Runbook、回滚 Runbook 和自动计划检查，覆盖 Go/No-Go、上线后验证、回滚触发条件、持久化数据保护和恢复责任人。
36. 发布门禁必须包含密钥泄漏检查，拒绝仓库工作区内出现真实生产 env、TLS 证书目录、私钥块、证书块、AWS key 模式或疑似非占位密钥赋值。
37. 远端账号必须提供账号数据导出和账号注销接口；导出不得包含密码哈希或 token，注销必须删除当前用户、会话、云端状态和云备份，并立即使旧 token 失效；CORS 预检必须允许 DELETE。
38. 需要登录的写入和上传接口必须先完成 token 校验，再解析 JSON body；未登录坏 JSON 请求应返回 `UNAUTHORIZED` 而不是进入 body 解析错误路径。
38. 用户在本地登录、远端注册、远端登录或体验演示数据前，必须先同意《用户协议》和《隐私政策》；同意记录必须包含版本、时间和来源，并可在“我的”页查看。
39. 上线后必须提供不含用户内容、不含 token、不含密码、不含 cookie 的脱敏诊断包导出能力，用于客服和运维排查前端版本、运行环境、存储状态、监控状态和数据规模。
40. 上线后必须提供“反馈与投诉”入口；暖窝动态和评论必须可被投诉，投诉记录至少包含提交人、对象类型、对象 ID、问题类型、补充说明、状态和提交时间，并纳入本地/云端状态边界。
40.1 投诉补充说明必须在保存前拦截 password、token、cookie、验证码、私钥、身份证等敏感信息；历史本地数据迁移时也必须清理旧投诉说明中的敏感内容，避免用户误把凭证写入本地数据、云同步或备份。
41. App 内必须展示运营主体和客服/投诉联系方式；生产门禁必须拒绝缺失 `PET_OPERATOR_NAME` 且 `PET_SUPPORT_CONTACT_URL` / `PET_SUPPORT_EMAIL` 均未配置的运行时配置。

## 8. 打卡管理底部弹层

首页必须提供“管理今日打卡”底部弹层：

- 从首页照护进度卡进入。
- 展示今日完成率、总项目、已完成和待打卡数量。
- 展示当前宠物今天的打卡项。
- 支持单项标记完成或恢复待办。
- 支持批量全部完成和全部待办。
- 支持删除打卡项。
- 支持快速加入预设项：饮水、喂食、铲屎、晚餐、洗澡、梳毛。
- 支持创建自定义打卡项：标题、图标、时间。
- 同一宠物同一天不重复添加同名打卡项。
- 点击首页打卡卡片可切换完成状态。
- 弹层采用 V5 暖色底部弹层视觉，不出现顶部黑色胶囊装饰。

## 9. 健康提醒管理底部弹层

正式 App 需要提供健康提醒管理底部弹层：

- 从首页健康提醒区进入。
- 从记录/提醒页进入。
- 展示当前宠物的待处理提醒。
- 展示最近完成提醒。
- 支持快速添加预设提醒：吃药、就医、驱虫、疫苗、洗澡。
- 支持创建自定义提醒：标题、类型、图标、日期、备注。
- 支持删除提醒。
- 采用 V5 暖色底部弹层视觉。

## 10. 宠物档案详情与成长胶囊

正式 App 需要提供宠物档案详情入口：

- 首页主宠物卡可进入详情。
- 宠物列表每个宠物可进入详情。
- 详情以 V5 暖色底部弹层呈现。
- 展示宠物基本信息、体重、今日打卡进度、待处理提醒数量。
- 展示近期提醒。
- 展示最近护理记录。
- 展示最近成长胶囊。

成长胶囊需要作为独立领域逻辑维护：

- 创建胶囊对象。
- 按宠物筛选胶囊。
- 为详情页提供最近胶囊数据。

## 容器化部署基线

- API 服务端必须提供可审查的 `Dockerfile` 和 `.dockerignore`。
- 容器必须以 `NODE_ENV=production` 启动，并复用生产环境变量 fail-fast 门禁。
- 容器必须使用非 root 用户运行服务进程。
- 容器必须声明持久化数据卷 `/data`，并将 `PET_SERVER_DATA_DIR` 指向该目录。
- 容器必须暴露 API 端口 `8787`，监听地址为 `0.0.0.0`。
- 容器必须配置 `HEALTHCHECK`，检查 `/health`。
- 发布门禁必须包含 `npm run container:check`，防止 `.dockerignore`、数据卷、健康检查或运行用户被误改。

## 生产存储门禁

- 本地开发可以继续使用 JSON 文件存储。
- 生产环境必须使用 `PET_STORAGE_DRIVER=sqlite`。
- 生产环境必须显式配置绝对路径 `PET_SQLITE_FILE`，不能落在 `server-data` 默认目录。
- `/ready` 必须验证当前数据存储驱动可写，并纳入媒体存储 ready 探针。
- 发布门禁必须覆盖 SQLite 驱动读写回归和媒体存储 ready 探针。

## 生产媒体存储门禁

- 本地体验可以继续使用 Data URL 或本地媒体目录。
- 配置远端 API 且用户远端登录后，成长胶囊图片必须优先上传到 `/media/uploads`。
- 自有服务器生产环境默认使用 `PET_MEDIA_STORAGE_DRIVER=local`。
- 生产环境必须显式配置绝对路径 `PET_MEDIA_LOCAL_DIR`，并将该目录挂载到服务器持久化数据卷。
- 如后续升级 S3，才需要显式配置 `PET_MEDIA_PUBLIC_BASE_URL`、`PET_MEDIA_S3_ENDPOINT`、`PET_MEDIA_S3_REGION`、`PET_MEDIA_S3_BUCKET`、`PET_MEDIA_S3_ACCESS_KEY_ID`、`PET_MEDIA_S3_SECRET_ACCESS_KEY`。
- `/ready` 必须通过 `checks.media` 报告媒体存储检查结果；local 模式必须验证目录可写，S3 模式至少验证公开访问地址、S3 endpoint、region、bucket 和访问密钥配置完整。
- 同步体和备份不得继续保存大体积图片 Data URL。
- 发布门禁必须覆盖未登录上传失败、已登录上传成功、本地媒体读取回归、当前用户媒体删除、跨用户媒体删除拦截、账号注销媒体清理和媒体 ready 配置探针。

## 备份恢复演练门禁

- 发布门禁必须包含 `npm run backup:drill`。
- 演练必须使用隔离临时目录，不能读取或覆盖真实生产数据。
- 演练必须覆盖 SQLite 主文件及 WAL/SHM 快照恢复。
- 恢复后必须重新启动 API，验证账号登录、状态读取和云备份恢复。
- 真实上线还必须配置平台级定时备份、异地保存、保留周期和恢复责任人。

## 发布与回滚计划门禁

- 必须提供 `docs/release-runbook.md`，记录 Go/No-Go、发布命令、生产 runtime 检查、生产环境检查、上线后烟测和人工验收。
- 必须提供 `docs/rollback.md`，记录回滚触发条件、禁止操作、版本回滚、静态资源回滚、runtime-config 回滚、备份恢复升级和回滚后验证。
- 发布门禁必须包含 `npm run release:plan:check`。
- 回滚流程不得删除 `pet_companion_data` 或 `/data`，不得在未确认备份前覆盖 SQLite 数据。
- 回滚后必须重新执行 `npm run smoke:production` 和 `npm run ops:check`。

## 架构文档漂移门禁

- 必须提供 `docs/architecture.md`，记录当前前端、后端、发布和运维分层。
- 发布门禁必须包含 `npm run architecture:check`。
- `npm run architecture:check` 必须扫描 `src/` 和 `server/` 的相对 import，阻止 UI 直连 API/Repository、Domain 反向依赖 UI/API/Repository、服务端导入前端 UI 等分层漂移。
- 架构文档不得继续声称后端只是未接入的雏形，或遗漏账号生命周期、媒体上传、PWA 更新、远端同步、SQLite、S3、发布证据包等当前能力。
- 架构变更时必须同步代码、文档和自动审查，避免后续开发误按旧结构继续堆功能。

## 公网发布包边界门禁

- 发布门禁必须包含 `npm run public:bundle:check`。
- `dist` 必须只包含 App 运行资源、静态安全头、构建信息、图标、前端源码模块和用户可见法务文本。
- `dist` 不得包含 `README.md`、内部需求文档、API 合同、架构说明、部署 Runbook、回滚 Runbook、真机验收清单、安全说明、CI 说明、后端代码、脚本、部署模板或输出证据目录。
- `dist/docs/` 只允许包含 `privacy.md` 和 `terms.md`。
- 所有公开文本文件不得引用 `deploy/production.env`、`deploy/target.json`、`output/production-evidence.json`、`output/release-evidence.json`、内部 Runbook、服务端入口、脚本入口或私钥块。
- 构建前必须清理旧 `dist`，避免上一次构建遗留内部文档继续被发布。

## 发布证据包门禁

- 发布门禁必须包含 `npm run release:evidence`。
- 发布门禁必须包含 `npm run external:evidence:check`。
- 发布门禁必须包含 `npm run artifact:manifest`。
- 发布门禁必须包含 `npm run artifact:verify`。
- 发布门禁必须包含 `npm run release:evidence:check`。
- 必须提供不含密钥的 `deploy/production-evidence.example.json`。
- 真实外部证据应写入 `output/production-evidence.json`，不得提交生产密码、token、cookie、私钥、证书内容或对象存储密钥。
- 发布证据包必须输出 `output/release-evidence.json` 和 `output/release-evidence.md`。
- 发布产物清单必须输出 `output/release-artifacts.json` 和 `output/release-artifacts.md`，记录 `dist` 全量文件 SHA-256。
- 发布证据包必须记录 Service Worker 缓存名、预缓存内容哈希和 runtime-config 是否被预缓存，便于上线后排查旧缓存。
- 发布产物校验必须能发现 `dist` 文件缺失、额外文件或 SHA-256 不一致。
- 证据包必须记录应用版本、发布通道、构建目标、Git 信息、dist/build-info 状态、产物清单状态、本地门禁列表、CI workflow 和外部上线证据项。
- 外部上线证据缺失时必须明确标记为 `pending_external_evidence`，不得伪造成已完成。
- 证据包不得读取或输出真实生产密钥、token、cookie、私钥或证书。

## 密钥泄漏门禁

- 必须提供 `docs/security.md`。
- 发布门禁必须包含 `npm run secrets:check`。
- 仓库工作区不得存在 `deploy/production.env` 或 `deploy/certs/`。
- 仓库工作区不得包含私钥块、证书块、真实 access key、真实 token、真实 cookie 或真实 password。
- `runtime-config.js` 只能保存公开运行时配置，不得保存 token、cookie、password、private key 或 access key。

## 账号数据生命周期门禁

- 服务端必须提供 `GET /account/export`。
- 服务端必须提供 `DELETE /account`。
- 账号数据导出必须只包含当前登录用户的数据，且不得包含 `passwordHash`、access token、refresh token、cookie 或 token 哈希。
- 账号注销必须要求当前密码确认，且错误密码尝试必须进入服务端限流。
- 账号注销成功后必须删除当前用户、当前用户全部会话、当前用户云端状态、当前用户云备份和可识别的当前用户媒体文件。
- 账号注销成功后旧 access token 必须立即失效，且不得影响其他用户数据。

## 可访问性与离线可用门禁

- 发布门禁必须包含 `npm run accessibility:check`。
- 首页必须提供跳过导航入口，并让主内容区可被键盘聚焦。
- 全局必须保留可见焦点样式，主要操作按钮触控高度不得低于 44px。
- 底部导航必须具备可读标签，当前页状态必须对辅助技术可见。
- 打卡管理、健康提醒等底部弹层必须使用 dialog 语义，并为自定义输入提供标签。
- Service Worker 必须提供离线导航回退，断网刷新已缓存页面不得直接白屏。
- `runtime-config.js` 不得被预缓存，避免生产 API/监控配置被旧缓存锁死。

## PWA 更新生命周期门禁

- Service Worker 缓存版本每次静态资源发布必须递增。
- Service Worker 缓存名必须包含当前 `APP_VERSION` 和预缓存资源内容哈希，并由 `npm run pwa:cache:check` 自动验证；发布前可用 `npm run pwa:cache:update` 自动刷新缓存名。
- 新 Service Worker 激活时必须清理同前缀旧缓存，避免用户长期命中旧 JS/CSS。
- “我的”页必须提供“检查更新”和“应用更新”入口，且不得自动打断用户正在填写的表单。
- 应用更新必须通过受控的 `SKIP_WAITING` 消息触发，激活后再刷新页面。
- `runtime-config.js` 仍不得进入预缓存；旧缓存清理不得删除非本应用缓存。
- 发布门禁必须通过 `npm run audit`、`npm run test`、`npm run pwa:cache:check` 和 `npm run accessibility:check` 验证更新闭环。

## 用户协议与隐私政策同意门禁

- 必须提供 `docs/terms.md` 和 `docs/privacy.md`。
- 登录、注册和演示数据入口必须展示协议勾选项。
- 未同意前不得创建本地用户、远端账号、远端会话或演示数据。
- 同意记录必须写入状态层，包含版本、同意时间和来源。
- “我的”页必须展示当前同意状态，并提供查看条款入口。
- 发布门禁必须通过 `npm run audit` 和 `npm run test` 验证协议同意闭环。

## 支持诊断包门禁

- “我的”页必须提供“导出脱敏诊断包”入口。
- 诊断包只能包含版本、运行环境、存储状态、监控摘要、会话摘要、同意状态和各数据表计数。
- 诊断包不得包含昵称、账号、宠物名、图片、动态、评论、access token、refresh token、password、cookie、Authorization 或密钥。
- 导出前必须执行敏感字段扫描；命中敏感字段时必须阻止导出并进入监控边界。
- 发布门禁必须通过 `npm run audit` 和 `npm run test` 验证诊断包脱敏规则。

## 生产部署编排门禁

- 必须提供 Docker Compose 生产编排模板。
- 必须提供 Nginx HTTPS 静态托管和 API 反向代理模板。
- 必须提供不含真实密钥的 `production.env.example`。
- 必须提供不含真实服务器地址的 `deploy/target.example.json`，用于约束自有服务器上传目录。
- 发布门禁必须包含 `npm run deploy:target:check`，拒绝把产物目标指向服务器首页根目录、系统目录或与持久化数据混用。
- 发布门禁必须包含 `npm run deploy:bundle:check`。
- 部署编排必须验证 HTTPS、静态安全头、API 反代、健康检查和只读 `dist` 挂载。

## 真机验收模板门禁

- 必须提供 `docs/manual-device-acceptance.md`，覆盖 iPhone/Android 多尺寸设备矩阵。
- 必验流程必须包含首次打开、注册/登录、宠物档案、打卡管理、健康提醒、图片上传、云同步、云备份、离线体验、PWA 更新、账号导出、账号注销、法务入口、可访问性和支持/投诉入口。
- 验收记录必须要求脱敏截图或工单链接，不得包含 token、cookie、password、私钥、生产密钥或完整个人敏感信息。
- 发布门禁必须包含 `npm run manual:acceptance:check`，防止真机验收模板漏项。

## Operations monitoring gate

- Production releases must provide an executable ops check script.
- The ops check must verify frontend availability, API health, API readiness, request-id propagation, monitoring ingest, static security headers, and latency SLO.
- Production releases must provide an alert rules example.
- Production releases must provide an operations Runbook.
- Release gates must include `npm run ops:check:self-test`.

