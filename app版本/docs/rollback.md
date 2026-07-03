# Pet Companion Rollback Runbook

This runbook is for reverting a failed production release. It avoids destructive actions by default.

## Rollback triggers

Start rollback when any item is true after deployment:

- Production app has a white screen or cannot load `index.html`.
- `runtime-config.js` points to the wrong API or has `API_MOCK_FALLBACK=true`.
- API `/health` fails.
- API `/ready` fails or reports storage not writable.
- Login, cloud sync, backup restore, or image upload breaks for normal users.
- Monitoring ingest fails and the release cannot be observed.
- Evidence suggests data corruption, cross-user data exposure, or broken ownership checks.

## What not to do

- Do not delete the `pet_companion_data` volume.
- Do not delete `/data`.
- Do not overwrite SQLite files before a restore owner approves the backup restore path.
- Do not commit or paste production secrets.
- Do not run ad-hoc cleanup commands during rollback unless the restore owner approves them.

## Fast rollback to previous image version

Set the previous known-good version on the deployment host:

```powershell
$env:APP_VERSION='0.3.9'
docker compose -f deploy/docker-compose.production.yml --env-file deploy/production.env up -d
```

If the host uses shell env files instead of PowerShell environment variables, set `APP_VERSION` in the deployment shell for that command only.

This changes the API image tag but keeps the persistent `pet_companion_data` volume mounted at `/data`.

## Static asset rollback

If only the frontend is broken:

1. Restore the previous `dist` artifact from the release archive.
2. Keep `runtime-config.js` aligned with the production API.
3. Restart only the web service if needed:

```powershell
docker compose -f deploy/docker-compose.production.yml --env-file deploy/production.env up -d pet-web
```

## Runtime config rollback

If only `runtime-config.js` is wrong:

```powershell
$env:PET_API_BASE_URL='https://api.your-real-domain.cn'
$env:PET_MONITORING_ENDPOINT='https://monitoring.your-real-domain.cn/events'
npm run runtime:production
npm run deploy:check:production
docker compose -f deploy/docker-compose.production.yml --env-file deploy/production.env up -d pet-web
```

## Backup restore escalation

Use backup restore only when data is damaged or missing and a restore owner approves it.

Before touching production data:

1. Run or review the latest `npm run backup:drill` result in the release evidence.
2. Identify the selected backup timestamp and storage location.
3. Stop writes or put the app in maintenance mode at the platform layer.
4. Snapshot the current broken data volume for forensics.
5. Restore the approved SQLite backup set, including the main database file and any WAL/SHM side files captured by the backup system.
6. Start the API and verify `/ready`.

## Verification after rollback

Run:

```powershell
$env:PET_PROD_APP_URL='https://app.your-real-domain.cn'
$env:PET_PROD_API_BASE_URL='https://api.your-real-domain.cn'
npm run smoke:production

$env:PET_OPS_MAX_LATENCY_MS='1500'
npm run ops:check
```

Verify:

- `/health` returns 200.
- `/ready` returns 200 and storage writable.
- Unauthorized `/app-state` returns 401 with requestId.
- Existing remote account can sign in.
- Existing pet state loads.
- Backup list and backup restore paths work.
- Image URLs still resolve.

## Post-rollback notes

Record:

- Failed `APP_VERSION`.
- Rolled-back `APP_VERSION`.
- Trigger and user impact.
- Whether `pet_companion_data` was untouched.
- Whether backup restore was used.
- Smoke and ops check output after rollback.
