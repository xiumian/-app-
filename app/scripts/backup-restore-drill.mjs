import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const CHILD_SOURCE = String.raw`
  import assert from 'node:assert/strict';
  import { createPetCompanionServer } from './server/index.js';
  import { createStateBackup } from './src/domain/backups.js';

  function listen(server) {
    return new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  }

  function close(server) {
    return new Promise(resolve => server.close(resolve));
  }

  async function request(baseUrl, path, { method = 'GET', token = '', body = null } = {}) {
    const response = await fetch(baseUrl + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {})
      },
      body: body ? JSON.stringify(body) : null
    });
    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';
    const payload = text && contentType.includes('application/json') ? JSON.parse(text) : text;
    return { response, payload };
  }

  const phase = process.env.PET_BACKUP_DRILL_PHASE;
  const account = 'backup-drill@example.com';
  const password = 'BackupPass123';
  const server = createPetCompanionServer();
  await listen(server);
  const { port } = server.address();
  const baseUrl = 'http://127.0.0.1:' + port;

  try {
    let result = await request(baseUrl, '/ready');
    assert.equal(result.response.status, 200);
    assert.equal(result.payload.checks.storage.driver, 'sqlite');
    assert.equal(result.payload.checks.storage.writable, true);

    if (phase === 'seed') {
      result = await request(baseUrl, '/auth/register', {
        method: 'POST',
        body: { account, name: 'Backup Drill', password }
      });
      assert.equal(result.response.status, 201);
      const user = result.payload.user;
      const token = result.payload.session.accessToken;
      const state = {
        schemaVersion: 4,
        currentUserId: user.id,
        activeTab: 'home',
        users: [user],
        pets: [{ id: 'pet_drill', ownerId: user.id, name: 'Mochi' }],
        reminders: [],
        records: [],
        photos: [],
        posts: [],
        checkins: [{ id: 'chk_drill', userId: user.id, petId: 'pet_drill', title: 'Water', done: false }],
        session: { accessToken: 'must-not-persist-in-state', refreshToken: 'must-not-persist-in-state' },
        ui: { sheet: 'checkins', detailPetId: 'pet_drill' }
      };
      result = await request(baseUrl, '/app-state', { method: 'PUT', token, body: { state } });
      assert.equal(result.response.status, 200);

      const backup = createStateBackup(state, { appVersion: 'backup-drill', createdAt: '2026-06-29T00:00:00.000Z' });
      result = await request(baseUrl, '/app-state/backups', { method: 'POST', token, body: backup });
      assert.equal(result.response.status, 200);
      assert.ok(result.payload.backupId.startsWith('bak_'));
      console.log('seeded sqlite backup drill data');
      process.exitCode = 0;
    } else if (phase === 'verify') {
      result = await request(baseUrl, '/auth/sign-in', {
        method: 'POST',
        body: { account, password }
      });
      assert.equal(result.response.status, 200);
      const user = result.payload.user;
      const token = result.payload.session.accessToken;

      result = await request(baseUrl, '/app-state', { token });
      assert.equal(result.response.status, 200);
      assert.equal(result.payload.state.pets[0].name, 'Mochi');
      assert.equal(result.payload.state.session.accessToken, null);
      assert.equal(result.payload.state.ui.sheet, null);

      result = await request(baseUrl, '/app-state/backups', { token });
      assert.equal(result.response.status, 200);
      assert.equal(result.payload.length, 1);
      const backupId = result.payload[0].backupId;

      result = await request(baseUrl, '/app-state', {
        method: 'PUT',
        token,
        body: {
          state: {
            schemaVersion: 4,
            currentUserId: user.id,
            users: [user],
            pets: [{ id: 'pet_drill', ownerId: user.id, name: 'Changed' }],
            reminders: [], records: [], photos: [], posts: [], checkins: []
          }
        }
      });
      assert.equal(result.response.status, 200);

      result = await request(baseUrl, '/app-state/backups/' + encodeURIComponent(backupId) + '/restore', { method: 'POST', token });
      assert.equal(result.response.status, 200);
      assert.equal(result.payload.state.pets[0].name, 'Mochi');
      console.log('verified restored sqlite backup drill data');
      process.exitCode = 0;
    } else {
      throw new Error('Unknown backup drill phase: ' + phase);
    }
  } finally {
    await close(server);
  }
`;

function runChild(phase, env) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD_SOURCE], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, ...env, PET_BACKUP_DRILL_PHASE: phase }
  });
  assert.equal(result.status, 0, `${phase} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}

async function copySqliteSet(fromDir, toDir, sqliteFile) {
  await mkdir(toDir, { recursive: true });
  const base = basename(sqliteFile);
  const entries = await readdir(fromDir);
  const sqliteEntries = entries.filter(entry => entry === base || entry.startsWith(`${base}-`));
  assert.ok(sqliteEntries.includes(base), 'sqlite primary file was not created');
  for (const entry of sqliteEntries) {
    await copyFile(join(fromDir, entry), join(toDir, entry));
  }
  return sqliteEntries;
}

async function removeSqliteSet(dir, sqliteFile) {
  const base = basename(sqliteFile);
  const entries = await readdir(dir).catch(() => []);
  await Promise.all(entries
    .filter(entry => entry === base || entry.startsWith(`${base}-`))
    .map(entry => rm(join(dir, entry), { force: true })));
}

const root = await mkdtemp(join(tmpdir(), 'pet-companion-backup-drill-'));
const dataDir = join(root, 'data');
const snapshotDir = join(root, 'snapshot');
const sqliteFile = join(dataDir, 'pet-companion.sqlite');
const childEnv = {
  PET_SERVER_DATA_DIR: dataDir,
  PET_STORAGE_DRIVER: 'sqlite',
  PET_SQLITE_FILE: sqliteFile,
  PET_SERVER_HOST: '127.0.0.1',
  PET_CORS_ORIGIN: '*',
  PET_SERVER_LOG_LEVEL: 'off',
  PET_MEDIA_STORAGE_DRIVER: 'local'
};

try {
  runChild('seed', childEnv);
  const copied = await copySqliteSet(dataDir, snapshotDir, sqliteFile);
  await removeSqliteSet(dataDir, sqliteFile);
  await copySqliteSet(snapshotDir, dataDir, sqliteFile);
  runChild('verify', childEnv);
  console.log(`PASS backup restore drill (${copied.join(', ')})`);
} finally {
  if (process.env.PET_BACKUP_DRILL_KEEP_TMP === '1') {
    console.log(`kept drill temp directory: ${root}`);
  } else {
    await rm(root, { recursive: true, force: true });
  }
}
