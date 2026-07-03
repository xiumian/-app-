import { closeSheet, openSheet, replaceState, resetState, saveState, state, storageStatus } from './core/state.js';
import { uid, offsetDate } from './core/utils.js';
import { currentUser, selectedPet } from './core/selectors.js';
import { canAccessPet, canAccessPetResource, canAccessPost, canDeleteComment } from './core/policies.js';
import { captureException, getMonitoringStatus } from './core/monitoring.js';
import { authRepository } from './repositories/authRepository.js';
import { appStateRepository } from './repositories/appStateRepository.js';
import { createDemoPet, createPetFromForm, deletePetCascade } from './domain/pets.js';
import { createCheckin, deleteCheckinById, ensureDefaultCheckins, hasCheckinTitleToday, setTodayCheckinsDone, toggleCheckinDone } from './domain/checkins.js';
import { createPresetReminder, createReminder, hasOpenReminder, REMINDER_PRESETS } from './domain/reminders.js';
import { createCapsule } from './domain/capsules.js';
import { createCareRecord, createWeightRecord } from './domain/records.js';
import { createComment, createPost, togglePostLike } from './domain/posts.js';
import { createReport, hasRecentDuplicateReport, reportTargetLabel, sanitizeReportDetail } from './domain/reports.js';
import { createStateBackup, sanitizeStateForRestore, validateStateBackup } from './domain/backups.js';
import { createRemoteSession, getSessionStatus } from './domain/sessions.js';
import { upsertRemoteUser } from './domain/users.js';
import { ValidationError, optionalText, requiredDate, requiredText, selectedValue, validateImageFile } from './core/validation.js';
import { toast } from './ui/toast.js';
import { drawVisibleCharts } from './ui/charts.js';
import { renderApp } from './ui/views.js';
import { renderRuntimeError } from './ui/components.js';
import { runWithRemoteRefresh } from './core/remoteSync.js';
import { deleteRemoteMedia, hasRemoteMediaApi, uploadRemoteMedia } from './api/mediaClient.js';
import { ApiError } from './api/client.js';
import { deleteRemoteAccount, exportRemoteAccount } from './api/accountClient.js';
import { acceptLegalConsent, getLegalConsentStatus, hasAcceptedLegalConsent } from './domain/consent.js';
import { assertSupportDiagnosticsSafe, createSupportDiagnostics } from './domain/diagnostics.js';
import { applyPwaUpdate, checkForPwaUpdate, registerPwaUpdate } from './core/pwaUpdate.js';
import { APP_IS_PRODUCTION, OPERATOR_NAME, SUPPORT_CONTACT_LABEL, SUPPORT_CONTACT_URL, SUPPORT_EMAIL } from './core/config.js';

const appEl = document.querySelector('#app');
let pendingConfirmAction = null;

function render() {
  try {
    appEl.innerHTML = renderApp();
    requestAnimationFrame(drawVisibleCharts);
  } catch (error) {
    console.error(error);
    captureException(error, { source: 'render' });
    appEl.innerHTML = renderRuntimeError();
    toast('页面加载异常，已进入保护视图');
  }
}

function reportError(error) {
  if (error instanceof ValidationError) {
    toast(error.message);
    return;
  }
  if (error instanceof ApiError && error.code === 'RATE_LIMITED') {
    const retryText = error.retryAfterSeconds ? `，约 ${error.retryAfterSeconds} 秒后再试` : '，请稍后再试';
    toast(`请求过于频繁${retryText}`, { durationMs: 4000 });
    return;
  }
  if (error instanceof ApiError) {
    if (error.status >= 500 || ['API_TIMEOUT', 'NETWORK_ERROR'].includes(error.code)) {
      captureException(error, { source: 'api-error', detail: { status: error.status, code: error.code, requestId: error.requestId } });
    }
    toast(error.message || '远端服务请求失败');
    return;
  }
  console.error(error);
  captureException(error, { source: 'interaction' });
  toast('操作失败，请稍后重试');
}

function setFormSubmitting(form, isSubmitting) {
  if (isSubmitting) {
    form.dataset.submitting = 'true';
    form.setAttribute('aria-busy', 'true');
  } else {
    delete form.dataset.submitting;
    form.removeAttribute('aria-busy');
  }

  form.querySelectorAll('button[type="submit"], input[type="submit"]').forEach(control => {
    if (isSubmitting) {
      if (control.disabled) control.dataset.wasDisabled = 'true';
      control.disabled = true;
      return;
    }
    if (control.dataset.wasDisabled === 'true') {
      delete control.dataset.wasDisabled;
      return;
    }
    control.disabled = false;
  });
}

function denyAccess() {
  toast('无权操作这份数据');
}

function requestDangerConfirm({ title, message, confirmLabel = '确认删除', requiresPassword = false, passwordLabel = '当前密码', onConfirm }) {
  pendingConfirmAction = onConfirm;
  state.ui.sheet = 'confirm';
  state.ui.confirm = { title, message, confirmLabel, requiresPassword, passwordLabel };
  render();
}

function cancelDangerConfirm() {
  pendingConfirmAction = null;
  closeSheet();
  render();
}

async function runDangerConfirm(payload = {}) {
  const action = pendingConfirmAction;
  pendingConfirmAction = null;
  closeSheet();
  if (typeof action === 'function') await action(payload);
}

async function submitPasswordConfirm(form) {
  const fd = new FormData(form);
  const password = requiredText(fd, 'password', '当前密码', { max: 128 });
  await runDangerConfirm({ password });
}

function requirePetAccess(petId) {
  if (canAccessPet(state, petId)) return true;
  denyAccess();
  return false;
}

function requireRemoteSession() {
  if (state.session?.authMode === 'remote' && state.session?.accessToken) return true;
  toast('请先登录远端账号');
  return false;
}

function requireLegalConsent(form = null, source = 'auth') {
  if (hasAcceptedLegalConsent(state)) return true;
  const checkbox = form?.querySelector('[name="legalConsent"]') || document.querySelector('[name="legalConsent"]');
  if (!checkbox?.checked) {
    toast('请先阅读并同意用户协议和隐私政策');
    return false;
  }
  acceptLegalConsent({ state, source: checkbox.dataset.consentSource || source });
  saveState();
  return true;
}

async function runRemoteWithRefresh(operation) {
  return runWithRemoteRefresh({
    getSession: () => state.session,
    refreshSession: session => authRepository.refreshRemote(session),
    saveSession: nextSession => {
      state.session = nextSession;
      saveState();
    },
    operation
  });
}

function handleLogin(form) {
  if (!requireLegalConsent(form, 'local-login')) return;
  const fd = new FormData(form);
  const { user } = authRepository.signInLocal({
    state,
    uid,
    name: requiredText(fd, 'name', '昵称', { max: 20 }),
    account: requiredText(fd, 'account', '账号/手机号', { max: 40 })
  });

  state.activeTab = 'home';
  saveState();
  render();
  toast('已进入宠伴记');
}

function applyRemoteAuth(payload, message) {
  const data = payload?.data || payload;
  if (!data?.user || !data?.session) throw new Error('远端登录响应不完整');
  const user = upsertRemoteUser({ state, user: data.user });
  state.currentUserId = user.id;
  state.session = createRemoteSession({ uid, user, session: data.session });
  state.activeTab = 'home';
  saveState();
  render();
  toast(message);
}

async function handleRemoteRegister(form) {
  if (!requireLegalConsent(form, 'remote-register')) return;
  const fd = new FormData(form);
  const result = await authRepository.registerRemote({
    name: requiredText(fd, 'name', '昵称', { max: 20 }),
    account: requiredText(fd, 'account', '账号/手机号', { max: 80 }),
    password: requiredText(fd, 'password', '密码', { max: 128 })
  });
  applyRemoteAuth(result, '注册成功，已登录');
}

async function handleRemoteLogin(form) {
  if (!requireLegalConsent(form, 'remote-login')) return;
  const fd = new FormData(form);
  const result = await authRepository.signInRemote({
    account: requiredText(fd, 'account', '账号/手机号', { max: 80 }),
    password: requiredText(fd, 'password', '密码', { max: 128 })
  });
  applyRemoteAuth(result, '远端登录成功');
}

async function handleLogout() {
  const wasRemote = state.session?.authMode === 'remote' && state.session?.refreshToken;
  if (wasRemote) {
    try {
      await authRepository.signOutRemote(state.session);
    } catch (error) {
      captureException(error, { source: 'remote-sign-out' });
    }
  }
  authRepository.signOut({ state });
  saveState();
  render();
  toast('已退出账号');
}

async function pushRemoteState() {
  if (!requireRemoteSession()) return;
  await runRemoteWithRefresh(() => appStateRepository.pushRemote(state));
  toast('本地数据已上传云端');
}

async function pullRemoteState() {
  if (!requireRemoteSession()) return;
  const result = await runRemoteWithRefresh(() => appStateRepository.pullRemote(state.session));
  if (!result?.state) throw new Error('云端状态为空');
  const currentSession = state.session;
  replaceState({
    ...result.state,
    currentUserId: currentSession.userId,
    session: currentSession,
    ui: { sheet: null, detailPetId: null }
  });
  render();
  toast('已拉取云端数据');
}

async function createRemoteBackup() {
  if (!requireRemoteSession()) return;
  const result = await runRemoteWithRefresh(() => appStateRepository.createRemoteBackup(state));
  toast(result?.backupId ? `云备份已创建：${result.backupId.slice(0, 12)}` : '云备份已创建');
}

function downloadJsonFile(payload, fileName) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function exportFileStamp(date = new Date()) { return date.toISOString().replace(/[:.]/g, '-'); }

async function exportAccountData() {
  if (!requireRemoteSession()) return;
  const data = await runRemoteWithRefresh(() => exportRemoteAccount(state.session));
  downloadJsonFile(data, `pet-companion-account-${exportFileStamp()}.json`);
  toast('账号数据导出已生成');
}

function exportLocalBackup() {
  const backup = createStateBackup(state);
  downloadJsonFile(backup, `pet-companion-local-backup-${exportFileStamp()}.json`);
  toast('本机备份已导出，token 不会写入备份');
}

async function importLocalBackup(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    input.value = '';
    throw new ValidationError('备份文件过大，请选择 5MB 以内的 JSON 备份');
  }
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    input.value = '';
    throw new ValidationError('备份文件不是有效 JSON');
  }
  input.value = '';
  if (!validateStateBackup(payload)) {
    throw new ValidationError('备份格式不正确，无法恢复');
  }
  requestDangerConfirm({
    title: '恢复本机备份',
    message: '恢复会覆盖当前浏览器里的本机数据。建议先导出当前本机备份，再继续恢复。',
    confirmLabel: '确认恢复',
    onConfirm: () => {
      replaceState(sanitizeStateForRestore(payload.state));
      render();
      toast('本机备份已恢复');
    }
  });
}

function exportSupportDiagnostics() {
  const diagnostics = createSupportDiagnostics({
    state,
    storageStatus,
    monitoringStatus: getMonitoringStatus(),
    sessionStatus: getSessionStatus(state.session),
    consentStatus: getLegalConsentStatus(state),
    environment: {
      path: location.pathname,
      userAgent: navigator.userAgent,
      language: navigator.language,
      online: navigator.onLine
    }
  });
  const safety = assertSupportDiagnosticsSafe(diagnostics);
  if (!safety.safe) {
    captureException(new Error('Unsafe support diagnostics blocked'), { source: 'support-diagnostics', detail: { fields: safety.unsafe } });
    toast('诊断包包含敏感字段，已阻止导出');
    return;
  }
  downloadJsonFile(diagnostics, `pet-companion-diagnostics-${exportFileStamp()}.json`);
  toast('脱敏诊断包已生成');
}

function isSafeSupportUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isSafeSupportEmail(value) {
  const email = String(value || '').trim();
  return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email) && !email.includes('..');
}

function supportExportContact() {
  const url = isSafeSupportUrl(SUPPORT_CONTACT_URL) ? SUPPORT_CONTACT_URL : '';
  const email = isSafeSupportEmail(SUPPORT_EMAIL) ? SUPPORT_EMAIL : '';
  return {
    operatorName: OPERATOR_NAME || '待配置',
    label: SUPPORT_CONTACT_LABEL || '客服入口',
    url,
    email,
    configured: Boolean(url || email)
  };
}

function exportUserReports() {
  const reports = state.reports
    .filter(report => report.reporterId === state.currentUserId)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .map(report => ({
      id: report.id,
      targetType: report.targetType,
      targetId: report.targetId,
      postId: report.postId,
      reason: report.reason,
      reasonLabel: report.reasonLabel,
      detail: sanitizeReportDetail(report.detail),
      status: report.status,
      createdAt: report.createdAt
    }));
  if (!reports.length) {
    toast('暂无投诉记录可导出');
    return;
  }
  const exportedAt = new Date();
  downloadJsonFile({
    schema: 'pet-companion-report-export-v1',
    exportedAt: exportedAt.toISOString(),
    userId: state.currentUserId,
    count: reports.length,
    newestAt: reports[0]?.createdAt || null,
    oldestAt: reports.at(-1)?.createdAt || null,
    support: supportExportContact(),
    followUp: '请将编号和导出文件交给运营与客服渠道跟进；不要额外粘贴密码、验证码、token、cookie、私钥或身份证。',
    reports
  }, `pet-companion-reports-${exportFileStamp(exportedAt)}.json`);
  toast('投诉记录导出已生成');
}

function copyTextFallback(text) {
  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', 'readonly');
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  document.body.appendChild(input);
  input.select();
  try {
    return document.execCommand('copy');
  } finally {
    input.remove();
  }
}

async function copyReportId(reportId) {
  const report = state.reports.find(item => item.id === reportId && item.reporterId === state.currentUserId);
  if (!report) {
    toast('未找到这条投诉记录');
    return;
  }
  const text = report.id;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else if (!copyTextFallback(text)) {
      throw new Error('clipboard unavailable');
    }
    toast(`已复制投诉编号 ${text}`);
  } catch {
    toast(`投诉编号：${text}`);
  }
}

async function copyReportBrief(reportId) {
  const report = state.reports.find(item => item.id === reportId && item.reporterId === state.currentUserId);
  if (!report) {
    toast('未找到这条投诉记录');
    return;
  }
  const text = [
    `投诉编号：${report.id}`,
    `对象：${reportTargetLabel(report.targetType)}${report.targetId ? ` / ${report.targetId}` : ''}`,
    `问题类型：${report.reasonLabel || '其他问题'}`,
    `提交时间：${report.createdAt || '未记录'}`,
    `补充说明：${sanitizeReportDetail(report.detail) || '无'}`,
    '提醒：请勿补充密码、验证码、token、cookie、私钥或身份证等敏感信息。'
  ].join('\n');
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else if (!copyTextFallback(text)) {
      throw new Error('clipboard unavailable');
    }
    toast('已复制客服跟进说明');
  } catch {
    toast('复制失败，请导出投诉记录后联系客服');
  }
}

function openReportSheet(target) {
  state.ui.reportTarget = {
    type: target.type || 'general',
    id: target.id || '',
    postId: target.postId || ''
  };
  openSheet('report');
  render();
}

function reportRecordName(report) {
  return report?.targetType === 'general' ? '反馈记录' : `${reportTargetLabel(report?.targetType)}投诉记录`;
}

function submitReport(form) {
  const fd = new FormData(form);
  const report = createReport({
    uid,
    reporterId: state.currentUserId,
    targetType: selectedValue(fd, 'targetType', '投诉对象'),
    targetId: optionalText(fd, 'targetId', '投诉对象 ID', { max: 80 }),
    postId: optionalText(fd, 'postId', '动态 ID', { max: 80 }),
    reason: selectedValue(fd, 'reason', '问题类型'),
    detail: optionalText(fd, 'detail', '补充说明', { max: 300 })
  });
  if (hasRecentDuplicateReport(state.reports, report)) {
    throw new ValidationError('10 分钟内已提交过相同反馈，请勿重复提交');
  }
  state.reports.push(report);
  closeSheet();
  saveState();
  render();
  toast(`${reportRecordName(report)}已保存，编号 ${report.id}，请联系运营客服跟进`);
}

async function checkAppUpdate() {
  const status = await checkForPwaUpdate();
  render();
  if (!status.supported) return toast('当前环境不支持 PWA 更新检查');
  if (status.error) return toast(`更新检查失败：${status.error}`);
  toast(status.updateAvailable ? '发现新版本，可点击应用更新' : '当前已是最新版本');
}

function applyAppUpdate() {
  if (!applyPwaUpdate()) return toast('暂无可应用的新版本');
  toast('正在应用新版本');
}

async function deleteRemoteAccountData() {
  if (!requireRemoteSession()) return;
  requestDangerConfirm({
    title: '注销远端账号',
    message: '将删除当前远端用户、云端状态、云备份和会话，并使旧 token 失效。这个操作不可撤销。',
    confirmLabel: '确认注销',
    requiresPassword: true,
    passwordLabel: '当前远端账号密码',
    onConfirm: async ({ password }) => {
      await runRemoteWithRefresh(() => deleteRemoteAccount({ session: state.session, password }));
      resetState();
      render();
      toast('远端账号已注销，本地会话已清空');
    }
  });
}

function seedDemo() {
  if (APP_IS_PRODUCTION) {
    toast('生产环境不提供演示数据入口，请注册或登录后添加真实宠物档案');
    return;
  }
  if (!requireLegalConsent(null, 'seed-demo')) return;
  let user = currentUser();
  if (!user) {
    user = authRepository.signInLocal({ state, uid, name: '主人', account: 'demo' }).user;
  }

  const pet = createDemoPet({ uid, ownerId: user.id });
  const petId = pet.id;
  state.pets.push(pet);
  state.selectedPetId = petId;
  ensureDefaultCheckins({ state, uid, petId });

  state.reminders.push(
    createReminder({ uid, petId, type: '驱虫', title: '体内驱虫', dueDate: offsetDate(1), note: '提前一天提醒。', icon: '🪱' }),
    createReminder({ uid, petId, type: '疫苗', title: '年度疫苗复查', dueDate: offsetDate(21), note: '带疫苗本。', icon: '💉' })
  );

  [3.9, 4.0, 4.1, 4.2].forEach((weight, index) => {
    state.records.push(createWeightRecord({ uid, petId, weight, daysOffset: -30 + index * 10 }));
  });

  state.posts.push(createPost({
    uid,
    authorId: user.id,
    petId,
    content: '奶盖今天换粮第三天，精神状态稳定，便便稍微软。'
  }));

  state.activeTab = 'home';
  saveState();
  render();
  toast('演示数据已加入');
}

async function submitPet(form) {
  const fd = new FormData(form);
  const avatarFile = fd.get('avatarImage');
  const avatarImage = avatarFile?.size
    ? await storePhotoImage(validateImageFile(avatarFile), `${requiredText(fd, 'name', '宠物名', { max: 20 })}头像`)
    : '';
  const pet = createPetFromForm({ uid, ownerId: state.currentUserId, formData: fd, avatarImage });
  state.pets.push(pet);
  state.selectedPetId = pet.id;
  ensureDefaultCheckins({ state, uid, petId: pet.id });
  saveState();
  render();
  toast(avatarImage ? '宠物档案和真实头像已保存' : '宠物档案已保存');
}

function submitReminder(form) {
  const fd = new FormData(form);
  const petId = selectedValue(fd, 'petId', '宠物');
  if (!requirePetAccess(petId)) return;
  state.reminders.push(createReminder({
    uid,
    petId,
    type: selectedValue(fd, 'type', '类型'),
    title: requiredText(fd, 'title', '标题', { max: 40 }),
    dueDate: requiredDate(fd, 'dueDate', '到期日期'),
    note: optionalText(fd, 'note', '备注', { max: 120 })
  }));
  saveState();
  render();
  toast('提醒已添加');
}

function submitReminderSheet(form) {
  const pet = selectedPet();
  if (!pet) return toast('请先添加宠物');
  const fd = new FormData(form);
  state.reminders.push(createReminder({
    uid,
    petId: pet.id,
    type: selectedValue(fd, 'type', '类型') || '自定义',
    title: requiredText(fd, 'title', '提醒名称', { max: 40 }),
    dueDate: requiredDate(fd, 'dueDate', '提醒日期'),
    note: optionalText(fd, 'note', '备注', { max: 120 }),
    icon: optionalText(fd, 'icon', '图标', { max: 4, fallback: '🔔' })
  }));
  saveState();
  render();
  toast('健康提醒已创建');
}


function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('\u56fe\u7247\u8bfb\u53d6\u5931\u8d25'));
    reader.readAsDataURL(file);
  });
}

async function storePhotoImage(file, title) {
  const dataUrl = await readFileAsDataUrl(file);
  if (state.session?.authMode === 'remote' && state.session?.accessToken && hasRemoteMediaApi()) {
    const media = await runRemoteWithRefresh(() => uploadRemoteMedia({ dataUrl, fileName: file.name, title }, state.session));
    return media.url;
  }
  return dataUrl;
}

function isRemoteStoredImage(value) {
  const text = String(value || '').trim();
  return Boolean(text) && !text.startsWith('data:');
}

async function deleteStoredMediaUrls(urls) {
  if (state.session?.authMode !== 'remote' || !state.session?.accessToken || !hasRemoteMediaApi()) return;
  const uniqueUrls = [...new Set(urls.filter(isRemoteStoredImage))];
  for (const url of uniqueUrls) {
    await runRemoteWithRefresh(() => deleteRemoteMedia({ url }, state.session));
  }
}

function updatePetBirthdayFields(form) {
  const mode = form.querySelector('[data-role="birthday-mode"]')?.value || 'birthday';
  const dateInput = form.querySelector('[data-role="birthday-date"]');
  const label = form.querySelector('[data-role="birthday-date-label"]');
  const hint = form.querySelector('[data-role="birthday-date-hint"]');
  const field = dateInput?.closest('.birthday-date-field');
  if (!dateInput || !label || !hint || !field) return;

  if (mode === 'unknown') {
    dateInput.value = '';
    dateInput.disabled = true;
    label.textContent = '日期';
    hint.textContent = '已选择生日未知，建档时不会强制记录日期。';
    field.classList.add('is-disabled');
    return;
  }

  dateInput.disabled = false;
  field.classList.remove('is-disabled');
  if (mode === 'adoption') {
    label.textContent = '领养日';
    hint.textContent = '不知道生日时，可以只记录带回家的日子。';
    return;
  }

  label.textContent = '生日';
  hint.textContent = '知道生日就填写；不知道可以切到“生日未知”。';
}

async function updatePetAvatarPreview(input) {
  const preview = input.closest('.avatar-upload-field')?.querySelector('[data-role="avatar-preview"]');
  if (!preview) return;
  if (!input.files?.length) {
    preview.innerHTML = '<span>预览</span>';
    return;
  }
  const file = validateImageFile(input.files[0]);
  const dataUrl = await readFileAsDataUrl(file);
  preview.innerHTML = `<img src="${dataUrl}" alt="头像预览" />`;
}

async function updatePostImagePreview(input) {
  const preview = input.form?.querySelector('[data-role="post-image-preview"]');
  if (!preview) return;
  if (!input.files?.length) {
    preview.hidden = true;
    preview.innerHTML = '';
    return;
  }
  const file = validateImageFile(input.files[0]);
  const dataUrl = await readFileAsDataUrl(file);
  preview.hidden = false;
  preview.innerHTML = `<img src="${dataUrl}" alt="动态图片预览" /><span>${file.name}</span>`;
}

function resetPostImagePreview(form) {
  const preview = form.querySelector('[data-role="post-image-preview"]');
  if (!preview) return;
  preview.hidden = true;
  preview.innerHTML = '';
}

function submitRecord(form) {
  const fd = new FormData(form);
  const petId = selectedValue(fd, 'petId', '宠物');
  if (!requirePetAccess(petId)) return;
  const value = requiredText(fd, 'value', '数值/描述', { max: 60 });
  const type = selectedValue(fd, 'type', '类型');
  state.records.push(createCareRecord({
    uid,
    petId,
    type,
    value,
    happenedAt: fd.get('happenedAt'),
    note: optionalText(fd, 'note', '备注', { max: 120 })
  }));
  saveState();
  render();
  toast('护理记录已保存');
}

async function submitPhoto(form) {
  const fd = new FormData(form);
  const petId = selectedValue(fd, 'petId', '\u5ba0\u7269');
  if (!requirePetAccess(petId)) return;
  const title = requiredText(fd, 'title', '\u80f6\u56ca\u6807\u9898', { max: 40 });
  const file = validateImageFile(fd.get('image'));
  const imageData = await storePhotoImage(file, title);

  state.photos.push(createCapsule({
    uid,
    petId,
    title,
    imageData
  }));
  saveState();
  render();
  toast(imageData.startsWith('data:') ? '\u6210\u957f\u80f6\u56ca\u5df2\u4fdd\u5b58' : '\u56fe\u7247\u5df2\u4e0a\u4f20\uff0c\u6210\u957f\u80f6\u56ca\u5df2\u4fdd\u5b58');
}

async function submitPost(form) {
  const fd = new FormData(form);
  const petId = selectedValue(fd, 'petId', '宠物');
  if (!requirePetAccess(petId)) return;
  const imageFile = fd.get('image');
  const imageData = imageFile?.size
    ? await storePhotoImage(validateImageFile(imageFile), `post-${petId}`)
    : '';
  state.posts.push(createPost({
    uid,
    authorId: state.currentUserId,
    petId,
    content: requiredText(fd, 'content', '动态内容', { max: 280 }),
    imageData
  }));
  saveState();
  render();
  toast(imageData ? '图文动态已发布' : '动态已发布');
}

function submitComment(form) {
  const post = state.posts.find(item => item.id === form.dataset.postId);
  const content = requiredText(new FormData(form), 'content', '评论内容', { max: 100 });
  if (!post) return;
  if (!canAccessPost(state, post)) return denyAccess();
  post.comments.push(createComment({ uid, authorId: state.currentUserId, content }));
  saveState();
  render();
  toast('评论已发布');
}

function submitCheckin(form) {
  const pet = selectedPet();
  if (!pet) return toast('请先添加宠物');
  const fd = new FormData(form);
  const title = requiredText(fd, 'title', '打卡项目', { max: 24 });
  if (hasCheckinTitleToday({ state, petId: pet.id, title })) return toast('今天已经有这个打卡项');
  state.checkins.push(createCheckin({
    state,
    uid,
    petId: pet.id,
    icon: optionalText(fd, 'icon', '图标', { max: 4, fallback: '🐾' }),
    title,
    time: optionalText(fd, 'time', '时间', { max: 12, fallback: '全天' })
  }));
  saveState();
  render();
  toast('打卡项已创建');
}

function addPresetCheckin(target) {
  const pet = selectedPet();
  if (!pet) return toast('请先添加宠物');
  const title = target.dataset.title;
  if (hasCheckinTitleToday({ state, petId: pet.id, title })) return toast('今天已经有这个打卡项');
  state.checkins.push(createCheckin({
    state,
    uid,
    petId: pet.id,
    icon: target.dataset.icon,
    title,
    time: target.dataset.time
  }));
  saveState();
  render();
  toast('已加入今日打卡');
}

function setAllTodayCheckins(done) {
  const pet = selectedPet();
  if (!pet) return toast('请先添加宠物');
  const changed = setTodayCheckinsDone({ state, petId: pet.id, done });
  if (!changed) return toast(done ? '今日打卡已经全部完成' : '今日打卡已经全部是待办');
  saveState();
  render();
  toast(done ? '今日打卡已全部完成' : '今日打卡已重置为待办');
}

function addPresetReminder(target) {
  const pet = selectedPet();
  if (!pet) return toast('请先添加宠物');
  const preset = REMINDER_PRESETS.find(item => item.type === target.dataset.type);
  if (!preset) return toast('提醒预设不存在');
  if (hasOpenReminder({ state, petId: pet.id, title: preset.title, type: preset.type })) {
    return toast('已有同类待完成提醒');
  }
  state.reminders.push(createPresetReminder({ uid, petId: pet.id, preset }));
  saveState();
  render();
  toast('已加入健康提醒');
}

function deletePet(id) {
  if (!requirePetAccess(id)) return;
  const pet = state.pets.find(item => item.id === id);
  const mediaUrls = [
    pet?.avatarImage,
    ...state.photos.filter(photo => photo.petId === id).map(photo => photo.imageData),
    ...state.posts.filter(post => post.petId === id).map(post => post.imageData)
  ];
  requestDangerConfirm({
    title: '删除宠物档案',
    message: '关联的提醒、记录、照片、打卡和暖窝动态也会一起删除。若照片或动态图片已上传云端，也会同步删除远端图片文件。删除后无法从本机恢复。',
    confirmLabel: '删除档案',
    onConfirm: async () => {
      await deleteStoredMediaUrls(mediaUrls);
      const removed = deletePetCascade({ state, petId: id });
      if (!removed.deleted) return toast('宠物档案不存在');
      saveState();
      render();
      const related = removed.reminders + removed.records + removed.photos + removed.posts + removed.checkins;
      toast(related ? `宠物档案已删除，并清理 ${related} 条关联数据` : '宠物档案已删除');
    }
  });
}

function toggleReminder(id) {
  const item = state.reminders.find(reminder => reminder.id === id);
  if (!canAccessPetResource(state, item)) return denyAccess();
  if (item) item.done = !item.done;
  saveState();
  render();
}

function deleteReminder(id) {
  const item = state.reminders.find(reminder => reminder.id === id);
  if (!canAccessPetResource(state, item)) return denyAccess();
  requestDangerConfirm({
    title: '删除健康提醒',
    message: `将删除“${item.title || '健康提醒'}”，删除后不会再提醒。`,
    confirmLabel: '删除提醒',
    onConfirm: () => {
      state.reminders = state.reminders.filter(reminder => reminder.id !== id);
      saveState();
      render();
      toast('提醒已删除');
    }
  });
}

function deleteCheckin(id) {
  const item = state.checkins.find(checkin => checkin.id === id);
  if (!canAccessPetResource(state, item)) return denyAccess();
  requestDangerConfirm({
    title: '删除打卡项',
    message: `将删除“${item.title || '打卡项'}”，今天的完成状态也会移除。`,
    confirmLabel: '删除打卡',
    onConfirm: () => {
      deleteCheckinById({ state, id });
      saveState();
      render();
      toast('打卡项已删除');
    }
  });
}

function toggleLike(id) {
  const post = state.posts.find(item => item.id === id);
  if (!post) return;
  if (!canAccessPost(state, post)) return denyAccess();
  togglePostLike({ post, userId: state.currentUserId });
  saveState();
  render();
}

function deletePost(id) {
  const post = state.posts.find(item => item.id === id);
  if (!canAccessPost(state, post)) return denyAccess();
  requestDangerConfirm({
    title: '删除暖窝动态',
    message: '这条动态和下面的评论会一起删除，删除后无法从本机恢复。',
    confirmLabel: '删除动态',
    onConfirm: async () => {
      await deleteStoredMediaUrls([post.imageData]);
      state.posts = state.posts.filter(item => item.id !== id);
      saveState();
      render();
      toast('暖窝动态已删除');
    }
  });
}

function deleteComment({ postId, commentId }) {
  const post = state.posts.find(item => item.id === postId);
  const comment = post?.comments.find(item => item.id === commentId);
  if (!canDeleteComment(state, post, comment)) return denyAccess();
  requestDangerConfirm({
    title: '删除评论',
    message: '这条评论会从动态下移除，删除后无法从本机恢复。',
    confirmLabel: '删除评论',
    onConfirm: () => {
      post.comments = post.comments.filter(item => item.id !== commentId);
      saveState();
      render();
      toast('评论已删除');
    }
  });
}

function deleteRecord(id) {
  const item = state.records.find(record => record.id === id);
  if (!canAccessPetResource(state, item)) return denyAccess();
  requestDangerConfirm({
    title: '删除护理记录',
    message: `将删除“${item.type || '护理'} · ${item.value || '记录'}”，删除后无法从本机恢复。`,
    confirmLabel: '删除记录',
    onConfirm: () => {
      state.records = state.records.filter(record => record.id !== id);
      saveState();
      render();
      toast('护理记录已删除');
    }
  });
}

function deletePhoto(id) {
  const item = state.photos.find(photo => photo.id === id);
  if (!canAccessPetResource(state, item)) return denyAccess();
  requestDangerConfirm({
    title: '删除成长胶囊照片',
    message: `将删除“${item.title || '这张照片'}”。若照片已上传云端，也会同步删除远端图片文件。删除后无法从本机恢复。`,
    confirmLabel: '删除照片',
    onConfirm: async () => {
      await deleteStoredMediaUrls([item.imageData]);
      state.photos = state.photos.filter(photo => photo.id !== id);
      saveState();
      render();
      toast('成长胶囊照片已删除');
    }
  });
}

function clearData() {
  requestDangerConfirm({
    title: '清空本地数据',
    message: '会清空本浏览器内的宠物档案、提醒、记录、照片、动态和本地会话。远端数据不会自动删除。',
    confirmLabel: '清空本机',
    onConfirm: () => {
      resetState();
      render();
      toast('本地数据已清空');
    }
  });
}

document.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  if (form.dataset.submitting === 'true') return;
  setFormSubmitting(form, true);
  try {
    if (form.id === 'remote-register-form') return await handleRemoteRegister(form);
    if (form.id === 'remote-login-form') return await handleRemoteLogin(form);
    if (form.id === 'confirm-password-form') return await submitPasswordConfirm(form);
    if (form.id === 'login-form') return handleLogin(form);
    if (form.id === 'pet-form') return await submitPet(form);
    if (form.id === 'reminder-form') return submitReminder(form);
    if (form.id === 'reminder-sheet-form') return submitReminderSheet(form);
    if (form.id === 'record-form') return submitRecord(form);
    if (form.id === 'photo-form') return await submitPhoto(form);
    if (form.id === 'post-form') return await submitPost(form);
    if (form.id === 'report-form') return submitReport(form);
    if (form.id === 'checkin-form') return submitCheckin(form);
    if (form.classList.contains('comment-form')) return submitComment(form);
  } catch (error) {
    reportError(error);
  } finally {
    if (form.isConnected) setFormSubmitting(form, false);
  }
});

document.addEventListener('change', async event => {
  const birthdayMode = event.target.closest('[data-role="birthday-mode"]');
  if (birthdayMode) {
    updatePetBirthdayFields(birthdayMode.form);
    return;
  }

  const avatarInput = event.target.closest('[data-role="avatar-image-input"]');
  if (avatarInput) {
    try {
      await updatePetAvatarPreview(avatarInput);
    } catch (error) {
      avatarInput.value = '';
      const preview = avatarInput.closest('.avatar-upload-field')?.querySelector('[data-role="avatar-preview"]');
      if (preview) preview.innerHTML = '<span>预览</span>';
      reportError(error);
    }
  }

  const postImageInput = event.target.closest('[data-role="post-image-input"]');
  if (postImageInput) {
    try {
      await updatePostImagePreview(postImageInput);
    } catch (error) {
      postImageInput.value = '';
      resetPostImagePreview(postImageInput.form);
      reportError(error);
    }
  }

  const backupInput = event.target.closest('[data-role="local-backup-input"]');
  if (backupInput) {
    try {
      await importLocalBackup(backupInput);
    } catch (error) {
      reportError(error);
    }
  }
});

document.addEventListener('click', async event => {
  const sheetPanel = event.target.closest('[data-sheet-panel]');
  if (event.target.matches('.sheet-backdrop') && !sheetPanel) {
    if (state.ui.sheet === 'confirm') pendingConfirmAction = null;
    closeSheet();
    render();
    return;
  }

  const tabButton = event.target.closest('[data-tab]');
  if (tabButton) {
    state.activeTab = tabButton.dataset.tab;
    saveState();
    render();
    return;
  }

  const panelButton = event.target.closest('[data-panel]');
  if (panelButton) {
    state.carePanel = panelButton.dataset.panel;
    saveState();
    render();
    return;
  }

  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) return;
  const id = actionEl.dataset.id;

  try {
    if (actionEl.dataset.action === 'logout') { await handleLogout(); return; }
    if (actionEl.dataset.action === 'cancel-confirm') { cancelDangerConfirm(); return; }
    if (actionEl.dataset.action === 'confirm-danger') { await runDangerConfirm(); return; }
    if (actionEl.dataset.action === 'push-remote-state') { await pushRemoteState(); return; }
    if (actionEl.dataset.action === 'pull-remote-state') { await pullRemoteState(); return; }
    if (actionEl.dataset.action === 'create-remote-backup') { await createRemoteBackup(); return; }
    if (actionEl.dataset.action === 'export-account-data') { await exportAccountData(); return; }
    if (actionEl.dataset.action === 'export-local-backup') { exportLocalBackup(); return; }
    if (actionEl.dataset.action === 'export-support-diagnostics') { exportSupportDiagnostics(); return; }
    if (actionEl.dataset.action === 'export-reports') { exportUserReports(); return; }
    if (actionEl.dataset.action === 'copy-report-id') { await copyReportId(id); return; }
    if (actionEl.dataset.action === 'copy-report-brief') { await copyReportBrief(id); return; }
    if (actionEl.dataset.action === 'check-pwa-update') { await checkAppUpdate(); return; }
    if (actionEl.dataset.action === 'apply-pwa-update') { applyAppUpdate(); return; }
    if (actionEl.dataset.action === 'delete-remote-account') { await deleteRemoteAccountData(); return; }
    if (actionEl.dataset.action === 'retry-render') render();
    if (actionEl.dataset.action === 'seed-demo') seedDemo();
    if (actionEl.dataset.action === 'open-legal-sheet') { openSheet('legal'); render(); }
    if (actionEl.dataset.action === 'open-report-sheet') { openReportSheet({ type: actionEl.dataset.reportType || 'general', id, postId: actionEl.dataset.postId || '' }); return; }
    if (actionEl.dataset.action === 'accept-legal-consent') { acceptLegalConsent({ state, source: 'legal-sheet' }); closeSheet(); saveState(); render(); toast('已记录协议与隐私政策同意'); }
    if (actionEl.dataset.action === 'open-checkin-sheet') { openSheet('checkins'); render(); }
    if (actionEl.dataset.action === 'open-reminder-sheet') { openSheet('reminders'); render(); }
    if (actionEl.dataset.action === 'open-pet-detail') {
      const petId = id || state.selectedPetId;
      if (!requirePetAccess(petId)) return;
      state.ui.detailPetId = petId; openSheet('pet-detail'); render();
    }
    if (actionEl.dataset.action === 'close-sheet') { closeSheet(); render(); }
    if (actionEl.dataset.action === 'add-checkin-preset') addPresetCheckin(actionEl);
    if (actionEl.dataset.action === 'add-reminder-preset') addPresetReminder(actionEl);
    if (actionEl.dataset.action === 'toggle-checkin') {
      const item = state.checkins.find(checkin => checkin.id === id);
      if (!canAccessPetResource(state, item)) return denyAccess();
      toggleCheckinDone({ state, id });
      saveState(); render();
    }
    if (actionEl.dataset.action === 'delete-checkin') deleteCheckin(id);
    if (actionEl.dataset.action === 'complete-all-checkins') setAllTodayCheckins(true);
    if (actionEl.dataset.action === 'reset-all-checkins') setAllTodayCheckins(false);
    if (actionEl.dataset.action === 'select-pet') { if (!requirePetAccess(id)) return; state.selectedPetId = id; ensureDefaultCheckins({ state, uid, petId: id }); saveState(); render(); toast('已切换主宠物'); }
    if (actionEl.dataset.action === 'delete-pet') deletePet(id);
    if (actionEl.dataset.action === 'delete-record') deleteRecord(id);
    if (actionEl.dataset.action === 'delete-photo') deletePhoto(id);
    if (actionEl.dataset.action === 'delete-post') deletePost(id);
    if (actionEl.dataset.action === 'delete-comment') deleteComment({ postId: actionEl.dataset.postId, commentId: id });
    if (actionEl.dataset.action === 'toggle-reminder') toggleReminder(id);
    if (actionEl.dataset.action === 'delete-reminder') deleteReminder(id);
    if (actionEl.dataset.action === 'toggle-like') toggleLike(id);
    if (actionEl.dataset.action === 'clear-data') clearData();
  } catch (error) {
    reportError(error);
  }
});

registerPwaUpdate({
  onUpdateFound: () => {
    render();
    toast('发现新版本，可在“我的”页应用更新');
  }
}).catch(error => {
  captureException(error, { source: 'pwa-update-register' });
});

window.addEventListener('error', event => {
  console.error(event.error || event.message);
  captureException(event.error || event.message, { source: 'window-error' });
  toast('运行出现异常，请重试当前操作');
});

window.addEventListener('unhandledrejection', event => {
  console.error(event.reason);
  captureException(event.reason, { source: 'unhandled-rejection' });
  toast('异步操作失败，请稍后重试');
});

render();

