import { ValidationError, cleanText } from '../core/validation.js';

const REPORT_REASON_LABELS = new Map([
  ['illegal', '违法违规'],
  ['harassment', '骚扰攻击'],
  ['privacy', '隐私泄露'],
  ['infringement', '侵权内容'],
  ['spam', '广告垃圾'],
  ['medical-risk', '误导性健康建议'],
  ['other', '其他问题']
]);

export const REPORT_REASONS = [...REPORT_REASON_LABELS.entries()].map(([value, label]) => ({ value, label }));
export const REPORT_DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

const SENSITIVE_REPORT_PATTERN = /(pat_|prt_|Bearer\s+|password\s*[=:：]|token\s*[=:：]|cookie\s*[=:：]|secret\s*[=:：]|private[_-]?key|access[_-]?key|验证码|短信码|身份证|PRIVATE KEY)/i;

export function reportReasonLabel(value) {
  return REPORT_REASON_LABELS.get(value) || REPORT_REASON_LABELS.get('other');
}

export function createReport({ uid, reporterId, targetType = 'general', targetId = '', postId = '', reason = 'other', detail = '' }) {
  const cleanedDetail = cleanText(detail);
  assertReportDetailSafe(cleanedDetail);
  return {
    id: uid('rpt'),
    reporterId: cleanText(reporterId),
    targetType: cleanText(targetType) || 'general',
    targetId: cleanText(targetId),
    postId: cleanText(postId),
    reason: REPORT_REASON_LABELS.has(reason) ? reason : 'other',
    reasonLabel: reportReasonLabel(reason),
    detail: cleanedDetail,
    status: 'submitted',
    createdAt: new Date().toISOString()
  };
}

export function hasRecentDuplicateReport(reports, report, { now = new Date(), windowMs = REPORT_DUPLICATE_WINDOW_MS } = {}) {
  if (!Array.isArray(reports) || !report) return false;
  const nowTime = new Date(now).getTime();
  return reports.some(item => {
    if (!item || item.reporterId !== report.reporterId) return false;
    if ((item.targetType || 'general') !== (report.targetType || 'general')) return false;
    if ((item.targetId || '') !== (report.targetId || '')) return false;
    if ((item.postId || '') !== (report.postId || '')) return false;
    if ((item.reason || 'other') !== (report.reason || 'other')) return false;
    if (cleanText(item.detail) !== cleanText(report.detail)) return false;
    const createdAt = new Date(item.createdAt || 0).getTime();
    return Number.isFinite(createdAt) && Number.isFinite(nowTime) && nowTime - createdAt >= 0 && nowTime - createdAt <= windowMs;
  });
}

export function assertReportDetailSafe(detail) {
  if (hasSensitiveReportDetail(detail)) {
    throw new ValidationError('投诉说明不能包含密码、验证码、token、cookie、私钥、身份证等敏感信息');
  }
}

export function hasSensitiveReportDetail(detail) {
  return SENSITIVE_REPORT_PATTERN.test(String(detail || ''));
}

export function sanitizeReportDetail(detail) {
  const cleanedDetail = cleanText(detail);
  return hasSensitiveReportDetail(cleanedDetail) ? '[已移除敏感信息，请通过客服渠道补充脱敏说明]' : cleanedDetail;
}

export function reportTargetLabel(targetType) {
  if (targetType === 'post') return '暖窝动态';
  if (targetType === 'comment') return '评论';
  return '反馈与投诉';
}
