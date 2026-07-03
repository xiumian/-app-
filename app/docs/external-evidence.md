# 宠伴记外部上线证据

外部上线证据用于记录仓库外才能确认的真实生产事项。它不能放真实密码、token、cookie、私钥、证书内容或对象存储密钥。

## 模板

仓库提供不含密钥的模板：

```text
deploy/production-evidence.example.json
```

真实证据文件建议放在本地输出目录，避免误提交：

```text
output/production-evidence.json
```

可用初始化命令从模板生成本地真实证据文件：

```powershell
npm run external:evidence:init
```

该命令默认不会覆盖已有的 `output/production-evidence.json`；如必须重新初始化，使用：

```powershell
npm run external:evidence:init -- --force
```

使用 `--force` 时，脚本会先把旧证据文件自动复制到 `output/evidence-backups/production-evidence.<timestamp>.json`，再写入新的 pending 模板，避免误删已收集的上线证据。

## 更新单项证据

不建议手工编辑 JSON。用更新脚本推进某一项状态，脚本会校验占位内容和疑似密钥，并在真实写入前自动备份旧文件：

```powershell
npm run external:evidence:update -- --id domainTls --status provided --owner ops-wang --evidence-ref "ops-ticket-domain-tls" --proof-ref "ops-ticket-domain-tls#https-endpoint" --dry-run
npm run external:evidence:update -- --id domainTls --status verified --owner ops-wang --evidence-ref "ops-ticket-domain-tls" --proof-ref "ops-ticket-domain-tls#https-endpoint" --proof-ref "ops-ticket-domain-tls#tls-expiry" --proof-ref "ops-ticket-domain-tls#gateway-route"
```

规则：

- `provided` / `verified` 必须填写非占位的 `owner` 和 `evidenceRef`。
- `provided` / `verified` 必须至少填写一个 `--proof-ref`，只放脱敏工单编号、截图路径、验收文档锚点或记录编号。
- `verified` 的 `proofRefs` 数量必须覆盖该项 `requiredProof` 列表，避免只写一句“已完成”就通过上线判断。
- `verified` 会自动写入当前 `checkedAt`，也可以用 `--checked-at` 指定可解析时间；该时间不得是未来时间，也不得早于 90 天前。
- `evidenceRef` 只放工单号、脱敏截图路径、验收文档链接或记录编号，不放 password、token、cookie、private key、证书正文或对象存储密钥。
- 每次真实写入都会先备份到 `output/evidence-backups/production-evidence.<timestamp>.json`。


## 采集 domainTls 证据摘要

`domainTls` 是上线前最前置的外部阻断项。拿到正式入口后，先用采集脚本生成脱敏证据摘要：

```powershell
npm.cmd run external:evidence:domain-tls -- --url "https://<production-app-url>" --api-health-url "https://<production-app-url>/api/health" --gateway-ref "<gateway-or-nginx-ticket>" --owner "<owner-id>"
```

输出：

- `output/domain-tls-evidence-latest.json`
- `output/domain-tls-evidence-latest.md`
- `output/domain-tls-evidence-<timestamp>.json`
- `output/domain-tls-evidence-<timestamp>.md`

脚本会检查 HTTPS 入口、TLS 握手、证书颁发者、证书到期时间、SHA-256 指纹、可选 API 健康检查和网关/反代证据引用，并输出建议的 `external:evidence:update` 命令。

注意：

- 该脚本只读取公网 HTTPS 响应和 TLS 证书摘要，不读取 `deploy/production.env`。
- `--url` 和 `--api-health-url` 必须是 `https://`，不能是 localhost 或内网地址。
- `--gateway-ref` 只填脱敏工单号、网关配置审查记录或截图引用，不放证书正文、私钥、token、cookie 或真实密钥。
- 如果没有 `--gateway-ref` 或 API 健康检查未通过，只能作为 `provided` 候选，不应标记为 `verified`。

## 采集 productionEnv 证据摘要

`productionEnv` 用于证明正式部署主机已经准备好 `deploy/production.env`，并且该文件没有进入仓库。采集脚本只输出键名覆盖、文件元数据和脱敏审查引用，不输出任何 env 值：

```powershell
npm.cmd run external:evidence:production-env -- --file deploy/production.env --review-ref "<masked-env-review-ticket>" --owner "<owner-id>"
```

输出：

- `output/production-env-evidence-latest.json`
- `output/production-env-evidence-latest.md`
- `output/production-env-evidence-<timestamp>.json`
- `output/production-env-evidence-<timestamp>.md`

脚本会检查文件存在性、大小、修改时间、权限 mode、必需键是否齐全、占位符是否清除、`PET_AUTH_SECRET` 是否已设置、是否包含私钥块，以及当前目录能看到的 git 状态。输出文件只记录 `present/missing/placeholderKeys/secretKeysSet` 等摘要，不记录真实配置值。

注意：

- 不要把 `deploy/production.env` 内容粘贴到聊天、工单公开区或仓库。
- `--review-ref` 只填脱敏配置审查截图、工单号或审批记录，不放密码、token、cookie、private key 或完整 env 内容。
- 如果当前目录不是 git 仓库，脚本会记录 `not_git_worktree`，上线负责人仍需在真实部署仓库确认 `deploy/production.env` 未被提交。

## 采集 persistentStorage / objectStorage 证据摘要

`persistentStorage` 和 `objectStorage` 分别用于证明正式数据文件、SQLite 数据卷、媒体图片目录和重启后访问链路已经准备好。采集脚本只记录文件/目录元数据和脱敏证据引用，不读取数据库行内容或媒体文件内容：

```powershell
npm.cmd run external:evidence:storage -- --data-dir /data --sqlite-file /data/pet-companion.sqlite --media-dir /data/media --storage-ref "<volume-or-db-ticket>" --restart-ref "<restart-retention-ticket>" --restore-owner-ref "<restore-owner-ticket>" --media-mount-ref "<media-volume-ticket>" --media-upload-ref "<upload-read-ticket>" --media-restart-ref "<media-restart-ticket>" --owner "<owner-id>"
```

输出：

- `output/storage-evidence-latest.json`
- `output/storage-evidence-latest.md`
- `output/storage-evidence-<timestamp>.json`
- `output/storage-evidence-<timestamp>.md`

脚本会检查数据目录、SQLite 主文件、SQLite WAL/SHM 旁路文件、媒体目录、媒体目录样本文件名数量，以及持久化卷、重启保留、恢复责任人、媒体挂载、上传读取和重启后图片访问的脱敏证据引用。

注意：

- 不读取 SQLite 表数据，不读取媒体文件内容。
- `--storage-ref`、`--restart-ref`、`--restore-owner-ref`、`--media-mount-ref`、`--media-upload-ref`、`--media-restart-ref` 只填工单、截图路径或验收记录编号。
- 不要填 password、token、cookie、private key、对象存储密钥或完整个人敏感信息。

## 采集 monitoringAlerts / platformBackups 证据摘要

`monitoringAlerts` 和 `platformBackups` 分别用于证明正式监控告警和平台级备份恢复已经启用。采集脚本只读取本仓库的告警规则模板和运维手册，并登记脱敏证据引用；它不访问真实监控平台、备份平台或密钥系统：

```powershell
npm.cmd run external:evidence:ops -- --monitoring-url "https://<monitoring-dashboard-or-endpoint>" --alert-ref "<alert-rule-ticket>" --recipient-ref "<oncall-recipient-ticket>" --backup-job-ref "<backup-job-ticket>" --retention-ref "<retention-offsite-ticket>" --restore-drill-ref "<restore-drill-ticket>" --restore-owner-ref "<restore-owner-ticket>" --owner "<owner-id>"
```

输出：

- `output/ops-evidence-latest.json`
- `output/ops-evidence-latest.md`
- `output/ops-evidence-<timestamp>.json`
- `output/ops-evidence-<timestamp>.md`

脚本会检查 `deploy/alert-rules.example.json` 是否可解析、是否包含 API ready 和 monitoring ingest 等关键告警、告警是否链接 `docs/operations.md` runbook，以及运维手册是否记录 `ops:check`、`backup:drill`、异地保留和恢复责任人要求。

注意：

- `--monitoring-url` 必须是 HTTPS，且不能继续使用示例域名。
- `--alert-ref`、`--recipient-ref`、`--backup-job-ref`、`--retention-ref`、`--restore-drill-ref`、`--restore-owner-ref` 只填脱敏工单、截图路径或验收记录编号。
- 不要填监控平台 token、备份平台密钥、cookie、private key 或真实生产密钥。

## 采集 legalApproval / manualDeviceAcceptance 证据摘要

`legalApproval` 和 `manualDeviceAcceptance` 分别用于证明真实运营主体、客服渠道、政策版本、地区法务意见和 iPhone/Android 真机验收已经完成。采集脚本只读取本仓库的政策文档和真机验收记录表，并登记脱敏证据引用：

```powershell
npm.cmd run external:evidence:release-approval -- --operator-ref "<operator-ticket>" --support-ref "<support-channel-ticket>" --policy-version-ref "<policy-version-ticket>" --legal-review-ref "<regional-legal-review-ticket>" --device-matrix-ref "<device-matrix-ticket>" --core-flow-ref "<core-flow-screenshots-ticket>" --offline-pwa-delete-ref "<offline-pwa-delete-ticket>" --retest-conclusion-ref "<final-retest-ticket>" --owner "<owner-id>"
```

输出：

- `output/release-approval-evidence-latest.json`
- `output/release-approval-evidence-latest.md`
- `output/release-approval-evidence-<timestamp>.json`
- `output/release-approval-evidence-<timestamp>.md`

脚本会检查 `docs/privacy.md`、`docs/terms.md`、`docs/manual-device-acceptance.md` 和 `output/manual-device-acceptance-record.json` 的覆盖情况，并输出 `legalApproval` / `manualDeviceAcceptance` 的建议登记命令。

注意：

- 真机验收记录先通过 `npm.cmd run manual:acceptance:record` 生成，再由 QA 填入脱敏截图路径、工单号或验收文档链接。
- `--operator-ref`、`--support-ref`、`--policy-version-ref`、`--legal-review-ref`、`--device-matrix-ref`、`--core-flow-ref`、`--offline-pwa-delete-ref`、`--retest-conclusion-ref` 只填脱敏引用。
- 不要填写真实个人敏感信息、密码、token、cookie、private key、生产密钥或未脱敏截图。

真机验收项 `manualDeviceAcceptance` 建议使用 `docs/manual-device-acceptance.md` 作为记录模板，验收完成后把脱敏截图、设备矩阵和复验结论的工单或文档链接填入 `evidenceRef`。

## 状态汇总

上线前可快速查看外部证据完成度和 Go/No-Go 阻断项：

```powershell
npm run external:evidence:status
```

如果要在发布窗口强制要求全部外部项已验证，可执行：

```powershell
npm run external:evidence:status -- --require-verified
```

如果你希望先把「未完成项」按优先级逐条看清并拿到可执行指令，可先跑：

```powershell
npm run external:evidence:next -- --commands
```

脚本会输出每一条待处理项、缺口、以及建议的 `external:evidence:update` 命令骨架，适合在发布窗口前批量推进。

如果只想看某一类负责人要补的内容，可按 Ops / Legal / QA 分组过滤：

```powershell
npm run external:evidence:next -- --owner ops --commands
npm run external:evidence:next -- --owner legal --commands
npm run external:evidence:next -- --owner qa --commands
```

10 点现场也可以直接使用更短的负责人脚本：

```powershell
npm.cmd run external:evidence:next:ops
npm.cmd run external:evidence:next:legal
npm.cmd run external:evidence:next:qa
```

如果要给 10 点验收或发布负责人分派证据补齐任务，可生成负责人填报表：

```powershell
npm.cmd run external:evidence:worksheet
```

输出：

- `output/external-evidence-worksheet.md`
- `output/external-evidence-worksheet.json`

填报表会按优先级列出 8 个外部项、建议负责人、requiredProof、proofRef 填写位和 `provided` / `verified` 命令骨架。

如果发布窗口需要一个总入口，把 8 个阻断项、当前登记状态、各采集脚本最新输出、readyForProvided / readyForVerified 和下一步命令汇总到同一页，可生成外部证据指挥台：

```powershell
npm.cmd run external:evidence:cockpit
```

输出：

- `output/external-evidence-cockpit.html`
- `output/external-evidence-cockpit.md`
- `output/external-evidence-cockpit.json`

指挥台只汇总脱敏证据引用和本地输出路径；不包含真实密码、token、cookie、私钥、TLS 证书正文或生产密钥，也不会部署、上传或修改服务器首页。

如果要把外部证据缺口直接分派给运维、法务和 QA，可生成可转发的脱敏请求包：

```powershell
npm.cmd run external:evidence:request-pack
```

输出：

- `output/external-evidence-request-pack.html`
- `output/external-evidence-request-pack.md`
- `output/external-evidence-request-pack.json`
- `output/external-evidence-request-ops.html`
- `output/external-evidence-request-ops.md`
- `output/external-evidence-request-ops.json`
- `output/external-evidence-request-legal.html`
- `output/external-evidence-request-legal.md`
- `output/external-evidence-request-legal.json`
- `output/external-evidence-request-qa.html`
- `output/external-evidence-request-qa.md`
- `output/external-evidence-request-qa.json`

请求包会按 Ops / Legal / QA 分组列出每项需要返回的 proofRef、采集命令和登记命令。它只要求对方返回脱敏工单号、截图路径、仪表盘链接或验收记录编号；不要放密码、token、cookie、私钥、TLS PEM、生产 env 值或对象存储密钥。

Each owner file also includes a 10am owner handoff message, the matching shortcut command, and an owner return checklist so the release owner can forward it directly without exposing secrets.

如果要给 CI、工单机器人或发布看板读取，使用纯 JSON 输出：

```powershell
npm run external:evidence:status -- --json
```

注意：如果要把 JSON 直接接给脚本解析，请使用 `npm --silent` 或直接执行 Node，避免 npm 命令头混入输出：

```powershell
npm --silent run external:evidence:status -- --json
node ./scripts/external-evidence-status.mjs --json
```

该命令只读取 `output/production-evidence.json` 或模板文件，不读取真实密钥，不部署、不发布。

## 校验

```powershell
npm run external:evidence:check
npm run external:evidence:collectors:self-test
```

校验内容：

- 必须包含全部外部证据项。
- 每项 `status` 必须是 `pending`、`provided` 或 `verified`。
- 每项必须带 `requiredProof`，列出该项达到 `verified` 至少需要保留的证据类型。
- 真实证据文件中，`provided` / `verified` 项不得继续使用 `example.com`、`ops-owner`、`legal-owner`、`qa-owner`、`TODO`、`待定` 等占位内容。
- 真实证据文件中，`provided` / `verified` 项必须带 `proofRefs`，且不得使用占位或疑似密钥内容。
- `verified` 项必须填写 `owner` 和 `checkedAt`。
- `verified` 项的 `proofRefs` 数量必须大于等于 `requiredProof` 数量。
- `verified` 项的 `checkedAt` 必须是可解析日期时间。
- `verified` 项的 `checkedAt` 不得是未来时间，避免还未验收的事项被提前标为通过。
- `verified` 项的 `checkedAt` 不得早于 90 天前，避免过期的 HTTPS、备份、监控或真机验收记录继续支撑上线判断。
- 不得出现疑似 password、secret、token、cookie、private key、access key、证书块或私钥块。
- `external:evidence:collectors:self-test` 会离线检查 domain/TLS、生产 env、存储、监控备份、法务/真机验收采集器的参数校验、脱敏输出和登记命令生成，不访问真实服务器。

## 与发布证据包的关系

`npm run release:evidence` 会读取可选的 `output/production-evidence.json`：

- 文件不存在：发布证据包里的外部项保持 `pending_external_evidence`。
- 文件存在：发布证据包会合并每项状态、负责人、证据引用和检查时间。
- 全部外部项为 `verified`：发布证据包结论会变为 `local_release_gates_ready_external_evidence_verified`。

真实上线前，发布负责人必须把外部证据从 `pending` 推进到 `verified`，并保留可审计的证据引用。
