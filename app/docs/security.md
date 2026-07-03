# Pet Companion Security Release Notes

This document defines the local security gate for release hygiene. It does not replace a professional security review, but it prevents common release mistakes.

## Secret hygiene gate

Run before release:

```powershell
npm run secrets:check
```

The check fails if:

- `deploy/production.env` exists in the repository workspace.
- `deploy/certs/` exists in the repository workspace.
- A private key or certificate block is found.
- An AWS access key id pattern is found.
- A likely non-placeholder secret assignment is found.

Allowed values are limited to examples, placeholders, test strings, and local demo values. Real production secrets must live only in the deployment environment or secret manager.

## Release requirement

`npm run release:check` includes `npm run secrets:check`.

Do not deploy if the secret hygiene check fails.

## Token hash secret

Production API deployments must set `PET_AUTH_SECRET` to a random non-placeholder value of at least 32 characters. The server uses it for HMAC-SHA256 token hashes before persisting sessions. Access and refresh token hash lookups use constant-time comparison to reduce timing side-channel leakage. Refresh tokens have a separate expiry and are rotated on every refresh, so the previous refresh token is invalid after a successful refresh. Rotate PET_AUTH_SECRET as a production secret; existing sessions should be considered invalid after rotation.

## API request boundary

JSON endpoints reject non-JSON request bodies with `UNSUPPORTED_MEDIA_TYPE`, while CORS allows the production account deletion flow through `DELETE` preflight. Account deletion requires the current password and the password-confirmation attempts are rate-limited, so a stolen session cannot be used for unlimited password guessing. JSON API responses also default to `Cache-Control: no-store` and `Pragma: no-cache` so account data, token responses, cloud state, and error details are not stored by browser or proxy caches. API and media responses additionally send `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and `Cross-Origin-Opener-Policy` to align the backend surface with the static frontend security baseline. Keep this behavior behind the release gate so browser clients cannot silently send ambiguous text payloads or cache sensitive API data.

Authenticated mutation and upload routes validate the bearer token before parsing JSON request bodies. This keeps unauthenticated malformed JSON or oversized payload attempts on the cheap `UNAUTHORIZED` path instead of spending extra work in domain handlers.

Rate limiting does not trust `X-Forwarded-For` by default. Set `PET_TRUST_PROXY=true` only when the API is reachable exclusively through a trusted reverse proxy that overwrites forwarded headers; otherwise a direct client could spoof the header and split itself across fake IP buckets.

Rate-limited responses include a CORS-exposed `Retry-After` header. Keep client retries and monitoring probes aligned with this value instead of tight retry loops.

Frontend monitoring redacts sensitive keys and token-like string values before sending events, and monitoring ingest repeats the same redaction before persistence, so accidental client-side credentials are neither sent onward in normal clients nor stored in local monitoring evidence.

## Runtime config boundary

`runtime-config.js` may contain public runtime URLs and flags only:

- release channel
- API URL
- API timeout
- mock fallback flag
- monitoring endpoint
- monitoring sample rate

It must never contain tokens, cookies, passwords, private keys, access keys, or user data.

## Production secret locations

Use private deployment infrastructure for:

- `deploy/production.env`
- TLS certificates under `deploy/certs/`
- `PET_AUTH_SECRET` for HMAC token hashes
- `PET_REFRESH_TOKEN_TTL_MS` for refresh token expiry
- S3 access key and secret key
- monitoring credentials
- account-provider credentials

The repository contains only `deploy/production.env.example`.

## Incident response

If a secret is committed or published:

1. Revoke and rotate the secret outside this repository.
2. Remove the secret from the workspace.
3. Run `npm run secrets:check`.
4. Run `npm run release:check`.
5. Record the incident in private ops notes.
