import { state, storageStatus } from '../core/state.js';
import { escapeHTML, formatDate, formatDateTime, localDatetimeValue, todayISO } from '../core/utils.js';
import { currentUser, currentPetReminders, petName, petOptions, selectedPet, todayCheckins, userPets } from '../core/selectors.js';
import { REMINDER_PRESETS } from '../domain/reminders.js';
import { CHECKIN_PRESETS, getCheckinSummary } from '../domain/checkins.js';
import { latestCapsules } from '../domain/capsules.js';
import { renderEmptyState } from './components.js';
import {
  API_BASE_URL,
  APP_VERSION,
  APP_IS_PRODUCTION,
  OPERATOR_NAME,
  SUPPORT_CONTACT_LABEL,
  SUPPORT_CONTACT_URL,
  SUPPORT_EMAIL
} from '../core/config.js';
import { getSessionStatus } from '../domain/sessions.js';
import { canAccessPet, canAccessPost, canDeleteComment, filterAccessiblePosts, filterOwnedPetResources, filterOwnedPets } from '../core/policies.js';
import { getLegalConsentStatus, hasAcceptedLegalConsent, LEGAL_CONSENT_VERSION } from '../domain/consent.js';
import { getPwaUpdateStatus } from '../core/pwaUpdate.js';
import { IMAGE_UPLOAD_ACCEPT, IMAGE_UPLOAD_HELP_TEXT } from '../core/validation.js';
import { REPORT_REASONS, reportReasonLabel, reportTargetLabel } from '../domain/reports.js';

export function renderApp() {
  if (!currentUser()) return renderLogin();
  const tab = state.activeTab || 'home';
  return `
    <section class="shell">
      ${renderAppHeader(tab)}
      <div class="content">${renderTab(tab)}</div>
      ${renderBottomNav()}
      ${renderSheet()}
    </section>`;
}

function appHeaderTitle(tab) {
  const titles = {
    home: '今日照护',
    pets: '宠物档案',
    care: '记录与提醒',
    community: '暖窝动态',
    admin: '我的服务'
  };
  return titles[tab] || titles.home;
}

function appHeaderMeta(tab) {
  const pet = selectedPet();
  const pending = currentPetReminders().filter(item => !item.done).length;
  const pets = userPets().length;
  if (tab === 'home') return pet ? `${pet.name} · ${pending ? `${pending} 项待处理` : '今日状态安稳'}` : '先添加一只宠物，开始安排照护';
  if (tab === 'pets') return pets ? `${pets} 只宠物已建档` : '添加宠物后，档案会显示在这里';
  if (tab === 'care') return pet ? `${pet.name} 的护理、提醒和记录` : '先选择宠物再记录护理';
  if (tab === 'community') return '分享养宠变化，也看看别人的经验';
  if (tab === 'admin') return '资料备份、隐私协议、客服反馈';
  return '把每一天的照护都安放好';
}

function renderAppHeader(tab) {
  const pet = selectedPet();
  return `<header class="topbar app-topbar">
    <div class="app-title-block">
      <span class="eyebrow">${escapeHTML(tab === 'home' ? '今天' : '当前页面')}</span>
      <h1>${escapeHTML(appHeaderTitle(tab))}</h1>
      <small>${escapeHTML(appHeaderMeta(tab))}</small>
    </div>
    <button class="topbar-pet" type="button" data-tab="pets" aria-label="${pet ? `查看${pet.name}的档案` : '添加宠物档案'}">
      ${renderPetFace(pet, { fallback: '🐾' })}
      <span>${escapeHTML(pet?.name || '建档')}</span>
    </button>
  </header>`;
}

function renderLogin() {
  const remoteReady = Boolean(API_BASE_URL);
  return `
    <section class="shell login-shell">
      <div class="card health-card login-hero-card">
        <div class="login-brand-row"><div class="logo">🐾</div><span>宠物照护助手</span></div>
        <h1 class="page-title">把宠物的日常，照顾得更稳妥。</h1>
        <p class="muted">记录档案、提醒疫苗驱虫、整理护理变化，也留下每一次值得珍藏的成长瞬间。</p>
        <div class="login-benefits">
          <span>今日照护清单</span>
          <span>成长照片时间线</span>
          <span>资料备份与隐私保护</span>
        </div>
      </div>
      ${remoteReady ? renderRemoteAuth() : renderLocalAuth()}
      ${renderSheet()}
    </section>`;
}

function renderSeedDemoButton(label, extraAttributes = '') {
  if (APP_IS_PRODUCTION) return '';
  const attrs = extraAttributes ? ` ${extraAttributes}` : '';
  return `<button class="ghost-btn"${attrs} data-action="seed-demo">${escapeHTML(label)}</button>`;
}

function renderLocalAuth() {
  return `<form id="login-form" class="card auth-card formal-auth-card">
    <div class="auth-card-head"><span class="eyebrow">开始使用</span><h2>创建你的宠物空间</h2><p>先在这台设备上建立资料，之后可以按需要再开启账号同步。</p></div>
    <div class="field"><label>怎么称呼你</label><input name="name" required maxlength="20" placeholder="例如：奶盖主人" /></div>
    <div class="field"><label>登录标识</label><input name="account" required maxlength="40" placeholder="手机号或邮箱" /></div>
    ${renderLegalConsentBlock('local')}
    <button class="primary-btn" type="submit">进入宠伴记</button>
    ${renderSeedDemoButton('游客体验', 'type="button"')}
    <p class="muted">你的资料会先保存在当前设备；导出备份前，请妥善保管自己的文件。</p>
  </form>`;
}

function renderRemoteAuth() {
  return `<div class="card auth-card formal-auth-card">
    <div class="auth-card-head"><span class="eyebrow">账号中心</span><h2>登录后继续照护</h2><p>宠物档案、提醒、护理记录和成长照片可以按账号整理，并在“我的”页管理备份。</p></div>
    <form id="remote-register-form" class="auth-stack">
      <div class="field"><label>怎么称呼你</label><input name="name" required maxlength="20" autocomplete="name" placeholder="例如：奶盖主人" /></div>
      <div class="field"><label>账号</label><input name="account" required maxlength="80" autocomplete="username" placeholder="手机号或邮箱" /></div>
      <div class="field"><label>密码</label><input name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password" placeholder="至少 8 位" /></div>
      ${renderLegalConsentBlock('remote-register')}
      <button class="primary-btn" type="submit">创建账号并进入</button>
    </form>
    <hr class="soft-divider" />
    <form id="remote-login-form" class="auth-stack">
      <div class="field"><label>已有账号</label><input name="account" required maxlength="80" autocomplete="username" placeholder="手机号或邮箱" /></div>
      <div class="field"><label>密码</label><input name="password" type="password" required minlength="8" maxlength="128" autocomplete="current-password" placeholder="输入密码" /></div>
      ${renderLegalConsentBlock('remote-login')}
      <button class="ghost-btn" type="submit">登录账号</button>
    </form>
    ${renderSeedDemoButton('游客体验', 'type="button"')}
  </div>`;
}

function renderLegalConsentBlock(source) {
  const accepted = hasAcceptedLegalConsent(state);
  return `<div class="consent-box">
    <label><input type="checkbox" name="legalConsent" value="${LEGAL_CONSENT_VERSION}" data-consent-source="${source}" ${accepted ? 'checked' : ''} /> 我已阅读并同意《用户协议》和《隐私政策》</label>
    <button class="link-btn" type="button" data-action="open-legal-sheet">查看条款</button>
  </div>`;
}

function renderBottomNav() {
  return `<nav class="nav" aria-label="主导航">
    ${navButton('home', '🐾', '今日')}
    ${navButton('pets', '🐱', '宠物')}
    ${navButton('care', '🗓️', '记录')}
    ${navButton('community', '♡', '暖窝')}
    ${navButton('admin', '♙', '我的')}
  </nav>`;
}

function navButton(id, icon, label) {
  const active = state.activeTab === id;
  return `<button type="button" data-tab="${id}" class="${active ? 'active' : ''}" aria-label="${label}" ${active ? 'aria-current="page"' : ''}><b>${icon}</b>${label}</button>`;
}

function safeImageSrc(value) {
  const src = String(value || '').trim();
  if (/^data:image\/(?:jpeg|png|webp|gif);base64,/i.test(src) || src.startsWith('/media/files/')) return escapeHTML(src);
  try {
    return new URL(src).protocol === 'https:' ? escapeHTML(src) : '';
  } catch {
    return '';
  }
}

function safeCssColor(value, fallback = '#f2e7d9') {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function renderSafeImage(src, alt) {
  const safe = safeImageSrc(src);
  return safe ? `<img src="${safe}" alt="${escapeHTML(alt)}" />` : `<div role="img" aria-label="${escapeHTML(alt)}">📷</div>`;
}

function renderPetFace(pet, { fallback = '🐾' } = {}) {
  const bg = safeCssColor(pet?.color);
  const avatarImage = safeImageSrc(pet?.avatarImage);
  if (avatarImage) {
    return `<div class="pet-face has-photo" style="background:${bg}"><img src="${avatarImage}" alt="${escapeHTML(pet.name || '宠物头像')}" /></div>`;
  }
  return `<div class="pet-face" style="background:${bg}">${escapeHTML(pet?.avatar || fallback)}</div>`;
}

function petBirthdayLabel(pet) {
  if (!pet) return '未填写';
  if (pet.birthdayMode === 'unknown') return '生日未知';
  if (pet.birthdayMode === 'adoption') return pet.birthday ? `领养日 ${formatDate(pet.birthday)}` : '领养日未填写';
  return formatDate(pet.birthday);
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

function operatorNameLabel() {
  return OPERATOR_NAME || '宠伴记服务团队';
}

function supportContactLabel() {
  return SUPPORT_CONTACT_LABEL || '联系客服';
}

function renderSupportContactLink() {
  if (SUPPORT_CONTACT_URL && isSafeSupportUrl(SUPPORT_CONTACT_URL)) {
    return `<a href="${escapeHTML(SUPPORT_CONTACT_URL)}" target="_blank" rel="noopener">${escapeHTML(supportContactLabel())}</a>`;
  }
  if (SUPPORT_EMAIL && isSafeSupportEmail(SUPPORT_EMAIL)) {
    return `<a href="mailto:${escapeHTML(SUPPORT_EMAIL)}">${escapeHTML(SUPPORT_EMAIL)}</a>`;
  }
  return '<span>可先提交反馈记录并保存编号</span>';
}

function renderOperatorSupportCard() {
  return `<div class="card"><h2 class="section-title" style="margin-top:0;">运营与客服</h2><p class="muted">用于处理账号、数据导出、注销、投诉、侵权和隐私问题。</p><div class="data-status"><span>运营主体：${escapeHTML(operatorNameLabel())}</span><span>联系：${renderSupportContactLink()}</span></div></div>`;
}

function renderReportHistory(reports) {
  if (!reports.length) return '<p class="muted">暂无反馈记录。提交后会生成编号，便于后续沟通和追踪。</p>';
  const rows = [...reports]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 5)
    .map(item => {
    const id = item.id || '未编号';
    const status = item.status === 'submitted' ? '已记录' : (item.status || '已记录');
    return `<li><strong>${escapeHTML(id)}</strong><span>${escapeHTML(reportReasonLabel(item.reason))}</span><span>${escapeHTML(status)}</span><small>${escapeHTML(formatDateTime(item.createdAt))}</small><button class="link-btn" type="button" data-action="copy-report-id" data-id="${escapeHTML(id)}">复制编号</button><button class="link-btn" type="button" data-action="copy-report-brief" data-id="${escapeHTML(id)}">复制客服说明</button></li>`;
  }).join('');
  return `<ul class="report-history">${rows}</ul>`;
}

function renderTab(tab) {
  const views = { home: renderHome, pets: renderPets, care: renderCare, community: renderCommunity, admin: renderAdmin };
  return (views[tab] || renderHome)();
}

function renderHome() {
  const pets = userPets();
  const pet = selectedPet();
  const checkins = todayCheckins(pet?.id);
  const checkinSummary = getCheckinSummary(checkins);
  const pending = currentPetReminders().filter(item => !item.done && item.dueDate <= todayISO());
  const nextReminder = currentPetReminders().find(item => !item.done);
  const latestRecords = state.records
    .filter(item => pets.some(p => p.id === item.petId))
    .sort((a, b) => new Date(b.happenedAt) - new Date(a.happenedAt))
    .slice(0, 3);

  return `
    <section class="home-hero card">
      <div class="home-hero-main">
        ${renderPetFace(pet)}
        <div class="home-hero-copy">
          <span class="eyebrow">今天的主角</span>
          <h2>${pet ? escapeHTML(pet.name) : '添加第一只宠物'}</h2>
          <p>${pet ? `${escapeHTML(pet.breed || pet.species)} · ${escapeHTML(pet.gender || '未填性别')} · ${pending.length ? `${pending.length} 个提醒待处理` : '状态安稳'}` : '建立档案后开始安排每日照护'}</p>
        </div>
      </div>
      <button class="ghost-btn home-detail-btn" type="button" data-action="open-pet-detail" data-id="${pet?.id || ''}" ${pet ? '' : 'disabled'}>查看详情</button>
    </section>

    <section class="care-progress card care-progress-v2">
      <div class="care-copy">
        <span class="eyebrow">今日计划</span>
        <h2>照护进度</h2>
        <p>${checkins.length ? `已完成 ${checkinSummary.done}/${checkinSummary.total}，还剩 ${checkinSummary.pending} 项。` : '先加入喂食、饮水、清洁等日常事项，今天就有清晰计划。'}</p>
      </div>
      <div class="care-ring-mini" style="--care-percent:${checkinSummary.percent}%"><b>${checkinSummary.pending}</b><span>待完成</span></div>
      <button class="primary-btn" type="button" data-action="open-checkin-sheet">查看计划</button>
    </section>

    <section class="checkin-grid">
      ${checkins.length ? checkins.map(renderCheckinCard).join('') : renderEmptyState({ icon: '🗓️', title: '今天还没有打卡项', description: '点管理加入饮水、喂食、铲屎等照护事项。', actionLabel: '管理打卡', action: 'open-checkin-sheet', className: 'grid-span' })}
    </section>

    <div class="section-title row"><h2 style="margin:0;">健康提醒</h2><button class="ghost-btn" data-action="open-reminder-sheet">管理</button></div>
    ${nextReminder ? renderReminderItem(nextReminder) : renderEmptyState({ icon: '💊', title: '暂无待处理提醒', description: '驱虫、疫苗、复查可以从管理提醒里添加。', actionLabel: '管理提醒', action: 'open-reminder-sheet' })}

    <h2 class="section-title">最近记录</h2>
    ${latestRecords.length ? latestRecords.map(renderRecordItem).join('') : renderEmptyState({ icon: '✍️', title: '还没有护理记录', description: '去记录页记一笔喂食、体重、洗澡或便便状态。' })}
  `;
}

function renderCheckinCard(item) {
  return `<button type="button" class="checkin-card ${item.done ? 'done' : ''}" data-action="toggle-checkin" data-id="${item.id}" aria-label="${escapeHTML(item.title)}${item.done ? '已完成' : '待打卡'}">
    <em>${item.done ? '✓' : escapeHTML(item.icon || '🐾')}</em>
    <b>${escapeHTML(item.title)}</b>
    <span>${escapeHTML(item.time || '全天')}</span>
  </button>`;
}

function renderPets() {
  const pets = userPets();
  const pet = selectedPet();
  const photos = filterOwnedPetResources(state, state.photos)
    .filter(photo => !pet || photo.petId === pet.id)
    .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  return `
    <h2 class="page-title">宠物档案</h2>
    <section class="pet-list">${pets.length ? pets.map(renderPetItem).join('') : renderEmptyState({ icon: '🐱', title: '还没有宠物档案', description: '点开下方“添加宠物档案”，先保存一只宠物。' })}</section>
    <details class="compact-panel" ${pets.length ? '' : 'open'}>
      <summary><span>添加 / 编辑宠物档案</span><b>${pets.length ? '点开修改' : '先建档'}</b></summary>
      <form id="pet-form">
        <div class="form-grid">
          <div class="field"><label>宠物名</label><input name="name" required maxlength="20" placeholder="奶盖" /></div>
          <div class="field"><label>头像</label><select name="avatar"><option>🐱</option><option>🐶</option><option>🐰</option><option>🐹</option><option>🦜</option><option>🐾</option></select></div>
          <div class="field"><label>类型</label><select name="species"><option>猫</option><option>狗</option><option>兔子</option><option>仓鼠</option><option>鸟</option><option>其他</option></select></div>
          <div class="field"><label>品种</label><input name="breed" maxlength="24" placeholder="银渐层 / 柯基" /></div>
          <div class="field"><label>性别</label><select name="gender"><option>妹妹</option><option>弟弟</option><option>未知</option></select></div>
          <div class="field"><label>生日选项</label><select name="birthdayMode" data-role="birthday-mode"><option value="birthday">知道生日</option><option value="unknown">生日未知</option><option value="adoption">只记录领养日</option></select></div>
          <div class="field birthday-date-field"><label data-role="birthday-date-label">生日</label><input name="birthday" type="date" data-role="birthday-date" /><small class="field-hint" data-role="birthday-date-hint">知道生日就填写；不知道可以切到“生日未知”。</small></div>
          <div class="field"><label>体重 kg</label><input name="weight" type="number" min="0" step="0.1" placeholder="4.2" /></div>
          <div class="field"><label>头像色</label><input name="color" type="color" value="#f2e7d9" /></div>
        </div>
        <div class="field avatar-upload-field">
          <label>真实头像照片</label>
          <div class="avatar-upload-card">
            <div class="avatar-preview" data-role="avatar-preview"><span>预览</span></div>
            <div>
              <input name="avatarImage" type="file" accept="${IMAGE_UPLOAD_ACCEPT}" data-role="avatar-image-input" />
              <small class="field-hint">可选；上传后会作为宠物头像，没传则使用上面的图标头像。${escapeHTML(IMAGE_UPLOAD_HELP_TEXT)}</small>
            </div>
          </div>
        </div>
        <div class="field"><label>照护备注</label><textarea name="note" maxlength="160" placeholder="过敏、忌口、性格、就医注意事项"></textarea></div>
        <button class="primary-btn" type="submit">保存宠物档案</button>
      </form>
    </details>
    <h2 class="section-title">成长胶囊</h2>
    <div class="photo-grid compact-photo-grid">${photos.length ? photos.map(renderPhotoItem).join('') : renderEmptyState({ icon: '📷', title: '还没有成长胶囊', description: '点开下方“上传成长胶囊”，记录第一次回家、洗澡或出门。', className: 'grid-span' })}</div>
    <details class="compact-panel">
      <summary><span>上传成长胶囊</span><b>照片记录</b></summary>
      <form id="photo-form">
        <div class="field"><label>关联宠物</label><select name="petId" required>${petOptions(pet?.id)}</select></div>
        <div class="field"><label>胶囊标题</label><input name="title" required maxlength="40" placeholder="第一次回家" /></div>
        <div class="field"><label>选择图片</label><input name="image" type="file" accept="${IMAGE_UPLOAD_ACCEPT}" required /><small class="field-hint">${escapeHTML(IMAGE_UPLOAD_HELP_TEXT)}</small></div>
        <button class="primary-btn" type="submit">加入成长胶囊</button>
      </form>
    </details>`;
}

function renderPetItem(pet) {
  const isSelected = pet.id === state.selectedPetId;
  const weightLabel = pet.weight ? `${escapeHTML(pet.weight)} kg` : '未记录';
  return `<article class="pet-item pet-profile-card ${isSelected ? 'selected' : ''}">
    <div class="pet-card-topline">
      <span class="pet-card-kicker">${isSelected ? '当前主宠' : '宠物档案'}</span>
      <span class="pet-card-status">${isSelected ? '主宠' : '可切换'}</span>
    </div>
    <div class="pet-card-header">
      ${renderPetFace(pet)}
      <div class="pet-card-title">
        <h3>${escapeHTML(pet.name)}</h3>
        <p>${escapeHTML(pet.species)} · ${escapeHTML(pet.breed || '未填品种')} · ${escapeHTML(pet.gender)}</p>
      </div>
      <button class="ghost-btn pet-card-detail" type="button" data-action="open-pet-detail" data-id="${pet.id}">详情</button>
    </div>
    <div class="pet-card-metrics">
      <span><b>${escapeHTML(petBirthdayLabel(pet))}</b><small>生日 / 领养</small></span>
      <span><b>${weightLabel}</b><small>体重</small></span>
    </div>
    ${pet.note ? `<p class="pet-card-note">${escapeHTML(pet.note)}</p>` : '<p class="pet-card-note muted">还没有照护备注，可补充忌口、性格和就医注意事项。</p>'}
    <div class="pet-card-actions">
      <button class="ghost-btn" type="button" data-action="select-pet" data-id="${pet.id}" ${isSelected ? 'disabled' : ''}>${isSelected ? '已是主宠' : '设为主宠'}</button>
      <button class="danger-btn" type="button" data-action="delete-pet" data-id="${pet.id}">删除档案</button>
    </div>
  </article>`;
}

function renderPhotoItem(photo) {
  return `<article class="photo-card">${renderSafeImage(photo.imageData, photo.title)}<h3 style="margin:8px 0 0;font-size:14px;">${escapeHTML(photo.title)}</h3><p class="muted">${escapeHTML(petName(photo.petId))} · ${formatDate(photo.createdAt)}</p><div class="post-actions"><button class="danger-btn" type="button" data-action="delete-photo" data-id="${photo.id}">删除照片</button></div></article>`;
}

function renderCare() {
  const panel = state.carePanel || 'reminders';
  return `<h2 class="page-title">记录与提醒</h2>
    ${renderHealthDisclaimer()}
    <div class="segment">${panelButton('reminders', '提醒')}${panelButton('records', '护理')}${panelButton('stats', '统计')}</div>
    ${panel === 'reminders' ? renderReminderPanel() : panel === 'records' ? renderRecordPanel() : renderStatsPanel()}`;
}

function renderHealthDisclaimer() {
  return `<aside class="health-disclaimer" role="note">
    <b>健康说明</b>
    <span>提醒、护理记录和趋势图仅用于日常照护记录，不构成兽医诊断、治疗或用药建议；出现异常请及时咨询专业兽医。</span>
  </aside>`;
}

function panelButton(id, label) {
  return `<button data-panel="${id}" class="${state.carePanel === id ? 'active' : ''}">${label}</button>`;
}

function renderReminderPanel() {
  const pet = selectedPet();
  const reminders = currentPetReminders();
  return `<div class="card"><div class="row" style="margin-bottom:12px;"><div><h3 style="margin:0;">健康提醒</h3><p class="muted">也可以用暖色底部弹层快速管理。</p></div><button class="ghost-btn" data-action="open-reminder-sheet">管理提醒</button></div><form id="reminder-form">
    <div class="field"><label>关联宠物</label><select name="petId" required>${petOptions(pet?.id)}</select></div>
    <div class="form-grid"><div class="field"><label>类型</label><select name="type"><option>疫苗</option><option>驱虫</option><option>体检</option><option>洗澡</option><option>自定义</option></select></div><div class="field"><label>到期日期</label><input name="dueDate" type="date" required value="${todayISO()}" /></div></div>
    <div class="field"><label>标题</label><input name="title" required maxlength="40" placeholder="年度疫苗 / 体内驱虫" /></div>
    <div class="field"><label>备注</label><textarea name="note" maxlength="120" placeholder="例如：带疫苗本，空腹称重"></textarea></div>
    <button class="primary-btn" type="submit">添加提醒</button>
  </form></div><div class="stack">${reminders.length ? reminders.map(renderReminderItem).join('') : renderEmptyState({ icon: '🔔', title: '还没有提醒', description: '添加疫苗、驱虫、体检或洗澡提醒，首页会优先展示最近待办。' })}</div>`;
}

export function renderReminderItem(item) {
  const overdue = !item.done && item.dueDate <= todayISO();
  return `<article class="list-item"><div class="row"><div><h3 style="margin:0;">${escapeHTML(item.title)}</h3><p class="muted">${escapeHTML(petName(item.petId))} · ${escapeHTML(item.type)} · ${formatDate(item.dueDate)}</p></div><span class="pill ${item.done ? 'done' : overdue ? 'warn' : ''}">${item.done ? '已完成' : overdue ? '待处理' : '计划中'}</span></div>${item.note ? `<p>${escapeHTML(item.note)}</p>` : ''}<div class="post-actions"><button class="ghost-btn" data-action="toggle-reminder" data-id="${item.id}">${item.done ? '设为待办' : '标记完成'}</button><button class="danger-btn" data-action="delete-reminder" data-id="${item.id}">删除</button></div></article>`;
}

function renderRecordPanel() {
  const pet = selectedPet();
  const pets = userPets();
  const records = filterOwnedPetResources(state, state.records)
    .sort((a,b)=>new Date(b.happenedAt)-new Date(a.happenedAt));
  return `<div class="card record-form-card"><form id="record-form" class="record-form">
    <div class="field"><label>关联宠物</label><select name="petId" required>${petOptions(pet?.id)}</select></div>
    <div class="form-grid"><div class="field"><label>类型</label><select name="type"><option>喂食</option><option>体重</option><option>洗澡</option><option>便便</option><option>其他</option></select></div><div class="field"><label>时间</label><input name="happenedAt" type="datetime-local" value="${localDatetimeValue()}" /></div></div>
    <div class="field"><label>数值/描述</label><input name="value" required maxlength="60" placeholder="80g / 4.2kg / 状态正常" /></div>
    <div class="field"><label>备注</label><textarea name="note" maxlength="120" placeholder="可记录品牌、精神状态、异常情况"></textarea></div>
    <button class="primary-btn" type="submit">保存护理记录</button>
  </form></div><div class="stack">${records.length ? records.map(renderRecordItem).join('') : renderEmptyState({ icon: '🧾', title: '还没有护理记录', description: '记录喂食、体重、洗澡和便便状态，后续会形成趋势。' })}</div>`;
}

export function renderRecordItem(item) {
  return `<article class="list-item"><div class="row"><div><h3 style="margin:0;">${escapeHTML(item.type)} · ${escapeHTML(item.value)}</h3><p class="muted">${escapeHTML(petName(item.petId))} · ${formatDateTime(item.happenedAt)}</p></div><span class="pill">记录</span></div>${item.note ? `<p>${escapeHTML(item.note)}</p>` : ''}<div class="post-actions"><button class="danger-btn" type="button" data-action="delete-record" data-id="${item.id}">删除记录</button></div></article>`;
}

function renderStatsPanel() {
  const pet = selectedPet();
  return `<div class="card"><h2 class="section-title" style="margin-top:0;">${pet ? escapeHTML(pet.name) : '宠物'}体重趋势</h2><canvas id="weight-chart" width="720" height="360"></canvas></div><div class="card"><h2 class="section-title" style="margin-top:0;">记录类型分布</h2><canvas id="record-chart" width="720" height="360"></canvas></div><div class="card"><h2 class="section-title" style="margin-top:0;">提醒完成状态</h2><canvas id="reminder-chart" width="720" height="260"></canvas></div>`;
}

function renderCommunity() {
  const pet = selectedPet();
  const posts = filterAccessiblePosts(state, state.posts).slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  return `<section class="community-hero card">
      <span class="eyebrow">宠物生活圈</span>
      <h2>暖窝动态</h2>
      <p>记录照片、状态和照护经验，把零散小事沉淀成宠物成长时间线。</p>
    </section>
    <section class="community-composer card">
      <form id="post-form">
        <div class="composer-row">
          ${renderPetFace(pet)}
          <div class="field"><label>关联宠物</label><select name="petId">${petOptions(pet?.id)}</select></div>
        </div>
        <div class="field"><label>分享一次变化</label><textarea name="content" required maxlength="280" placeholder="例如：奶盖今天换粮第三天，精神状态稳定，还拍到一张很乖的照片。"></textarea></div>
        <label class="post-image-picker">
          <input name="image" type="file" accept="${IMAGE_UPLOAD_ACCEPT}" data-role="post-image-input" />
          <span>＋ 添加照片</span>
          <small>${escapeHTML(IMAGE_UPLOAD_HELP_TEXT)}</small>
        </label>
        <div class="post-image-preview" data-role="post-image-preview" hidden></div>
        <button class="primary-btn" type="submit">发布图文动态</button>
      </form>
    </section>
    <div class="community-feed">${posts.length ? posts.map(renderPostItem).join('') : renderEmptyState({ icon: '☕', title: '暖窝还没有动态', description: '发布第一条有用的养宠小事，比如换粮、复查或约遛经验。' })}</div>`;
}

function renderPostItem(post) {
  const user = state.users.find(item => item.id === post.authorId);
  const liked = post.likedBy.includes(state.currentUserId);
  const canManagePost = canAccessPost(state, post);
  return `<article class="post community-post">
    <header class="post-header">
      ${renderPostAvatar(post)}
      <div><h3>${escapeHTML(petName(post.petId))}</h3><p>${escapeHTML(user?.name || '养宠人')} · ${formatDateTime(post.createdAt)}</p></div>
    </header>
    ${post.imageData ? `<div class="post-image">${renderSafeImage(post.imageData, `${petName(post.petId)}动态图片`)}</div>` : ''}
    <p class="post-content">${escapeHTML(post.content)}</p>
    <div class="post-actions community-actions"><button class="ghost-btn" type="button" data-action="toggle-like" data-id="${post.id}">${liked ? '已喜欢' : '喜欢'} ${post.likedBy.length}</button><span class="pill">评论 ${post.comments.length}</span><button class="ghost-btn" type="button" data-action="open-report-sheet" data-report-type="post" data-id="${post.id}">投诉</button>${canManagePost ? `<button class="danger-btn" type="button" data-action="delete-post" data-id="${post.id}">删除动态</button>` : ''}</div>
    <div class="comment-list">${post.comments.map(comment => renderCommentItem(post, comment)).join('')}</div>
    <form class="comment-form" data-post-id="${post.id}"><label class="sr-only">评论内容</label><input name="content" required maxlength="100" placeholder="写一句评论" /><button class="ghost-btn" type="submit">评论</button></form>
  </article>`;
}

function renderPostAvatar(post) {
  const pet = state.pets.find(item => item.id === post.petId && canAccessPet(state, item));
  const fallback = (petName(post.petId) || '宠').slice(0, 1);
  const bg = safeCssColor(pet?.color);
  const avatarImage = safeImageSrc(pet?.avatarImage);
  if (avatarImage) {
    return `<div class="post-avatar pet-face has-photo" style="background:${bg}"><img src="${avatarImage}" alt="${escapeHTML(pet?.name || '宠物头像')}" /></div>`;
  }
  return `<div class="post-avatar pet-face" style="background:${bg}">${escapeHTML(pet?.avatar || fallback)}</div>`;
}

function renderCommentItem(post, comment) {
  const user = state.users.find(item => item.id === comment.authorId);
  const canDelete = canDeleteComment(state, post, comment);
  return `<div class="comment"><strong>${escapeHTML(user?.name || '用户')}：</strong>${escapeHTML(comment.content)}<button class="link-btn comment-delete-btn" type="button" data-action="open-report-sheet" data-report-type="comment" data-post-id="${post.id}" data-id="${comment.id}">投诉</button>${canDelete ? `<button class="link-btn comment-delete-btn" type="button" data-action="delete-comment" data-post-id="${post.id}" data-id="${comment.id}">删除</button>` : ''}</div>`;
}

function renderAdminPanel({ title, badge = '', body, open = false, danger = false }) {
  return `<details class="compact-panel admin-panel${danger ? ' danger-panel' : ''}" ${open ? 'open' : ''}>
    <summary><span>${escapeHTML(title)}</span>${badge ? `<b>${escapeHTML(badge)}</b>` : ''}</summary>
    <div class="compact-panel-body">${body}</div>
  </details>`;
}

function renderAdmin() {
  const ownedPosts = filterAccessiblePosts(state, state.posts);
  const ownedPets = filterOwnedPets(state);
  const ownedRecords = filterOwnedPetResources(state, state.records);
  const ownedReminders = filterOwnedPetResources(state, state.reminders);
  const myReports = state.reports
    .filter(item => item.reporterId === state.currentUserId)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const pending = ownedReminders.filter(item => !item.done).length;
  const session = getSessionStatus(state.session);
  const consent = getLegalConsentStatus(state);
  const pwaUpdate = getPwaUpdateStatus();
  const pwaStatus = !pwaUpdate.supported ? '当前安装环境无需手动更新' : (pwaUpdate.updateAvailable ? '发现新版本' : '已是最新');
  const remoteReady = storageStatus.remoteReady && session.hasToken;
  const remoteDisabled = remoteReady ? '' : 'disabled';
  const supportConfigured = Boolean(SUPPORT_CONTACT_URL || SUPPORT_EMAIL);
  const accountModeLabel = remoteReady ? '账号同步已开启' : '资料保存在此设备';
  const privacyLabel = consent.accepted ? '隐私授权已确认' : '待确认隐私授权';
  const supportSummary = supportConfigured ? '客服服务可用' : '反馈记录可用';
  const dataCards = [
    { label: '宠物档案', value: ownedPets.length, meta: '已建档宠物', tone: 'ok' },
    { label: '待办提醒', value: pending, meta: pending ? '今天待处理' : '暂无待处理', tone: pending ? 'warn' : 'ok' },
    { label: '护理记录', value: ownedRecords.length, meta: '累计照护记录', tone: 'neutral' },
    { label: '暖窝动态', value: ownedPosts.length, meta: '我的发布', tone: 'neutral' }
  ];
  const quickServices = [
    { icon: '🧾', title: '协议与隐私', desc: privacyLabel, action: 'open-legal-sheet', label: '查看' },
    { icon: '💾', title: '资料备份', desc: '保存一份宠物资料副本', action: 'export-local-backup', label: '导出' },
    { icon: '📣', title: '问题反馈', desc: myReports.length ? `已记录 ${myReports.length} 条` : '提交问题并获得编号', action: 'open-report-sheet', label: '提交', attrs: 'data-report-type="general"' },
    { icon: '🛟', title: '帮助与客服', desc: supportSummary, action: 'export-support-diagnostics', label: '排查包' }
  ];

  const panels = [
    renderAdminPanel({
      title: '资料与备份',
      badge: accountModeLabel,
      open: true,
      body: `<p class="muted">导出宠物资料，或从之前保存的备份文件恢复。恢复会覆盖当前设备里的资料，建议先导出一份备份。</p><div class="sync-actions"><button class="ghost-btn" data-action="export-account-data" ${remoteDisabled}>导出账号资料</button><button class="ghost-btn" data-action="export-local-backup">导出资料备份</button></div><div class="field"><label for="local-backup-input">恢复备份文件</label><input id="local-backup-input" type="file" accept="application/json,.json" data-role="local-backup-input" /><small class="field-hint">恢复前建议先导出当前资料，避免误覆盖。</small></div>`
    }),
    renderAdminPanel({
      title: '隐私与协议',
      badge: consent.accepted ? '已确认' : '待确认',
      body: `<p class="muted">查看用户协议、隐私政策，以及资料保存、导出和删除说明。</p><div class="data-status"><span>${consent.accepted ? '已确认协议与隐私' : '尚未确认协议与隐私'}</span><span>${consent.acceptedAt ? `确认时间：${escapeHTML(formatDate(consent.acceptedAt))}` : '确认时间：未记录'}</span></div><button class="ghost-btn" data-action="open-legal-sheet">查看用户协议与隐私政策</button>`
    }),
    renderAdminPanel({
      title: '同步与备份',
      badge: remoteReady ? '可同步' : '未开启',
      body: `<p class="muted">${remoteReady ? '当前账号可以手动保存到云端，也可以从云端恢复资料。' : '当前数据仅保存在这台设备的浏览器里；登录账号后可开启云端同步和备份。'}</p><div class="sync-actions"><button class="ghost-btn" data-action="push-remote-state" ${remoteDisabled}>保存到云端</button><button class="ghost-btn" data-action="pull-remote-state" ${remoteDisabled}>从云端恢复</button><button class="ghost-btn" data-action="create-remote-backup" ${remoteDisabled}>创建云备份</button></div>`
    }),
    renderAdminPanel({
      title: '应用更新',
      badge: pwaUpdate.updateAvailable ? '可更新' : '正常',
      body: `<p class="muted">检查是否有新的 App 版本，更新后可以获得最新体验和修复。</p><div class="data-status"><span>当前版本：v${APP_VERSION}</span><span>更新状态：${escapeHTML(pwaStatus)}</span></div><div class="sync-actions"><button class="ghost-btn" data-action="check-pwa-update">检查更新</button><button class="primary-btn" data-action="apply-pwa-update" ${pwaUpdate.updateAvailable ? '' : 'disabled'}>立即更新</button></div>`
    }),
    renderAdminPanel({
      title: '客服与反馈',
      badge: `${myReports.length} 条`,
      body: `<p class="muted">遇到账号、资料、投诉、隐私或功能问题，可以提交反馈并保存编号，便于后续沟通。</p><div class="data-status"><span>服务团队：${escapeHTML(operatorNameLabel())}</span><span>联系：${renderSupportContactLink()}</span><span>反馈记录：${myReports.length}</span><span>${myReports[0] ? `最近：${escapeHTML(reportReasonLabel(myReports[0].reason))}` : '暂无近期反馈'}</span></div>${renderReportHistory(myReports)}<div class="sync-actions"><button class="ghost-btn" data-action="open-report-sheet" data-report-type="general">提交反馈或投诉</button><button class="ghost-btn" data-action="export-reports" ${myReports.length ? '' : 'disabled'}>导出反馈记录</button><button class="ghost-btn" data-action="export-support-diagnostics" aria-label="导出客服诊断包">导出问题排查包</button></div>`
    }),
    renderAdminPanel({
      title: '谨慎操作',
      badge: '需确认',
      danger: true,
      body: `<p class="muted">清空当前设备里的宠物档案、提醒、记录、照片、动态和登录状态。注销账号会按条款删除对应账号资料。</p><div class="sync-actions"><button class="danger-btn" data-action="clear-data">清空此设备资料</button><button class="danger-btn" data-action="delete-remote-account" ${remoteDisabled}>注销账号</button></div>`
    })
  ];

  return `<section class="account-hero account-hero-customer card">
    <div>
      <span class="eyebrow">我的账户</span>
      <h2>我的宠伴记</h2>
      <p>${escapeHTML(accountModeLabel)} · ${escapeHTML(privacyLabel)} · ${escapeHTML(supportSummary)}</p>
    </div>
    <div class="account-hero-actions">
      <button class="ghost-btn" type="button" data-action="open-legal-sheet">协议与隐私</button>
      <button class="ghost-btn" type="button" data-action="logout">退出登录</button>
    </div>
  </section>
  <div class="account-overview-grid account-data-grid">${dataCards.map(item => `<article class="account-status-card ${item.tone}"><span>${escapeHTML(item.label)}</span><strong>${escapeHTML(String(item.value))}</strong><small>${escapeHTML(String(item.meta))}</small></article>`).join('')}</div>
  <section class="account-section-card card">
    <div class="section-heading"><div><span class="eyebrow">常用服务</span><h3>服务与安全</h3></div><small>常用操作</small></div>
    <div class="account-service-grid">${quickServices.map(item => `<button class="account-service-card" type="button" data-action="${escapeHTML(item.action)}" ${item.attrs || ''}><span>${escapeHTML(item.icon)}</span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.desc)}</small><b>${escapeHTML(item.label)}</b></button>`).join('')}</div>
  </section>
  <section class="account-section-card card">
    <div class="section-heading"><div><span class="eyebrow">更多设置</span><h3>资料、隐私与帮助</h3></div><small>按需展开</small></div>
    <div class="admin-panels customer-panels">${panels.join('')}</div>
  </section>`;
}
function renderSheet() {
  if (state.ui.sheet === 'legal') return renderLegalSheet();
  if (state.ui.sheet === 'pet-detail') return renderPetDetailSheet();
  if (state.ui.sheet === 'reminders') return renderReminderSheet();
  if (state.ui.sheet === 'checkins') return renderCheckinSheet();
  if (state.ui.sheet === 'report') return renderReportSheet();
  if (state.ui.sheet === 'confirm') return renderConfirmSheet();
  return '';
}

function renderReportSheet() {
  const target = state.ui.reportTarget || { type: 'general' };
  const targetLabel = reportTargetLabel(target.type);
  const reasonOptions = REPORT_REASONS.map(item => `<option value="${escapeHTML(item.value)}">${escapeHTML(item.label)}</option>`).join('');
  return `<div class="sheet-backdrop" data-action="close-sheet">
    <section class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="report-sheet-title" data-sheet-panel>
      <i class="sheet-handle"></i>
      <header><div><h2 id="report-sheet-title">反馈与投诉</h2><p>${escapeHTML(targetLabel)} · 提交后会生成编号，便于后续沟通</p></div><button data-action="close-sheet">取消</button></header>
      <form id="report-form" class="sheet-form">
        <input type="hidden" name="targetType" value="${escapeHTML(target.type || 'general')}" />
        <input type="hidden" name="targetId" value="${escapeHTML(target.id || '')}" />
        <input type="hidden" name="postId" value="${escapeHTML(target.postId || '')}" />
        <label class="sr-only">问题类型</label><select name="reason" required>${reasonOptions}</select>
        <label class="sr-only">补充说明</label><textarea name="detail" maxlength="300" placeholder="请说明问题，例如侵权、骚扰、隐私泄露、广告垃圾、误导性健康建议或功能异常。"></textarea>
        <p class="field-hint">不要填写密码、验证码、私钥或完整身份证等敏感信息。提交后请保存编号；账号问题可同时导出问题排查包。</p>
        <button class="primary-btn" type="submit">提交反馈</button>
      </form>
    </section>
  </div>`;
}

function renderConfirmSheet() {
  const confirm = state.ui.confirm || {};
  const title = confirm.title || '确认操作';
  const message = confirm.message || '这个操作完成后可能无法恢复，请确认是否继续。';
  const confirmLabel = confirm.confirmLabel || '确认';
  const requiresPassword = Boolean(confirm.requiresPassword);
  const passwordBlock = requiresPassword
    ? `<form id="confirm-password-form" class="confirm-password-form">
        <div class="field">
          <label for="confirm-password-input">${escapeHTML(confirm.passwordLabel || '当前密码')}</label>
          <input id="confirm-password-input" name="password" type="password" required minlength="8" maxlength="128" autocomplete="current-password" placeholder="输入当前账号密码" />
          <small class="field-hint">密码只用于本次确认，不会写入资料备份。</small>
        </div>
        <div class="confirm-actions">
          <button class="ghost-btn" type="button" data-action="cancel-confirm">再想想</button>
          <button class="danger-btn" type="submit">${escapeHTML(confirmLabel)}</button>
        </div>
      </form>`
    : `<div class="confirm-actions">
        <button class="ghost-btn" type="button" data-action="cancel-confirm">再想想</button>
        <button class="danger-btn" type="button" data-action="confirm-danger">${escapeHTML(confirmLabel)}</button>
      </div>`;
  return `<div class="sheet-backdrop confirm-backdrop" data-action="cancel-confirm">
    <section class="bottom-sheet confirm-sheet" role="alertdialog" aria-modal="true" aria-labelledby="confirm-sheet-title" aria-describedby="confirm-sheet-message" data-sheet-panel>
      <i class="sheet-handle"></i>
      <header><h2 id="confirm-sheet-title">${escapeHTML(title)}</h2><button type="button" data-action="cancel-confirm">取消</button></header>
      <p id="confirm-sheet-message">${escapeHTML(message)}</p>
      ${passwordBlock}
    </section>
  </div>`;
}

function renderLegalSheet() {
  return `<div class="sheet-backdrop" data-action="close-sheet">
    <section class="bottom-sheet legal-sheet" role="dialog" aria-modal="true" aria-labelledby="legal-sheet-title" data-sheet-panel>
      <i class="sheet-handle"></i>
      <header><h2 id="legal-sheet-title">用户协议与隐私政策</h2><button data-action="close-sheet">完成</button></header>
      <div class="legal-list">
        <h3>服务范围</h3>
        <p>宠伴记用于宠物档案、每日打卡、健康提醒、护理记录、成长胶囊、暖窝动态、资料同步、资料备份、账号资料导出和账号注销。</p>
        <h3>运营与客服</h3>
        <p>当前运营主体：${escapeHTML(operatorNameLabel())}。账号、数据导出、注销、投诉、侵权或隐私问题可通过 ${renderSupportContactLink()} 联系处理。</p>
        <h3>用户责任</h3>
        <p>请只上传你有权保存和分享的账号、宠物资料、图片、动态和评论，不发布违法、侵权、骚扰、欺诈、恶意代码或过度暴露个人隐私的内容。</p>
        <h3>隐私和数据处理</h3>
        <p>未登录账号时，资料保存在当前设备；登录账号后，相关资料会用于注册登录、资料同步、资料备份、图片保存、图片删除、账号资料导出和账号注销。</p>
        <h3>删除和导出</h3>
        <p>你可以在“我的”页导出账号资料或注销账号。注销会删除当前账号、登录会话、云端资料、云备份和可识别的当前用户媒体文件，并使旧登录状态失效。</p>
        <h3>健康提示</h3>
        <p>健康提醒、护理记录和体重趋势仅用于日常管理，不构成兽医诊断、治疗建议或用药建议；宠物异常时请咨询专业兽医。</p>
        <p class="muted">当前条款版本：${LEGAL_CONSENT_VERSION}。完整文本可查看 <a href="./docs/terms.md" target="_blank" rel="noopener">《用户协议》</a> 和 <a href="./docs/privacy.md" target="_blank" rel="noopener">《隐私政策》</a>。</p>
        <button class="primary-btn" type="button" data-action="accept-legal-consent">同意并继续</button>
      </div>
    </section>
  </div>`;
}

function renderCheckinSheet() {
  const pet = selectedPet();
  const items = todayCheckins(pet?.id);
  const summary = getCheckinSummary(items);
  const presetButtons = CHECKIN_PRESETS.map(item => {
    const added = items.some(checkin => checkin.title === item.title);
    return `<button data-action="add-checkin-preset" data-icon="${escapeHTML(item.icon)}" data-title="${escapeHTML(item.title)}" data-time="${escapeHTML(item.time)}" ${added ? 'disabled' : ''}>
      <i>${escapeHTML(item.icon)}</i><span>${escapeHTML(item.title)}</span><small>${added ? '已加入' : escapeHTML(item.time)}</small>
    </button>`;
  }).join('');

  return `<div class="sheet-backdrop" data-action="close-sheet">
    <section class="bottom-sheet checkin-sheet" role="dialog" aria-modal="true" aria-labelledby="checkin-sheet-title" data-sheet-panel>
      <i class="sheet-handle"></i>
      <header><div><h2 id="checkin-sheet-title">打卡管理</h2><p>${pet ? `${escapeHTML(pet.name)} · 今日照护计划` : '先添加宠物后再管理打卡'}</p></div><button data-action="close-sheet">完成</button></header>
      <section class="sheet-summary">
        <div class="sheet-progress" style="--care-percent:${summary.percent}%"><b>${summary.percent}%</b><span>完成率</span></div>
        <div class="sheet-metrics">
          <span><b>${summary.total}</b>今日项目</span>
          <span><b>${summary.done}</b>已完成</span>
          <span><b>${summary.pending}</b>待打卡</span>
        </div>
      </section>
      <div class="sheet-toolbar">
        <button data-action="complete-all-checkins" ${items.length && summary.pending ? '' : 'disabled'}>全部完成</button>
        <button data-action="reset-all-checkins" ${items.length && summary.done ? '' : 'disabled'}>全部待办</button>
      </div>
      <small>今日项目</small>
      <div class="manage-list checkin-manage-list">${items.length ? items.map(renderManageCheckin).join('') : renderEmptyState({ icon: '🐾', title: '暂无打卡项', description: '先从下方快速加入常用照护项目。' })}</div>
      <small>快速加入</small>
      <div class="quick-preset-grid">${presetButtons}</div>
      <small>自定义项目</small>
      <form id="checkin-form" class="sheet-form">
        <label class="sr-only">打卡标题</label><input name="title" required maxlength="24" placeholder="自定义项目，例如：滴眼药水" />
        <div class="form-grid"><label class="sr-only">打卡图标</label><input name="icon" maxlength="2" placeholder="图标，如 💊" /><label class="sr-only">打卡时间</label><input name="time" placeholder="时间，如 12:00" /></div>
        <button class="dashed" type="submit">＋ 创建自定义打卡</button>
      </form>
    </section>
  </div>`;
}

function renderManageCheckin(item) {
  return `<div class="manage-row checkin-manage-row ${item.done ? 'done' : ''}">
    <i>${item.done ? '✓' : escapeHTML(item.icon || '🐾')}</i>
    <b>${escapeHTML(item.title)}</b>
    <span>${escapeHTML(item.time || '全天')} · ${item.done ? '已完成' : '待打卡'}</span>
    <button data-action="toggle-checkin" data-id="${item.id}">${item.done ? '待办' : '完成'}</button>
    <button data-action="delete-checkin" data-id="${item.id}">删除</button>
  </div>`;
}

function renderReminderSheet() {
  const pet = selectedPet();
  const reminders = currentPetReminders();
  const pending = reminders.filter(item => !item.done);
  const completed = reminders.filter(item => item.done).slice(0, 3);
  return `<div class="sheet-backdrop" data-action="close-sheet">
      <section class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="reminder-sheet-title" data-sheet-panel>
        <i class="sheet-handle"></i>
        <header><h2 id="reminder-sheet-title">健康提醒管理</h2><button data-action="close-sheet">完成</button></header>
        ${renderHealthDisclaimer()}
        <small>待处理</small>
      <div class="manage-list">${pending.length ? pending.map(renderManageReminder).join('') : renderEmptyState({ icon: '🌿', title: '暂无待处理提醒', description: '从下方快速添加驱虫、疫苗或就医提醒。' })}</div>
      <small>最近完成</small>
      <div class="manage-list">${completed.length ? completed.map(renderManageReminder).join('') : renderEmptyState({ icon: '✅', title: '还没有完成记录', description: '完成提醒后会在这里保留最近记录。' })}</div>
      <small>快速添加</small>
      <div class="chip-cloud">
        ${REMINDER_PRESETS.map(item => `<button data-action="add-reminder-preset" data-type="${escapeHTML(item.type)}">${escapeHTML(item.icon)} ${escapeHTML(item.type)}</button>`).join('')}
      </div>
      <small>自定义</small>
      <form id="reminder-sheet-form" class="sheet-form">
        <label class="sr-only">提醒名称</label><input name="title" required maxlength="40" placeholder="提醒名称，例如：复查耳朵" />
        <div class="form-grid">
          <label class="sr-only">提醒类型</label><select name="type"><option>疫苗</option><option>驱虫</option><option>体检</option><option>洗澡</option><option>自定义</option></select>
          <label class="sr-only">提醒图标</label><input name="icon" maxlength="2" placeholder="图标，如 🏥" />
        </div>
        <div class="form-grid">
          <label class="sr-only">提醒日期</label><input name="dueDate" type="date" required value="${todayISO()}" />
          <label class="sr-only">提醒备注</label><input name="note" placeholder="备注，如 带疫苗本" />
        </div>
        <input type="hidden" name="petId" value="${escapeHTML(pet?.id || '')}" />
        <button class="dashed" type="submit">＋ 创建健康提醒</button>
      </form>
    </section>
  </div>`;
}

function renderManageReminder(item) {
  return `<div class="manage-row reminder-manage-row"><i>${escapeHTML(item.icon || '🔔')}</i><b>${escapeHTML(item.title)}</b><span>${escapeHTML(petName(item.petId))} · ${formatDate(item.dueDate)} ${item.done ? '· 已完成' : '· 待处理'}</span><button data-action="toggle-reminder" data-id="${item.id}">${item.done ? '待办' : '完成'}</button><button data-action="delete-reminder" data-id="${item.id}">删除</button></div>`;
}

function renderPetDetailSheet() {
  const pet = (canAccessPet(state, state.ui.detailPetId) && state.pets.find(item => item.id === state.ui.detailPetId)) || selectedPet();
  if (!pet) {
    return `<div class="sheet-backdrop" data-action="close-sheet"><section class="bottom-sheet" data-sheet-panel><i class="sheet-handle"></i><header><h2>宠物详情</h2><button data-action="close-sheet">完成</button></header>${renderEmptyState({ icon: '🐾', title: '请先添加宠物档案', description: '建立档案后才能查看打卡、提醒和成长胶囊。' })}</section></div>`;
  }
  const checkins = todayCheckins(pet.id);
  const doneCount = checkins.filter(item => item.done).length;
  const reminders = filterOwnedPetResources(state, state.reminders)
    .filter(item => item.petId === pet.id && !item.done)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3);
  const records = filterOwnedPetResources(state, state.records)
    .filter(item => item.petId === pet.id)
    .sort((a, b) => new Date(b.happenedAt) - new Date(a.happenedAt))
    .slice(0, 3);
  const capsules = latestCapsules({ state, petId: pet.id, limit: 3 });

  return `<div class="sheet-backdrop" data-action="close-sheet">
    <section class="bottom-sheet pet-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="pet-detail-title" data-sheet-panel>
      <i class="sheet-handle"></i>
      <header><h2 id="pet-detail-title">宠物详情</h2><button data-action="close-sheet">完成</button></header>
      <section class="pet-detail-cover">
        ${renderPetFace(pet)}
        <div><h2>${escapeHTML(pet.name)}</h2><p>${escapeHTML(pet.species)} · ${escapeHTML(pet.breed || '未填品种')} · ${escapeHTML(pet.gender || '未知')}</p></div>
      </section>
      <div class="detail-stats">
        <div><b>${pet.weight || '--'}</b><span>体重 kg</span></div>
        <div><b>${doneCount}/${checkins.length || 0}</b><span>今日打卡</span></div>
        <div><b>${reminders.length}</b><span>待提醒</span></div>
      </div>
      <small>基础信息</small>
      <div class="info-list">
        <div><span>生日</span><b>${escapeHTML(petBirthdayLabel(pet))}</b></div>
        <div><span>建档</span><b>${formatDate(pet.createdAt)}</b></div>
        <div><span>备注</span><b>${escapeHTML(pet.note || '未填写')}</b></div>
      </div>
      <small>近期提醒</small>
      <div class="manage-list">${reminders.length ? reminders.map(renderManageReminder).join('') : renderEmptyState({ icon: '💊', title: '没有待处理提醒', description: '需要时可从健康提醒管理里添加。' })}</div>
      <small>最近记录</small>
      <div class="stack">${records.length ? records.map(renderRecordItem).join('') : renderEmptyState({ icon: '🧾', title: '还没有护理记录', description: '护理记录会帮助判断饮食、体重和状态变化。' })}</div>
      <small>成长胶囊</small>
      <div class="capsule-strip">${capsules.length ? capsules.map(item => `<article>${renderSafeImage(item.imageData, item.title)}<b>${escapeHTML(item.title)}</b><span>${formatDate(item.createdAt)}</span></article>`).join('') : renderEmptyState({ icon: '📷', title: '还没有成长胶囊', description: '保存照片后会出现在这里。' })}</div>
    </section>
  </div>`;
}






