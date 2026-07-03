import { SERVER_LOG_LEVEL } from './config.js';

const LOG_LEVELS = ['off', 'error', 'info'];

function normalizedLogLevel() {
  return LOG_LEVELS.includes(SERVER_LOG_LEVEL) ? SERVER_LOG_LEVEL : 'info';
}

function writeStructuredLog(level, event, fields = {}) {
  const configuredLevel = normalizedLogLevel();
  if (configuredLevel === 'off') return;
  if (level === 'info' && configuredLevel !== 'info') return;

  const entry = {
    level,
    event,
    time: new Date().toISOString(),
    ...fields
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else console.log(line);
}

export function logAccess(fields) {
  writeStructuredLog('info', 'api_request', fields);
}

export function logError(fields) {
  writeStructuredLog('error', 'api_error', fields);
}
