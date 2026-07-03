import { randomUUID } from 'node:crypto';
import { HttpError } from './http.js';
import { BACKUP_RETENTION_MAX } from './config.js';

const DATA_KEYS = ['users', 'pets', 'reminders', 'records', 'photos', 'posts', 'checkins', 'reports'];
const PET_RESOURCE_KEYS = ['reminders', 'records', 'photos'];
const SENSITIVE_REPORT_PATTERN = /(pat_|prt_|Bearer\s+|password\s*[=:：]|token\s*[=:：]|cookie\s*[=:：]|secret\s*[=:：]|private[_-]?key|access[_-]?key|验证码|短信码|身份证|PRIVATE KEY)/i;
const SENSITIVE_REPORT_PLACEHOLDER = '[已移除敏感信息，请通过客服渠道补充脱敏说明]';
const REPORT_DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function cleanText(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

function sanitizeReportDetail(detail) {
  const cleaned = cleanText(detail);
  return SENSITIVE_REPORT_PATTERN.test(cleaned) ? SENSITIVE_REPORT_PLACEHOLDER : cleaned;
}

function reportDuplicateKey(report) {
  return [
    report.reporterId || '',
    report.targetType || 'general',
    report.targetId || '',
    report.postId || '',
    report.reason || 'other',
    cleanText(report.detail)
  ].join('\u001f');
}

function isRecentDuplicateReport(left, right) {
  if (reportDuplicateKey(left) !== reportDuplicateKey(right)) return false;
  const leftTime = new Date(left.createdAt || 0).getTime();
  const rightTime = new Date(right.createdAt || 0).getTime();
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && Math.abs(leftTime - rightTime) <= REPORT_DUPLICATE_WINDOW_MS;
}

function sanitizeReports(reports) {
  const kept = [];
  for (const report of reports) {
    if (!report || typeof report !== 'object') continue;
    report.detail = sanitizeReportDetail(report.detail);
    if (kept.some(item => isRecentDuplicateReport(item, report))) continue;
    kept.push(report);
  }
  return kept;
}

export function sanitizeState(input = {}) {
  const state = cloneJson(input && typeof input === 'object' && !Array.isArray(input) ? input : {});
  state.schemaVersion = Number(state.schemaVersion) || 5;
  state.ui = { sheet: null, detailPetId: null };
  if (state.session) {
    state.session.accessToken = null;
    state.session.refreshToken = null;
  }
  for (const key of DATA_KEYS) {
    if (!Array.isArray(state[key])) state[key] = [];
  }
  state.reports = sanitizeReports(state.reports);
  return state;
}

function assertOwnedPetIds(state, user) {
  for (const pet of state.pets) {
    if (!pet || pet.ownerId !== user.id) {
      throw new HttpError(403, 'FORBIDDEN_RESOURCE', '不能保存其他用户的宠物');
    }
  }
  return new Set(state.pets.map(pet => pet.id).filter(Boolean));
}

function assertPetResourceOwnership(state, petIds, key) {
  for (const item of state[key]) {
    if (!item || !petIds.has(item.petId)) {
      throw new HttpError(403, 'FORBIDDEN_RESOURCE', `不能保存其他用户的${key}`);
    }
  }
}

export function assertStateOwnership(state, user) {
  const petIds = assertOwnedPetIds(state, user);
  for (const key of PET_RESOURCE_KEYS) assertPetResourceOwnership(state, petIds, key);
  for (const item of state.checkins) {
    if (!item || item.userId !== user.id || !petIds.has(item.petId)) {
      throw new HttpError(403, 'FORBIDDEN_RESOURCE', '不能保存其他用户的打卡');
    }
  }
  for (const post of state.posts) {
    if (!post || post.authorId !== user.id || !petIds.has(post.petId)) {
      throw new HttpError(403, 'FORBIDDEN_RESOURCE', '不能保存其他用户的动态');
    }
    const comments = Array.isArray(post.comments) ? post.comments : [];
    for (const comment of comments) {
      if (!comment || comment.authorId !== user.id) {
        throw new HttpError(403, 'FORBIDDEN_RESOURCE', '不能保存其他用户的评论');
      }
    }
  }
  for (const report of state.reports) {
    if (!report || report.reporterId !== user.id) {
      throw new HttpError(403, 'FORBIDDEN_RESOURCE', '不能保存其他用户的投诉反馈');
    }
  }
}

export function emptyState(user) {
  return {
    schemaVersion: 5,
    currentUserId: user.id,
    activeTab: 'home',
    carePanel: 'reminders',
    selectedPetId: null,
    users: [user],
    pets: [],
    reminders: [],
    records: [],
    photos: [],
    posts: [],
    checkins: [],
    reports: [],
    session: null,
    ui: { sheet: null, detailPetId: null }
  };
}

export function getState(db, user) {
  const state = sanitizeState(db.states[user.id] || emptyState(user));
  state.currentUserId = user.id;
  return {
    state,
    updatedAt: db.states[user.id]?.updatedAt || null
  };
}

export function putState(db, user, payload) {
  if (!payload || typeof payload !== 'object' || !payload.state) {
    throw new HttpError(400, 'VALIDATION_ERROR', '请提供 state');
  }
  const state = sanitizeState(payload.state);
  state.currentUserId = user.id;
  assertStateOwnership(state, user);
  db.states[user.id] = {
    ...state,
    updatedAt: new Date().toISOString()
  };
  return { ok: true, updatedAt: db.states[user.id].updatedAt };
}

export function validateBackup(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (payload.backupVersion !== 1) return false;
  if (!payload.state || typeof payload.state !== 'object' || Array.isArray(payload.state)) return false;
  return DATA_KEYS.every(key => Array.isArray(payload.state[key]));
}

export function createBackup(db, user, payload) {
  if (!validateBackup(payload)) throw new HttpError(400, 'VALIDATION_ERROR', '备份格式不正确');
  const backupState = sanitizeState(payload.state);
  backupState.currentUserId = user.id;
  assertStateOwnership(backupState, user);
  const backupId = `bak_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  const backup = {
    ...payload,
    backupId,
    userId: user.id,
    createdAt,
    state: backupState
  };
  if (!db.backups[user.id]) db.backups[user.id] = [];
  db.backups[user.id].push(backup);
  db.backups[user.id] = db.backups[user.id]
    .sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')))
    .slice(-BACKUP_RETENTION_MAX);
  return { backupId, createdAt };
}

export function listBackups(db, user) {
  return (db.backups[user.id] || []).map(item => ({
    backupId: item.backupId,
    appVersion: item.appVersion,
    schemaVersion: item.schemaVersion,
    createdAt: item.createdAt,
    counts: item.counts || {}
  }));
}

export function restoreBackup(db, user, backupId) {
  const backup = (db.backups[user.id] || []).find(item => item.backupId === backupId);
  if (!backup) throw new HttpError(404, 'NOT_FOUND', '备份不存在');
  const restoredAt = new Date().toISOString();
  db.states[user.id] = {
    ...sanitizeState(backup.state),
    currentUserId: user.id,
    updatedAt: restoredAt
  };
  return { ok: true, state: db.states[user.id], restoredAt };
}
