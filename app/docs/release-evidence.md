# 宠伴记发布证据包

发布证据包用于把一次上线前检查变成可交接、可归档的证据文件，可作为发布评审和上线交接附件。它不读取真实生产密钥，也不会部署或发布。

## 生成命令

```powershell
npm run release:evidence
npm run release:evidence:check
```

生成文件：

```text
output/release-evidence.json
output/release-evidence.md
output/release-artifacts.json
output/release-artifacts.md
```

## 证据内容

- 应用版本、发布通道、构建目标。
- Git 分支和提交；如果不是 Git 工作区，会记录 `not-a-git-worktree`。
- `dist/index.html` 和 `dist/build-info.json` 是否存在。
- `dist` 全量产物文件数量、总字节数和产物清单 SHA-256。
- `release:check` 的真实命令、实际步骤和期望步骤是否一致。
- `release:check` 需要覆盖的本地门禁列表；`build` 内部还会执行 `audit` 和 `test`。
- `public:bundle:check` 是否纳入本地发布门禁，确保公网发布包不包含内部文档、脚本、后端代码或输出证据。
- `pwa:cache:check` 是否纳入本地发布门禁，确保 Service Worker 缓存版本和预缓存清单符合当前发布。
- `architecture:check` 是否纳入本地发布门禁，确保架构文档与当前代码分层一致。
- `deploy:target:check` 是否纳入本地发布门禁，确保服务器上传目标不会指向首页根目录或系统目录。
- `production:env:example:check` 和 `production:env:self-test` 是否纳入本地发布门禁，确保环境变量模板完整且真实生产 env 校验会拒绝占位值。
- `deploy:transfer:plan` 是否纳入本地发布门禁，确保只生成本地交付清单，不执行 SSH/SCP/rsync 或远端写入。
- `manual:acceptance:check` 是否纳入本地发布门禁，确保真机验收模板覆盖设备矩阵、核心流程、支持/投诉、脱敏截图和复验结论。
- `artifact:manifest` 是否纳入本地发布门禁，确保交付产物可校验。
- `artifact:verify` 是否纳入本地发布门禁，确保 `dist` 与产物清单一致。
- `external:evidence:check` 是否纳入本地发布门禁，避免外部证据模板和真实证据文件漂移。
- `external:evidence:collectors:self-test` 是否纳入本地发布门禁，确保 domain/TLS、生产 env、存储、监控备份、法务/真机验收采集器本身可用。
- 证据包自身的生成命令和顺序；在 `release:check` 中必须位于本地门禁之后。
- `release:evidence:self-test` 是否纳入发布门禁，先验证证据生成器会把占位、密钥痕迹、乱码、缺失 proof、无效时间等外部证据标记为 `invalid_external_evidence`。
- `release:evidence:check` 是否纳入发布门禁，确保证据包没有与 `package.json` 发布步骤或产物清单漂移。
- `launch:status` 是否可用，用于把本地证据和外部证据汇总成轻量 Go/No-Go 判定。
- CI workflow 和 `npm run ci:check` 状态。
- 外部证据来源、已验证数量和待补齐数量。
- 真实上线仍需外部提供证据的项目：域名/TLS、生产 env、持久化存储、对象存储、监控告警、平台备份、法务确认、真机验收。
- 每个外部证据项会带 `requiredProof` 必要证据列表，用于评审时判断是否能从 `pending/provided` 升级为 `verified`。
- `verified` 外部证据必须提供覆盖每条 `requiredProof` 的 `proofRefs`，防止空泛工单或占位链接误判为可上线。
- Release evidence marks placeholder owner/evidenceRef values, possible secrets, mojibake, missing requiredProof, or invalid checkedAt as `invalid_external_evidence`, so fake verified evidence cannot make the package look ready.

## 使用方式

建议通过完整本地门禁自动生成：

```powershell
npm run release:check
```

当前 `release:check` 已包含 `release:evidence` 和 `release:evidence:check`，因此正常发布前只需执行：

```powershell
npm run release:check
```

如果需要手动分步生成，必须先跑完本地门禁，再生成证据包：

```powershell
npm run architecture:check
npm run public:bundle:check
npm run pwa:cache:check
npm run deploy:target:check
npm run production:env:example:check
npm run production:env:self-test
npm run manual:acceptance:check
npm run external:evidence:check
npm run external:evidence:collectors:self-test
npm run secrets:check
npm run accessibility:check
npm run artifact:manifest
npm run artifact:verify
npm run deploy:transfer:plan
npm run release:evidence:self-test
npm run release:evidence
npm run release:evidence:check
```

如果 `release-evidence.json` 中任一外部证据仍是 `pending_external_evidence`，不能声明真实上线完成。

Before real release, run:

```powershell
npm run release:go
```

`release:go` runs `release:check` and then `launch:status -- --require-go`; it must fail until all external evidence is verified.
