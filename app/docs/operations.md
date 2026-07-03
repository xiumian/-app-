# Pet Companion Operations Runbook

## Ops check

After deployment, configure real URLs and run:

```powershell
$env:PET_PROD_APP_URL='https://app.your-real-domain.cn'
$env:PET_PROD_API_BASE_URL='https://app.your-real-domain.cn/api'
$env:PET_OPS_MAX_LATENCY_MS='1500'
npm run ops:check
```

Self-test the checker locally:

```powershell
npm run ops:check:self-test
```

The ops check verifies:

- `index.html` is reachable and static security headers exist.
- `runtime-config.js` is production, disables mock fallback, points to the target API, and includes a real operator plus support/complaint channel.
- `runtime-config.js` is not long cached.
- `service-worker.js` remains updateable.
- `/health` and `/ready` are healthy.
- `/ready` proves storage is writable.
- Unauthorized `/app-state` returns 401 and preserves requestId.
- `/monitoring/events` accepts an ops probe event.

## Backup and restore drill

Before each production release, run:

```powershell
npm run backup:drill
```

The drill uses a temporary SQLite data directory, seeds an account plus app state plus a cloud backup, snapshots the SQLite main file and WAL/SHM side files, deletes the original database files, restores the snapshot, restarts the API, then verifies sign-in, app-state reads, and backup restore. It does not read production data. Production still needs scheduled platform backups, offsite retention, and a named restore owner.

## Alert rules

Reference: `deploy/alert-rules.example.json`.
Rollback reference: `docs/rollback.md`.

Minimum recommended alerts:

1. API ready fails continuously: critical.
2. runtime-config is not production, mock fallback is enabled, or operator/support contact is missing: critical.
3. Ops check latency exceeds SLO: warning.
4. Monitoring ingest fails continuously: warning.

## backup-restore-drill-failed

1. Re-run with `PET_BACKUP_DRILL_KEEP_TMP=1 npm run backup:drill` and inspect the kept temp directory.
2. Check whether SQLite side files (`.sqlite-wal`, `.sqlite-shm`) were copied with the main database file.
3. Verify the container or volume backup job captures a consistent SQLite snapshot.
4. Do not release until `npm run backup:drill`, `npm run server:test`, and `npm run ops:check:self-test` pass.

## api-not-ready

1. Check containers: `docker compose -f deploy/docker-compose.production.yml ps`.
2. Check API logs: `docker compose -f deploy/docker-compose.production.yml logs --tail=200 pet-api`.
3. Verify `/data` volume is writable.
4. Verify `PET_STORAGE_DRIVER`, `PET_SQLITE_FILE`, and media storage env vars.
5. After fixing, run `npm run ops:check` and `npm run smoke:production`.
6. If users are affected or `/ready` remains unhealthy, follow the rollback runbook in `docs/rollback.md`.

## frontend-runtime-config-invalid

1. Regenerate `dist/runtime-config.js`: `npm run runtime:production`.
2. Run `npm run deploy:check:production`.
3. Confirm Nginx serves `runtime-config.js` with `Cache-Control: no-store`.
4. Confirm App “我的 - 运营与客服” shows the real operator and support/complaint channel.
5. Republish static assets and run `npm run ops:check`.

## latency-slo-breach

1. Inspect API access logs for `durationMs`.
2. Check container CPU, memory, and disk IO.
3. Check server media directory disk IO and monitoring endpoint latency.
4. If only static assets are slow, check CDN/Nginx cache and TLS status.

## monitoring-ingest-failed

1. Verify `PET_MONITORING_ENDPOINT` is HTTPS and reachable.
2. Verify `/monitoring/events` returns 200.
3. Check gateway, CORS, and request body limits.
4. After recovery, run `npm run ops:check` to emit a probe event.

## support-diagnostics

当用户反馈白屏、数据异常、同步失败或图片上传失败时，先让用户在“我的”页导出“脱敏诊断包”。诊断包只包含版本、运行环境、存储状态、数据量计数、会话摘要、同意状态和监控摘要，不包含昵称、账号、宠物名、图片、动态、评论、token、password、cookie 或密钥。

排查步骤：

1. 检查 `app.version`、`app.releaseChannel`、`runtimeConfigSource` 是否与当前发布一致。
2. 检查 `storage.recovered`、`storage.migrated` 和 `storage.repairedFields` 判断是否发生本地恢复或迁移。
3. 检查 `session.authMode`、`session.signedIn`、`session.remoteCredentialPresent` 判断用户是否处于本地模式或远端模式。
4. 检查 `monitoring.captured`、`monitoring.failed`、`monitoring.lastErrorName` 与服务端监控事件是否对应。
5. 如果诊断包导出被阻止，说明安全扫描命中了敏感字段，需先修复 `src/domain/diagnostics.js` 的脱敏边界再发布。

## feedback-and-complaints

用户通过“反馈与投诉”提交问题时，不要要求用户填写密码、验证码、token、cookie、身份证号、私钥或生产密钥。App 会在保存投诉记录前拦截这些敏感内容，并在本地状态迁移时清理历史投诉说明里的敏感内容，避免它们进入本地状态、云同步或云备份。若用户确需证明账号归属，改用客服渠道完成身份核验，并只在工单系统中保存脱敏后的处理结论。

## pwa-update-stuck

当用户反馈“已发布新版本但页面仍是旧版本”时：

1. 让用户进入“我的”页点击“检查更新”，再点击“应用更新”。
2. 确认当前 `service-worker.js` 中的缓存名为最新 `pet-companion-*` 版本。
3. 检查 `runtime-config.js` 是否被错误长缓存；该文件必须是 `no-store`。
4. 检查浏览器 Cache Storage 中是否残留旧 `pet-companion-*` 缓存；新 Service Worker 激活后应自动清理旧缓存。
5. 如果“应用更新”没有刷新页面，检查 `SKIP_WAITING` 消息监听和 `controllerchange` 刷新逻辑。
6. 修复后重新执行 `npm run accessibility:check`、`npm run audit` 和真实浏览器手动验收。

## Minimum manual acceptance after release

- Open home, profile, checkin management, and growth capsule on real iPhone/Android devices.
- Register a remote account, upload one image, and verify the capsule image URL is reachable.
- Refresh the page and verify session, cloud sync, and backup entries still work.
- Simulate offline or weak network and verify the app does not white-screen.
- Verify “检查更新 / 应用更新” can activate a new PWA build and old caches are removed.
- Export a support diagnostics bundle and verify it contains only metadata/counts, not user content or credentials.
