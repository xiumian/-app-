import { spawnSync } from 'node:child_process';

const cases = [];

function addCase(name, code) {
  cases.push({ name, code });
}

function runCase({ name, code }) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  if (result.status === 0) {
    console.log(`PASS ${name}`);
    return true;
  }

  console.error(`FAIL ${name}`);
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return false;
}

const helpers = `
import assert from 'node:assert/strict';
class MemoryStorage {
  constructor(seed = {}) { this.store = new Map(Object.entries(seed)); }
  get length() { return this.store.size; }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null; }
  setItem(key, value) { this.store.set(key, String(value)); }
  removeItem(key) { this.store.delete(key); }
  key(index) { return Array.from(this.store.keys())[index] || null; }
  clear() { this.store.clear(); }
}
`;

addCase('validation layer', `
${helpers}
const validation = await import('./src/core/validation.js');
const fd = new FormData();
fd.set('name', ' 奶盖 ');
fd.set('date', '2026-06-28');
fd.set('weight', '4.2');
assert.equal(validation.requiredText(fd, 'name', '昵称'), '奶盖');
assert.equal(validation.requiredDate(fd, 'date', '日期'), '2026-06-28');
assert.equal(validation.optionalPositiveNumber(fd, 'weight', '体重'), 4.2);
assert.throws(() => validation.requiredText(new FormData(), 'name', '昵称'), validation.ValidationError);
const file = new File(['abc'], 'pet.png', { type: 'image/png' });
assert.equal(validation.validateImageFile(file).name, 'pet.png');
assert.equal(validation.IMAGE_UPLOAD_ACCEPT, 'image/jpeg,image/png,image/webp,image/gif');
assert.ok(validation.IMAGE_UPLOAD_HELP_TEXT.includes('5MB'));
const svg = new File(['<svg/>'], 'pet.svg', { type: 'image/svg+xml' });
assert.throws(() => validation.validateImageFile(svg), validation.ValidationError);
`);

addCase('pet birthday mode and real avatar model', `
${helpers}
const { createPetFromForm } = await import('./src/domain/pets.js');
const unknown = new FormData();
unknown.set('name', '年糕');
unknown.set('avatar', '🐱');
unknown.set('species', '猫');
unknown.set('gender', '未知');
unknown.set('birthdayMode', 'unknown');
unknown.set('birthday', '2026-06-01');
unknown.set('color', '#f2e7d9');
const pet = createPetFromForm({ uid: () => 'pet_1', ownerId: 'u1', formData: unknown, avatarImage: '/media/pet.png' });
assert.equal(pet.birthdayMode, 'unknown');
assert.equal(pet.birthday, '');
assert.equal(pet.avatarImage, '/media/pet.png');
assert.equal(pet.color, '#f2e7d9');

const adoption = new FormData();
adoption.set('name', '雪糕');
adoption.set('avatar', '🐶');
adoption.set('species', '狗');
adoption.set('gender', '弟弟');
adoption.set('birthdayMode', 'adoption');
adoption.set('birthday', '2026-05-01');
adoption.set('color', 'url(javascript:alert(1))');
const adoptedPet = createPetFromForm({ uid: () => 'pet_2', ownerId: 'u1', formData: adoption });
assert.equal(adoptedPet.birthdayMode, 'adoption');
assert.equal(adoptedPet.birthday, '2026-05-01');
assert.equal(adoptedPet.color, '#f2e7d9');
`);

addCase('deleting a pet clears owned related data only', `
${helpers}
const { deletePetCascade } = await import('./src/domain/pets.js');
const state = {
  selectedPetId: 'p1',
  ui: { sheet: 'pet-detail', detailPetId: 'p1' },
  pets: [
    { id: 'p1', ownerId: 'u1', name: '奶盖' },
    { id: 'p2', ownerId: 'u1', name: '年糕' },
    { id: 'p3', ownerId: 'u2', name: '别人家的猫' }
  ],
  reminders: [{ id: 'rm1', petId: 'p1' }, { id: 'rm2', petId: 'p2' }, { id: 'rm3', petId: 'p3' }],
  records: [{ id: 'r1', petId: 'p1' }, { id: 'r2', petId: 'p2' }, { id: 'r3', petId: 'p3' }],
  photos: [{ id: 'ph1', petId: 'p1' }, { id: 'ph2', petId: 'p2' }, { id: 'ph3', petId: 'p3' }],
  posts: [{ id: 'post1', petId: 'p1' }, { id: 'post2', petId: 'p2' }, { id: 'post3', petId: 'p3' }],
  checkins: [{ id: 'c1', petId: 'p1' }, { id: 'c2', petId: 'p2' }, { id: 'c3', petId: 'p3' }]
};
const removed = deletePetCascade({ state, petId: 'p1' });
assert.equal(removed.deleted, true);
assert.deepEqual(
  { reminders: removed.reminders, records: removed.records, photos: removed.photos, posts: removed.posts, checkins: removed.checkins },
  { reminders: 1, records: 1, photos: 1, posts: 1, checkins: 1 }
);
assert.deepEqual(state.pets.map(item => item.id), ['p2', 'p3']);
for (const key of ['reminders', 'records', 'photos', 'posts', 'checkins']) {
  assert.equal(state[key].some(item => item.petId === 'p1'), false);
  assert.equal(state[key].some(item => item.petId === 'p2'), true);
  assert.equal(state[key].some(item => item.petId === 'p3'), true);
}
assert.equal(state.selectedPetId, 'p2');
assert.equal(state.ui.detailPetId, null);
assert.equal(deletePetCascade({ state, petId: 'missing' }).deleted, false);
`);

addCase('owned records and capsules can be deleted by user action', `
${helpers}
globalThis.localStorage = new MemoryStorage();
const { state } = await import('./src/core/state.js');
const { renderApp } = await import('./src/ui/views.js');
const { readFileSync } = await import('node:fs');
state.users = [{ id: 'u1', name: '主人', account: 'demo' }];
state.currentUserId = 'u1';
state.selectedPetId = 'p1';
state.activeTab = 'care';
state.carePanel = 'records';
state.pets = [{ id: 'p1', ownerId: 'u1', name: '奶盖', species: '猫', gender: '弟弟', color: 'url(javascript:alert(1))', avatarImage: 'javascript:alert(1)' }];
state.records = [{ id: 'r1', petId: 'p1', type: '体重', value: '4.2kg', happenedAt: '2026-06-30T08:00:00.000Z', note: '稳定' }];
state.photos = [{ id: 'ph1', petId: 'p1', title: '第一次回家', imageData: 'javascript:alert(1)', createdAt: '2026-06-30T08:00:00.000Z' }];
state.reminders = [];
state.posts = [];
state.checkins = [];
const careHtml = renderApp();
assert.ok(careHtml.includes('data-action="delete-record"'));
assert.ok(careHtml.includes('删除记录'));
assert.ok(careHtml.includes('health-disclaimer'));
assert.ok(careHtml.includes('不构成兽医诊断、治疗或用药建议'));
state.activeTab = 'pets';
const petsHtml = renderApp();
assert.ok(petsHtml.includes('data-action="delete-photo"'));
assert.ok(petsHtml.includes('删除照片'));
assert.equal(petsHtml.includes('javascript:alert(1)'), false);
assert.equal(petsHtml.includes('url(javascript'), false);
assert.ok(petsHtml.includes('background:#f2e7d9'));
assert.ok(petsHtml.includes('role="img"'));
const main = readFileSync('./src/main.js', 'utf8');
assert.ok(main.includes('function deleteRecord(id)'));
assert.ok(main.includes('function deletePhoto(id)'));
assert.ok(main.includes('canAccessPetResource(state, item)'));
assert.ok(main.includes("actionEl.dataset.action === 'delete-record'"));
assert.ok(main.includes("actionEl.dataset.action === 'delete-photo'"));
`);

addCase('community posts and comments have delete controls and policy', `
${helpers}
globalThis.localStorage = new MemoryStorage();
const { state } = await import('./src/core/state.js');
const policies = await import('./src/core/policies.js');
const { renderApp } = await import('./src/ui/views.js');
const { readFileSync } = await import('node:fs');
state.users = [
  { id: 'u1', name: '主人', account: 'demo' },
  { id: 'u2', name: '访客', account: 'guest' }
];
state.currentUserId = 'u1';
state.selectedPetId = 'p1';
state.activeTab = 'community';
state.pets = [{ id: 'p1', ownerId: 'u1', name: '奶盖', species: '猫', gender: '弟弟' }];
const ownPost = {
  id: 'post1',
  authorId: 'u1',
  petId: 'p1',
  content: '今天状态很好',
  likedBy: [],
  comments: [
    { id: 'cm1', authorId: 'u1', content: '补充一下' },
    { id: 'cm2', authorId: 'u2', content: '可爱' }
  ],
  createdAt: '2026-06-30T08:00:00.000Z'
};
state.posts = [ownPost];
state.reminders = [];
state.records = [];
state.photos = [];
state.checkins = [];
const html = renderApp();
assert.ok(html.includes('data-action="delete-post"'));
assert.ok(html.includes('删除动态'));
assert.ok(html.includes('data-action="delete-comment"'));
assert.ok(html.includes('删除'));
assert.equal(policies.canAccessPost(state, ownPost), true);
assert.equal(policies.canDeleteComment(state, ownPost, ownPost.comments[0]), true);
assert.equal(policies.canDeleteComment(state, ownPost, ownPost.comments[1]), true);
state.currentUserId = 'u3';
assert.equal(policies.canAccessPost(state, ownPost), false);
assert.equal(policies.canDeleteComment(state, ownPost, ownPost.comments[1]), false);
const main = readFileSync('./src/main.js', 'utf8');
assert.ok(main.includes('function deletePost(id)'));
assert.ok(main.includes('function deleteComment({ postId, commentId })'));
assert.ok(main.includes("actionEl.dataset.action === 'delete-post'"));
assert.ok(main.includes("actionEl.dataset.action === 'delete-comment'"));
`);

addCase('feedback and complaint records are available', `
${helpers}
globalThis.localStorage = new MemoryStorage();
const { state } = await import('./src/core/state.js');
const { renderApp } = await import('./src/ui/views.js');
const reports = await import('./src/domain/reports.js');
state.users = [{ id: 'u1', name: '主人', account: 'demo' }];
state.currentUserId = 'u1';
state.selectedPetId = 'p1';
state.activeTab = 'community';
state.pets = [{ id: 'p1', ownerId: 'u1', name: '奶盖', species: '猫', gender: '弟弟' }];
state.posts = [{
  id: 'post1',
  authorId: 'u1',
  petId: 'p1',
  content: '今天状态很好',
  likedBy: [],
  comments: [{ id: 'cm1', authorId: 'u1', content: '评论内容' }],
  createdAt: '2026-06-30T08:00:00.000Z'
}];
state.reminders = [];
state.records = [];
state.photos = [];
state.checkins = [];
state.reports = [];
let html = renderApp();
assert.ok(html.includes('data-action="open-report-sheet"'));
assert.ok(html.includes('data-report-type="post"'));
assert.ok(html.includes('data-report-type="comment"'));
state.ui.sheet = 'report';
state.ui.reportTarget = { type: 'comment', id: 'cm1', postId: 'post1' };
html = renderApp();
assert.ok(html.includes('id="report-form"'));
assert.ok(html.includes('反馈与投诉'));
assert.ok(html.includes('误导性健康建议'));
assert.ok(html.includes('提交后会生成编号，便于后续沟通'));
const report = { ...reports.createReport({ uid: () => 'rpt_1', reporterId: 'u1', targetType: 'comment', targetId: 'cm1', postId: 'post1', reason: 'privacy', detail: '泄露隐私' }), createdAt: '2026-06-30T08:30:00.000Z' };
assert.equal(report.reasonLabel, '隐私泄露');
assert.equal(report.detail, '泄露隐私');
assert.equal(report.status, 'submitted');
assert.equal(reports.reportTargetLabel('post'), '暖窝动态');
const duplicate = { ...report, id: 'rpt_2', createdAt: new Date(Date.now() - 60 * 1000).toISOString() };
assert.equal(reports.hasRecentDuplicateReport([duplicate], report), true);
const oldDuplicate = { ...report, id: 'rpt_3', createdAt: new Date(Date.now() - 11 * 60 * 1000).toISOString() };
assert.equal(reports.hasRecentDuplicateReport([oldDuplicate], report), false);
assert.throws(
  () => reports.createReport({ uid: () => 'rpt_2', reporterId: 'u1', reason: 'other', detail: 'password=123456 token=pat_secret' }),
  /投诉说明不能包含/
);
state.activeTab = 'admin';
state.ui.sheet = null;
state.reports = [
  { ...report, id: 'rpt_old', createdAt: '2026-06-29T08:00:00.000Z' },
  report,
  { ...report, id: 'rpt_new', reason: 'spam', createdAt: '2026-06-30T09:30:00.000Z' },
  { ...report, id: 'rpt_mid', createdAt: '2026-06-30T09:00:00.000Z' },
  { ...report, id: 'rpt_older', createdAt: '2026-06-28T08:00:00.000Z' },
  { ...report, id: 'rpt_hidden', createdAt: '2026-06-27T08:00:00.000Z' }
];
html = renderApp();
assert.ok(html.includes('反馈记录：6'));
assert.ok(html.includes('rpt_1'));
assert.ok(html.includes('rpt_new'));
assert.ok(html.includes('最近：广告垃圾'));
assert.ok(html.indexOf('rpt_new') < html.indexOf('rpt_mid'));
assert.ok(html.indexOf('rpt_mid') < html.indexOf('rpt_1'));
assert.equal(html.includes('rpt_hidden'), false);
assert.ok(html.includes('已记录'));
assert.ok(html.includes('可以提交反馈并保存编号'));
assert.ok(html.includes('便于后续沟通'));
assert.ok(html.includes('提交反馈或投诉'));
assert.ok(html.includes('导出反馈记录'));
assert.ok(html.includes('data-action="export-reports"'));
assert.ok(html.includes('data-action="copy-report-id"'));
assert.ok(html.includes('data-action="copy-report-brief"'));
assert.ok(html.includes('复制编号'));
assert.ok(html.includes('复制客服说明'));
assert.ok(html.includes('资料与备份'));
assert.ok(html.includes('导出资料备份'));
assert.ok(html.includes('data-action="export-local-backup"'));
assert.ok(html.includes('恢复备份文件'));
assert.ok(html.includes('data-role="local-backup-input"'));
assert.ok(html.includes('恢复前建议先导出当前资料'));
assert.ok(html.includes('清空当前设备里的宠物档案、提醒、记录、照片、动态和登录状态'));
assert.ok(html.includes('清空此设备资料'));
assert.equal(html.includes('Schema v'), false);
assert.equal(html.includes('敏感字段'), false);
assert.equal(html.includes('端点：'), false);
assert.equal(html.includes('当前为本地 H5/PWA 版本，后续可接正式后端'), false);
assert.equal(html.includes('会清空本浏览器内的演示数据和恢复备份'), false);
const main = await import('node:fs').then(fs => fs.readFileSync('./src/main.js', 'utf8'));
assert.ok(main.includes('hasRecentDuplicateReport(state.reports, report)'));
assert.ok(main.includes('10 分钟内已提交过相同反馈'));
assert.ok(main.includes("编号 \${report.id}"));
assert.ok(main.includes('请联系运营客服跟进'));
assert.ok(main.includes('exportUserReports'));
assert.ok(main.includes('pet-companion-report-export-v1'));
assert.ok(main.includes('sanitizeReportDetail(report.detail)'));
assert.ok(main.includes('function exportFileStamp'));
assert.ok(main.includes('.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))'));
assert.ok(main.includes('count: reports.length'));
assert.ok(main.includes('newestAt'));
assert.ok(main.includes('oldestAt'));
assert.ok(main.includes('supportExportContact()'));
assert.ok(main.includes('function isSafeSupportUrl'));
assert.ok(main.includes('function isSafeSupportEmail'));
assert.ok(main.includes('configured: Boolean(url || email)'));
assert.ok(main.includes('pet-companion-reports-\${exportFileStamp(exportedAt)}.json'));
assert.ok(main.includes("actionEl.dataset.action === 'export-reports'"));
assert.ok(main.includes('copyReportId'));
assert.ok(main.includes('copyReportBrief'));
assert.ok(main.includes("actionEl.dataset.action === 'copy-report-id'"));
assert.ok(main.includes("actionEl.dataset.action === 'copy-report-brief'"));
assert.ok(main.includes('已复制投诉编号'));
assert.ok(main.includes('已复制客服跟进说明'));
assert.ok(main.includes('function reportRecordName'));
assert.ok(main.includes("report?.targetType === 'general' ? '反馈记录'"));
assert.equal(main.includes('reportTargetLabel(report.targetType)}投诉记录已保存'), false);
`);

addCase('checkin and reminder deletion require confirmation', `
${helpers}
const { readFileSync } = await import('node:fs');
const main = readFileSync('./src/main.js', 'utf8');
assert.ok(main.includes('function deleteReminder(id)'));
assert.ok(main.includes('function deleteCheckin(id)'));
assert.ok(main.includes('requestDangerConfirm({'));
assert.ok(main.includes("title: '删除健康提醒'"));
assert.ok(main.includes("title: '删除打卡项'"));
assert.ok(main.includes("actionEl.dataset.action === 'delete-checkin') deleteCheckin(id)"));
assert.ok(main.includes("actionEl.dataset.action === 'delete-reminder') deleteReminder(id)"));
assert.equal(main.includes("actionEl.dataset.action === 'delete-reminder') { const item"), false);
`);

addCase('danger operations use in-app confirmation sheet', `
${helpers}
globalThis.localStorage = new MemoryStorage();
const { state } = await import('./src/core/state.js');
const { renderApp } = await import('./src/ui/views.js');
const { readFileSync } = await import('node:fs');
state.users = [{ id: 'u1', name: '主人', account: 'demo' }];
state.currentUserId = 'u1';
state.ui.sheet = 'confirm';
state.ui.confirm = {
  title: '删除护理记录',
  message: '将删除这条护理记录，删除后无法从本机恢复。',
  confirmLabel: '删除记录'
};
const html = renderApp();
assert.ok(html.includes('role="alertdialog"'));
assert.ok(html.includes('data-action="cancel-confirm"'));
assert.ok(html.includes('data-action="confirm-danger"'));
assert.ok(html.includes('删除护理记录'));
assert.ok(html.includes('删除记录'));
const main = readFileSync('./src/main.js', 'utf8');
const ordinaryConfirmPhrases = [
  '确定删除这份宠物档案吗',
  '确定删除这条健康提醒吗',
  '确定删除这个打卡项吗',
  '确定删除这条暖窝动态吗',
  '确定删除这条评论吗',
  '确定删除这条护理记录吗',
  '确定删除这张成长胶囊照片吗',
  '确定清空本浏览器内的所有宠伴记数据吗'
];
for (const phrase of ordinaryConfirmPhrases) assert.equal(main.includes(\`confirm('\${phrase}\`), false);
assert.ok(main.includes("actionEl.dataset.action === 'cancel-confirm'"));
assert.ok(main.includes("actionEl.dataset.action === 'confirm-danger'"));
`);

addCase('remote account deletion uses in-app password confirmation', `
${helpers}
globalThis.localStorage = new MemoryStorage();
const { state } = await import('./src/core/state.js');
const { renderApp } = await import('./src/ui/views.js');
const { readFileSync } = await import('node:fs');
state.users = [{ id: 'u1', name: '主人', account: 'demo@example.com' }];
state.currentUserId = 'u1';
state.activeTab = 'admin';
state.ui.sheet = 'confirm';
state.ui.confirm = {
  title: '注销远端账号',
  message: '将删除当前远端用户、云端状态、云备份和会话，并使旧 token 失效。这个操作不可撤销。',
  confirmLabel: '确认注销',
  requiresPassword: true,
  passwordLabel: '当前远端账号密码'
};
const html = renderApp();
assert.ok(html.includes('id="confirm-password-form"'));
assert.ok(html.includes('name="password" type="password"'));
assert.ok(html.includes('autocomplete="current-password"'));
assert.ok(html.includes('密码只用于本次确认，不会写入资料备份。'));
assert.ok(html.includes('确认注销'));
assert.equal(JSON.stringify(state).includes('password='), false);
const main = readFileSync('./src/main.js', 'utf8');
assert.equal(main.includes('prompt('), false);
assert.ok(main.includes('requiresPassword: true'));
assert.ok(main.includes("form.id === 'confirm-password-form'"));
assert.ok(main.includes('deleteRemoteAccount({ session: state.session, password })'));
`);

addCase('remote media deletion is wired for photo and pet deletion', `
${helpers}
const { mediaUrlToDeletePath } = await import('./src/api/mediaClient.js');
assert.equal(mediaUrlToDeletePath('/media/files/usr_1/photo.png'), '/media/files/usr_1/photo.png');
assert.equal(mediaUrlToDeletePath('https://cdn.example.com/pet-media/usr_1/photo.png'), '/media/files/pet-media/usr_1/photo.png');
assert.equal(mediaUrlToDeletePath('data:image/png;base64,abc'), '');
const { readFileSync } = await import('node:fs');
const main = readFileSync('./src/main.js', 'utf8');
assert.ok(main.includes("import { deleteRemoteMedia, hasRemoteMediaApi, uploadRemoteMedia }"));
assert.ok(main.includes('async function deleteStoredMediaUrls(urls)'));
assert.ok(main.includes('deleteRemoteMedia({ url }, state.session)'));
assert.ok(main.includes('若照片已上传云端，也会同步删除远端图片文件'));
assert.ok(main.includes('...state.photos.filter(photo => photo.petId === id).map(photo => photo.imageData)'));
`);

addCase('pet form communicates image limits', `
${helpers}
globalThis.localStorage = new MemoryStorage();
const { state } = await import('./src/core/state.js');
const { renderApp } = await import('./src/ui/views.js');
state.users = [{ id: 'u1', name: '主人', account: 'demo' }];
state.currentUserId = 'u1';
state.activeTab = 'pets';
state.pets = [];
state.reminders = [];
state.records = [];
state.photos = [];
state.posts = [];
state.checkins = [];
const html = renderApp();
assert.ok(html.includes('accept="image/jpeg,image/png,image/webp,image/gif"'));
assert.ok(html.includes('支持 JPG、PNG、WebP、GIF，单张不超过 5MB。'));
assert.ok(html.includes('data-role="birthday-mode"'));
`);

addCase('migrations and local store recovery', `
${helpers}
globalThis.localStorage = new MemoryStorage({
  pet_companion_state_v3: JSON.stringify({ schemaVersion: 3, users: [{ id: 'u1' }], pets: [{ id: 'p1', color: 'url(javascript:alert(1))' }], ui: { sheet: 'bad' } })
});
const { migrateState } = await import('./src/core/migrations.js');
const { loadAppState, saveAppState, clearAppState, getStorageStatus } = await import('./src/api/localStore.js');
const migrated = migrateState(loadAppState());
assert.equal(migrated.state.schemaVersion, 5);
assert.equal(migrated.state.ui.sheet, null);
assert.equal(Array.isArray(migrated.state.pets), true);
assert.equal(migrated.state.pets[0].color, '#f2e7d9');
assert.equal(migrated.report.repairedFields.includes('pets.color'), true);
saveAppState(migrated.state);
assert.ok(globalThis.localStorage.getItem('pet_companion_state_v3'));
globalThis.localStorage.setItem('pet_companion_state_v3', JSON.stringify({
  schemaVersion: 5,
  users: [],
  pets: [],
  reminders: [],
  records: [],
  photos: [],
  posts: [],
  checkins: [],
  reports: [{ id: 'r1', reporterId: 'u1', reason: 'other', detail: 'token=pat_secret password=123456' }],
  ui: {}
}));
const sanitized = migrateState(loadAppState());
assert.equal(sanitized.state.reports[0].detail.includes('pat_secret'), false);
assert.equal(sanitized.state.reports[0].detail.includes('password'), false);
assert.ok(sanitized.report.repairedFields.includes('reports.detail'));
assert.equal(sanitized.state.reports[0].status, 'submitted');
globalThis.localStorage.setItem('pet_companion_state_v3', '{bad json');
assert.deepEqual(loadAppState(), {});
assert.equal(getStorageStatus().recovered, true);
assert.ok(getStorageStatus().backupKey.startsWith('pet_companion_recovery_'));
clearAppState();
assert.equal(globalThis.localStorage.length, 0);
`);

addCase('api client and repositories', `
${helpers}
globalThis.localStorage = new MemoryStorage();
const { apiRequest } = await import('./src/api/client.js');
const { appStateRepository } = await import('./src/repositories/appStateRepository.js');
const { authRepository } = await import('./src/repositories/authRepository.js');
const { uid } = await import('./src/core/utils.js');
const remote = await apiRequest('/health');
assert.equal(remote.mocked, true);
const state = { schemaVersion: 5, users: [], pets: [], reminders: [], records: [], photos: [], posts: [], checkins: [], reports: [], ui: {} };
const signed = authRepository.signInLocal({ state, uid, name: '主人', account: 'demo' });
assert.equal(signed.user.name, '主人');
assert.equal(authRepository.status({ state }).signedIn, true);
appStateRepository.save(state);
assert.equal(appStateRepository.load().currentUserId, state.currentUserId);
assert.equal(appStateRepository.status().remoteReady, false);
assert.equal((await authRepository.signInRemote({ account: 'demo' })).mocked, true);
authRepository.signOut({ state });
assert.equal(authRepository.status({ state }).signedIn, false);
appStateRepository.clear();
`);

addCase('api client preserves retry-after', `
${helpers}
globalThis.PET_COMPANION_CONFIG = {
  API_BASE_URL: 'https://api.example.com',
  API_MOCK_FALLBACK: false
};
globalThis.fetch = async () => new Response(
  JSON.stringify({ code: 'RATE_LIMITED', message: 'too many requests' }),
  { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '17' } }
);
const { apiRequest, ApiError } = await import('./src/api/client.js');
await assert.rejects(
  () => apiRequest('/auth/sign-in', { method: 'POST', body: { account: 'demo', password: 'wrong' } }),
  error => {
    assert.equal(error instanceof ApiError, true);
    assert.equal(error.status, 429);
    assert.equal(error.code, 'RATE_LIMITED');
    assert.equal(error.retryAfterSeconds, 17);
    return true;
  }
);
`);

addCase('api client preserves server error message', `
${helpers}
globalThis.PET_COMPANION_CONFIG = {
  API_BASE_URL: 'https://api.example.com',
  API_MOCK_FALLBACK: false
};
globalThis.fetch = async () => new Response(
  JSON.stringify({ code: 'INVALID_CREDENTIALS', message: '账号或密码不正确' }),
  { status: 401, headers: { 'content-type': 'application/json', 'x-request-id': 'req_login_001' } }
);
const { apiRequest, ApiError } = await import('./src/api/client.js');
await assert.rejects(
  () => apiRequest('/auth/sign-in', { method: 'POST', body: { account: 'demo', password: 'wrong' } }),
  error => {
    assert.equal(error instanceof ApiError, true);
    assert.equal(error.status, 401);
    assert.equal(error.code, 'INVALID_CREDENTIALS');
    assert.equal(error.message, '账号或密码不正确');
    assert.equal(error.requestId, 'req_login_001');
    return true;
  }
);
`);

addCase('api client falls back to request id on http error', `
${helpers}
globalThis.PET_COMPANION_CONFIG = {
  API_BASE_URL: 'https://api.example.com',
  API_MOCK_FALLBACK: false
};
let capturedHeaders = null;
globalThis.fetch = async (url, options) => {
  capturedHeaders = options.headers;
  return new Response(
    JSON.stringify({ code: 'SERVER_ERROR', message: '服务暂不可用' }),
    { status: 503, headers: { 'content-type': 'application/json' } }
  );
};
const { apiRequest, ApiError } = await import('./src/api/client.js');
await assert.rejects(
  () => apiRequest('/ready'),
  error => {
    assert.equal(error instanceof ApiError, true);
    assert.equal(error.status, 503);
    assert.equal(error.code, 'SERVER_ERROR');
    assert.equal(error.message, '服务暂不可用');
    assert.equal(error.requestId, capturedHeaders['X-Request-ID']);
    assert.ok(error.requestId.startsWith('web_'));
    return true;
  }
);
`);

addCase('api client sends request id header', `
${helpers}
globalThis.PET_COMPANION_CONFIG = {
  API_BASE_URL: 'https://api.example.com',
  API_MOCK_FALLBACK: false
};
let capturedHeaders = null;
globalThis.fetch = async (url, options) => {
  capturedHeaders = options.headers;
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'x-request-id': capturedHeaders['X-Request-ID'] }
  });
};
const { apiRequest } = await import('./src/api/client.js');
const result = await apiRequest('/health');
assert.ok(capturedHeaders['X-Request-ID'].startsWith('web_'));
assert.equal(result.data.ok, true);

await apiRequest('/health', { headers: { 'x-request-id': 'req_custom_001' } });
assert.equal(capturedHeaders['x-request-id'], 'req_custom_001');
assert.equal(capturedHeaders['X-Request-ID'], undefined);
`);

addCase('api client keeps request id on network error', `
${helpers}
globalThis.PET_COMPANION_CONFIG = {
  API_BASE_URL: 'https://api.example.com',
  API_MOCK_FALLBACK: false
};
let capturedHeaders = null;
globalThis.fetch = async (url, options) => {
  capturedHeaders = options.headers;
  throw new Error('offline');
};
const { apiRequest, ApiError } = await import('./src/api/client.js');
await assert.rejects(
  () => apiRequest('/health'),
  error => {
    assert.equal(error instanceof ApiError, true);
    assert.equal(error.code, 'NETWORK_ERROR');
    assert.equal(error.requestId, capturedHeaders['X-Request-ID']);
    assert.ok(error.requestId.startsWith('web_'));
    return true;
  }
);
`);

addCase('main reports rate limit retry hint', `
${helpers}
const { readFileSync } = await import('node:fs');
const main = readFileSync('./src/main.js', 'utf8');
assert.ok(main.includes('ApiError'));
assert.ok(main.includes("error.code === 'RATE_LIMITED'"));
assert.ok(main.includes('retryAfterSeconds'));
assert.ok(main.includes('请求过于频繁'));
assert.ok(main.includes('durationMs: 4000'));
`);

addCase('main reports api error message', `
${helpers}
const { readFileSync } = await import('node:fs');
const main = readFileSync('./src/main.js', 'utf8');
assert.ok(main.includes('error instanceof ApiError'));
assert.ok(main.includes("toast(error.message || '远端服务请求失败')"));
assert.equal(main.includes("toast('操作失败，请稍后重试')"), true);
`);

addCase('main monitors high-risk api errors', `
${helpers}
const { readFileSync } = await import('node:fs');
const main = readFileSync('./src/main.js', 'utf8');
assert.ok(main.includes("error.status >= 500"));
assert.ok(main.includes("'API_TIMEOUT'"));
assert.ok(main.includes("'NETWORK_ERROR'"));
assert.ok(main.includes("source: 'api-error'"));
assert.ok(main.includes('status: error.status'));
assert.ok(main.includes('code: error.code'));
assert.ok(main.includes('requestId: error.requestId'));
`);

addCase('toast supports custom duration', `
${helpers}
const toastEl = {
  textContent: '',
  timer: null,
  classList: {
    added: [],
    removed: [],
    add(value) { this.added.push(value); },
    remove(value) { this.removed.push(value); }
  }
};
globalThis.document = { querySelector: selector => selector === '#toast' ? toastEl : null };
let timeoutDelay = null;
globalThis.setTimeout = (callback, delay) => {
  timeoutDelay = delay;
  callback();
  return 1;
};
globalThis.clearTimeout = () => {};
const { toast } = await import('./src/ui/toast.js');
toast('请求过于频繁，约 17 秒后再试', { durationMs: 4000 });
assert.equal(toastEl.textContent, '请求过于频繁，约 17 秒后再试');
assert.deepEqual(toastEl.classList.added, ['show']);
assert.deepEqual(toastEl.classList.removed, ['show']);
assert.equal(timeoutDelay, 4000);
`);

addCase('remote auth ui and session boundary', `
${helpers}
globalThis.localStorage = new MemoryStorage();
globalThis.PET_COMPANION_CONFIG = {
  API_BASE_URL: 'https://api.example.com',
  API_MOCK_FALLBACK: false
};
const { state } = await import('./src/core/state.js');
const { uid } = await import('./src/core/utils.js');
const { upsertRemoteUser } = await import('./src/domain/users.js');
const { createRemoteSession, getSessionStatus } = await import('./src/domain/sessions.js');
const { renderApp } = await import('./src/ui/views.js');
const loginHtml = renderApp();
assert.ok(loginHtml.includes('remote-register-form'));
assert.ok(loginHtml.includes('remote-login-form'));
assert.ok(loginHtml.includes('创建账号并进入'));
const user = upsertRemoteUser({ state, user: { id: 'usr_remote', name: '主人', account: 'demo@example.com', createdAt: '2026-06-29T00:00:00.000Z' } });
state.currentUserId = user.id;
state.session = createRemoteSession({
  uid,
  user,
  session: { accessToken: 'pat_test', refreshToken: 'prt_test', expiresAt: '2026-07-29T00:00:00.000Z' }
});
state.activeTab = 'admin';
assert.equal(getSessionStatus(state.session).authMode, 'remote');
assert.equal(getSessionStatus(state.session).hasToken, true);
const appHtml = renderApp();
assert.ok(appHtml.includes('账号同步已开启'));
assert.equal(appHtml.includes('已持有远端 token'), false);
assert.equal(appHtml.includes('模式：remote'), false);
assert.ok(appHtml.includes('保存到云端'));
assert.ok(appHtml.includes('从云端恢复'));
assert.ok(appHtml.includes('创建云备份'));
`);

addCase('remote sync sanitizes session tokens', `
${helpers}
globalThis.PET_COMPANION_CONFIG = {
  API_BASE_URL: 'https://api.example.com',
  API_MOCK_FALLBACK: false
};
let capturedBody = null;
globalThis.fetch = async (url, options) => {
  capturedBody = JSON.parse(options.body);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
};
const { appStateRepository } = await import('./src/repositories/appStateRepository.js');
const state = {
  schemaVersion: 5,
  currentUserId: 'usr_remote',
  users: [{ id: 'usr_remote', name: '主人', account: 'demo@example.com' }],
  pets: [],
  reminders: [],
  records: [],
  photos: [],
  posts: [],
  checkins: [],
  reports: [{ id: 'r1', detail: 'token=pat_secret password=123456' }],
  session: { authMode: 'remote', accessToken: 'pat_secret', refreshToken: 'prt_secret' },
  ui: { sheet: 'checkins', detailPetId: 'p1' }
};
await appStateRepository.pushRemote(state);
assert.equal(capturedBody.state.session.accessToken, null);
assert.equal(capturedBody.state.session.refreshToken, null);
assert.equal(capturedBody.state.ui.sheet, null);
assert.equal(capturedBody.state.ui.detailPetId, null);
assert.equal(capturedBody.state.reports[0].detail.includes('pat_secret'), false);
assert.equal(capturedBody.state.reports[0].detail.includes('password'), false);
`);

addCase('remote state restore is migrated and sanitized before use', `
${helpers}
globalThis.PET_COMPANION_CONFIG = {
  API_BASE_URL: 'https://api.example.com',
  API_MOCK_FALLBACK: false
};
globalThis.fetch = async () => new Response(JSON.stringify({
  state: {
    schemaVersion: 1,
    currentUserId: 'usr_remote',
    users: [{ id: 'usr_remote', name: '主人' }],
    pets: [],
    reminders: [],
    records: [],
    photos: [],
    posts: [],
    checkins: [],
    reports: [{ id: 'r1', reason: 'other', detail: 'Bearer pat_secret password=123456' }],
    session: { authMode: 'remote', accessToken: 'pat_secret', refreshToken: 'prt_secret' },
    ui: { sheet: 'report', detailPetId: 'p1' }
  }
}), { status: 200, headers: { 'content-type': 'application/json' } });
const { appStateRepository } = await import('./src/repositories/appStateRepository.js');
const pulled = await appStateRepository.pullRemote({ accessToken: 'pat_current' });
assert.equal(pulled.state.session.accessToken, null);
assert.equal(pulled.state.session.refreshToken, null);
assert.equal(pulled.state.ui.sheet, null);
assert.equal(pulled.state.ui.detailPetId, null);
assert.equal(pulled.state.reports[0].detail.includes('pat_secret'), false);
assert.equal(pulled.state.reports[0].detail.includes('password'), false);
assert.equal(pulled.state.reports[0].status, 'submitted');
assert.equal(pulled.state.reports[0].reasonLabel, '其他问题');
`);

addCase('remote sync refreshes expired access token', `
${helpers}
const { ApiError } = await import('./src/api/client.js');
const { runWithRemoteRefresh } = await import('./src/core/remoteSync.js');
let session = {
  authMode: 'remote',
  accessToken: 'pat_old',
  refreshToken: 'prt_keep',
  expiresAt: '2026-06-29T00:00:00.000Z'
};
let operationCalls = 0;
let refreshCalls = 0;
const result = await runWithRemoteRefresh({
  getSession: () => session,
  refreshSession: async current => {
    refreshCalls += 1;
    assert.equal(current.refreshToken, 'prt_keep');
    return { data: { accessToken: 'pat_new', refreshToken: 'prt_new', expiresAt: '2026-07-29T00:00:00.000Z', refreshExpiresAt: '2026-08-29T00:00:00.000Z' } };
  },
  saveSession: next => { session = next; },
  operation: async () => {
    operationCalls += 1;
    if (operationCalls === 1) throw new ApiError('expired', { status: 401, code: 'HTTP_ERROR' });
    return { ok: true };
  }
});
assert.deepEqual(result, { ok: true });
assert.equal(operationCalls, 2);
assert.equal(refreshCalls, 1);
assert.equal(session.accessToken, 'pat_new');
assert.equal(session.refreshToken, 'prt_new');
assert.equal(session.refreshExpiresAt, '2026-08-29T00:00:00.000Z');
`);

addCase('runtime config overrides', `
${helpers}
globalThis.PET_COMPANION_CONFIG = {
  APP_RELEASE_CHANNEL: 'production',
  API_BASE_URL: 'https://api.example.com',
  API_TIMEOUT_MS: 12000,
  API_MOCK_FALLBACK: false,
  MONITORING_ENDPOINT: 'https://monitor.example.com/events',
  MONITORING_SAMPLE_RATE: 0.5,
  OPERATOR_NAME: '宠伴记运营团队',
  SUPPORT_CONTACT_LABEL: '客服中心',
  SUPPORT_CONTACT_URL: 'https://support.example.com/pet',
  SUPPORT_EMAIL: 'support@example.com'
};
const config = await import('./src/core/config.js');
assert.equal(config.APP_RELEASE_CHANNEL, 'production');
assert.equal(config.API_BASE_URL, 'https://api.example.com');
assert.equal(config.API_TIMEOUT_MS, 12000);
assert.equal(config.API_MOCK_FALLBACK, false);
assert.equal(config.MONITORING_ENDPOINT, 'https://monitor.example.com/events');
assert.equal(config.MONITORING_SAMPLE_RATE, 0.5);
assert.equal(config.OPERATOR_NAME, '宠伴记运营团队');
assert.equal(config.SUPPORT_CONTACT_LABEL, '客服中心');
assert.equal(config.SUPPORT_CONTACT_URL, 'https://support.example.com/pet');
assert.equal(config.SUPPORT_EMAIL, 'support@example.com');
assert.equal(config.RUNTIME_CONFIG_SOURCE, 'runtime-config');
`);

addCase('production runtime config requires operator support channel', `
${helpers}
const { spawnSync } = await import('node:child_process');
const missing = spawnSync(process.execPath, ['./scripts/write-runtime-config.mjs', '--production', '--target', 'output/runtime-missing-support.js'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: {
    ...process.env,
    PET_API_BASE_URL: 'https://api.pet-companion.test',
    PET_MONITORING_ENDPOINT: 'https://monitoring.pet-companion.test/events',
    PET_API_MOCK_FALLBACK: 'false'
  }
});
assert.notEqual(missing.status, 0);
assert.ok((missing.stderr + missing.stdout).includes('PET_OPERATOR_NAME'));

const placeholder = spawnSync(process.execPath, ['./scripts/write-runtime-config.mjs', '--production', '--target', 'output/runtime-placeholder-support.js'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: {
    ...process.env,
    PET_API_BASE_URL: 'https://api.example.com',
    PET_MONITORING_ENDPOINT: 'https://monitoring.example.com/events',
    PET_API_MOCK_FALLBACK: 'false',
    PET_OPERATOR_NAME: '示例运营主体',
    PET_SUPPORT_EMAIL: 'support@example.com'
  }
});
assert.notEqual(placeholder.status, 0);
assert.ok((placeholder.stderr + placeholder.stdout).includes('不能使用 example.com'));

const unsafeEmail = spawnSync(process.execPath, ['./scripts/write-runtime-config.mjs', '--production', '--target', 'output/runtime-unsafe-support-email.js'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: {
    ...process.env,
    PET_API_BASE_URL: 'https://api.pet-companion.test',
    PET_MONITORING_ENDPOINT: 'https://monitoring.pet-companion.test/events',
    PET_API_MOCK_FALLBACK: 'false',
    PET_OPERATOR_NAME: '宠伴记运营主体',
    PET_SUPPORT_EMAIL: 'support@pet-companion.test?body=token'
  }
});
assert.notEqual(unsafeEmail.status, 0);
assert.ok((unsafeEmail.stderr + unsafeEmail.stdout).includes('客服/投诉渠道'));

const ok = spawnSync(process.execPath, ['./scripts/write-runtime-config.mjs', '--production', '--target', 'output/runtime-with-support.js'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: {
    ...process.env,
    PET_API_BASE_URL: 'https://api.pet-companion.test',
    PET_MONITORING_ENDPOINT: 'https://monitoring.pet-companion.test/events',
    PET_API_MOCK_FALLBACK: 'false',
    PET_OPERATOR_NAME: '宠伴记运营主体',
    PET_SUPPORT_EMAIL: 'support@pet-companion.test'
  }
});
assert.equal(ok.status, 0);
`);

addCase('production smoke and ops checks verify support channel', `
${helpers}
const { readFileSync } = await import('node:fs');
const smoke = readFileSync('./scripts/smoke-production.mjs', 'utf8');
const ops = readFileSync('./scripts/ops-check.mjs', 'utf8');
for (const source of [smoke, ops]) {
  assert.ok(source.includes('OPERATOR_NAME'));
  assert.ok(source.includes('SUPPORT_CONTACT_URL'));
  assert.ok(source.includes('SUPPORT_EMAIL'));
  assert.ok(source.includes("extractRuntimeString(source, key)"));
  assert.ok(source.includes("extractRuntimeBoolean(source, key)"));
  assert.ok(source.includes("API_BASE_URL'), apiBaseUrl"));
  assert.ok(source.includes('[A-Z0-9._%+-]+@[A-Z0-9.-]+'));
}
assert.ok(smoke.includes('runtime-config 必须提供真实运营主体'));
assert.ok(smoke.includes('runtime-config 必须指向目标 API'));
assert.ok(smoke.includes('不能使用占位内容'));
assert.ok(smoke.includes('不能使用占位域名'));
assert.ok(ops.includes('runtime-config support contact missing'));
assert.ok(ops.includes('still uses placeholder'));
assert.ok(ops.includes('must not use placeholder host'));
assert.ok(ops.includes('runtime-config API_BASE_URL mismatch'));
`);


addCase('external evidence init protects existing evidence on force', `
${helpers}
const { readFileSync } = await import('node:fs');
const init = readFileSync('./scripts/external-evidence-init.mjs', 'utf8');
const doc = readFileSync('./docs/external-evidence.md', 'utf8');
assert.ok(init.includes('copyFile(targetPath, backupPath)'));
assert.ok(init.includes('output/evidence-backups'));
assert.ok(init.includes('external evidence init backup'));
assert.ok(init.includes('would backup'));
assert.ok(init.includes("replace(/^\\\\uFEFF/, '')"));
assert.ok(doc.includes('output/evidence-backups/production-evidence.<timestamp>.json'));
assert.ok(doc.includes('pending'));
assert.ok(doc.includes('--force'));
`);


addCase('external evidence update validates status and protects secrets', `
${helpers}
const { readFileSync } = await import('node:fs');
const update = readFileSync('./scripts/external-evidence-update.mjs', 'utf8');
const pkg = readFileSync('./package.json', 'utf8');
const doc = readFileSync('./docs/external-evidence.md', 'utf8');
assert.ok(pkg.includes('external:evidence:update'));
assert.ok(update.includes('allowedStatus'));
assert.ok(update.includes('secretPattern'));
assert.ok(update.includes('placeholderPattern'));
assert.ok(update.includes('copyFile(evidencePath, backupPath)'));
assert.ok(update.includes('external evidence update dry-run'));
assert.ok(update.includes("replace(/^\\\\uFEFF/, '')"));
assert.ok(update.includes('checkedAt must be a parseable date/time'));
assert.ok(update.includes('checkedAt must not be in the future'));
assert.ok(update.includes('checkedAt is too old; refresh external evidence before marking verified'));
assert.ok(update.includes('proofRefs are required'));
assert.ok(update.includes('verified evidence requires proofRefs for every required proof'));
assert.ok(update.includes('proofRef'));
assert.ok(doc.includes('JSON'));
assert.ok(doc.includes('npm run external:evidence:update'));
assert.ok(doc.includes('proofRefs'));
assert.ok(doc.includes('数量必须覆盖'));
`);

addCase('deploy target check rejects homepage and overlapping upload paths', `
${helpers}
const { mkdirSync, writeFileSync } = await import('node:fs');
const { spawnSync } = await import('node:child_process');
mkdirSync('output', { recursive: true });
const unsafePath = 'output/deploy-target-unsafe.json';
writeFileSync(unsafePath, JSON.stringify({
  schema: 'pet-companion-deploy-target-v1',
  hostLabel: 'unsafe-host',
  projectRoot: '/opt/pet-companion',
  distTarget: '/opt/pet-companion',
  deployConfigTarget: '/opt/pet-companion/dist/deploy',
  dataTarget: '/opt/pet-companion/data',
  mediaTarget: '/opt/pet-companion/data/media'
}, null, 2), 'utf8');
const unsafe = spawnSync(process.execPath, ['./scripts/deploy-target-check.mjs', '--target', unsafePath], {
  cwd: process.cwd(),
  encoding: 'utf8'
});
assert.notEqual(unsafe.status, 0);
const unsafeOutput = unsafe.stdout + unsafe.stderr;
assert.ok(unsafeOutput.includes('distTarget must be a child directory of projectRoot'));
assert.ok(unsafeOutput.includes('deployConfigTarget must be separate from distTarget'));
assert.ok(unsafeOutput.includes('dataTarget must be outside projectRoot'));
assert.ok(unsafeOutput.includes('mediaTarget must be outside projectRoot'));

const homepagePath = 'output/deploy-target-homepage.json';
writeFileSync(homepagePath, JSON.stringify({
  schema: 'pet-companion-deploy-target-v1',
  hostLabel: 'homepage-host',
  projectRoot: '/var/www/html',
  distTarget: '/var/www/html/pet',
  deployConfigTarget: '/var/www/html/deploy',
  dataTarget: '/srv/pet-companion/data',
  mediaTarget: '/srv/pet-companion/media'
}, null, 2), 'utf8');
const homepage = spawnSync(process.execPath, ['./scripts/deploy-target-check.mjs', '--target', homepagePath], {
  cwd: process.cwd(),
  encoding: 'utf8'
});
assert.notEqual(homepage.status, 0);
assert.ok((homepage.stdout + homepage.stderr).includes('points at a server homepage/system path'));
`);

addCase('deploy transfer plan is local only and excludes private files', `
${helpers}
const { readFileSync } = await import('node:fs');
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
const script = readFileSync('./scripts/deploy-transfer-plan.mjs', 'utf8');
const runbook = readFileSync('./docs/release-runbook.md', 'utf8');
assert.equal(pkg.scripts['deploy:transfer:plan'], 'node ./scripts/deploy-transfer-plan.mjs');
assert.ok(pkg.scripts['release:check'].includes('npm run deploy:transfer:plan'));
assert.ok(script.includes('pet-companion-deploy-transfer-plan-v1'));
assert.ok(script.includes('FORBIDDEN_TRANSFER_FILES'));
assert.ok(script.includes('deploy/production.env'));
assert.ok(script.includes('deploy/certs/privkey.pem'));
assert.ok(script.includes('deploy-target-check.mjs'));
assert.ok(script.includes('manifestSha256'));
assert.ok(script.includes('不执行 SSH、SCP、rsync'));
assert.ok(runbook.includes('output/deploy-transfer-plan.md'));
assert.ok(runbook.includes('does not run SSH, SCP, rsync'));
`);

addCase('production env checker rejects placeholders and masks secrets', `
${helpers}
const { readFileSync } = await import('node:fs');
const { spawnSync } = await import('node:child_process');
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
const script = readFileSync('./scripts/production-env-check.mjs', 'utf8');
assert.ok(pkg.scripts['production:env:example:check'].includes('production-env-check.mjs'));
assert.ok(pkg.scripts['production:env:self-test'].includes('--self-test'));
assert.ok(pkg.scripts['production:env:check'].includes('--production'));
assert.ok(pkg.scripts['release:check'].includes('npm run production:env:example:check'));
assert.ok(pkg.scripts['release:check'].includes('npm run production:env:self-test'));
assert.ok(script.includes('getServerRuntimeChecks'));
assert.ok(script.includes('placeholderPattern'));
assert.ok(script.includes('maskedDetail'));
const template = spawnSync(process.execPath, ['./scripts/production-env-check.mjs', '--file', 'deploy/production.env.example', '--template'], {
  cwd: process.cwd(),
  encoding: 'utf8'
});
assert.equal(template.status, 0, template.stdout + template.stderr);
const selfTest = spawnSync(process.execPath, ['./scripts/production-env-check.mjs', '--self-test'], {
  cwd: process.cwd(),
  encoding: 'utf8'
});
assert.equal(selfTest.status, 0, selfTest.stdout + selfTest.stderr);
assert.ok(selfTest.stdout.includes('PASS production env self-test'));
`);


addCase('strict release go gate requires external evidence verified', `
${helpers}
const { readFileSync } = await import('node:fs');
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
const launchStatus = readFileSync('./scripts/launch-status.mjs', 'utf8');
const releaseEvidence = readFileSync('./scripts/release-evidence.mjs', 'utf8');
const releaseEvidenceCheck = readFileSync('./scripts/release-evidence-check.mjs', 'utf8');
const readiness = readFileSync('./docs/production-readiness.md', 'utf8');
const runbook = readFileSync('./docs/release-runbook.md', 'utf8');
assert.ok(pkg.scripts['release:go'].includes('npm run release:check'));
assert.ok(pkg.scripts['release:go'].includes('launch:status -- --require-go'));
assert.ok(pkg.scripts['release:check'].includes('npm run launch:status:self-test'));
assert.ok(pkg.scripts['release:check'].includes('npm run deploy:target:check'));
assert.ok(pkg.scripts['deploy:target:check'].includes('deploy-target-check.mjs'));
assert.ok(pkg.scripts['release:check'].includes('npm run manual:acceptance:check'));
assert.ok(pkg.scripts['manual:acceptance:check'].includes('manual-acceptance-check.mjs'));
assert.ok(pkg.scripts['launch:status:self-test'].includes('--self-test'));
assert.ok(launchStatus.includes('selfTest') && launchStatus.includes('runSelfTest'));
assert.ok(launchStatus.includes('requireGo') && launchStatus.includes('process.exit(1)'));
assert.ok(launchStatus.includes('REQUIRED_IDS'));
assert.ok(launchStatus.includes('ALLOWED_STATUS'));
assert.ok(launchStatus.includes('SECRET_PATTERN'));
assert.ok(launchStatus.includes('PLACEHOLDER_PATTERN'));
assert.ok(launchStatus.includes('MOJIBAKE_PATTERN'));
assert.ok(launchStatus.includes('validateEvidenceItem'));
assert.ok(launchStatus.includes('placeholder evidenceRef'));
assert.ok(launchStatus.includes('placeholder owner'));
assert.ok(launchStatus.includes('checkedAt is not parseable'));
assert.ok(launchStatus.includes('checkedAt is in the future'));
assert.ok(launchStatus.includes('checkedAt is too old'));
assert.ok(launchStatus.includes('output/production-evidence.json is missing'));
assert.ok(launchStatus.includes('is not valid JSON'));
assert.ok(launchStatus.includes('releaseEvidenceRead.error'));
assert.ok(launchStatus.includes('artifactManifestRead.error'));
assert.ok(launchStatus.includes('release evidence artifact sha does not match current artifact manifest'));
assert.ok(launchStatus.includes('compareCurrentDistToArtifactManifest'));
assert.ok(launchStatus.includes('artifact manifest sha does not match current dist'));
assert.ok(launchStatus.includes('productionEvidenceRead'));
assert.ok(launchStatus.includes('production evidence schema mismatch'));
assert.ok(launchStatus.includes('required external evidence item'));
assert.ok(pkg.scripts['release:check'].includes('npm run release:evidence:self-test'));
assert.ok(pkg.scripts['release:evidence:self-test'].includes('--self-test'));
assert.ok(releaseEvidence.includes('validateExternalEvidenceItem'));
assert.ok(releaseEvidence.includes('externalEvidenceStatus'));
assert.ok(releaseEvidence.includes('runSelfTest'));
assert.ok(releaseEvidence.includes('invalid_external_evidence'));
assert.ok(releaseEvidence.includes('validationErrors'));
assert.ok(releaseEvidence.includes('checkedAt is in the future'));
assert.ok(releaseEvidence.includes('checkedAt is too old'));
assert.ok(releaseEvidenceCheck.includes('release:evidence:self-test'));
assert.ok(releaseEvidenceCheck.includes('selfTestStep'));
assert.ok(releaseEvidenceCheck.includes('invalidExternalEvidence'));
assert.ok(releaseEvidenceCheck.includes('validation errors'));
assert.ok(readiness.includes('npm.cmd run release:go'));
assert.ok(runbook.includes('npm run release:go'));
`);


addCase('monitoring redacts sensitive payloads before send', `
${helpers}
globalThis.PET_COMPANION_CONFIG = {
  APP_VERSION: 'test',
  MONITORING_ENDPOINT: 'https://monitoring.example.com/events',
  MONITORING_SAMPLE_RATE: 1
};
let sentPayload = null;
globalThis.fetch = async (url, options) => {
  sentPayload = JSON.parse(options.body);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
};
const { captureException, captureMessage } = await import('./src/core/monitoring.js');
await captureException(new Error('failed with pat_secret and password=hidden'), {
  source: 'unit-test',
  detail: {
    requestId: 'req_safe_001',
    accessToken: 'pat_detail',
    nested: { authorization: 'Bearer hidden', note: 'safe note' }
  }
});
let serialized = JSON.stringify(sentPayload);
assert.equal(sentPayload.detail.requestId, 'req_safe_001');
assert.equal(sentPayload.detail.accessToken, '[redacted]');
assert.equal(sentPayload.detail.nested.authorization, '[redacted]');
assert.equal(sentPayload.detail.nested.note, 'safe note');
assert.equal(sentPayload.detail.error.message, '[redacted]');
assert.equal(serialized.includes('pat_secret'), false);
assert.equal(serialized.includes('pat_detail'), false);
assert.equal(serialized.includes('Bearer hidden'), false);

await captureMessage('manual check with prt_secret', { detail: { cookie: 'cookie=session' } });
serialized = JSON.stringify(sentPayload);
assert.equal(sentPayload.detail.message, '[redacted]');
assert.equal(sentPayload.detail.cookie, '[redacted]');
assert.equal(serialized.includes('prt_secret'), false);
assert.equal(serialized.includes('cookie=session'), false);
`);

addCase('monitoring boundary', `
${helpers}
const client = await import('./src/api/monitoringClient.js');
const monitoring = await import('./src/core/monitoring.js');
assert.equal(client.hasMonitoringEndpoint(), false);
assert.equal(monitoring.getMonitoringStatus().enabled, false);
const result = await client.sendMonitoringEvent({ type: 'test' });
assert.equal(result.disabled, true);
await monitoring.captureException(new Error('boom'), { source: 'unit-test' });
const status = monitoring.getMonitoringStatus();
assert.equal(status.captured, 1);
assert.equal(status.sent, 0);
assert.equal(status.lastErrorName, 'Error');
`);

addCase('backup and remote state boundary', `
${helpers}
globalThis.localStorage = new MemoryStorage();
const backups = await import('./src/domain/backups.js');
const appStateClient = await import('./src/api/appStateClient.js');
const { appStateRepository } = await import('./src/repositories/appStateRepository.js');
const state = {
  schemaVersion: 5,
  currentUserId: 'u1',
  activeTab: 'admin',
  carePanel: 'records',
  users: [{ id: 'u1', name: '主人' }],
  pets: [{ id: 'p1', ownerId: 'u1' }],
  reminders: [],
  records: [],
  photos: [],
  posts: [],
  checkins: [],
  reports: [{ id: 'r1', reason: 'other', detail: 'token=pat_secret password=123456' }],
  session: { accessToken: 'secret-access', refreshToken: 'secret-refresh', authMode: 'remote' },
  ui: { sheet: 'checkins', detailPetId: 'p1' }
};
const backup = backups.createStateBackup(state, { createdAt: '2026-06-29T00:00:00.000Z', appVersion: 'test' });
assert.equal(backups.validateStateBackup(backup), true);
assert.equal(backup.state.session.accessToken, null);
assert.equal(backup.state.session.refreshToken, null);
assert.equal(backup.state.ui.sheet, null);
assert.equal(backup.state.reports[0].detail.includes('pat_secret'), false);
assert.equal(backup.state.reports[0].detail.includes('password'), false);
assert.equal(backup.counts.pets, 1);
assert.equal(backups.summarizeStateBackup(backup).valid, true);
assert.equal(appStateRepository.validateBackup(backup), true);
assert.equal(appStateRepository.status().backupReady, false);
assert.equal(appStateClient.hasRemoteStateApi(), false);
assert.equal(await appStateClient.saveRemoteState(state), null);
assert.equal(await appStateRepository.createRemoteBackup(state), null);
const main = await import('node:fs').then(fs => fs.readFileSync('./src/main.js', 'utf8'));
assert.ok(main.includes('exportLocalBackup'));
assert.ok(main.includes('importLocalBackup'));
assert.ok(main.includes('createStateBackup(state)'));
assert.ok(main.includes('validateStateBackup(payload)'));
assert.ok(main.includes('sanitizeStateForRestore(payload.state)'));
assert.ok(main.includes('local-backup-input'));
assert.ok(main.includes('pet-companion-local-backup-'));
assert.ok(main.includes("actionEl.dataset.action === 'export-local-backup'"));
`);

addCase('legal consent gate', `
${helpers}
globalThis.localStorage = new MemoryStorage();
const { state } = await import('./src/core/state.js');
const consent = await import('./src/domain/consent.js');
const { renderApp } = await import('./src/ui/views.js');
assert.equal(consent.hasAcceptedLegalConsent(state), false);
const loginHtml = renderApp();
assert.ok(loginHtml.includes('name="legalConsent"'));
assert.ok(loginHtml.includes('用户协议'));
assert.ok(loginHtml.includes('隐私政策'));
consent.acceptLegalConsent({ state, source: 'unit-test' });
assert.equal(consent.hasAcceptedLegalConsent(state), true);
assert.equal(consent.getLegalConsentStatus(state).source, 'unit-test');
state.ui.sheet = 'legal';
const legalHtml = renderApp();
assert.ok(legalHtml.includes('用户协议与隐私政策'));
assert.ok(legalHtml.includes(consent.LEGAL_CONSENT_VERSION));
assert.ok(legalHtml.includes('账号资料导出'));
assert.ok(legalHtml.includes('运营与客服'));
assert.ok(legalHtml.includes('可识别的当前用户媒体文件'));
assert.ok(legalHtml.includes('不构成兽医诊断'));
assert.ok(legalHtml.includes('./docs/terms.md'));
assert.ok(legalHtml.includes('./docs/privacy.md'));
assert.equal(legalHtml.includes('正式上架前'), false);
assert.equal(legalHtml.includes('占位'), false);
`);


addCase('production hides demo data entry points', `
${helpers}
globalThis.localStorage = new MemoryStorage();
globalThis.PET_COMPANION_CONFIG = {
  APP_RELEASE_CHANNEL: 'production',
  API_BASE_URL: 'https://api.example.com',
  API_MOCK_FALLBACK: false,
  OPERATOR_NAME: '宠伴记运营团队',
  SUPPORT_CONTACT_URL: 'javascript:alert(1)',
  SUPPORT_EMAIL: 'support@pet-companion.test?body=token'
};
const { state } = await import('./src/core/state.js');
const { renderApp } = await import('./src/ui/views.js');
const { readFileSync } = await import('node:fs');
let html = renderApp();
assert.equal(html.includes('data-action="seed-demo"'), false);
assert.equal(html.includes('填充演示数据'), false);
state.users = [{ id: 'u1', name: '主人', account: 'demo' }];
state.currentUserId = 'u1';
state.activeTab = 'admin';
html = renderApp();
assert.equal(html.includes('data-action="seed-demo"'), false);
assert.equal(html.includes('填充演示数据'), false);
assert.equal(html.includes('javascript:alert'), false);
assert.equal(html.includes('mailto:support@pet-companion.test?body=token'), false);
assert.ok(html.includes('可先提交反馈记录并保存编号'));
const main = readFileSync('./src/main.js', 'utf8');
assert.ok(main.includes('if (APP_IS_PRODUCTION)'));
assert.ok(main.includes('生产环境不提供演示数据入'));
const views = readFileSync('./src/ui/views.js', 'utf8');
assert.ok(views.includes('isSafeSupportEmail'));
assert.ok(views.includes('[A-Z0-9._%+-]+@[A-Z0-9.-]+'));
`);

addCase('support diagnostics are redacted', `
${helpers}
globalThis.PET_COMPANION_CONFIG = {
  APP_RELEASE_CHANNEL: 'production',
  API_BASE_URL: 'https://api.example.com',
  API_MOCK_FALLBACK: false,
  MONITORING_ENDPOINT: 'https://monitor.example.com/events'
};
const diagnostics = await import('./src/domain/diagnostics.js');
const payload = diagnostics.createSupportDiagnostics({
  state: {
    schemaVersion: 5,
    activeTab: 'admin',
    carePanel: 'records',
    currentUserId: 'user_secret',
    selectedPetId: 'pet_secret',
    users: [{ id: 'user_secret', name: '主人', account: 'private@example.com' }],
    pets: [{ id: 'pet_secret', name: '奶盖' }],
    reminders: [],
    records: [],
    photos: [{ imageData: 'data:image/png;base64,secret' }],
    posts: [{ content: 'private post' }],
    checkins: [],
    session: { accessToken: 'pat_secret', refreshToken: 'prt_secret' }
  },
  storageStatus: { migrated: true, recovered: false, remoteReady: true, backupReady: true, repairedFields: ['pets'], sourceVersion: 3, targetVersion: 5 },
  monitoringStatus: { enabled: true, endpointConfigured: true, sampleRate: 1, captured: 2, sent: 1, failed: 0, lastErrorName: 'Error' },
  sessionStatus: { signedIn: true, authMode: 'remote', hasToken: true, expiresAt: '2026-07-01T00:00:00.000Z' },
  consentStatus: { accepted: true, version: '2026-06-29', acceptedAt: '2026-06-29T00:00:00.000Z', source: 'unit-test' },
  environment: { path: '/index.html', userAgent: 'Unit Browser', language: 'zh-CN', online: true }
});
assert.equal(payload.state.counts.users, 1);
assert.equal(payload.session.remoteCredentialPresent, true);
const json = JSON.stringify(payload);
assert.equal(json.includes('private@example.com'), false);
assert.equal(json.includes('奶盖'), false);
assert.equal(json.includes('pat_secret'), false);
assert.equal(json.includes('data:image'), false);
assert.equal(diagnostics.assertSupportDiagnosticsSafe(payload).safe, true);
assert.equal(diagnostics.assertSupportDiagnosticsSafe({ password: 'x' }).safe, false);
`);

addCase('pwa update status and admin controls', `
${helpers}
globalThis.localStorage = new MemoryStorage();
const pwaUpdate = await import('./src/core/pwaUpdate.js');
assert.deepEqual(pwaUpdate.getPwaUpdateStatus(), {
  supported: false,
  checking: false,
  updateAvailable: false,
  lastCheckedAt: '',
  lastAppliedAt: '',
  error: ''
});
assert.equal((await pwaUpdate.checkForPwaUpdate()).supported, false);
assert.equal(pwaUpdate.applyPwaUpdate(), false);
const { state } = await import('./src/core/state.js');
const consent = await import('./src/domain/consent.js');
const { renderApp } = await import('./src/ui/views.js');
state.users = [{ id: 'u1', name: '主人', account: 'demo' }];
state.currentUserId = 'u1';
state.activeTab = 'admin';
consent.acceptLegalConsent({ state, source: 'unit-test' });
const html = renderApp();
assert.ok(html.includes('应用更新'));
assert.ok(html.includes('检查是否有新的 App 版本'));
assert.equal(html.includes('发布状态：验收候选版'), false);
assert.equal(html.includes('配置状态：默认体验配置'), false);
assert.equal(html.includes('云服务：本机体验'), false);
assert.equal(html.includes('local-production-ready'), false);
assert.equal(html.includes('mock fallback'), false);
assert.ok(html.includes('客服与反馈'));
assert.ok(html.includes('遇到账号、资料、投诉、隐私或功能问题'));
assert.equal(html.includes('上线前需在 runtime-config 中配置真实客服链接或邮箱'), false);
assert.ok(html.includes('check-pwa-update'));
assert.ok(html.includes('apply-pwa-update'));
assert.ok(html.includes('account-service-grid'));
assert.ok(html.includes('admin-panel'));
assert.equal(html.includes('<div class="grid"><div class="stat">'), false);
`);

addCase('ownership policy and checkin domain', `
${helpers}
const policies = await import('./src/core/policies.js');
const checkins = await import('./src/domain/checkins.js');
const state = {
  currentUserId: 'u1',
  pets: [{ id: 'p1', ownerId: 'u1' }, { id: 'p2', ownerId: 'u2' }],
  records: [{ id: 'r1', petId: 'p1' }, { id: 'r2', petId: 'p2' }],
  posts: [
    { id: 'a', authorId: 'u1', petId: 'p1', comments: [] },
    { id: 'b', authorId: 'u2', petId: 'p2', comments: [] }
  ],
  checkins: []
};
assert.equal(policies.canAccessPet(state, 'p1'), true);
assert.equal(policies.canAccessPet(state, 'p2'), false);
assert.equal(policies.filterOwnedPetResources(state, state.records).length, 1);
assert.equal(policies.filterAccessiblePosts(state, state.posts).length, 1);
const id = () => 'chk_1';
state.checkins.push(checkins.createCheckin({ state, uid: id, petId: 'p1', title: '饮水' }));
assert.equal(checkins.hasCheckinTitleToday({ state, petId: 'p1', title: '饮水' }), true);
assert.equal(checkins.getCheckinSummary(state.checkins).pending, 1);
checkins.setTodayCheckinsDone({ state, petId: 'p1', done: true });
assert.equal(checkins.getCheckinSummary(state.checkins).done, 1);
checkins.toggleCheckinDone({ state, id: 'chk_1' });
assert.equal(state.checkins[0].done, false);
assert.equal(checkins.deleteCheckinById({ state, id: 'chk_1' }), true);
`);

addCase('render smoke with bottom sheet', `
${helpers}
globalThis.localStorage = new MemoryStorage();
const { state } = await import('./src/core/state.js');
const { uid } = await import('./src/core/utils.js');
const { authRepository } = await import('./src/repositories/authRepository.js');
const { createDemoPet } = await import('./src/domain/pets.js');
const { ensureDefaultCheckins } = await import('./src/domain/checkins.js');
const { createPost } = await import('./src/domain/posts.js');
const { renderApp } = await import('./src/ui/views.js');
const user = authRepository.signInLocal({ state, uid, name: '主人', account: 'demo' }).user;
const ownPet = createDemoPet({ uid, ownerId: user.id });
const foreignPet = { ...createDemoPet({ uid, ownerId: 'u2' }), id: 'foreign_pet', name: '别人家的猫' };
state.pets.push(ownPet, foreignPet);
state.selectedPetId = ownPet.id;
ensureDefaultCheckins({ state, uid, petId: ownPet.id });
state.posts.push(createPost({ uid, authorId: 'u2', petId: foreignPet.id, content: '不可见内容' }));
state.ui.sheet = 'checkins';
const html = renderApp();
assert.ok(html.includes('打卡管理'));
assert.ok(html.includes('今日照护计划'));
assert.ok(html.includes('全部完成'));
assert.ok(html.includes('快速加入'));
assert.ok(html.includes('打卡标题'));
assert.equal(html.includes('别人家的猫'), false);
`);

addCase('motion css is purposeful and reduced-motion safe', `
${helpers}
const { readFileSync } = await import('node:fs');
const css = readFileSync('./styles.css', 'utf8');
assert.equal(css.includes('var(--ink)'), false);
assert.ok(css.includes('color:var(--text)') || css.includes('color: var(--text);'));
assert.ok(css.includes('@keyframes warm-rise'));
assert.ok(css.includes('@keyframes sheet-rise'));
assert.ok(css.includes('@keyframes check-pop'));
assert.ok(css.includes('form[aria-busy="true"] button[type="submit"]::after'));
assert.ok(css.includes('.health-disclaimer'));
assert.ok(css.includes('@media (prefers-reduced-motion:reduce)') || css.includes('@media (prefers-reduced-motion: reduce)'));
assert.ok(css.includes('animation:none !important') || css.includes('animation: none !important'));
assert.ok(css.includes('transition:none !important') || css.includes('transition: none !important'));
`);

addCase('interactive semantics are native and not noisy', `
${helpers}
const { readFileSync } = await import('node:fs');
const index = readFileSync('./index.html', 'utf8');
const views = readFileSync('./src/ui/views.js', 'utf8');
const components = readFileSync('./src/ui/components.js', 'utf8');
const accessibility = readFileSync('./scripts/accessibility-check.mjs', 'utf8');
assert.ok(index.includes('<main id="app" tabindex="-1"></main>'));
assert.equal(index.includes('<main id="app" aria-live='), false);
assert.ok(index.includes('id="toast" role="status" aria-live="polite"'));
assert.ok(views.includes('<button type="button" class="checkin-card'));
assert.equal(views.includes('role="button" aria-label='), false);
assert.ok(components.includes('type="button" data-action="'));
assert.ok(accessibility.includes('pkgJson.version'));
assert.ok(accessibility.includes('-assets-[a-f0-9]{12}'));
assert.ok(accessibility.includes('main app is not a noisy live region'));
assert.ok(accessibility.includes('checkin cards are native buttons'));
`);

const failed = cases.filter(testCase => !runCase(testCase));

if (failed.length) {
  console.error(`\n${failed.length} test(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${cases.length} tests passed.`);



