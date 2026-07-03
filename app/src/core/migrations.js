import { createMigratedLocalSession } from '../domain/sessions.js';
import { reportReasonLabel, sanitizeReportDetail } from '../domain/reports.js';
import { sanitizePetColor } from '../domain/pets.js';

export const CURRENT_SCHEMA_VERSION = 5;

const ARRAY_KEYS = ['users', 'pets', 'reminders', 'records', 'photos', 'posts', 'checkins', 'reports'];
const VALID_TABS = ['home', 'pets', 'care', 'community', 'admin'];
const VALID_CARE_PANELS = ['reminders', 'records', 'stats'];
const VALID_SHEETS = [null, 'checkins', 'reminders', 'pet-detail', 'legal', 'report'];

export function migrateState(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const sourceVersion = source.schemaVersion == null ? CURRENT_SCHEMA_VERSION : Number(source.schemaVersion) || 1;
  const repairedFields = [];
  const next = { ...source };

  for (const key of ARRAY_KEYS) {
    if (!Array.isArray(next[key])) {
      next[key] = [];
      repairedFields.push(key);
    }
  }

  next.ui = next.ui && typeof next.ui === 'object' && !Array.isArray(next.ui) ? { ...next.ui } : {};
  if (!VALID_SHEETS.includes(next.ui.sheet || null)) {
    next.ui.sheet = null;
    repairedFields.push('ui.sheet');
  }
  if (typeof next.ui.detailPetId !== 'string') next.ui.detailPetId = null;
  if (!next.ui.reportTarget || typeof next.ui.reportTarget !== 'object' || Array.isArray(next.ui.reportTarget)) {
    next.ui.reportTarget = null;
  }

  if (!VALID_TABS.includes(next.activeTab)) {
    next.activeTab = 'home';
    repairedFields.push('activeTab');
  }

  if (!VALID_CARE_PANELS.includes(next.carePanel)) {
    next.carePanel = 'reminders';
    repairedFields.push('carePanel');
  }

  if (typeof next.currentUserId !== 'string') next.currentUserId = null;
  if (typeof next.selectedPetId !== 'string') next.selectedPetId = null;
  if (next.legalConsent && typeof next.legalConsent === 'object' && !Array.isArray(next.legalConsent)) {
    next.legalConsent = {
      version: typeof next.legalConsent.version === 'string' ? next.legalConsent.version : null,
      acceptedAt: typeof next.legalConsent.acceptedAt === 'string' ? next.legalConsent.acceptedAt : null,
      source: typeof next.legalConsent.source === 'string' ? next.legalConsent.source : 'unknown'
    };
  } else {
    next.legalConsent = null;
  }

  if (next.session && typeof next.session === 'object' && !Array.isArray(next.session)) {
    next.session = {
      sessionVersion: 1,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      ...next.session,
      userId: typeof next.session.userId === 'string' ? next.session.userId : next.currentUserId,
      authMode: next.session.authMode || 'local'
    };
  } else if (next.currentUserId) {
    next.session = createMigratedLocalSession({ userId: next.currentUserId });
    repairedFields.push('session');
  } else {
    next.session = null;
  }

  for (const post of next.posts) {
    if (!Array.isArray(post.likedBy)) post.likedBy = [];
    if (!Array.isArray(post.comments)) post.comments = [];
  }

  for (const reminder of next.reminders) {
    reminder.done = Boolean(reminder.done);
  }

  for (const pet of next.pets) {
    const sanitizedColor = sanitizePetColor(pet.color);
    if (pet.color !== sanitizedColor) {
      pet.color = sanitizedColor;
      repairedFields.push('pets.color');
    }
  }

  for (const report of next.reports) {
    if (!report.status) report.status = 'submitted';
    const sanitizedDetail = sanitizeReportDetail(report.detail);
    if (report.detail !== sanitizedDetail) {
      report.detail = sanitizedDetail;
      repairedFields.push('reports.detail');
    }
    if (!report.reasonLabel) report.reasonLabel = reportReasonLabel(report.reason);
  }

  next.schemaVersion = CURRENT_SCHEMA_VERSION;

  return {
    state: next,
    report: {
      sourceVersion,
      targetVersion: CURRENT_SCHEMA_VERSION,
      migrated: sourceVersion !== CURRENT_SCHEMA_VERSION,
      repairedFields: [...new Set(repairedFields)]
    }
  };
}
