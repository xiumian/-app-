#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import https from 'node:https';
import tls from 'node:tls';
import net from 'node:net';

const outputDir = 'output';
const latestJsonPath = `${outputDir}/domain-tls-evidence-latest.json`;
const latestMarkdownPath = `${outputDir}/domain-tls-evidence-latest.md`;
const DEFAULT_TIMEOUT_MS = 12000;
const SECRET_PATTERN = /(password|secret|token|cookie|private[_-]?key|access[_-]?key|AKIA[0-9A-Z]{16}|-----BEGIN)/i;
const LOCAL_HOST_PATTERN = /^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|::1$|fc|fd)/i;

function parseArgs(argv) {
  const result = { owner: 'domain-tls-owner', timeoutMs: DEFAULT_TIMEOUT_MS };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      result.help = true;
      continue;
    }
    if (arg === '--self-test') {
      result.selfTest = true;
      continue;
    }
    if (!arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
    result[key] = value.trim();
    index += 1;
  }
  if (result.timeoutMs !== undefined) {
    const parsed = Number(result.timeoutMs);
    if (!Number.isFinite(parsed) || parsed < 1000 || parsed > 60000) throw new Error('--timeout-ms must be between 1000 and 60000');
    result.timeoutMs = parsed;
  }
  return result;
}

function usage() {
  return `Usage: node ./scripts/external-evidence-domain-tls.mjs --url <https-url> [--api-health-url <https-url>] [--gateway-ref <masked-ref>] [--owner <owner-id>] [--timeout-ms <ms>]

Examples:
  npm.cmd run external:evidence:domain-tls -- --url "https://app.example.com" --api-health-url "https://app.example.com/api/health" --gateway-ref "ops-ticket-123#nginx-route" --owner "ops-wang"
  npm.cmd run external:evidence:update -- --id domainTls --status provided --owner "ops-wang" --evidence-ref "output/domain-tls-evidence-latest.json" --proof-ref "output/domain-tls-evidence-latest.json#https-reachable" --proof-ref "output/domain-tls-evidence-latest.json#tls-certificate" --proof-ref "ops-ticket-123#nginx-route"

This collector writes masked operational evidence references only. Do not paste private keys, cert PEM blocks, passwords, tokens, cookies, or production secrets.`;
}

function assertSafeText(label, value, { allowEmpty = false } = {}) {
  const text = String(value || '').trim();
  if (!allowEmpty && !text) throw new Error(`${label} is required`);
  if (SECRET_PATTERN.test(text)) throw new Error(`${label} appears to contain a secret; store only a masked ticket/link/record`);
  return text;
}

function normalizeHttpsUrl(label, value, { requirePublic = true } = {}) {
  const text = assertSafeText(label, value);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (url.protocol !== 'https:') throw new Error(`${label} must use https://`);
  if (url.username || url.password) throw new Error(`${label} must not include credentials`);
  if (requirePublic && LOCAL_HOST_PATTERN.test(url.hostname)) throw new Error(`${label} must be a public production host, not localhost/private LAN`);
  return url;
}

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function formatChinaTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} +08:00`;
}

function isIpAddress(hostname) {
  return net.isIP(hostname) !== 0;
}

function compactCertificate(cert) {
  if (!cert || Object.keys(cert).length === 0) return null;
  return {
    subject: cert.subject || {},
    issuer: cert.issuer || {},
    subjectaltname: cert.subjectaltname || '',
    validFrom: cert.valid_from || '',
    validTo: cert.valid_to || '',
    fingerprint256: cert.fingerprint256 || '',
    serialNumberSuffix: cert.serialNumber ? String(cert.serialNumber).slice(-8) : ''
  };
}

function daysUntil(value, now = new Date()) {
  const time = Date.parse(value || '');
  if (Number.isNaN(time)) return null;
  return Math.floor((time - now.getTime()) / (24 * 60 * 60 * 1000));
}

function probeHttps(url, timeoutMs) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const req = https.request(url, {
      method: 'GET',
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'pet-companion-release-evidence/1.0',
        'Accept': 'text/html,application/json;q=0.9,*/*;q=0.1'
      }
    }, (res) => {
      res.resume();
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 400,
          statusCode: res.statusCode,
          elapsedMs: Date.now() - startedAt,
          contentType: Array.isArray(res.headers['content-type']) ? res.headers['content-type'].join(', ') : (res.headers['content-type'] || ''),
          location: Array.isArray(res.headers.location) ? res.headers.location.join(', ') : (res.headers.location || '')
        });
      });
    });
    req.on('timeout', () => req.destroy(new Error(`request timed out after ${timeoutMs}ms`)));
    req.on('error', (error) => resolve({ ok: false, error: error.message, elapsedMs: Date.now() - startedAt }));
    req.end();
  });
}

function probeTls(url, timeoutMs) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const socket = tls.connect({
      host: url.hostname,
      port: Number(url.port || 443),
      servername: isIpAddress(url.hostname) ? undefined : url.hostname,
      rejectUnauthorized: false,
      timeout: timeoutMs
    }, () => {
      const cert = compactCertificate(socket.getPeerCertificate());
      resolve({
        ok: Boolean(cert),
        authorized: socket.authorized,
        authorizationError: socket.authorizationError || '',
        protocol: socket.getProtocol() || '',
        cipher: socket.getCipher()?.standardName || socket.getCipher()?.name || '',
        elapsedMs: Date.now() - startedAt,
        certificate: cert,
        daysRemaining: daysUntil(cert?.validTo)
      });
      socket.end();
    });
    socket.on('timeout', () => socket.destroy(new Error(`TLS timed out after ${timeoutMs}ms`)));
    socket.on('error', (error) => resolve({ ok: false, error: error.message, elapsedMs: Date.now() - startedAt }));
  });
}

function escapePipes(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function buildUpdateCommand({ owner, gatewayRef, enoughForProvided, enoughForVerified }) {
  const base = `npm.cmd run external:evidence:update -- --id domainTls --status ${enoughForVerified ? 'verified' : 'provided'} --owner "${owner}" --evidence-ref "${latestJsonPath}"`;
  const proofRefs = [
    `${latestJsonPath}#https-reachable`,
    `${latestJsonPath}#tls-certificate`
  ];
  if (gatewayRef) proofRefs.push(gatewayRef);
  const command = `${base}${proofRefs.map(ref => ` --proof-ref "${ref}"`).join('')}`;
  return enoughForProvided ? command : '# HTTPS or TLS probe did not pass; fix the endpoint before registering domainTls evidence';
}

function markdownFor(payload) {
  const app = payload.probes.app;
  const tlsResult = payload.probes.tls;
  const api = payload.probes.apiHealth;
  const cert = tlsResult.certificate || {};
  const coverageRows = payload.requiredProofCoverage.map((item, index) => `| ${index + 1} | ${escapePipes(item.requiredProof)} | ${item.covered ? 'yes' : 'no'} | ${escapePipes(item.proofRef || 'missing')} |`);
  return `# domainTls external evidence result

- Generated at: ${payload.generatedAtLocal}
- App URL: ${payload.url}
- API health URL: ${payload.apiHealthUrl || 'not provided'}
- Gateway reference: ${payload.gatewayRef || 'missing'}
- Summary: ${payload.summary.readyForVerified ? 'ready for verified after human review' : payload.summary.readyForProvided ? 'ready for provided; gateway/API proof still required for verified' : 'not ready; fix HTTPS/TLS first'}

## Probe result

| Item | Result |
| --- | --- |
| HTTPS status | ${app.statusCode || app.error || 'unknown'} |
| HTTPS reachable | ${app.ok ? 'yes' : 'no'} |
| TLS handshake | ${tlsResult.ok ? 'success' : 'failed'} |
| TLS trust | ${tlsResult.authorized ? 'trusted by local system' : `review required: ${tlsResult.authorizationError || tlsResult.error || 'unknown'}`} |
| TLS protocol | ${tlsResult.protocol || 'unknown'} |
| TLS issuer | ${escapePipes(cert.issuer?.O || cert.issuer?.CN || 'unknown')} |
| TLS valid to | ${cert.validTo || 'unknown'} |
| Days remaining | ${tlsResult.daysRemaining == null ? 'unknown' : tlsResult.daysRemaining} |
| Certificate SHA-256 fingerprint | ${cert.fingerprint256 || 'unknown'} |
| API health | ${api ? (api.ok ? `pass (${api.statusCode})` : `fail (${api.statusCode || api.error || 'unknown'})`) : 'not provided'} |

## requiredProof coverage

| # | requiredProof | covered | proofRef |
| ---: | --- | --- | --- |
${coverageRows.join('\n')}

## Suggested update command

~~~powershell
${payload.suggestedUpdateCommand}
~~~

This file does not contain passwords, tokens, cookies, TLS private keys, or certificate PEM blocks. If the certificate is not trusted, the remaining days are too low, the API probe fails, or the gateway reference is missing, do not mark this item as verified.
`;
}

async function collect(options) {
  const url = normalizeHttpsUrl('--url', options.url);
  const apiHealthUrl = options.apiHealthUrl ? normalizeHttpsUrl('--api-health-url', options.apiHealthUrl) : null;
  const gatewayRef = options.gatewayRef ? assertSafeText('gatewayRef', options.gatewayRef) : '';
  const owner = assertSafeText('owner', options.owner || 'domain-tls-owner');
  const generatedAt = new Date();

  const [appProbe, tlsProbe, apiProbe] = await Promise.all([
    probeHttps(url, options.timeoutMs),
    probeTls(url, options.timeoutMs),
    apiHealthUrl ? probeHttps(apiHealthUrl, options.timeoutMs) : Promise.resolve(null)
  ]);

  const httpsCovered = Boolean(appProbe.ok);
  const tlsCovered = Boolean(tlsProbe.ok && tlsProbe.certificate?.validTo);
  const gatewayCovered = Boolean(gatewayRef && (!apiProbe || apiProbe.ok));
  const readyForProvided = httpsCovered || tlsCovered;
  const readyForVerified = httpsCovered && tlsCovered && gatewayCovered;

  const payload = {
    schema: 'pet-companion-domain-tls-evidence-v1',
    generatedAt: generatedAt.toISOString(),
    generatedAtLocal: formatChinaTime(generatedAt),
    url: url.toString(),
    apiHealthUrl: apiHealthUrl ? apiHealthUrl.toString() : '',
    gatewayRef,
    owner,
    output: {
      latestJsonPath,
      latestMarkdownPath,
      archiveJsonPath: `${outputDir}/domain-tls-evidence-${timestampForPath(generatedAt)}.json`,
      archiveMarkdownPath: `${outputDir}/domain-tls-evidence-${timestampForPath(generatedAt)}.md`
    },
    summary: {
      readyForProvided,
      readyForVerified,
      httpsReachable: httpsCovered,
      tlsCertificateObserved: tlsCovered,
      gatewayEvidenceProvided: gatewayCovered
    },
    probes: {
      app: appProbe,
      tls: tlsProbe,
      apiHealth: apiProbe
    },
    requiredProofCoverage: [
      {
        requiredProof: 'Production HTTPS endpoint is reachable',
        covered: httpsCovered,
        proofRef: httpsCovered ? `${latestJsonPath}#https-reachable` : ''
      },
      {
        requiredProof: 'TLS issuer and expiry are recorded',
        covered: tlsCovered,
        proofRef: tlsCovered ? `${latestJsonPath}#tls-certificate` : ''
      },
      {
        requiredProof: 'Gateway or reverse proxy routes the production frontend and API',
        covered: gatewayCovered,
        proofRef: gatewayCovered ? gatewayRef : ''
      }
    ]
  };
  payload.suggestedUpdateCommand = buildUpdateCommand({ owner, gatewayRef, enoughForProvided: readyForProvided, enoughForVerified: readyForVerified });
  return payload;
}

async function writeOutputs(payload) {
  await mkdir(outputDir, { recursive: true });
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  const markdown = markdownFor(payload);
  await writeFile(payload.output.archiveJsonPath, json, 'utf8');
  await writeFile(payload.output.archiveMarkdownPath, markdown, 'utf8');
  await writeFile(latestJsonPath, json, 'utf8');
  await writeFile(latestMarkdownPath, markdown, 'utf8');
}

function runSelfTest() {
  const checks = [];
  const add = (name, pass, detail = '') => checks.push({ name, pass, detail });
  add('rejects http url', (() => { try { normalizeHttpsUrl('url', 'http://example.com'); return false; } catch { return true; } })());
  add('rejects localhost url', (() => { try { normalizeHttpsUrl('url', 'https://localhost'); return false; } catch { return true; } })());
  add('accepts public https url', normalizeHttpsUrl('url', 'https://app.example.org/path').hostname === 'app.example.org');
  add('detects secrets in refs', (() => { try { assertSafeText('gatewayRef', 'token=abc'); return false; } catch { return true; } })());
  const command = buildUpdateCommand({ owner: 'ops-wang', gatewayRef: 'ops-ticket-1#gateway', enoughForProvided: true, enoughForVerified: true });
  add('builds verified command with three proof refs', command.includes('--status verified') && (command.match(/--proof-ref/g) || []).length === 3, command);
  const fakePayload = {
    generatedAtLocal: '2026-07-01 10:00:00 +08:00',
    url: 'https://app.example.org/',
    apiHealthUrl: 'https://app.example.org/api/health',
    gatewayRef: 'ops-ticket-1#gateway',
    summary: { readyForVerified: true, readyForProvided: true },
    probes: {
      app: { ok: true, statusCode: 200 },
      tls: { ok: true, authorized: true, protocol: 'TLSv1.3', certificate: { issuer: { O: 'Test CA' }, validTo: 'Jul 01 12:00:00 2027 GMT', fingerprint256: 'AA:BB' }, daysRemaining: 365 },
      apiHealth: { ok: true, statusCode: 200 }
    },
    requiredProofCoverage: [
      { requiredProof: 'HTTPS', covered: true, proofRef: `${latestJsonPath}#https-reachable` },
      { requiredProof: 'TLS', covered: true, proofRef: `${latestJsonPath}#tls-certificate` },
      { requiredProof: 'Gateway', covered: true, proofRef: 'ops-ticket-1#gateway' }
    ],
    suggestedUpdateCommand: command
  };
  const markdown = markdownFor(fakePayload);
  add('markdown documents required proof coverage', markdown.includes('requiredProof coverage') && markdown.includes('Suggested update command'));

  let failed = 0;
  for (const check of checks) {
    if (check.pass) console.log(`PASS ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
    else {
      failed += 1;
      console.error(`FAIL ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
    }
  }
  if (failed) throw new Error(`${failed} domain TLS self-test checks failed`);
  console.log(`\nPASS external evidence domain tls self-test :: ${checks.length} checks passed.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (options.selfTest) {
    runSelfTest();
    return;
  }
  if (!options.url) throw new Error('--url is required. Use --help for examples.');
  if (existsSync('deploy/production.env')) {
    console.log('NOTE deploy/production.env exists locally, but this collector does not read it.');
  }
  const payload = await collect(options);
  await writeOutputs(payload);
  console.log(`PASS domainTls evidence latest json :: ${latestJsonPath}`);
  console.log(`PASS domainTls evidence latest markdown :: ${latestMarkdownPath}`);
  console.log(`PASS domainTls evidence archive json :: ${payload.output.archiveJsonPath}`);
  console.log(`PASS domainTls evidence archive markdown :: ${payload.output.archiveMarkdownPath}`);
  console.log(`domainTls readyForProvided: ${payload.summary.readyForProvided}`);
  console.log(`domainTls readyForVerified: ${payload.summary.readyForVerified}`);
  console.log('Suggested update command:');
  console.log(payload.suggestedUpdateCommand);
}

main().catch(error => {
  console.error(`FAIL external evidence domain tls :: ${error.message}`);
  process.exit(1);
});
