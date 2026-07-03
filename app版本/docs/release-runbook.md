# Pet Companion Release Runbook

This runbook is the pre-production release handoff. It is intentionally executable and conservative. It does not contain real secrets, real host names, or private certificates.

## Release owner inputs

Before a release window, fill these values in the private deployment notes, not in this repository:

- App URL: `https://app.your-real-domain.cn`
- API base URL: `https://api.your-real-domain.cn`
- CDN/media URL: `https://cdn.your-real-domain.cn`
- Monitoring endpoint: `https://monitoring.your-real-domain.cn/events`
- Release version: `0.4.0`
- Deployment target root: app-owned path such as `/opt/pet-companion`, not a server homepage root
- Restore owner: named human who can approve restore or rollback
- Rollback target: previous known-good `APP_VERSION`

## Go / No-Go

Make a go decision only when every item below is true.

Do not release if any item fails, is skipped, or cannot be evidenced:

1. `npm run release:check` passes locally.
2. `npm run backup:drill` passes locally.
3. `npm run readiness:check` passes locally.
4. `npm run public:bundle:check` passes locally.
5. `npm run pwa:cache:check` passes locally.
6. `npm run architecture:check` passes locally.
7. `npm run external:evidence:check` passes locally.
8. `npm run secrets:check` passes locally.
9. `npm run accessibility:check` passes locally.
10. `npm run deploy:target:check` confirms upload paths stay in app-owned directories and do not point at a server homepage root.
11. `npm run manual:acceptance:check` confirms the manual device acceptance template covers device matrix, complaint-prone flows, sanitized evidence, and retest sign-off.
12. `npm run artifact:manifest` generates `output/release-artifacts.json`.
13. `npm run artifact:verify` confirms `dist` matches `output/release-artifacts.json`.
14. `npm run release:evidence:self-test` passes before evidence generation.
15. `npm run release:evidence` runs after the local gates and generates `output/release-evidence.json`.
16. `npm run release:evidence:check` confirms the evidence package matches `package.json` release steps and `output/release-artifacts.json`.
17. GitHub Actions `Pet Companion Release Gate` passes for the release commit when code hosting is used.
18. Production runtime config is generated with HTTPS API and HTTPS monitoring.
19. `npm run deploy:check:production` passes against the generated `dist`.
20. `npm run server:check:production` passes with the production environment values.
21. `deploy/production.env` exists only on the deployment host and contains real secrets, never placeholders.
22. TLS files exist only on the deployment host under `deploy/certs/`.
23. The deployment host has a recent platform backup and a named restore owner.
24. The rollback target `APP_VERSION` is known and still available.

## Local release gate

Run from the project root:

```powershell
npm run release:check
```

Before any real publish/deploy action, run the strict Go/No-Go gate:

```powershell
npm run release:go
```

`release:go` reruns `release:check` and then runs `launch:status -- --require-go`; it must fail when external production evidence is still pending.

This includes build, browser e2e, remote e2e, production smoke self-test, ops self-test, deploy checks, server tests, backup restore drill, container checks, deploy target checks, deploy bundle checks, manual acceptance template checks, release plan checks, production readiness checks, launch status self-test (`launch:status:self-test`), secret hygiene, and accessibility checks.

CI runs the same release gate through:

```powershell
npm run ci:check
```

See `docs/ci.md` and `.github/workflows/release-gate.yml`.

Production readiness documentation is part of the release gate:

```powershell
npm run readiness:check
```

See `docs/production-readiness.md`.

Release evidence is generated after the local gates by:

```powershell
npm run architecture:check
npm run public:bundle:check
npm run pwa:cache:check
npm run deploy:target:check
npm run manual:acceptance:check
npm run external:evidence:check
npm run secrets:check
npm run accessibility:check
npm run artifact:manifest
npm run artifact:verify
npm run release:evidence:self-test
npm run release:evidence
npm run release:evidence:check
```

Use `deploy/production-evidence.example.json` as the template for `output/production-evidence.json`.
Attach `output/release-artifacts.json`, `output/release-evidence.json`, or `output/release-evidence.md` to the release handoff. See `docs/external-evidence.md` and `docs/release-evidence.md`.

Secret hygiene is part of the release gate:

```powershell
npm run secrets:check
```

See `docs/security.md`.

Accessibility and offline readiness are part of the release gate:

```powershell
npm run accessibility:check
```

This verifies keyboard focus visibility, dialog semantics, labeled sheet fields, touch targets, and service-worker offline navigation fallback. See `docs/accessibility.md`.

## Production runtime check

Generate production runtime config with real HTTPS URLs:

```powershell
$env:PET_API_BASE_URL='https://api.your-real-domain.cn'
$env:PET_MONITORING_ENDPOINT='https://monitoring.your-real-domain.cn/events'
$env:PET_OPERATOR_NAME='宠伴记运营主体'
$env:PET_SUPPORT_CONTACT_URL='https://support.your-real-domain.cn/pet-companion'
$env:PET_SUPPORT_EMAIL='support@your-real-domain.cn'
npm run runtime:production
npm run deploy:check:production
```

Review `dist/runtime-config.js` and verify:

- `APP_RELEASE_CHANNEL` is `production`.
- `API_BASE_URL` is the production HTTPS API URL.
- `API_MOCK_FALLBACK` is `false`.
- `MONITORING_ENDPOINT` is the production HTTPS monitoring URL.
- `OPERATOR_NAME` shows the real operator.
- `SUPPORT_CONTACT_URL` or `SUPPORT_EMAIL` provides a real support/complaint channel.
- No token, cookie, password, or private key is present.

## Server production gate

On the deployment host, set production values and run:

```powershell
npm run server:check:production
```

Required production categories:

- `NODE_ENV=production`
- non-loopback `PET_SERVER_HOST`
- absolute persistent `PET_SERVER_DATA_DIR`
- `PET_STORAGE_DRIVER=sqlite`
- absolute persistent `PET_SQLITE_FILE`
- explicit HTTPS `PET_CORS_ORIGIN`
- S3-compatible media storage
- authentication rate limits within production bounds
- request body size within production bounds

## Deploy

After the go decision:

Prepare or verify the private deployment target first:

```powershell
Copy-Item deploy/target.example.json deploy/target.json
npm run deploy:target:check
npm run production:env:example:check
npm run production:env:self-test
npm run deploy:transfer:plan
```

Only upload into the app-owned paths recorded in `deploy/target.json`. Do not copy `dist` into `/var/www/html`, `/usr/share/nginx/html`, `/www/wwwroot`, `/home/*/public_html`, or any existing server homepage directory. `distTarget` and `deployConfigTarget` must be child directories under `projectRoot`; `dataTarget` and `mediaTarget` must stay outside app files and separate from each other, so data transfer or image uploads cannot overwrite the app bundle, config, or homepage.

Use `output/deploy-transfer-plan.md` as the handoff checklist. It is generated locally and does not run SSH, SCP, rsync, or any remote write.

Before starting the real container, create `deploy/production.env` only in the private deployment workspace and run `npm run production:env:check` there. The checker rejects placeholders such as `example.com` and masks secret values in output.

```powershell
docker compose -f deploy/docker-compose.production.yml --env-file deploy/production.env up -d --build
```

Do not paste real secrets into chat, commit them, or place them in `production.env.example`.

## Post-deploy verification

Run production smoke:

```powershell
$env:PET_PROD_APP_URL='https://app.your-real-domain.cn'
$env:PET_PROD_API_BASE_URL='https://api.your-real-domain.cn'
npm run smoke:production
```

Run ops check:

```powershell
$env:PET_PROD_APP_URL='https://app.your-real-domain.cn'
$env:PET_PROD_API_BASE_URL='https://api.your-real-domain.cn'
$env:PET_OPS_MAX_LATENCY_MS='1500'
npm run ops:check
```

Manual acceptance:

- Run `npm run manual:acceptance:check` before the release window to ensure `docs/manual-device-acceptance.md` is complete enough for QA.
- Open login/register and verify the user agreement and privacy policy checkbox blocks entry until checked.
- Open home, pet profile, checkin management, and growth capsule on real iPhone.
- Open home, pet profile, checkin management, and growth capsule on real Android.
- Register a remote account.
- Create or update one pet.
- Create a checkin and mark it done.
- Upload one image and verify image upload URL is reachable.
- Refresh the page and verify session, cloud sync, and cloud backup still work.
- Simulate weak network and verify the app does not white-screen.
- Export a support diagnostics bundle and verify it is redacted before attaching it to any support ticket.

## Failure handling

If smoke or ops checks fail after deployment:

1. Stop feature verification.
2. Capture failing command output.
3. Check `docs/operations.md`.
4. If impact is user-visible or data-risky, follow `docs/rollback.md`.
