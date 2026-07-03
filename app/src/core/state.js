import { appStateRepository } from '../repositories/appStateRepository.js';
import { CURRENT_SCHEMA_VERSION, migrateState } from './migrations.js';

export const defaultState = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  currentUserId: null,
  activeTab: 'home',
  carePanel: 'reminders',
  selectedPetId: null,
  users: [],
  pets: [],
  reminders: [],
  records: [],
  photos: [],
  posts: [],
  checkins: [],
  reports: [],
  session: null,
  legalConsent: null,
  ui: { sheet: null, detailPetId: null, confirm: null, reportTarget: null }
};

export function normalizeState(input = {}) {
  const state = {
    ...defaultState,
    ...input,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ui: { ...defaultState.ui, ...(input.ui || {}) }
  };

  for (const key of ['users', 'pets', 'reminders', 'records', 'photos', 'posts', 'checkins', 'reports']) {
    if (!Array.isArray(state[key])) state[key] = [];
  }

  return state;
}

const loadedState = appStateRepository.load();
const migration = migrateState(loadedState);

export let storageStatus = {
  ...appStateRepository.status(),
  ...migration.report
};

export let state = normalizeState(migration.state);

if (storageStatus.migrated || storageStatus.repairedFields.length) {
  appStateRepository.save(state);
}

export function saveState() {
  appStateRepository.save(state);
}

export function resetState() {
  state = normalizeState();
  storageStatus = {
    sourceKey: null,
    recovered: false,
    backupKey: null,
    error: null,
    sourceVersion: CURRENT_SCHEMA_VERSION,
    targetVersion: CURRENT_SCHEMA_VERSION,
    migrated: false,
    repairedFields: []
  };
  appStateRepository.clear();
}

export function replaceState(nextState) {
  state = normalizeState(nextState);
  appStateRepository.save(state);
}

export function closeSheet() {
  state.ui.sheet = null;
  state.ui.detailPetId = null;
  state.ui.confirm = null;
  state.ui.reportTarget = null;
  saveState();
}

export function openSheet(name) {
  state.ui.sheet = name;
  saveState();
}
