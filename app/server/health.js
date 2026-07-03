import { readFileSync } from 'node:fs';
import { probeMediaStorage } from './media.js';
import { probeStorage } from './storage.js';

const startedAt = new Date().toISOString();
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export function getHealth() {
  return {
    ok: true,
    service: 'pet-companion-api',
    status: 'live',
    version: packageJson.version,
    startedAt,
    uptimeSeconds: Math.round(process.uptime())
  };
}

export async function getReadiness() {
  const checks = {};
  try {
    checks.storage = await probeStorage();
  } catch (error) {
    checks.storage = {
      ok: false,
      driver: 'unknown',
      writable: false,
      code: error.code || 'STORAGE_PROBE_FAILED'
    };
  }

  try {
    checks.media = await probeMediaStorage();
  } catch (error) {
    checks.media = {
      ok: false,
      driver: 'unknown',
      writable: false,
      code: error.code || 'MEDIA_PROBE_FAILED'
    };
  }

  const ok = Object.values(checks).every(check => check.ok);
  return {
    status: ok ? 200 : 503,
    body: {
      ok,
      service: 'pet-companion-api',
      status: ok ? 'ready' : 'not_ready',
      version: packageJson.version,
      checks
    }
  };
}
