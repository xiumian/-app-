import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { DATA_DIR, SQLITE_FILE, STORAGE_DRIVER } from './config.js';

const DB_FILE = join(DATA_DIR, 'pet-companion-server.json');
const DB_BACKUP_FILE = `${DB_FILE}.bak`;
const SQLITE_KEY = 'primary';
const require = createRequire(import.meta.url);

const defaultDb = {
  users: [],
  sessions: [],
  states: {},
  backups: {},
  monitoringEvents: []
};

let writeQueue = Promise.resolve();
let sqliteDb = null;
let DatabaseSync = null;

function normalizeDb(input = {}) {
  return {
    ...defaultDb,
    ...input,
    users: Array.isArray(input.users) ? input.users : [],
    sessions: Array.isArray(input.sessions) ? input.sessions : [],
    states: input.states && typeof input.states === 'object' && !Array.isArray(input.states) ? input.states : {},
    backups: input.backups && typeof input.backups === 'object' && !Array.isArray(input.backups) ? input.backups : {},
    monitoringEvents: Array.isArray(input.monitoringEvents) ? input.monitoringEvents : []
  };
}

async function readNormalizedFile(file) {
  const raw = await readFile(file, 'utf8');
  return normalizeDb(JSON.parse(raw));
}

function isJsonParseError(error) {
  return error instanceof SyntaxError;
}

async function copyCurrentPrimaryToBackup() {
  try {
    await readNormalizedFile(DB_FILE);
    await copyFile(DB_FILE, DB_BACKUP_FILE);
  } catch (error) {
    if (error.code === 'ENOENT' || isJsonParseError(error)) return;
    throw error;
  }
}

async function atomicWriteDb(db, { refreshBackup = true } = {}) {
  await mkdir(DATA_DIR, { recursive: true });
  if (refreshBackup) await copyCurrentPrimaryToBackup();

  const tempFile = join(DATA_DIR, `pet-companion-server.${process.pid}.${Date.now()}.tmp`);
  try {
    await writeFile(tempFile, `${JSON.stringify(normalizeDb(db), null, 2)}\n`, 'utf8');
    await rename(tempFile, DB_FILE);
  } finally {
    await rm(tempFile, { force: true }).catch(() => {});
  }
}

function getSqliteDb() {
  if (sqliteDb) return sqliteDb;
  if (!DatabaseSync) {
    ({ DatabaseSync } = require('node:sqlite'));
  }
  mkdirSync(dirname(SQLITE_FILE), { recursive: true });
  sqliteDb = new DatabaseSync(SQLITE_FILE);
  sqliteDb.exec('PRAGMA journal_mode = WAL');
  sqliteDb.exec('PRAGMA synchronous = NORMAL');
  sqliteDb.exec('PRAGMA busy_timeout = 5000');
  sqliteDb.exec(`CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  sqliteDb.exec(`CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  return sqliteDb;
}

function readSqliteDb() {
  const row = getSqliteDb().prepare('SELECT value FROM app_state WHERE key = ?').get(SQLITE_KEY);
  if (!row) return normalizeDb();
  return normalizeDb(JSON.parse(row.value));
}

function writeSqliteDb(db) {
  const connection = getSqliteDb();
  const normalized = normalizeDb(db);
  const value = JSON.stringify(normalized);
  const updatedAt = new Date().toISOString();
  try {
    connection.exec('BEGIN IMMEDIATE');
    connection.prepare(`INSERT INTO app_state (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run(SQLITE_KEY, value, updatedAt);
    connection.exec('COMMIT');
  } catch (error) {
    try {
      connection.exec('ROLLBACK');
    } catch {}
    throw error;
  }
}

async function readJsonDb() {
  try {
    return await readNormalizedFile(DB_FILE);
  } catch (error) {
    if (error.code === 'ENOENT') return normalizeDb();
    if (isJsonParseError(error)) {
      const recovered = await readNormalizedFile(DB_BACKUP_FILE);
      await atomicWriteDb(recovered, { refreshBackup: false });
      return recovered;
    }
    throw error;
  }
}

async function writeJsonDb(db) {
  await atomicWriteDb(db);
}

export async function readDb() {
  if (STORAGE_DRIVER === 'sqlite') return readSqliteDb();
  return readJsonDb();
}

export function writeDb(db) {
  writeQueue = writeQueue.then(async () => {
    if (STORAGE_DRIVER === 'sqlite') {
      writeSqliteDb(db);
      return;
    }
    await writeJsonDb(db);
  });
  return writeQueue;
}

export async function updateDb(mutator) {
  const db = await readDb();
  const result = await mutator(db);
  await writeDb(db);
  return result;
}

export async function probeStorage() {
  if (STORAGE_DRIVER === 'sqlite') {
    const checkedAt = new Date().toISOString();
    getSqliteDb().prepare(`INSERT INTO app_meta (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run('readycheck', JSON.stringify({ checkedAt }), checkedAt);
    const row = getSqliteDb().prepare('SELECT value FROM app_meta WHERE key = ?').get('readycheck');
    return {
      ok: Boolean(row),
      driver: 'sqlite',
      writable: Boolean(row),
      checkedAt,
      file: SQLITE_FILE
    };
  }

  const checkedAt = new Date().toISOString();
  const probeFile = join(DATA_DIR, `.readycheck-${process.pid}.json`);
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(probeFile, `${JSON.stringify({ checkedAt })}\n`, 'utf8');
  const info = await readFile(probeFile, 'utf8');
  await rm(probeFile, { force: true });
  return {
    ok: true,
    driver: 'json-file',
    writable: true,
    checkedAt,
    bytesWritten: Buffer.byteLength(info)
  };
}
