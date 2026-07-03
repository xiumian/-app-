import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const checks = [];
const add = (name, pass, detail = '') => checks.push({ name, pass, detail });

const requiredFiles = [
  'index.html',
  '_headers',
  'runtime-config.js',
  'runtime-config.example.js',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'service-worker.js',
  'Dockerfile',
  '.dockerignore',
  '.gitignore',
  '.github/workflows/release-gate.yml',
  'deploy/docker-compose.production.yml',
  'deploy/nginx.conf',
  'deploy/target.example.json',
  'deploy/production-evidence.example.json',
  'deploy/production.env.example',
  'deploy/alert-rules.example.json',
  'docs/api-contract.md',
  'docs/architecture.md',
  'docs/backend.md',
  'docs/ci.md',
  'docs/runtime-config.md',
  'docs/requirements.md',
  'docs/deployment.md',
  'docs/operations.md',
  'docs/production-readiness.md',
  'docs/release-evidence.md',
  'docs/release-runbook.md',
  'docs/rollback.md',
  'docs/security.md',
  'docs/privacy.md',
  'docs/terms.md',
  'docs/accessibility.md',
  'src/main.js',
  'src/api/appStateClient.js',
  'src/api/authClient.js',
  'src/api/client.js',
  'src/api/accountClient.js',
  'src/api/localStore.js',
  'src/api/mediaClient.js',
  'src/api/monitoringClient.js',
  'src/repositories/appStateRepository.js',
  'src/repositories/authRepository.js',
  'src/core/state.js',
  'src/core/config.js',
  'src/core/migrations.js',
  'src/core/monitoring.js',
  'src/core/pwaUpdate.js',
  'src/core/utils.js',
  'src/core/policies.js',
  'src/core/validation.js',
  'src/core/remoteSync.js',
  'src/core/selectors.js',
  'src/domain/backups.js',
  'src/domain/consent.js',
  'src/domain/diagnostics.js',
  'src/domain/users.js',
  'src/domain/sessions.js',
  'src/domain/pets.js',
  'src/domain/capsules.js',
  'src/domain/checkins.js',
  'src/domain/reminders.js',
  'src/domain/records.js',
  'src/domain/posts.js',
  'src/ui/views.js',
  'src/ui/charts.js',
  'src/ui/components.js',
  'src/ui/toast.js',
  'assets/icon.svg',
  'assets/maskable-icon.svg',
  'scripts/build.mjs',
  'scripts/architecture-check.mjs',
  'scripts/public-bundle-check.mjs',
  'scripts/pwa-cache-check.mjs',
  'scripts/artifact-manifest.mjs',
  'scripts/artifact-verify.mjs',
  'scripts/external-evidence-check.mjs',
  'scripts/external-evidence-init.mjs',
  'scripts/external-evidence-next.mjs',
  'scripts/external-evidence-domain-tls.mjs',
  'scripts/external-evidence-production-env.mjs',
  'scripts/external-evidence-storage.mjs',
  'scripts/external-evidence-ops.mjs',
  'scripts/external-evidence-release-approval.mjs',
  'scripts/external-evidence-worksheet.mjs',
  'scripts/external-evidence-cockpit.mjs',
  'scripts/external-evidence-request-pack.mjs',
  'scripts/external-evidence-update.mjs',
  'scripts/external-evidence-status.mjs',
  'scripts/deploy-check.mjs',
  'scripts/deploy-target-check.mjs',
  'scripts/deploy-bundle-check.mjs',
  'scripts/deploy-transfer-plan.mjs',
  'scripts/production-env-check.mjs',
  'scripts/manual-acceptance-check.mjs',
  'scripts/manual-acceptance-record.mjs',
  'scripts/acceptance-10am.mjs',
  'scripts/acceptance-brief.mjs',
  'scripts/acceptance-decision-card.mjs',
  'scripts/acceptance-signoff-sheet.mjs',
  'scripts/acceptance-meeting-minutes.mjs',
  'scripts/acceptance-snapshot-lock.mjs',
  'scripts/acceptance-bundle-check.mjs',
  'scripts/acceptance-bundle-zip.mjs',
  'scripts/acceptance-final.mjs',
  'scripts/acceptance-final-check.mjs',
  'scripts/acceptance-handoff.mjs',
  'scripts/acceptance-preflight.mjs',
  'scripts/ops-check.mjs',
  'scripts/smoke-production.mjs',
  'scripts/write-runtime-config.mjs',
  'scripts/server-production-check.mjs',
  'scripts/server-test.mjs',
  'scripts/backup-restore-drill.mjs',
  'scripts/release-plan-check.mjs',
  'scripts/readiness-check.mjs',
  'scripts/release-evidence.mjs',
  'scripts/release-evidence-check.mjs',
  'scripts/launch-status.mjs',
  'scripts/secrets-check.mjs',
  'scripts/accessibility-check.mjs',
  'scripts/container-check.mjs',
  'scripts/test.mjs',
  'scripts/e2e.mjs',
  'scripts/e2e-remote.mjs',
  'server/auth.js',
  'server/config.js',
  'server/health.js',
  'server/http.js',
  'server/index.js',
  'server/lifecycle.js',
  'server/logger.js',
  'server/media.js',
  'server/rateLimit.js',
  'server/router.js',
  'server/state.js',
  'server/storage.js'
];

for (const file of requiredFiles) {
  add(`required:${file}`, existsSync(file), file);
}

for (const file of requiredFiles.filter(file => file.endsWith('.js') || file.endsWith('.mjs'))) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  add(`syntax:${file}`, result.status === 0, (result.stderr || result.stdout || '').trim());
}

const textFiles = [
  'index.html',
  'styles.css',
  'docs/requirements.md',
  'docs/architecture.md',
  'docs/deployment.md',
  'docs/operations.md',
  'docs/production-readiness.md',
  'docs/release-evidence.md',
  'docs/release-runbook.md',
  'docs/rollback.md',
  'docs/security.md',
  'docs/privacy.md',
  'docs/terms.md',
  'docs/accessibility.md',
  'docs/backend.md',
  'docs/ci.md',
  'Dockerfile',
  '.dockerignore',
  '.gitignore',
  '.github/workflows/release-gate.yml',
  'deploy/docker-compose.production.yml',
  'deploy/nginx.conf',
  'deploy/production-evidence.example.json',
  'deploy/production.env.example',
  'deploy/alert-rules.example.json',
  'docs/api-contract.md',
  'docs/runtime-config.md',
  'runtime-config.js',
  'runtime-config.example.js',
  '_headers',
  'scripts/architecture-check.mjs',
  'scripts/public-bundle-check.mjs',
  'scripts/pwa-cache-check.mjs',
  'scripts/deploy-check.mjs',
  'scripts/deploy-target-check.mjs',
  'scripts/artifact-manifest.mjs',
  'scripts/artifact-verify.mjs',
  'scripts/external-evidence-check.mjs',
  'scripts/external-evidence-init.mjs',
  'scripts/external-evidence-next.mjs',
  'scripts/external-evidence-domain-tls.mjs',
  'scripts/external-evidence-production-env.mjs',
  'scripts/external-evidence-storage.mjs',
  'scripts/external-evidence-ops.mjs',
  'scripts/external-evidence-release-approval.mjs',
  'scripts/external-evidence-worksheet.mjs',
  'scripts/external-evidence-cockpit.mjs',
  'scripts/external-evidence-request-pack.mjs',
  'scripts/external-evidence-update.mjs',
  'scripts/external-evidence-status.mjs',
  'scripts/deploy-bundle-check.mjs',
  'scripts/manual-acceptance-check.mjs',
  'scripts/manual-acceptance-record.mjs',
  'scripts/acceptance-10am.mjs',
  'scripts/acceptance-brief.mjs',
  'scripts/acceptance-decision-card.mjs',
  'scripts/acceptance-signoff-sheet.mjs',
  'scripts/acceptance-meeting-minutes.mjs',
  'scripts/acceptance-snapshot-lock.mjs',
  'scripts/acceptance-bundle-check.mjs',
  'scripts/acceptance-bundle-zip.mjs',
  'scripts/acceptance-final.mjs',
  'scripts/acceptance-final-check.mjs',
  'scripts/acceptance-handoff.mjs',
  'scripts/acceptance-preflight.mjs',
  'scripts/ops-check.mjs',
  'scripts/smoke-production.mjs',
  'scripts/write-runtime-config.mjs',
  'scripts/server-production-check.mjs',
  'scripts/server-test.mjs',
  'scripts/backup-restore-drill.mjs',
  'scripts/release-plan-check.mjs',
  'scripts/readiness-check.mjs',
  'scripts/release-evidence.mjs',
  'scripts/release-evidence-check.mjs',
  'scripts/launch-status.mjs',
  'scripts/secrets-check.mjs',
  'scripts/accessibility-check.mjs',
  'scripts/container-check.mjs',
  'scripts/test.mjs',
  'server/router.js',
  'server/health.js',
  'server/lifecycle.js',
  'server/logger.js',
  'server/media.js',
  'server/rateLimit.js',
  'server/state.js',
  'scripts/e2e.mjs',
  'scripts/e2e-remote.mjs',
  'src/main.js',
  'src/api/accountClient.js',
  'src/core/monitoring.js',
  'src/core/pwaUpdate.js',
  'src/core/remoteSync.js',
  'src/ui/views.js',
  'src/core/state.js'
];

for (const file of textFiles) {
  const text = readFileSync(file, 'utf8');
  add(`no-mojibake:${file}`, !text.includes('?'.repeat(2)), 'no double question marker');
}

const index = readFileSync('index.html', 'utf8');
add('entry uses ES module', index.includes('type="module"') && index.includes('./src/main.js'));
add('index has pwa metadata', index.includes('rel="manifest"') && index.includes('rel="icon"') && index.includes('name="description"'));
add('index loads runtime config before app module', index.indexOf('./runtime-config.js') > -1 && index.indexOf('./runtime-config.js') < index.indexOf('./src/main.js'));

const manifest = readFileSync('manifest.webmanifest', 'utf8');
add('manifest is installable shape', manifest.includes('"display": "standalone"') && manifest.includes('"scope"') && manifest.includes('"icons"') && manifest.includes('maskable-icon.svg'));

const blackCapsulePattern = /#090909|dynamic-island|notch|phone:after|width:\s*11[0-9]px;\s*height:\s*3[0-9]px/;
const css = readFileSync('styles.css', 'utf8');
const designCss = readFileSync('design.css', 'utf8');
add('formal css has no black capsule decoration', !blackCapsulePattern.test(css));
add('design css has no black capsule decoration', !blackCapsulePattern.test(designCss));

const views = readFileSync('src/ui/views.js', 'utf8');
const checkins = readFileSync('src/domain/checkins.js', 'utf8');
add('checkin sheet rendered', views.includes('打卡管理') && views.includes('checkin-sheet') && views.includes('bottom-sheet'));
add('remote auth forms rendered when api configured', views.includes('remote-register-form') && views.includes('remote-login-form') && views.includes('创建账号并进入') && views.includes('游客体验'));
add('remote sync actions rendered', views.includes('push-remote-state') && views.includes('pull-remote-state') && views.includes('create-remote-backup') && !views.includes('token 不进入同步体/备份'));
add('checkin presets available', ['饮水', '喂食', '铲屎', '晚餐', '洗澡', '梳毛'].every(item => views.includes(item) || checkins.includes(item)));
add('checkin sheet can toggle and delete', views.includes('checkin-manage-row') && views.includes('data-action="toggle-checkin"') && views.includes('data-action="delete-checkin"'));
add('checkin sheet has batch actions', views.includes('complete-all-checkins') && views.includes('reset-all-checkins') && views.includes('sheet-summary'));
add('views use shared empty state component', views.includes('renderEmptyState') && !views.includes('class="empty">'));

const state = readFileSync('src/core/state.js', 'utf8');
add('checkins in state layer', state.includes('checkins') && state.includes('normalizeState'));
add('state schema versioned', state.includes('CURRENT_SCHEMA_VERSION') && state.includes('migrateState'));
add('state uses repository persistence boundary', state.includes('../repositories/appStateRepository.js') && !state.includes('../api/localStore.js') && !state.includes('localStorage.'));

const repository = readFileSync('src/repositories/appStateRepository.js', 'utf8');
add('app state repository exists', repository.includes('appStateRepository') && repository.includes('load()') && repository.includes('save(state)') && repository.includes('status()'));
add('repository wraps local store adapter', repository.includes('../api/localStore.js') && repository.includes('loadAppState') && repository.includes('saveAppState'));
add('repository has remote sync boundary', repository.includes('pullRemote') && repository.includes('pushRemote') && repository.includes('../api/appStateClient.js'));
add('repository has backup boundary', repository.includes('createLocalBackup') && repository.includes('createRemoteBackup') && repository.includes('validateBackup'));
add('repository sanitizes remote state sync', repository.includes('sanitizeStateForBackup') && repository.includes('saveRemoteState(sanitizeStateForBackup(state)'));

const config = readFileSync('src/core/config.js', 'utf8');
add('app version config exists', config.includes('APP_VERSION') && config.includes('APP_BUILD_TARGET') && config.includes('APP_RELEASE_CHANNEL'));
add('api environment config exists', config.includes('API_BASE_URL') && config.includes('API_TIMEOUT_MS') && config.includes('API_MOCK_FALLBACK'));
add('monitoring config exists', config.includes('MONITORING_ENDPOINT') && config.includes('MONITORING_SAMPLE_RATE'));
add('runtime config reader exists', config.includes('PET_COMPANION_CONFIG') && config.includes('RUNTIME_CONFIG_SOURCE') && config.includes('runtimeString'));

const policies = readFileSync('src/core/policies.js', 'utf8');
add('ownership policy module exists', policies.includes('canAccessPet') && policies.includes('canAccessPetResource') && policies.includes('filterAccessiblePosts'));

const selectors = readFileSync('src/core/selectors.js', 'utf8');
add('selectors use ownership policy', selectors.includes('./policies.js') && selectors.includes('filterOwnedPets') && selectors.includes('filterOwnedPetResources'));

const authClient = readFileSync('src/api/authClient.js', 'utf8');
add('auth api client skeleton exists', authClient.includes('registerRemote') && authClient.includes('signInRemote') && authClient.includes('refreshRemoteSession') && authClient.includes('signOutRemote'));
add('auth api client matches contract paths', authClient.includes('/auth/register') && authClient.includes('/auth/sign-in') && authClient.includes('/auth/refresh') && authClient.includes('/auth/sign-out') && authClient.includes('refreshToken'));

const appStateClient = readFileSync('src/api/appStateClient.js', 'utf8');
add('app state api client exists', appStateClient.includes('fetchRemoteState') && appStateClient.includes('saveRemoteState') && appStateClient.includes('hasRemoteStateApi'));
add('backup api client exists', appStateClient.includes('createRemoteBackup') && appStateClient.includes('listRemoteBackups') && appStateClient.includes('restoreRemoteBackup'));
const accountClient = readFileSync('src/api/accountClient.js', 'utf8');
add('account lifecycle api client exists', accountClient.includes('exportRemoteAccount') && accountClient.includes('deleteRemoteAccount') && accountClient.includes('/account/export') && accountClient.includes("'/account'"));
const mediaClient = readFileSync('src/api/mediaClient.js', 'utf8');
add('media api client exists', mediaClient.includes('uploadRemoteMedia') && mediaClient.includes('/media/uploads') && mediaClient.includes('Authorization'));
add('media api client supports remote deletion', mediaClient.includes('deleteRemoteMedia') && mediaClient.includes('mediaUrlToDeletePath') && mediaClient.includes("method: 'DELETE'"));
add('remote state client sends bearer token', appStateClient.includes('Authorization') && appStateClient.includes('Bearer') && appStateClient.includes('accessToken'));

const apiClient = readFileSync('src/api/client.js', 'utf8');
add('api client skeleton exists', apiClient.includes('ApiError') && apiClient.includes('apiRequest') && apiClient.includes('AbortController'));
add('api client supports mock fallback', apiClient.includes('API_MOCK_FALLBACK') && apiClient.includes('mocked: true'));

const monitoringClient = readFileSync('src/api/monitoringClient.js', 'utf8');
const monitoring = readFileSync('src/core/monitoring.js', 'utf8');
const pwaUpdate = readFileSync('src/core/pwaUpdate.js', 'utf8');
add('monitoring client exists', monitoringClient.includes('sendMonitoringEvent') && monitoringClient.includes('hasMonitoringEndpoint') && monitoringClient.includes('sendBeacon'));
add('monitoring boundary exists', monitoring.includes('captureException') && monitoring.includes('getMonitoringStatus') && monitoring.includes('dispatchMonitoringEvent'));
add('monitoring defaults to no external send', monitoring.includes('shouldSample') && monitoringClient.includes('disabled: true'));
add('pwa update lifecycle module exists', pwaUpdate.includes('registerPwaUpdate') && pwaUpdate.includes('checkForPwaUpdate') && pwaUpdate.includes('applyPwaUpdate') && pwaUpdate.includes('SKIP_WAITING'));
const remoteSync = readFileSync('src/core/remoteSync.js', 'utf8');
add('remote sync refresh boundary exists', remoteSync.includes('runWithRemoteRefresh') && remoteSync.includes('ApiError') && remoteSync.includes('status !== 401') && remoteSync.includes('mergeRefreshedSession'));

const migrations = readFileSync('src/core/migrations.js', 'utf8');
add('state migration module exists', migrations.includes('CURRENT_SCHEMA_VERSION = 5') && migrations.includes('migrateState') && migrations.includes('repairedFields'));
add('session migration exists', migrations.includes('createMigratedLocalSession') && migrations.includes('session'));
add('migration sanitizes legacy complaint details', migrations.includes('sanitizeReportDetail') && migrations.includes('reports.detail'));
add('migration sanitizes legacy pet colors', migrations.includes('sanitizePetColor') && migrations.includes('pets.color'));

const validation = readFileSync('src/core/validation.js', 'utf8');
add('validation layer exists', validation.includes('ValidationError') && validation.includes('requiredText') && validation.includes('validateImageFile'));
add('local image upload is capped', validation.includes('MAX_LOCAL_IMAGE_BYTES') && validation.includes('5MB'));
add('render layer allowlists image src values', views.includes('safeImageSrc') && views.includes('renderSafeImage') && views.includes('data:image\\/') && views.includes('jpeg|png|webp|gif') && views.includes("src.startsWith('/media/files/')") && !views.includes('src="${photo.imageData}"') && !views.includes('src="${item.imageData}"'));
add('render layer allowlists pet color styles', views.includes('safeCssColor') && views.includes('/^#[0-9a-f]{6}$/i') && views.includes('const bg = safeCssColor(pet?.color)') && !views.includes("const bg = pet?.color || '#f2e7d9'"));

const localStore = readFileSync('src/api/localStore.js', 'utf8');
add('local storage api adapter exists', localStore.includes('loadAppState') && localStore.includes('saveAppState') && localStore.includes('clearAppState'));
add('local storage recovery exists', localStore.includes('RECOVERY_PREFIX') && localStore.includes('getStorageStatus') && localStore.includes('backupKey'));

const backups = readFileSync('src/domain/backups.js', 'utf8');
add('backup domain exists', backups.includes('BACKUP_VERSION') && backups.includes('createStateBackup') && backups.includes('validateStateBackup'));
add('backup sanitizes sensitive fields', backups.includes('accessToken = null') && backups.includes('refreshToken = null') && backups.includes('sheet: null'));

const consent = readFileSync('src/domain/consent.js', 'utf8');
add('legal consent domain exists', consent.includes('LEGAL_CONSENT_VERSION') && consent.includes('hasAcceptedLegalConsent') && consent.includes('acceptLegalConsent') && consent.includes('getLegalConsentStatus'));
const diagnostics = readFileSync('src/domain/diagnostics.js', 'utf8');
add('support diagnostics domain exists', diagnostics.includes('SUPPORT_DIAGNOSTICS_VERSION') && diagnostics.includes('createSupportDiagnostics') && diagnostics.includes('assertSupportDiagnosticsSafe') && diagnostics.includes('no user content'));

add('checkin domain module exists', checkins.includes('DEFAULT_CHECKINS') && checkins.includes('CHECKIN_PRESETS') && checkins.includes('ensureDefaultCheckins'));
add('checkin domain owns management actions', checkins.includes('getCheckinSummary') && checkins.includes('setTodayCheckinsDone') && checkins.includes('deleteCheckinById') && checkins.includes('toggleCheckinDone'));

const users = readFileSync('src/domain/users.js', 'utf8');
add('user domain module exists', users.includes('findOrCreateUser'));

const sessions = readFileSync('src/domain/sessions.js', 'utf8');
add('session domain module exists', sessions.includes('createLocalSession') && sessions.includes('getSessionStatus') && sessions.includes('clearSession'));

const pets = readFileSync('src/domain/pets.js', 'utf8');
add('pet domain module exists', pets.includes('createPetFromForm') && pets.includes('createDemoPet'));
add('pet domain sanitizes avatar color', pets.includes('sanitizePetColor') && pets.includes('/^#[0-9a-f]{6}$/i') && pets.includes("color: sanitizePetColor(selectedValue(formData, 'color', '头像色'))"));

const capsules = readFileSync('src/domain/capsules.js', 'utf8');
add('capsule domain module exists', capsules.includes('createCapsule') && capsules.includes('latestCapsules'));
add('pet detail sheet rendered', views.includes('宠物详情') && views.includes('pet-detail-sheet'));
add('pet detail opens from pet cards', views.includes('data-action="open-pet-detail"'));

const reminders = readFileSync('src/domain/reminders.js', 'utf8');
add('reminder domain module exists', reminders.includes('REMINDER_PRESETS') && reminders.includes('createPresetReminder'));
add('reminder sheet rendered', views.includes('健康提醒管理') && views.includes('reminder-sheet-form'));
add('reminder presets available', ['吃药', '就医', '驱虫', '疫苗', '洗澡'].every(item => views.includes(item) || reminders.includes(item)));
add('reminder sheet can toggle and delete', views.includes('data-action="toggle-reminder"') && views.includes('data-action="delete-reminder"'));

const records = readFileSync('src/domain/records.js', 'utf8');
add('record domain module exists', records.includes('createCareRecord') && records.includes('createWeightRecord'));

const posts = readFileSync('src/domain/posts.js', 'utf8');
add('post domain module exists', posts.includes('createPost') && posts.includes('createComment') && posts.includes('togglePostLike'));
const reports = readFileSync('src/domain/reports.js', 'utf8');
  add('report domain blocks sensitive complaint details', reports.includes('assertReportDetailSafe') && reports.includes('sanitizeReportDetail') && reports.includes('SENSITIVE_REPORT_PATTERN') && reports.includes('投诉说明不能包含') && reports.includes('ValidationError'));

const main = readFileSync('src/main.js', 'utf8');
add('production runtime hides demo data entry points', config.includes('APP_IS_PRODUCTION') && views.includes('function renderSeedDemoButton') && views.includes('APP_IS_PRODUCTION') && views.includes("renderSeedDemoButton('游客体验'") && !views.includes("renderSeedDemoButton('填充演示数据'") && main.includes('if (APP_IS_PRODUCTION)') && main.includes('生产环境不提供演示数据入'));
  add('report domain prevents recent duplicate submissions', reports.includes('REPORT_DUPLICATE_WINDOW_MS') && reports.includes('hasRecentDuplicateReport') && reports.includes('windowMs') && main.includes('hasRecentDuplicateReport(state.reports, report)') && main.includes('10 分钟内已提交过相同反馈'));
add('main delegates object creation to domains', ['authRepository', 'createPetFromForm', 'createCareRecord', 'createPost'].every(item => main.includes(item)));
add('main handles validation errors', main.includes('ValidationError') && main.includes('reportError') && main.includes('requiredText'));
add('runtime error boundary is wired', main.includes('renderRuntimeError') && main.includes('window.addEventListener') && main.includes('retry-render'));
add('runtime monitoring is wired', main.includes('captureException') && main.includes('window-error') && main.includes('unhandled-rejection'));
add('admin hides internal storage status', views.includes('storageStatus') && views.includes('data-status') && !views.includes('修复字段') && !views.includes('Schema v'));
add('admin exports local backup before destructive local clearing', views.includes('导出资料备份') && views.includes('export-local-backup') && main.includes('exportLocalBackup') && main.includes('createStateBackup(state)') && main.includes('pet-companion-local-backup-') && main.includes('token 不会写入备份'));
add('admin restores local backup with validation and confirmation', views.includes('恢复备份文件') && views.includes('local-backup-input') && views.includes('恢复前建议先导出当前资料') && main.includes('importLocalBackup') && main.includes('validateStateBackup(payload)') && main.includes('sanitizeStateForRestore(payload.state)') && main.includes('恢复会覆盖当前浏览器里的本机数据') && main.includes('requestDangerConfirm'));
add('main uses auth repository', main.includes('authRepository.signInLocal') && main.includes('authRepository.registerRemote') && main.includes('authRepository.signInRemote') && main.includes('authRepository.signOutRemote') && main.includes('authRepository.signOut'));
add('main persists remote auth session', main.includes('upsertRemoteUser') && main.includes('createRemoteSession') && main.includes('applyRemoteAuth'));
add('main handles remote sync actions', main.includes('pushRemoteState') && main.includes('pullRemoteState') && main.includes('createRemoteBackup') && main.includes('appStateRepository.pushRemote') && main.includes('replaceState'));
add('main handles account export and deletion actions', main.includes('exportAccountData') && main.includes('deleteRemoteAccountData') && main.includes('export-account-data') && main.includes('delete-remote-account'));
add('profile data copy does not imply unfinished backend', views.includes('当前数据仅保存在这台设备的浏览器里') && views.includes('登录账号后可开启云端同步和备份') && !views.includes('当前为本地 H5/PWA 版本，后续可接正式后端'));
add('danger zone copy explains local data clearing scope', views.includes('清空当前设备里的宠物档案、提醒、记录、照片、动态和登录状态') && views.includes('注销账号会按条款删除对应账号资料') && views.includes('清空此设备资料') && !views.includes('\u4f1a\u6e05\u7a7a\u672c\u6d4f\u89c8\u5668\u5185\u7684\u6f14\u793a\u6570\u636e\u548c\u6062\u590d\u5907\u4efd'));
add('main gates auth and demo behind legal consent', main.includes('requireLegalConsent') && main.includes('acceptLegalConsent') && main.includes('handleRemoteRegister') && main.includes('seedDemo'));
add('main exports safe support diagnostics', main.includes('exportSupportDiagnostics') && main.includes('createSupportDiagnostics') && main.includes('assertSupportDiagnosticsSafe') && main.includes('export-support-diagnostics'));
add('main registers pwa update lifecycle', main.includes('registerPwaUpdate') && main.includes('checkAppUpdate') && main.includes('applyAppUpdate') && main.includes('pwa-update-register'));
add('main uploads photos to remote media when available', main.includes('storePhotoImage') && main.includes('uploadRemoteMedia') && main.includes('hasRemoteMediaApi') && main.includes("await submitPhoto(form)"));
add('main deletes remote media with photo and pet deletion', main.includes('deleteStoredMediaUrls') && main.includes('deleteRemoteMedia({ url }, state.session)') && main.includes('...state.photos.filter(photo => photo.petId === id).map(photo => photo.imageData)') && main.includes('若照片已上传云端，也会同步删除远端图片文件'));
add('main retries remote sync after refresh', main.includes('runWithRemoteRefresh') && main.includes('authRepository.refreshRemote') && main.includes('saveSession'));
add('main enforces ownership before mutations', main.includes('requirePetAccess') && main.includes('canAccessPetResource') && main.includes('canAccessPost'));

const authRepository = readFileSync('src/repositories/authRepository.js', 'utf8');
add('auth repository exists', authRepository.includes('signInLocal') && authRepository.includes('signOut') && authRepository.includes('registerRemote') && authRepository.includes('refreshRemote'));
add('admin hides internal session details', views.includes('getSessionStatus') && !views.includes('账号会话') && !views.includes('无远端 token') && !views.includes('已持有远端 token'));
add('admin hides internal monitoring status', !views.includes('可观测性') && !views.includes('监控：本地安全模式') && !views.includes('端点：'));
add('admin displays sync backup status', views.includes('同步与备份') && views.includes('当前数据仅保存在这台设备的浏览器里') && !views.includes('pet-companion-backup-v1'));
add('admin displays legal consent status', views.includes('隐私与协议') && views.includes('已确认协议与隐私') && views.includes('查看用户协议与隐私政策'));
  add('auth renders legal consent checkbox and sheet', views.includes('name="legalConsent"') && views.includes('用户协议与隐私政策') && views.includes('LEGAL_CONSENT_VERSION') && views.includes('./docs/terms.md') && views.includes('./docs/privacy.md') && !views.includes('正式上架前需要'));
  add('legal sheet matches published deletion and health terms', views.includes('账号资料导出') && views.includes('可识别的当前用户媒体文件') && views.includes('不构成兽医诊断') && views.includes('图片删除'));
  add('care screens show visible non medical disclaimer', views.includes('health-disclaimer') && views.includes('不构成兽医诊断、治疗或用药建议') && views.includes('renderHealthDisclaimer()') && views.includes('reminder-sheet-title') && css.includes('.health-disclaimer'));
  add('admin displays support diagnostics export', views.includes('导出客服诊断包') && views.includes('export-support-diagnostics'));
add('feedback and complaint UI exists', views.includes('反馈与投诉') && views.includes('open-report-sheet') && views.includes('report-form') && views.includes('REPORT_REASONS') && views.includes('renderReportHistory') && views.includes('report-history') && views.includes('提交后会生成编号') && views.includes('便于后续沟通') && views.includes('export-reports') && views.includes('导出反馈记录') && views.includes('copy-report-id') && views.includes('复制编号') && views.includes('copy-report-brief') && views.includes('复制客服说明') && views.includes('isSafeSupportEmail') && views.includes('[A-Z0-9._%+-]+@[A-Z0-9.-]+') && main.includes('createReport') && main.includes('submitReport') && main.includes('exportUserReports') && main.includes('sanitizeReportDetail(report.detail)') && main.includes('copyReportId') && main.includes('copyReportBrief') && main.includes('已复制客服跟进说明') && main.includes('pet-companion-report-export-v1') && main.includes('count: reports.length') && main.includes('newestAt') && main.includes('supportExportContact()') && main.includes('pet-companion-reports-${exportFileStamp(exportedAt)}.json'));
add('pet page keeps forms compact', views.includes('compact-panel') && views.includes('<summary><span>添加 / 编辑宠物档案</span>') && views.includes('<summary><span>上传成长胶囊</span>') && css.includes('.compact-panel') && css.includes('details.compact-panel[open]'));
add('community content can be reported', views.includes('data-report-type="post"') && views.includes('data-report-type="comment"') && main.includes('function reportRecordName') && main.includes("report?.targetType === 'general' ? '反馈记录'") && main.includes('编号 ${report.id}') && main.includes('请联系运营客服跟进'));
add('admin displays pwa update controls', views.includes('应用更新') && views.includes('check-pwa-update') && views.includes('apply-pwa-update'));
add('views filter data through ownership policy', views.includes('filterAccessiblePosts') && views.includes('filterOwnedPetResources') && views.includes('filterOwnedPets'));

const components = readFileSync('src/ui/components.js', 'utf8');
add('shared ui components exist', components.includes('renderEmptyState') && components.includes('renderRuntimeError'));

const sw = readFileSync('service-worker.js', 'utf8');
add('service worker caches ui components', sw.includes('src/ui/components.js'));
add('service worker caches migrations', sw.includes('src/core/migrations.js'));
add('service worker cache name is versioned', /pet-companion-v0\.4\.0-assets-[a-f0-9]{12}/.test(sw) && sw.includes('src/core/config.js') && sw.includes('assets/icon.svg'));
add('service worker does not precache runtime config', !sw.includes('runtime-config.js'));
add('service worker has offline navigation fallback', sw.includes("event.request.mode === 'navigate'") && sw.includes("caches.match('./index.html')"));
add('service worker caches repository', sw.includes('src/repositories/appStateRepository.js'));
add('service worker caches api client', sw.includes('src/api/client.js'));
add('service worker caches account client', sw.includes('src/api/accountClient.js'));
add('service worker caches auth modules', sw.includes('src/api/authClient.js') && sw.includes('src/repositories/authRepository.js') && sw.includes('src/domain/sessions.js') && sw.includes('src/domain/consent.js'));
add('service worker caches ownership policy', sw.includes('src/core/policies.js') && /pet-companion-v0\.4\.0-assets-[a-f0-9]{12}/.test(sw));
add('service worker caches support diagnostics module', sw.includes('src/domain/diagnostics.js'));
add('service worker caches pwa update module', sw.includes('src/core/pwaUpdate.js'));
add('service worker cleans old caches on activate', sw.includes("self.addEventListener('activate'") && sw.includes("caches.delete(key)") && sw.includes("self.clients.claim()"));
add('service worker supports controlled update activation', sw.includes("self.addEventListener('message'") && sw.includes('SKIP_WAITING') && sw.includes('self.skipWaiting()'));
add('service worker caches monitoring modules', sw.includes('src/api/monitoringClient.js') && sw.includes('src/core/monitoring.js'));
add('service worker caches remote sync module', sw.includes('src/core/remoteSync.js'));
add('service worker caches sync backup modules', sw.includes('src/api/appStateClient.js') && sw.includes('src/domain/backups.js'));
add('service worker caches media client', sw.includes('src/api/mediaClient.js'));

const pkg = readFileSync('package.json', 'utf8');
const packageJson = JSON.parse(pkg);
const releaseCheckCommand = packageJson.scripts?.['release:check'] || '';
const releaseCheckSteps = releaseCheckCommand
  .split(/\s+&&\s+/)
  .map(step => step.trim().match(/^npm run ([\w:-]+)$/)?.[1] || '')
  .filter(Boolean);
const releaseStepIndex = name => releaseCheckSteps.indexOf(name);
const releaseGoCommand = packageJson.scripts?.['release:go'] || '';
add('package scripts available', pkg.includes('"audit"') && pkg.includes('"test"') && pkg.includes('"e2e"') && pkg.includes('"start"') && pkg.includes('"build"'));
add('package check gates audit and test', pkg.includes('"check"') && pkg.includes('npm run audit') && pkg.includes('npm run test'));
add('package release gate includes browser e2e deploy server and container checks', pkg.includes('"release:check"') && pkg.includes('npm run build') && pkg.includes('npm run e2e') && pkg.includes('npm run e2e:remote') && pkg.includes('npm run smoke:production:self-test') && pkg.includes('npm run deploy:check') && pkg.includes('npm run server:test') && pkg.includes('npm run container:check'));
add('package strict release go gate exists', pkg.includes('"release:go"') && releaseGoCommand.includes('npm run release:check') && releaseGoCommand.includes('launch:status -- --require-go'));
add('package launch status self-test exists', pkg.includes('"launch:status:self-test"') && pkg.includes('scripts/launch-status.mjs --self-test') && releaseCheckCommand.includes('npm run launch:status:self-test'));
add('package remote e2e script exists', pkg.includes('"e2e:remote"') && pkg.includes('scripts/e2e-remote.mjs'));
add('package deploy check scripts exist', pkg.includes('"deploy:check"') && pkg.includes('"deploy:check:production"'));
add('package public bundle check script exists', pkg.includes('"public:bundle:check"') && pkg.includes('scripts/public-bundle-check.mjs'));
add('package pwa cache check script exists', pkg.includes('"pwa:cache:check"') && pkg.includes('scripts/pwa-cache-check.mjs'));
add('package production smoke scripts exist', pkg.includes('"smoke:production"') && pkg.includes('"smoke:production:self-test"') && pkg.includes('scripts/smoke-production.mjs'));
add('package production runtime script exists', pkg.includes('"runtime:production"') && pkg.includes('write-runtime-config.mjs') && pkg.includes('--production'));
add('package server scripts exist', pkg.includes('"server:start"') && pkg.includes('"server:test"') && pkg.includes('"server:check:production"'));
add('package ci check script exists', pkg.includes('"ci:check"') && pkg.includes('npm run release:check'));
add('package backup drill script exists', pkg.includes('"backup:drill"') && pkg.includes('scripts/backup-restore-drill.mjs'));
add('package container check script exists', pkg.includes('"container:check"') && pkg.includes('scripts/container-check.mjs'));
add('package deploy bundle check script exists', pkg.includes('"deploy:bundle:check"') && pkg.includes('scripts/deploy-bundle-check.mjs'));
add('package deploy target check script exists', pkg.includes('"deploy:target:check"') && pkg.includes('scripts/deploy-target-check.mjs'));
add('package manual acceptance check script exists', pkg.includes('"manual:acceptance:check"') && pkg.includes('scripts/manual-acceptance-check.mjs'));
add('package final acceptance check script exists', pkg.includes('"acceptance:final:check"') && pkg.includes('scripts/acceptance-final-check.mjs'));
add('package acceptance ready script exists', pkg.includes('"acceptance:ready"') && pkg.includes('external:evidence:collectors:self-test') && pkg.includes('release:evidence:self-test') && pkg.includes('acceptance:preflight') && pkg.includes('acceptance:bundle:check') && pkg.includes('acceptance:final:check') && pkg.includes('launch:status'));
add('package acceptance decision card script exists', pkg.includes('"acceptance:decision"') && pkg.includes('scripts/acceptance-decision-card.mjs'));
add('package acceptance signoff sheet script exists', pkg.includes('"acceptance:signoff"') && pkg.includes('scripts/acceptance-signoff-sheet.mjs'));
add('package acceptance meeting minutes script exists', pkg.includes('"acceptance:minutes"') && pkg.includes('scripts/acceptance-meeting-minutes.mjs'));
add('package ops check scripts exist', pkg.includes('"ops:check"') && pkg.includes('"ops:check:self-test"') && pkg.includes('scripts/ops-check.mjs'));
add('package release plan check script exists', pkg.includes('"release:plan:check"') && pkg.includes('scripts/release-plan-check.mjs'));
add('package readiness check script exists', pkg.includes('"readiness:check"') && pkg.includes('scripts/readiness-check.mjs'));
add('package architecture check script exists', pkg.includes('"architecture:check"') && pkg.includes('scripts/architecture-check.mjs'));
add('package release evidence script exists', pkg.includes('"release:evidence"') && pkg.includes('scripts/release-evidence.mjs'));
add('package release evidence self-test exists', pkg.includes('"release:evidence:self-test"') && pkg.includes('scripts/release-evidence.mjs --self-test') && releaseCheckCommand.includes('npm run release:evidence:self-test'));
add('package release evidence check script exists', pkg.includes('"release:evidence:check"') && pkg.includes('scripts/release-evidence-check.mjs'));
add('package artifact manifest script exists', pkg.includes('"artifact:manifest"') && pkg.includes('scripts/artifact-manifest.mjs'));
add('package artifact verify script exists', pkg.includes('"artifact:verify"') && pkg.includes('scripts/artifact-verify.mjs'));
add('package external evidence check script exists', pkg.includes('"external:evidence:check"') && pkg.includes('scripts/external-evidence-check.mjs'));
add('package external evidence next script exists', pkg.includes('"external:evidence:next"') && pkg.includes('"external:evidence:next:ops"') && pkg.includes('"external:evidence:next:legal"') && pkg.includes('"external:evidence:next:qa"') && pkg.includes('scripts/external-evidence-next.mjs'));
add('package external evidence domain tls script exists', pkg.includes('"external:evidence:domain-tls"') && pkg.includes('scripts/external-evidence-domain-tls.mjs'));
add('package external evidence production env script exists', pkg.includes('"external:evidence:production-env"') && pkg.includes('scripts/external-evidence-production-env.mjs'));
add('package external evidence storage script exists', pkg.includes('"external:evidence:storage"') && pkg.includes('scripts/external-evidence-storage.mjs'));
add('package external evidence ops script exists', pkg.includes('"external:evidence:ops"') && pkg.includes('scripts/external-evidence-ops.mjs'));
add('package external evidence release approval script exists', pkg.includes('"external:evidence:release-approval"') && pkg.includes('scripts/external-evidence-release-approval.mjs'));
add('package external evidence collectors self-test script exists', pkg.includes('"external:evidence:collectors:self-test"') && pkg.includes('external-evidence-domain-tls.mjs --self-test') && pkg.includes('external-evidence-production-env.mjs --self-test') && pkg.includes('external-evidence-storage.mjs --self-test') && pkg.includes('external-evidence-ops.mjs --self-test') && pkg.includes('external-evidence-release-approval.mjs --self-test'));
add('package external evidence worksheet script exists', pkg.includes('"external:evidence:worksheet"') && pkg.includes('scripts/external-evidence-worksheet.mjs'));
add('package external evidence cockpit script exists', pkg.includes('"external:evidence:cockpit"') && pkg.includes('scripts/external-evidence-cockpit.mjs'));
add('package external evidence request pack script exists', pkg.includes('"external:evidence:request-pack"') && pkg.includes('scripts/external-evidence-request-pack.mjs'));
add('package external evidence update script exists', pkg.includes('"external:evidence:update"') && pkg.includes('scripts/external-evidence-update.mjs'));
add('package secrets check script exists', pkg.includes('"secrets:check"') && pkg.includes('scripts/secrets-check.mjs'));
add('package accessibility check script exists', pkg.includes('"accessibility:check"') && pkg.includes('scripts/accessibility-check.mjs'));
add('package release gate includes ops self-test', pkg.includes('npm run ops:check:self-test'));
add('package release gate includes public bundle check', releaseCheckCommand.includes('npm run public:bundle:check') && releaseCheckCommand.indexOf('npm run deploy:check') < releaseCheckCommand.indexOf('npm run public:bundle:check') && releaseCheckCommand.indexOf('npm run public:bundle:check') < releaseCheckCommand.indexOf('npm run server:test'));
add('package release gate includes pwa cache check', releaseCheckCommand.includes('npm run pwa:cache:check') && releaseCheckCommand.indexOf('npm run public:bundle:check') < releaseCheckCommand.indexOf('npm run pwa:cache:check') && releaseCheckCommand.indexOf('npm run pwa:cache:check') < releaseCheckCommand.indexOf('npm run server:test'));
add('package release gate includes backup drill', pkg.includes('npm run backup:drill') && pkg.indexOf('npm run server:test') < pkg.indexOf('npm run backup:drill'));
add('package release gate includes release plan check', pkg.includes('npm run release:plan:check'));
add('package release gate includes readiness check', pkg.includes('npm run readiness:check'));
add('package release gate includes architecture check', pkg.includes('npm run architecture:check'));
add('package release gate includes external evidence check', pkg.includes('npm run external:evidence:check'));
add('package release gate includes external evidence collectors self-test', releaseCheckCommand.includes('npm run external:evidence:collectors:self-test') && releaseStepIndex('external:evidence:check') < releaseStepIndex('external:evidence:collectors:self-test') && releaseStepIndex('external:evidence:collectors:self-test') < releaseStepIndex('secrets:check'));
add('package release gate includes artifact manifest', releaseCheckCommand.includes('npm run artifact:manifest'));
add('package release gate includes artifact verify', releaseCheckCommand.includes('npm run artifact:verify'));
add('package release gate includes release evidence', releaseCheckSteps.includes('release:evidence'));
add('package release gate includes release evidence check', releaseCheckSteps.includes('release:evidence:check'));
add('package release gate generates and verifies evidence after local gates', releaseStepIndex('container:check') < releaseStepIndex('deploy:target:check') && releaseStepIndex('deploy:target:check') < releaseStepIndex('deploy:bundle:check') && releaseStepIndex('deploy:bundle:check') < releaseStepIndex('manual:acceptance:check') && releaseStepIndex('manual:acceptance:check') < releaseStepIndex('release:plan:check') && releaseStepIndex('readiness:check') < releaseStepIndex('architecture:check') && releaseStepIndex('architecture:check') < releaseStepIndex('launch:status:self-test') && releaseStepIndex('launch:status:self-test') < releaseStepIndex('external:evidence:check') && releaseStepIndex('external:evidence:check') < releaseStepIndex('external:evidence:collectors:self-test') && releaseStepIndex('external:evidence:collectors:self-test') < releaseStepIndex('secrets:check') && releaseStepIndex('secrets:check') < releaseStepIndex('accessibility:check') && releaseStepIndex('accessibility:check') < releaseStepIndex('artifact:manifest') && releaseStepIndex('artifact:manifest') < releaseStepIndex('artifact:verify') && releaseStepIndex('artifact:verify') < releaseStepIndex('release:evidence:self-test') && releaseStepIndex('release:evidence:self-test') < releaseStepIndex('release:evidence') && releaseStepIndex('release:evidence') < releaseStepIndex('release:evidence:check'));
add('package release gate includes secrets check', pkg.includes('npm run secrets:check'));
add('package release gate includes accessibility check', pkg.includes('npm run accessibility:check'));

const opsCheck = readFileSync('scripts/ops-check.mjs', 'utf8');
const architectureCheck = readFileSync('scripts/architecture-check.mjs', 'utf8');
const publicBundleCheck = readFileSync('scripts/public-bundle-check.mjs', 'utf8');
const pwaCacheCheck = readFileSync('scripts/pwa-cache-check.mjs', 'utf8');
const backupDrill = readFileSync('scripts/backup-restore-drill.mjs', 'utf8');
const releasePlanCheck = readFileSync('scripts/release-plan-check.mjs', 'utf8');
const readinessCheck = readFileSync('scripts/readiness-check.mjs', 'utf8');
const externalEvidenceCheck = readFileSync('scripts/external-evidence-check.mjs', 'utf8');
const externalEvidenceInit = readFileSync('scripts/external-evidence-init.mjs', 'utf8');
const externalEvidenceNext = readFileSync('scripts/external-evidence-next.mjs', 'utf8');
const externalEvidenceDomainTls = readFileSync('scripts/external-evidence-domain-tls.mjs', 'utf8');
const externalEvidenceProductionEnv = readFileSync('scripts/external-evidence-production-env.mjs', 'utf8');
const externalEvidenceStorage = readFileSync('scripts/external-evidence-storage.mjs', 'utf8');
const externalEvidenceOps = readFileSync('scripts/external-evidence-ops.mjs', 'utf8');
const externalEvidenceReleaseApproval = readFileSync('scripts/external-evidence-release-approval.mjs', 'utf8');
const externalEvidenceWorksheet = readFileSync('scripts/external-evidence-worksheet.mjs', 'utf8');
const externalEvidenceCockpit = readFileSync('scripts/external-evidence-cockpit.mjs', 'utf8');
const externalEvidenceRequestPack = readFileSync('scripts/external-evidence-request-pack.mjs', 'utf8');
const externalEvidenceUpdate = readFileSync('scripts/external-evidence-update.mjs', 'utf8');
const artifactManifestCheck = readFileSync('scripts/artifact-manifest.mjs', 'utf8');
const artifactVerifyCheck = readFileSync('scripts/artifact-verify.mjs', 'utf8');
const deployTargetCheck = readFileSync('scripts/deploy-target-check.mjs', 'utf8');
const deployTransferPlan = readFileSync('scripts/deploy-transfer-plan.mjs', 'utf8');
const productionEnvCheck = readFileSync('scripts/production-env-check.mjs', 'utf8');
const manualAcceptanceCheck = readFileSync('scripts/manual-acceptance-check.mjs', 'utf8');
const manualAcceptanceRecord = readFileSync('scripts/manual-acceptance-record.mjs', 'utf8');
const acceptance10am = readFileSync('scripts/acceptance-10am.mjs', 'utf8');
const acceptanceBrief = readFileSync('scripts/acceptance-brief.mjs', 'utf8');
const acceptanceDecisionCard = readFileSync('scripts/acceptance-decision-card.mjs', 'utf8');
const acceptanceSignoffSheet = readFileSync('scripts/acceptance-signoff-sheet.mjs', 'utf8');
const acceptanceMeetingMinutes = readFileSync('scripts/acceptance-meeting-minutes.mjs', 'utf8');
const acceptanceSnapshotLock = readFileSync('scripts/acceptance-snapshot-lock.mjs', 'utf8');
const acceptanceBundleCheck = readFileSync('scripts/acceptance-bundle-check.mjs', 'utf8');
const acceptanceBundleZip = readFileSync('scripts/acceptance-bundle-zip.mjs', 'utf8');
const acceptanceFinal = readFileSync('scripts/acceptance-final.mjs', 'utf8');
const acceptanceFinalCheck = readFileSync('scripts/acceptance-final-check.mjs', 'utf8');
const acceptanceHandoff = readFileSync('scripts/acceptance-handoff.mjs', 'utf8');
const acceptancePreflight = readFileSync('scripts/acceptance-preflight.mjs', 'utf8');
const releaseEvidence = readFileSync('scripts/release-evidence.mjs', 'utf8');
const releaseEvidenceCheck = readFileSync('scripts/release-evidence-check.mjs', 'utf8');
const launchStatus = readFileSync('scripts/launch-status.mjs', 'utf8');
const secretsCheck = readFileSync('scripts/secrets-check.mjs', 'utf8');
const accessibilityCheck = readFileSync('scripts/accessibility-check.mjs', 'utf8');
const operationsDoc = readFileSync('docs/operations.md', 'utf8');
add('architecture check enforces layer boundaries', architectureCheck.includes('layer boundary') && architectureCheck.includes('forbiddenLayerImports') && architectureCheck.includes('resolveRelativeImport'));
const releaseRunbook = readFileSync('docs/release-runbook.md', 'utf8');
const rollbackDoc = readFileSync('docs/rollback.md', 'utf8');
const securityDoc = readFileSync('docs/security.md', 'utf8');
const accessibilityDoc = readFileSync('docs/accessibility.md', 'utf8');
const productionReadinessDoc = readFileSync('docs/production-readiness.md', 'utf8');
const releaseEvidenceDoc = readFileSync('docs/release-evidence.md', 'utf8');
const manualDeviceAcceptanceDoc = readFileSync('docs/manual-device-acceptance.md', 'utf8');
const externalEvidenceDoc = readFileSync('docs/external-evidence.md', 'utf8');
const productionEvidenceExample = readFileSync('deploy/production-evidence.example.json', 'utf8');
const deployTargetExample = readFileSync('deploy/target.example.json', 'utf8');
const ciDoc = readFileSync('docs/ci.md', 'utf8');
const architectureDoc = readFileSync('docs/architecture.md', 'utf8');
const ciWorkflow = readFileSync('.github/workflows/release-gate.yml', 'utf8');
const alertRules = readFileSync('deploy/alert-rules.example.json', 'utf8');
add('ops check verifies production health signals', opsCheck.includes('runOpsCheck') && opsCheck.includes('/ready') && opsCheck.includes('/monitoring/events') && opsCheck.includes('PET_OPS_MAX_LATENCY_MS'));
add('ops check validates frontend security and cache policy', opsCheck.includes('SECURITY_HEADERS') && opsCheck.includes('runtime-config.js') && opsCheck.includes('service-worker.js') && opsCheck.includes('no-store') && opsCheck.includes('no-cache'));
add('ops check verifies operator support runtime config', opsCheck.includes('OPERATOR_NAME') && opsCheck.includes('SUPPORT_CONTACT_URL') && opsCheck.includes('extractRuntimeBoolean') && opsCheck.includes("API_BASE_URL'), apiBaseUrl") && opsCheck.includes('runtime-config support contact missing') && opsCheck.includes('[A-Z0-9._%+-]+@[A-Z0-9.-]+') && opsCheck.includes('still uses placeholder') && opsCheck.includes('must not use placeholder host'));
add('operations runbook exists', operationsDoc.includes('Pet Companion Operations Runbook') && operationsDoc.includes('api-not-ready') && operationsDoc.includes('monitoring-ingest-failed') && operationsDoc.includes('npm run ops:check'));
add('operations runbook includes support diagnostics', operationsDoc.includes('support-diagnostics') && operationsDoc.includes('脱敏诊断包') && operationsDoc.includes('remoteCredentialPresent'));
add('operations runbook includes complaint sensitive data handling', operationsDoc.includes('feedback-and-complaints') && operationsDoc.includes('保存投诉记录前拦截') && operationsDoc.includes('云同步或云备份'));
add('operations runbook includes pwa update recovery', operationsDoc.includes('pwa-update-stuck') && operationsDoc.includes('检查更新') && operationsDoc.includes('SKIP_WAITING'));
add('production readiness doc exists', productionReadinessDoc.includes('本仓库已具备的上线能力') && productionReadinessDoc.includes('真实上线前仍需外部配置') && productionReadinessDoc.includes('Go/No-Go'));
add('production readiness doc includes one-command acceptance ready', productionReadinessDoc.includes('npm.cmd run acceptance:ready') && productionReadinessDoc.includes('外部证据采集器自检') && productionReadinessDoc.includes('不部署、不上传、不读取真实密钥、不改服务器首页'));
add('architecture check exists', architectureCheck.includes('architecture checks passed') && architectureCheck.includes('staleClaims') && architectureCheck.includes('PET_STORAGE_DRIVER=sqlite') && architectureCheck.includes('architecture:check'));
add('architecture doc reflects production layers', architectureDoc.includes('宠伴记生产架构说明') && architectureDoc.includes('src/api/accountClient.js') && architectureDoc.includes('server/storage.js') && architectureDoc.includes('PET_MEDIA_STORAGE_DRIVER=local') && architectureDoc.includes('scripts/architecture-check.mjs') && architectureDoc.includes('本地门禁通过，但不能声明真实上线完成'));
add('architecture doc has no stale prototype claims', !['前端架构说明', '远端 API 客户端骨架', 'Node API 雏形', '使用本地 JSON 文件作为开发期存储', '上线前后续建议'].some(text => architectureDoc.includes(text)));
add('public bundle check exists', publicBundleCheck.includes('public bundle checks passed') && publicBundleCheck.includes('docs/privacy.md') && publicBundleCheck.includes('docs/terms.md') && publicBundleCheck.includes('docs/api-contract.md') && publicBundleCheck.includes('docs/manual-device-acceptance.md') && publicBundleCheck.includes('internalLeakPatterns') && publicBundleCheck.includes('output\\/production-evidence\\.json') && publicBundleCheck.includes('deploy\\/target\\.json') && publicBundleCheck.includes('public markdown limited to legal docs') && publicBundleCheck.includes('public legal doc has no launch placeholders'));
add('pwa cache check exists', pwaCacheCheck.includes('PWA cache checks passed') && pwaCacheCheck.includes('service worker cache name matches generated version/hash') && pwaCacheCheck.includes('expectedCacheName') && pwaCacheCheck.includes('runtime-config.js') && pwaCacheCheck.includes('collectJsFiles'));
add('readiness check validates stale launch claims', readinessCheck.includes('staleClaims') && readinessCheck.includes('no stale readiness claim') && readinessCheck.includes('production readiness checks passed'));
add('ci workflow runs release gate safely', ciWorkflow.includes('Pet Companion Release Gate') && ciWorkflow.includes('windows-latest') && ciWorkflow.includes("node-version: '24'") && ciWorkflow.includes('npm run ci:check') && ciWorkflow.includes('contents: read'));
add('ci documentation exists', ciDoc.includes('GitHub Actions') && ciDoc.includes('npm run ci:check') && ciDoc.includes('不读取真实生产密钥') && ciDoc.includes('windows-latest'));
add('external evidence template exists', productionEvidenceExample.includes('pet-companion-production-evidence-v1') && productionEvidenceExample.includes('manualDeviceAcceptance') && productionEvidenceExample.includes('"status": "pending"') && productionEvidenceExample.includes('"proofRefs": []'));
add('external evidence check exists', externalEvidenceCheck.includes('REQUIRED_IDS') && externalEvidenceCheck.includes('output/production-evidence.json') && externalEvidenceCheck.includes('no obvious secrets') && externalEvidenceCheck.includes('proofRefs present') && externalEvidenceCheck.includes('checkedAt not future') && externalEvidenceCheck.includes('checkedAt not stale') && externalEvidenceCheck.includes('verified has proofRefs for every required proof'));
add('external evidence init backs up forced overwrite', externalEvidenceInit.includes('copyFile(targetPath, backupPath)') && externalEvidenceInit.includes('output/evidence-backups') && externalEvidenceInit.includes('external evidence init backup') && externalEvidenceInit.includes("replace(/^\\uFEFF/, '')") && externalEvidenceDoc.includes('output/evidence-backups/production-evidence.<timestamp>.json'));
add('external evidence update validates and backs up writes', externalEvidenceUpdate.includes('allowedStatus') && externalEvidenceUpdate.includes('secretPattern') && externalEvidenceUpdate.includes('placeholderPattern') && externalEvidenceUpdate.includes('copyFile(evidencePath, backupPath)') && externalEvidenceUpdate.includes('external evidence update dry-run') && externalEvidenceUpdate.includes("replace(/^\\uFEFF/, '')") && externalEvidenceUpdate.includes('proofRefs are required') && externalEvidenceUpdate.includes('verified evidence requires proofRefs for every required proof') && externalEvidenceUpdate.includes('checkedAt must not be in the future') && externalEvidenceUpdate.includes('checkedAt is too old') && externalEvidenceDoc.includes('npm run external:evidence:update') && externalEvidenceDoc.includes('proofRefs') && externalEvidenceDoc.includes('不得是未来时间') && externalEvidenceDoc.includes('90 天前'));
add('external evidence documentation exists', externalEvidenceDoc.includes('deploy/production-evidence.example.json') && externalEvidenceDoc.includes('output/production-evidence.json') && externalEvidenceDoc.includes('npm run external:evidence:check') && externalEvidenceDoc.includes('external:evidence:collectors:self-test'));
add('external evidence next can focus one blocker', externalEvidenceNext.includes("optionValue('--id')") && externalEvidenceNext.includes("optionValue('--owner')") && externalEvidenceNext.includes('OWNER_GROUPS') && externalEvidenceNext.includes('负责人分组') && externalEvidenceNext.includes('unknown owner group') && externalEvidenceNext.includes('聚焦项') && externalEvidenceNext.includes('unknown evidence id') && externalEvidenceNext.includes('--owner "') && externalEvidenceDoc.includes('external:evidence:next -- --owner ops --commands') && externalEvidenceDoc.includes('external:evidence:next:ops') && externalEvidenceDoc.includes('external:evidence:next:legal') && externalEvidenceDoc.includes('external:evidence:next:qa') && acceptanceBrief.includes('external:evidence:next -- --id ${firstBlocker.id} --commands'));
add('external evidence domain tls collector exists', externalEvidenceDomainTls.includes('pet-companion-domain-tls-evidence-v1') && externalEvidenceDomainTls.includes('domain-tls-evidence-latest.json') && externalEvidenceDomainTls.includes('tls.connect') && externalEvidenceDomainTls.includes('getPeerCertificate') && externalEvidenceDomainTls.includes('--gateway-ref') && externalEvidenceDomainTls.includes('PASS external evidence domain tls self-test') && externalEvidenceNext.includes('external:evidence:domain-tls') && externalEvidenceWorksheet.includes('external:evidence:domain-tls') && externalEvidenceDoc.includes('npm.cmd run external:evidence:domain-tls') && externalEvidenceDoc.includes('output/domain-tls-evidence-latest.json'));
add('external evidence production env collector exists', externalEvidenceProductionEnv.includes('pet-companion-production-env-evidence-v1') && externalEvidenceProductionEnv.includes('production-env-evidence-latest.json') && externalEvidenceProductionEnv.includes('SECRET_KEYS') && externalEvidenceProductionEnv.includes('does not expose secret value') && externalEvidenceProductionEnv.includes('--review-ref') && externalEvidenceProductionEnv.includes('PASS external evidence production env self-test') && externalEvidenceNext.includes('external:evidence:production-env') && externalEvidenceWorksheet.includes('external:evidence:production-env') && externalEvidenceDoc.includes('npm.cmd run external:evidence:production-env') && externalEvidenceDoc.includes('output/production-env-evidence-latest.json'));
add('external evidence storage collector exists', externalEvidenceStorage.includes('pet-companion-storage-evidence-v1') && externalEvidenceStorage.includes('storage-evidence-latest.json') && externalEvidenceStorage.includes('--sqlite-file') && externalEvidenceStorage.includes('--media-dir') && externalEvidenceStorage.includes('persistentStorage readyForVerified') && externalEvidenceStorage.includes('objectStorage readyForVerified') && externalEvidenceStorage.includes('PASS external evidence storage self-test') && externalEvidenceNext.includes('external:evidence:storage') && externalEvidenceWorksheet.includes('external:evidence:storage') && externalEvidenceDoc.includes('npm.cmd run external:evidence:storage') && externalEvidenceDoc.includes('output/storage-evidence-latest.json'));
add('external evidence ops collector exists', externalEvidenceOps.includes('pet-companion-ops-evidence-v1') && externalEvidenceOps.includes('ops-evidence-latest.json') && externalEvidenceOps.includes('--monitoring-url') && externalEvidenceOps.includes('--backup-job-ref') && externalEvidenceOps.includes('monitoringAlerts readyForVerified') && externalEvidenceOps.includes('platformBackups readyForVerified') && externalEvidenceOps.includes('PASS external evidence ops self-test') && externalEvidenceNext.includes('external:evidence:ops') && externalEvidenceWorksheet.includes('external:evidence:ops') && externalEvidenceDoc.includes('npm.cmd run external:evidence:ops') && externalEvidenceDoc.includes('output/ops-evidence-latest.json'));
add('external evidence release approval collector exists', externalEvidenceReleaseApproval.includes('pet-companion-release-approval-evidence-v1') && externalEvidenceReleaseApproval.includes('release-approval-evidence-latest.json') && externalEvidenceReleaseApproval.includes('--operator-ref') && externalEvidenceReleaseApproval.includes('--device-matrix-ref') && externalEvidenceReleaseApproval.includes('legalApproval readyForVerified') && externalEvidenceReleaseApproval.includes('manualDeviceAcceptance readyForVerified') && externalEvidenceReleaseApproval.includes('PASS external evidence release approval self-test') && externalEvidenceNext.includes('external:evidence:release-approval') && externalEvidenceWorksheet.includes('external:evidence:release-approval') && externalEvidenceDoc.includes('npm.cmd run external:evidence:release-approval') && externalEvidenceDoc.includes('output/release-approval-evidence-latest.json'));
add('external evidence worksheet has html board', externalEvidenceWorksheet.includes('external-evidence-worksheet.html') && externalEvidenceWorksheet.includes('宠伴记外部上线证据看板') && externalEvidenceWorksheet.includes('必须补齐的证明') && externalEvidenceWorksheet.includes('不放密码') && acceptance10am.includes('external-evidence-worksheet.html') && acceptanceBundleCheck.includes('external evidence html has all blocker cards'));
add('external evidence cockpit has launch cockpit', externalEvidenceCockpit.includes('pet-companion-external-evidence-cockpit-v1') && externalEvidenceCockpit.includes('external-evidence-cockpit.html') && externalEvidenceCockpit.includes('COLLECTOR_COMMANDS') && externalEvidenceCockpit.includes('readyForVerified') && externalEvidenceCockpit.includes('does not deploy, upload, or modify the server homepage') && pkg.includes('external:evidence:cockpit') && acceptance10am.includes('external-evidence-cockpit.html') && acceptanceBundleCheck.includes('external evidence cockpit has all blockers') && externalEvidenceDoc.includes('npm.cmd run external:evidence:cockpit'));
add('external evidence request pack has owner handoff', externalEvidenceRequestPack.includes('pet-companion-external-evidence-request-pack-v1') && externalEvidenceRequestPack.includes('Ops / deployment owner') && externalEvidenceRequestPack.includes('Legal / operator owner') && externalEvidenceRequestPack.includes('QA / device acceptance owner') && externalEvidenceRequestPack.includes('external-evidence-request-pack.html') && externalEvidenceRequestPack.includes('groupPaths') && externalEvidenceRequestPack.includes('external-evidence-request-ops.md') && externalEvidenceRequestPack.includes('external-evidence-request-legal.md') && externalEvidenceRequestPack.includes('external-evidence-request-qa.md') && externalEvidenceRequestPack.includes('does not deploy, upload, access servers, or modify the server homepage') && externalEvidenceRequestPack.includes('OWNER_RETURN_CHECKLIST') && externalEvidenceRequestPack.includes('10am owner handoff message') && externalEvidenceRequestPack.includes('Run this shortcut first') && pkg.includes('external:evidence:request-pack') && acceptance10am.includes('external-evidence-request-pack.html') && acceptance10am.includes('external-evidence-request-ops.md') && acceptanceHandoff.includes('external-evidence-request-ops.md') && acceptanceBundleCheck.includes('external evidence request pack has per-owner files') && externalEvidenceDoc.includes('npm.cmd run external:evidence:request-pack') && externalEvidenceDoc.includes('output/external-evidence-request-ops.md') && externalEvidenceDoc.includes('output/external-evidence-request-legal.md') && externalEvidenceDoc.includes('output/external-evidence-request-qa.md') && externalEvidenceDoc.includes('10am owner handoff message') && externalEvidenceDoc.includes('owner return checklist'));
add('deploy target example exists', deployTargetExample.includes('pet-companion-deploy-target-v1') && deployTargetExample.includes('/opt/pet-companion') && deployTargetExample.includes('/srv/pet-companion') && deployTargetExample.includes('/var/www/html'));
add('deploy target check blocks homepage roots', deployTargetCheck.includes('DANGEROUS_EXACT_PATHS') && deployTargetCheck.includes('DANGEROUS_PATH_PATTERNS') && deployTargetCheck.includes('/var/www/html') && deployTargetCheck.includes('/usr/share/nginx/html') && deployTargetCheck.includes('/www/wwwroot') && deployTargetCheck.includes('/^\\/home\\/[^/]+$/i') && deployTargetCheck.includes('replace(/^\\uFEFF/,') && deployTargetCheck.includes('deploy/target.json') && deployTargetCheck.includes('deploy/target.example.json') && deployTargetCheck.includes('distTarget must stay inside projectRoot') && deployTargetExample.includes('Do not use a user home root'));
add('deploy target check isolates app uploads from data and media', deployTargetCheck.includes('isStrictlyInside') && deployTargetCheck.includes('distTarget must be a child directory of projectRoot') && deployTargetCheck.includes('deployConfigTarget must be separate from distTarget') && deployTargetCheck.includes('dataTarget must be outside projectRoot') && deployTargetCheck.includes('mediaTarget must be separate from dataTarget') && deployTargetExample.includes('dataTarget and mediaTarget must stay outside app files') && releaseRunbook.includes('data transfer or image uploads cannot overwrite the app bundle'));
add('deploy transfer plan exists and excludes private server files', deployTransferPlan.includes('pet-companion-deploy-transfer-plan-v1') && deployTransferPlan.includes('deploy-target-check.mjs') && deployTransferPlan.includes('FORBIDDEN_TRANSFER_FILES') && deployTransferPlan.includes('deploy/production.env') && deployTransferPlan.includes('deploy/certs/privkey.pem') && deployTransferPlan.includes('deploy-transfer-plan.json') && deployTransferPlan.includes('distMappings') && deployTransferPlan.includes('deployConfigMappings') && deployTransferPlan.includes('assertMappingsInside') && deployTransferPlan.includes('normalizeLocalPath') && deployTransferPlan.includes('normalizedTargetPath') && deployTransferPlan.includes('replace(/^\\uFEFF/,') && deployTransferPlan.includes('不会指向服务器首页根目录') && pkg.includes('deploy:transfer:plan') && pkg.includes('npm run deploy:transfer:plan'));
add('production env checker validates templates and rejects placeholders', productionEnvCheck.includes('production env self-test') && productionEnvCheck.includes('getServerRuntimeChecks') && productionEnvCheck.includes('placeholderPattern') && productionEnvCheck.includes('PET_AUTH_SECRET') && productionEnvCheck.includes('production.env.example') && pkg.includes('production:env:example:check') && pkg.includes('production:env:self-test') && pkg.includes('production:env:check'));
add('manual acceptance checklist covers complaint-prone flows', manualDeviceAcceptanceDoc.includes('支持/投诉') && manualDeviceAcceptanceDoc.includes('记录模板') && manualDeviceAcceptanceDoc.includes('验收结论') && manualDeviceAcceptanceDoc.includes('| 设备 | 系统/浏览器 | 网络 | 流程 | 结果 | 证据 | 备注 |'));
add('manual acceptance check validates template and release gate', manualAcceptanceCheck.includes('manual acceptance covers complaint-prone flows') && manualAcceptanceCheck.includes('支持/投诉') && manualAcceptanceCheck.includes('manual:acceptance:check') && manualAcceptanceCheck.includes('manualDeviceAcceptance'));
add('10am acceptance page shows domainTls proof checklist', acceptance10am.includes('必须补齐的证明') && acceptance10am.includes('需要现场补齐的证明') && acceptance10am.includes('provided 登记') && acceptance10am.includes('verified 登记') && acceptance10am.includes('nextRequiredProof'));
add('10am decision card records launch decision', acceptanceDecisionCard.includes('pet-companion-10am-decision-card-v1') && acceptanceDecisionCard.includes('sourceOfTruth') && acceptanceDecisionCard.includes('blockedClaims') && acceptanceDecisionCard.includes('do not deploy, upload, or modify server homepage') && pkg.includes('acceptance:decision') && acceptance10am.includes('10am-decision-card.html') && acceptanceBundleCheck.includes('decision card records go no-go boundary'));
add('10am signoff sheet records owner confirmations', acceptanceSignoffSheet.includes('pet-companion-10am-signoff-sheet-v1') && acceptanceSignoffSheet.includes('Owner signoff rows') && acceptanceSignoffSheet.includes('Final release stays') && acceptanceSignoffSheet.includes('acceptance:signoff') === false && pkg.includes('acceptance:signoff') && acceptance10am.includes('10am-signoff-sheet.html') && acceptanceBundleCheck.includes('signoff sheet records owner confirmation rows'));
add('10am meeting minutes tracks actions', acceptanceMeetingMinutes.includes('pet-companion-10am-meeting-minutes-v1') && acceptanceMeetingMinutes.includes('Action tracker') && acceptanceMeetingMinutes.includes('Do not claim production launch') && pkg.includes('acceptance:minutes') && acceptance10am.includes('10am-meeting-minutes.html') && acceptanceBundleCheck.includes('meeting minutes records action tracker'));
add('10am snapshot lock records material hashes', acceptanceSnapshotLock.includes('pet-companion-10am-snapshot-lock-v1') && acceptanceSnapshotLock.includes('SNAPSHOT_FILES') && acceptanceSnapshotLock.includes('combinedSha256') && pkg.includes('acceptance:snapshot') && pkg.includes('scripts/acceptance-snapshot-lock.mjs') && acceptance10am.includes('10am-snapshot-lock.html') && acceptanceBundleCheck.includes('snapshot lock records material hashes'));
add('manual acceptance record has html board', manualAcceptanceRecord.includes('manual-device-acceptance-record.html') && manualAcceptanceRecord.includes('宠伴记真机验收记录') && manualAcceptanceRecord.includes('必验流程记录') && manualAcceptanceRecord.includes('manualDeviceAcceptance proofRef 对照') && acceptanceBundleCheck.includes('manual acceptance html has device and flow board'));
add('acceptance package indexes现场 files', acceptance10am.includes('宠伴记 10点验收资料包总入口') && acceptance10am.includes('现场打开顺序') && acceptance10am.includes('index.html') && acceptance10am.includes('10am-decision-card.html') && acceptance10am.includes('10am-signoff-sheet.html') && acceptance10am.includes('10am-meeting-minutes.html') && acceptance10am.includes('10am-snapshot-lock.html') && acceptance10am.includes('external-evidence-cockpit.html') && acceptance10am.includes('external-evidence-request-pack.html') && acceptance10am.includes('external-evidence-worksheet.html') && acceptance10am.includes('manual-device-acceptance-record.html') && acceptance10am.includes('deploy-transfer-plan.md') && acceptance10am.includes('external:evidence:next:ops') && acceptance10am.includes('external:evidence:next:legal') && acceptance10am.includes('external:evidence:next:qa') && acceptanceBundleCheck.includes('bundle index is one-click entry') && acceptanceBundleCheck.includes('readme has open first instruction'));
add('acceptance preflight refreshes external evidence handoff artifacts', acceptancePreflight.includes('externalEvidenceCockpit') && acceptancePreflight.includes('external-evidence-cockpit.mjs') && acceptancePreflight.includes('externalEvidenceRequestPack') && acceptancePreflight.includes('external-evidence-request-pack.mjs') && acceptancePreflight.includes('acceptanceMeetingMinutes') && acceptancePreflight.includes('acceptance-meeting-minutes.mjs') && acceptancePreflight.includes('acceptanceSnapshotLock') && acceptancePreflight.includes('acceptance-snapshot-lock.mjs') && acceptancePreflight.includes('acceptanceSignoffSheet') && acceptancePreflight.includes('acceptance-signoff-sheet.mjs') && acceptancePreflight.includes('acceptanceDecisionCard') && acceptancePreflight.includes('acceptance-decision-card.mjs') && productionReadinessDoc.includes('10am GO/NO_GO decision card refresh') && productionReadinessDoc.includes('10am owner signoff sheet refresh') && productionReadinessDoc.includes('10am meeting minutes refresh') && productionReadinessDoc.includes('10am snapshot lock refresh'));
add('acceptance handoff refreshes cockpit and stable zip refs', acceptance10am.includes('acceptance-handoff.mjs') && acceptance10am.includes('external-evidence-request-pack.mjs') && acceptanceHandoff.includes('externalEvidenceCockpit') && acceptanceHandoff.includes('externalEvidenceRequestPack') && acceptanceHandoff.includes('10点现场入口') && acceptanceHandoff.includes('output/10am-decision-card.html') && acceptanceHandoff.includes('output/10am-signoff-sheet.html') && acceptanceHandoff.includes('output/10am-meeting-minutes.html') && acceptanceHandoff.includes('output/10am-snapshot-lock.html') && acceptanceHandoff.includes('output/external-evidence-cockpit.html') && acceptanceHandoff.includes('output/external-evidence-request-pack.html') && acceptanceHandoff.includes('output/10am-acceptance-bundle-latest.zip') && acceptanceHandoff.includes('output/10am-acceptance-bundle-latest.zip.sha256.txt') && acceptanceHandoff.includes('npm.cmd run acceptance:ready') && acceptanceHandoff.includes('npm.cmd run external:evidence:cockpit') && acceptanceHandoff.includes('npm.cmd run external:evidence:request-pack') && acceptanceHandoff.includes('npm.cmd run acceptance:snapshot') && acceptanceHandoff.includes('external:evidence:next:ops') && acceptanceHandoff.includes('external:evidence:next:legal') && acceptanceHandoff.includes('external:evidence:next:qa') && acceptanceBundleCheck.includes('handoff points to cockpit and stable zip sha'));
add('acceptance bundle zip writes stable latest package', acceptanceBundleZip.includes('10am-acceptance-bundle-latest.zip') && acceptanceBundleZip.includes('latestZipPath') && acceptanceBundleZip.includes('latestZipShaPath') && acceptanceBundleZip.includes('copyFile(zipPath, latestZipPath)') && acceptanceBundleZip.includes("openFirst: 'index.html'"));
add('acceptance final self-checks summary', acceptanceFinal.includes('runFinalSummaryCheck') && acceptanceFinal.includes('acceptance-final-check.mjs') && acceptanceFinal.includes('PASS 10am final summary check') && acceptanceFinal.includes('output/10am-acceptance-bundle/index.html') && acceptanceFinal.includes('output/10am-acceptance-bundle-latest.zip') && acceptanceFinal.includes('output/10am-acceptance-bundle-latest.zip.sha256.txt') && acceptanceFinal.includes('output/10am-decision-card.html') && acceptanceFinal.includes('output/10am-signoff-sheet.html') && acceptanceFinal.includes('output/10am-meeting-minutes.html') && acceptanceFinal.includes('output/10am-snapshot-lock.html') && acceptanceFinal.includes('output/external-evidence-cockpit.html') && acceptanceFinal.includes('output/external-evidence-worksheet.html') && acceptanceFinal.includes('output/manual-device-acceptance-record.html') && acceptanceFinal.includes('ownerShortcuts') && acceptanceFinal.includes('负责人快捷命令') && acceptanceFinal.includes('external:evidence:next:ops') && acceptanceFinalCheck.includes('final summary records bundle open first') && acceptanceFinalCheck.includes('final summary stable latest zip exists') && acceptanceFinalCheck.includes('final summary stable latest zip sha matches json') && acceptanceFinalCheck.includes('final summary stable latest zip sha alias exists') && acceptanceFinalCheck.includes('final summary records next external action') && acceptanceFinalCheck.includes('final summary records owner shortcut commands') && acceptanceFinalCheck.includes('final markdown has owner shortcuts') && acceptanceFinalCheck.includes('final markdown has现场打开顺序') && acceptanceFinalCheck.includes('output/10am-decision-card.html') && acceptanceFinalCheck.includes('output/10am-signoff-sheet.html') && acceptanceFinalCheck.includes('output/10am-meeting-minutes.html') && acceptanceFinalCheck.includes('output/10am-snapshot-lock.html') && acceptanceFinalCheck.includes('output/external-evidence-cockpit.html') && acceptanceFinalCheck.includes('final summary latest zip sha file matches json') && acceptanceFinalCheck.includes('final summary latest zip bytes match json') && acceptanceFinalCheck.includes('final outputs have no obvious secret blocks'));
add('artifact manifest generator exists', artifactManifestCheck.includes('pet-companion-release-artifacts-v1') && artifactManifestCheck.includes('sha256') && artifactManifestCheck.includes('release-artifacts.json') && artifactManifestCheck.includes('requiredArtifacts'));
add('artifact manifest verifier exists', artifactVerifyCheck.includes('pet-companion-release-artifacts-v1') && artifactVerifyCheck.includes('summary sha256 mismatch') && artifactVerifyCheck.includes('missing') && artifactVerifyCheck.includes('extra') && artifactVerifyCheck.includes('changed'));
add('release evidence generator exists', releaseEvidence.includes('release-evidence.json') && releaseEvidence.includes('release-artifacts.json') && releaseEvidence.includes('artifactManifest') && releaseEvidence.includes('parseNpmRunSteps') && releaseEvidence.includes('releaseCheckMatchesExpected') && releaseEvidence.includes('public:bundle:check') && releaseEvidence.includes('pwa:cache:check') && releaseEvidence.includes('architecture:check') && releaseEvidence.includes('release:evidence:check') && releaseEvidence.includes('evidenceVerification') && releaseEvidence.includes('productionEvidenceById') && releaseEvidence.includes('externalEvidenceSummary') && releaseEvidence.includes('validateExternalEvidenceItem') && releaseEvidence.includes('externalEvidenceStatus') && releaseEvidence.includes('runSelfTest') && releaseEvidence.includes('PASS release evidence self-test') && releaseEvidence.includes('invalid_external_evidence') && releaseEvidence.includes('validationErrors') && releaseEvidence.includes('proofRefs') && releaseEvidence.includes('verified proofRefs do not cover requiredProof') && releaseEvidence.includes('checkedAt is in the future') && releaseEvidence.includes('checkedAt is too old') && releaseEvidence.includes('evidenceGeneration') && releaseEvidence.includes('npm run release:evidence') && releaseEvidence.includes('local_release_gates_ready_external_evidence_required'));
add('release evidence checker exists', releaseEvidenceCheck.includes('release-evidence.json') && releaseEvidenceCheck.includes('release-artifacts.json') && releaseEvidenceCheck.includes('parseNpmRunSteps') && releaseEvidenceCheck.includes('release:evidence:self-test') && releaseEvidenceCheck.includes('selfTestStep') && releaseEvidenceCheck.includes('release:evidence:check') && releaseEvidenceCheck.includes('localGates') && releaseEvidenceCheck.includes('externalEvidenceSummary') && releaseEvidenceCheck.includes('invalidExternalEvidence') && releaseEvidenceCheck.includes('validationErrors') && releaseEvidenceCheck.includes('manifestSha256'));
add('launch status blocks missing malformed or unsafe external evidence', launchStatus.includes('REQUIRED_IDS') && launchStatus.includes('ALLOWED_STATUS') && launchStatus.includes('SECRET_PATTERN') && launchStatus.includes('PLACEHOLDER_PATTERN') && launchStatus.includes('MOJIBAKE_PATTERN') && launchStatus.includes('validateEvidenceItem') && launchStatus.includes('runSelfTest') && launchStatus.includes('PASS launch status self-test') && launchStatus.includes('is not valid JSON') && launchStatus.includes('releaseEvidenceRead.error') && launchStatus.includes('artifactManifestRead.error') && launchStatus.includes('release evidence artifact sha does not match current artifact manifest') && launchStatus.includes('compareCurrentDistToArtifactManifest') && launchStatus.includes('artifact manifest sha does not match current dist') && launchStatus.includes('productionEvidenceRead') && launchStatus.includes("source: 'missing'") && launchStatus.includes('output/production-evidence.json is missing') && launchStatus.includes('production evidence schema mismatch') && launchStatus.includes('required external evidence item') && launchStatus.includes('placeholder evidenceRef') && launchStatus.includes('missing proofRefs') && launchStatus.includes('verified proofRefs do not cover requiredProof') && launchStatus.includes('checkedAt is not parseable') && launchStatus.includes('checkedAt is in the future') && launchStatus.includes('checkedAt is too old') && launchStatus.includes('ownerShortcutsFor') && launchStatus.includes('Owner shortcut commands') && launchStatus.includes('external:evidence:next:ops') && productionReadinessDoc.includes('launch:status') && productionReadinessDoc.includes('external:evidence:next:ops'));
add('release evidence documentation exists', releaseEvidenceDoc.includes('output/release-evidence.json') && releaseEvidenceDoc.includes('output/release-artifacts.json') && releaseEvidenceDoc.includes('pending_external_evidence') && releaseEvidenceDoc.includes('manual:acceptance:check') && releaseEvidenceDoc.includes('artifact:manifest') && releaseEvidenceDoc.includes('artifact:verify') && releaseEvidenceDoc.includes('release:evidence:self-test') && releaseEvidenceDoc.includes('release:evidence:check') && releaseEvidenceDoc.includes('release:check') && releaseEvidenceDoc.includes('本地门禁之后') && releaseEvidenceDoc.includes('不读取真实生产密钥'));
add('backup restore drill exists', backupDrill.includes('PET_STORAGE_DRIVER') && backupDrill.includes('sqlite') && backupDrill.includes('copySqliteSet') && backupDrill.includes('restore') && backupDrill.includes('PASS backup restore drill'));
add('operations runbook includes backup restore drill', operationsDoc.includes('Backup and restore drill') && operationsDoc.includes('backup-restore-drill-failed') && operationsDoc.includes('npm run backup:drill'));
add('release plan check validates runbooks', releasePlanCheck.includes('docs/release-runbook.md') && releasePlanCheck.includes('docs/rollback.md') && releasePlanCheck.includes('Go / No-Go') && releasePlanCheck.includes('Rollback triggers'));
add('secrets check validates secret hygiene', secretsCheck.includes('deploy/production.env') && secretsCheck.includes('deploy/certs') && secretsCheck.includes('PRIVATE_KEY_BLOCK') && secretsCheck.includes('AWS access key id pattern'));
add('release runbook exists', releaseRunbook.includes('Pet Companion Release Runbook') && releaseRunbook.includes('Go / No-Go') && releaseRunbook.includes('npm run release:check') && releaseRunbook.includes('npm run release:go') && releaseRunbook.includes('npm run smoke:production') && releaseRunbook.includes('real iPhone'));
add('rollback runbook exists', rollbackDoc.includes('Pet Companion Rollback Runbook') && rollbackDoc.includes('Rollback triggers') && rollbackDoc.includes('pet_companion_data') && rollbackDoc.includes('npm run ops:check'));
add('security release notes exist', securityDoc.includes('Pet Companion Security Release Notes') && securityDoc.includes('npm run secrets:check') && securityDoc.includes('deploy/production.env') && securityDoc.includes('Runtime config boundary'));
add('accessibility release notes exist', accessibilityDoc.includes('宠伴记可访问性与离线可用门禁') && accessibilityDoc.includes('npm run accessibility:check') && accessibilityDoc.includes('offline navigation fallback') && accessibilityDoc.includes('runtime-config.js'));
add('accessibility check validates ui and offline baseline', accessibilityCheck.includes('skip link') && accessibilityCheck.includes('aria-current="page"') && accessibilityCheck.includes('offline navigation fallback') && accessibilityCheck.includes('runtime config is not precached'));
add('operations runbook references rollback', operationsDoc.includes('docs/rollback.md') && operationsDoc.includes('rollback'));
add('alert rules example exists', alertRules.includes('api-not-ready') && alertRules.includes('latency-slo-breach') && alertRules.includes('monitoring-ingest-failed') && alertRules.includes('docs/operations.md'));
add('package release gate includes deploy bundle check', pkg.includes('npm run deploy:bundle:check'));

const deployCompose = readFileSync('deploy/docker-compose.production.yml', 'utf8');
const deployNginx = readFileSync('deploy/nginx.conf', 'utf8');
const deployEnvExample = readFileSync('deploy/production.env.example', 'utf8');
const deployBundleCheck = readFileSync('scripts/deploy-bundle-check.mjs', 'utf8');
const gitignore = readFileSync('.gitignore', 'utf8');
add('deploy compose production bundle exists', deployCompose.includes('pet-api:') && deployCompose.includes('pet-web:') && deployCompose.includes('nginx:1.27-alpine'));
add('deploy compose uses api health and sqlite volume', deployCompose.includes('condition: service_healthy') && deployCompose.includes('PET_SQLITE_FILE: /data/pet-companion.sqlite') && deployCompose.includes('pet_companion_data:/data'));
add('deploy compose mounts dist and certs read-only', deployCompose.includes('../dist:/usr/share/nginx/html:ro') && deployCompose.includes('./certs:/etc/nginx/certs:ro'));
add('deploy nginx has https api proxy and pwa fallback', deployNginx.includes('listen 443 ssl') && deployNginx.includes('location /api/') && deployNginx.includes('try_files $uri $uri/ /index.html'));
add('deploy nginx protects runtime caching and security headers', deployNginx.includes('location = /runtime-config.js') && deployNginx.includes('no-store') && deployNginx.includes('Content-Security-Policy') && deployNginx.includes('Strict-Transport-Security'));
add('deploy env example has auth media and timeout placeholders', deployEnvExample.includes('PET_AUTH_SECRET=replace-with-random-auth-secret') && deployEnvExample.includes('PET_REFRESH_TOKEN_TTL_MS=2592000000') && deployEnvExample.includes('PET_BACKUP_RETENTION_MAX=20') && deployEnvExample.includes('PET_TRUST_PROXY=true') && deployEnvExample.includes('PET_MONITORING_RATE_LIMIT_MAX=120') && deployEnvExample.includes('PET_MONITORING_RATE_LIMIT_WINDOW_MS=60000') && deployEnvExample.includes('PET_SERVER_REQUEST_TIMEOUT_MS=30000') && deployEnvExample.includes('PET_SERVER_HEADERS_TIMEOUT_MS=15000') && deployEnvExample.includes('PET_SERVER_KEEP_ALIVE_TIMEOUT_MS=5000') && deployEnvExample.includes('PET_MEDIA_STORAGE_DRIVER=local') && deployEnvExample.includes('PET_MEDIA_LOCAL_DIR=/data/media'));
add('deploy secrets ignored', gitignore.includes('deploy/production.env') && gitignore.includes('deploy/certs/'));
add('deploy bundle check validates compose and nginx', deployBundleCheck.includes('compose defines api and web services') && deployBundleCheck.includes('nginx redirects http to https') && deployBundleCheck.includes('release gate includes deploy bundle check'));

const dockerfile = readFileSync('Dockerfile', 'utf8');
const dockerignore = readFileSync('.dockerignore', 'utf8');
const containerCheck = readFileSync('scripts/container-check.mjs', 'utf8');
add('container Dockerfile exists', dockerfile.includes('FROM node:24') && dockerfile.includes('NODE_ENV=production') && dockerfile.includes('PET_SERVER_HOST=0.0.0.0'));
add('container defaults to sqlite storage', dockerfile.includes('PET_STORAGE_DRIVER=sqlite') && dockerfile.includes('PET_SQLITE_FILE=/data/pet-companion.sqlite'));
add('container runs as non-root api runtime', dockerfile.includes('USER node') && dockerfile.includes('COPY --chown=node:node server ./server') && dockerfile.includes('CMD ["npm", "run", "server:start"]'));
add('container exposes persistent sqlite data and healthcheck', dockerfile.includes('VOLUME ["/data"]') && dockerfile.includes('PET_SQLITE_FILE=/data/pet-companion.sqlite') && dockerfile.includes('EXPOSE 8787') && dockerfile.includes('HEALTHCHECK') && dockerfile.includes('/health'));
add('dockerignore excludes local build and runtime data', ['node_modules', 'dist', 'output', 'server-data', '.git', '*.log', '*.bak'].every(item => dockerignore.includes(item)));
add('container check script validates docker baseline', containerCheck.includes('Dockerfile exists') && containerCheck.includes('release gate includes container check') && containerCheck.includes('container does not run as root') && containerCheck.includes('PET_STORAGE_DRIVER=sqlite'));


const build = readFileSync('scripts/build.mjs', 'utf8');
add('production build script exists', build.includes('dist') && build.includes('build-info.json') && build.includes('APP_VERSION'));
add('production build gates audit test and pwa cache', build.includes('./scripts/audit.mjs') && build.includes('./scripts/test.mjs') && build.includes('./scripts/pwa-cache-check.mjs') && build.includes('pwaCacheCheck') && build.includes('gates'));
add('production build copies runtime config and headers', build.includes('_headers') && build.includes('runtime-config.js') && build.includes('runtime-config.example.js'));
add('production build cleans stale dist before copy', build.includes('rm(resolvedDistDir') && build.includes('Refusing to clean dist outside workspace'));
add('production build publishes only legal docs', build.includes('publicDocs') && build.includes("'privacy.md'") && build.includes("'terms.md'") && !build.includes("'README.md'") && !build.includes("  'docs'\n"));

const deployCheck = readFileSync('scripts/deploy-check.mjs', 'utf8');
add('deploy check script exists', deployCheck.includes('deploy checks passed') && deployCheck.includes('runtime-config.js') && deployCheck.includes('Content-Security-Policy'));
add('deploy check supports production mode', deployCheck.includes('--production') && deployCheck.includes('API_MOCK_FALLBACK') && deployCheck.includes('https:') && deployCheck.includes('OPERATOR_NAME') && deployCheck.includes('SUPPORT_CONTACT_URL') && deployCheck.includes('[A-Z0-9._%+-]+@[A-Z0-9.-]+') && deployCheck.includes('production runtime config has no placeholders'));
const writeRuntimeConfig = readFileSync('scripts/write-runtime-config.mjs', 'utf8');
add('production runtime config writer exists', writeRuntimeConfig.includes('PET_API_BASE_URL') && writeRuntimeConfig.includes('PET_MONITORING_ENDPOINT') && writeRuntimeConfig.includes('PET_OPERATOR_NAME') && writeRuntimeConfig.includes('PET_SUPPORT_CONTACT_URL') && writeRuntimeConfig.includes('dist/runtime-config.js'));
add('production runtime config writer enforces production', writeRuntimeConfig.includes('生产运行时配置不完整') && writeRuntimeConfig.includes('https:') && writeRuntimeConfig.includes('API_MOCK_FALLBACK') && writeRuntimeConfig.includes('[A-Z0-9._%+-]+@[A-Z0-9.-]+') && writeRuntimeConfig.includes('不能使用 example.com'));
const productionSmoke = readFileSync('scripts/smoke-production.mjs', 'utf8');
add('production smoke script exists', productionSmoke.includes('PET_PROD_APP_URL') && productionSmoke.includes('PET_PROD_API_BASE_URL') && productionSmoke.includes('runSmoke') && productionSmoke.includes('--self-test'));
add('production smoke verifies runtime build info and api probes', productionSmoke.includes('APP_RELEASE_CHANNEL') && productionSmoke.includes('API_MOCK_FALLBACK') && productionSmoke.includes('assertBuildInfo') && productionSmoke.includes('/build-info.json') && productionSmoke.includes('/service-worker.js') && productionSmoke.includes('/health') && productionSmoke.includes('/ready') && productionSmoke.includes('/app-state'));
add('production smoke verifies operator support runtime config', productionSmoke.includes('OPERATOR_NAME') && productionSmoke.includes('SUPPORT_CONTACT_URL') && productionSmoke.includes('extractRuntimeBoolean') && productionSmoke.includes("API_BASE_URL'), apiBaseUrl") && productionSmoke.includes('runtime-config 必须提供 HTTPS 客服/投诉入口或客服邮箱') && productionSmoke.includes('[A-Z0-9._%+-]+@[A-Z0-9.-]+') && productionSmoke.includes('不能使用占位内容') && productionSmoke.includes('不能使用占位域名'));
add('production smoke verifies request id tracing', productionSmoke.includes('req_smoke_health_001') && productionSmoke.includes('req_smoke_unauth_001') && productionSmoke.includes('payload.requestId'));
const serverProductionCheck = readFileSync('scripts/server-production-check.mjs', 'utf8');
add('server production config check exists', serverProductionCheck.includes('getServerRuntimeChecks') && serverProductionCheck.includes('server production config check'));

const tests = readFileSync('scripts/test.mjs', 'utf8');
add('formal smoke tests exist', tests.includes('validation layer') && tests.includes('runtime config overrides') && tests.includes('ownership policy') && tests.includes('monitoring boundary') && tests.includes('backup and remote state boundary') && tests.includes('render smoke with bottom sheet'));
add('formal remote auth tests exist', tests.includes('remote auth ui and session boundary') && tests.includes('remote-register-form') && tests.includes('模式：remote') && tests.includes('已持有远端 token'));
add('formal remote sync tests exist', tests.includes('remote sync sanitizes session tokens') && tests.includes('上传云端') && tests.includes('pat_secret') && tests.includes('capturedBody.state.session.accessToken, null'));
add('formal remote refresh retry tests exist', tests.includes('remote sync refreshes expired access token') && tests.includes('operationCalls, 2') && tests.includes('pat_new') && tests.includes('refreshExpiresAt'));

const e2e = readFileSync('scripts/e2e.mjs', 'utf8');
add('browser e2e script exists', e2e.includes('headless=new') && e2e.includes('打卡管理') && e2e.includes('应用更新') && e2e.includes('客服与反馈') && e2e.includes('同步与备份') && e2e.includes('Page.captureScreenshot'));
add('browser e2e accepts legal consent before demo', e2e.includes('[name="legalConsent"]') && e2e.includes('seed-demo'));
const remoteE2e = readFileSync('scripts/e2e-remote.mjs', 'utf8');
add('remote browser e2e script exists', remoteE2e.includes('remote browser e2e') && remoteE2e.includes('createPetCompanionServer') && remoteE2e.includes('remote-register-form'));
add('remote browser e2e accepts legal consent before register', remoteE2e.includes('[name="legalConsent"]') && remoteE2e.includes('remote-register-form'));
add('remote browser e2e uses isolated debug resources', remoteE2e.includes('getFreePort') && remoteE2e.includes("mkdtemp(join(outputDir, 'chrome-profile-')") && remoteE2e.includes('浏览器进程提前退出') && remoteE2e.includes('stopBrowser') && remoteE2e.includes('PET_SERVER_LOG_LEVEL'));
add('remote browser e2e verifies cloud sync and backup', remoteE2e.includes('push-remote-state') && remoteE2e.includes('create-remote-backup') && remoteE2e.includes('db.states') && remoteE2e.includes('db.backups'));
add('remote browser e2e verifies backend secret sanitization', remoteE2e.includes('passwordHash') && remoteE2e.includes('accessToken, undefined') && remoteE2e.includes('session.accessToken, null'));

const deployment = readFileSync('docs/deployment.md', 'utf8');
add('deployment checklist exists', deployment.includes('npm run audit') && deployment.includes('npm run test') && deployment.includes('npm run build') && deployment.includes('npm run e2e') && deployment.includes('npm run deploy:check') && deployment.includes('runtime-config.js') && deployment.includes('build-info.json') && deployment.includes('发布前必须通过'));
add('deployment checklist includes remote e2e', deployment.includes('npm run e2e:remote') && deployment.includes('远端注册、云同步和云备份'));
add('deployment checklist includes server production config gate', deployment.includes('npm run server:check:production') && deployment.includes('通配 CORS') && deployment.includes('PET_SERVER_DATA_DIR') && deployment.includes('PET_SERVER_REQUEST_TIMEOUT_MS') && deployment.includes('HTTP timeout'));
add('deployment checklist includes container gate', deployment.includes('npm run container:check') && deployment.includes('docker build') && deployment.includes('pet-companion-api:0.4.0') && deployment.includes('pet-companion-data:/data'));
add('deployment checklist includes production compose bundle', deployment.includes('npm run deploy:bundle:check') && deployment.includes('deploy/docker-compose.production.yml') && deployment.includes('deploy/nginx.conf') && deployment.includes('docker compose -f deploy/docker-compose.production.yml'));
add('deployment checklist includes manual acceptance gate', deployment.includes('npm run manual:acceptance:check') && deployment.includes('docs/manual-device-acceptance.md') && deployment.includes('支持/投诉'));
add('deployment checklist includes ops checks', deployment.includes('npm run ops:check') && deployment.includes('docs/operations.md') && deployment.includes('deploy/alert-rules.example.json') && deployment.includes('latency SLO'));
add('deployment checklist includes production smoke', deployment.includes('npm run smoke:production') && deployment.includes('PET_PROD_APP_URL') && deployment.includes('X-Request-ID'));
add('deployment checklist includes backup drill', deployment.includes('npm run backup:drill') && deployment.includes('Backup and restore drill') && deployment.includes('WAL/SHM'));
add('deployment checklist includes release and rollback runbooks', deployment.includes('npm run release:plan:check') && deployment.includes('docs/release-runbook.md') && deployment.includes('docs/rollback.md'));
add('deployment checklist includes secrets check', deployment.includes('npm run secrets:check') && deployment.includes('docs/security.md') && deployment.includes('TLS 证书'));
add('deployment checklist includes accessibility check', deployment.includes('npm run accessibility:check') && deployment.includes('docs/accessibility.md') && deployment.includes('离线导航回退'));
add('deployment checklist includes legal policy check', deployment.includes('docs/terms.md') && deployment.includes('docs/privacy.md') && deployment.includes('登录、注册和演示数据入口'));
add('deployment checklist includes support diagnostics', deployment.includes('支持诊断包') && deployment.includes('不包含用户昵称') && deployment.includes('token'));
add('deployment checklist includes pwa update acceptance', deployment.includes('PWA update acceptance') && deployment.includes('检查更新') && deployment.includes('旧缓存'));
add('deployment checklist links production readiness', deployment.includes('docs/production-readiness.md') && deployment.includes('真实上线前仍需外部补齐'));
const requirements = readFileSync('docs/requirements.md', 'utf8');
add('requirements include production runtime gate', requirements.includes('scripts/write-runtime-config.mjs') && requirements.includes('生产 `runtime-config.js`') && requirements.includes('关闭 mock fallback'));
add('requirements include server ownership gate', requirements.includes('服务端状态与备份写入') && requirements.includes('跨用户宠物') && requirements.includes('跨用户'));
add('requirements include password auth gate', requirements.includes('注册和登录分离') && requirements.includes('密码、access token、refresh token 不得明文落库') && requirements.includes('登录失败不得签发会话') && requirements.includes('刷新时轮换'));
add('requirements include auth rate limit gate', requirements.includes('服务端认证接口、账号注销密码确认接口和前端监控事件接口必须有限流保护') && requirements.includes('RATE_LIMITED') && requirements.includes('PET_TRUST_PROXY=true') && requirements.includes('共享限流'));
add('requirements include remote auth ui gate', requirements.includes('配置 `API_BASE_URL` 后必须提供远端注册/登录入口') && requirements.includes('本地体验模式') && requirements.includes('不得误发账号请求'));
add('requirements include remote sync gate', requirements.includes('手动上传云端、拉取云端和创建云备份入口') && requirements.includes('同步请求体和备份不得包含 access token') && requirements.includes('PET_BACKUP_RETENTION_MAX'));
add('requirements include remote refresh retry gate', requirements.includes('access token 过期') && requirements.includes('刷新会话并重试一次') && requirements.includes('refreshExpiresAt'));
add('requirements include remote browser e2e gate', requirements.includes('真实浏览器远端联调') && requirements.includes('后端脱敏落库'));
add('requirements include server production config gate', requirements.includes('生产环境变量门禁') && requirements.includes('通配 CORS') && requirements.includes('loopback') && requirements.includes('HTTP request/header/keep-alive 超时'));
add('requirements include production startup fail-fast gate', requirements.includes('NODE_ENV=production') && requirements.includes('fail-fast') && requirements.includes('直接启动'));
add('requirements include request id tracing gate', requirements.includes('X-Request-ID') && requirements.includes('结构化访问日志') && requirements.includes('requestId 与响应头一致') && requirements.includes('UNSUPPORTED_MEDIA_TYPE') && requirements.includes('Cache-Control: no-store') && requirements.includes('Cross-Origin-Opener-Policy') && requirements.includes('不合理的 HTTP 超时'));
add('requirements include production smoke gate', requirements.includes('生产冒烟检查') && requirements.includes('runtime-config') && requirements.includes('health/ready'));
add('requirements include container deployment gate', requirements.includes('\u5bb9\u5668\u5316\u90e8\u7f72\u57fa\u7ebf') && requirements.includes('\u975e root \u7528\u6237') && requirements.includes('\u6301\u4e45\u5316\u6570\u636e\u5377') && requirements.includes('HEALTHCHECK'));
add('requirements include production storage gate', requirements.includes('PET_STORAGE_DRIVER=sqlite') && requirements.includes('PET_SQLITE_FILE') && requirements.includes('SQLite') && requirements.includes('/ready') && requirements.includes('\u5a92\u4f53\u5b58\u50a8 ready \u63a2\u9488'));
add('requirements include production media storage gate', requirements.includes('PET_MEDIA_STORAGE_DRIVER=local') && requirements.includes('PET_MEDIA_LOCAL_DIR') && requirements.includes('/media/uploads') && requirements.includes('Data URL') && requirements.includes('checks.media') && requirements.includes('当前用户媒体删除') && requirements.includes('账号注销媒体清理'));
add('requirements include production deploy bundle gate', requirements.includes('\u751f\u4ea7\u90e8\u7f72\u7f16\u6392\u95e8\u7981') && requirements.includes('Docker Compose') && requirements.includes('Nginx HTTPS') && requirements.includes('deploy:bundle:check'));
add('requirements include manual acceptance gate', requirements.includes('真机验收模板门禁') && requirements.includes('manual:acceptance:check') && requirements.includes('支持/投诉入口') && requirements.includes('脱敏截图'));
add('requirements include operations monitoring gate', requirements.includes('Operations monitoring gate') && requirements.includes('ops:check:self-test') && requirements.includes('latency SLO') && requirements.includes('operations Runbook'));
add('requirements include backup restore drill gate', requirements.includes('备份恢复演练门禁') && requirements.includes('npm run backup:drill') && requirements.includes('WAL/SHM') && requirements.includes('恢复云备份'));
add('requirements include release rollback plan gate', requirements.includes('发布与回滚计划门禁') && requirements.includes('docs/release-runbook.md') && requirements.includes('docs/rollback.md') && requirements.includes('release:plan:check'));
add('requirements include architecture drift gate', requirements.includes('\u67b6\u6784\u6587\u6863\u6f02\u79fb\u95e8\u7981') && requirements.includes('npm run architecture:check') && requirements.includes('docs/architecture.md') && requirements.includes('\u5206\u5c42\u6f02\u79fb'));
add('requirements include public bundle gate', requirements.includes('公网发布包边界门禁') && requirements.includes('npm run public:bundle:check') && requirements.includes('dist/docs/') && requirements.includes('privacy.md') && requirements.includes('terms.md') && requirements.includes('真机验收清单') && requirements.includes('output/production-evidence.json') && requirements.includes('私钥块'));
add('requirements include release evidence gate', requirements.includes('发布证据包门禁') && requirements.includes('npm run release:evidence') && requirements.includes('npm run release:evidence:check') && requirements.includes('npm run external:evidence:check') && requirements.includes('npm run artifact:manifest') && requirements.includes('npm run artifact:verify') && requirements.includes('deploy/production-evidence.example.json') && requirements.includes('output/release-evidence.json') && requirements.includes('output/release-artifacts.json') && requirements.includes('pending_external_evidence'));
add('requirements include secrets hygiene gate', requirements.includes('密钥泄漏门禁') && requirements.includes('npm run secrets:check') && requirements.includes('deploy/production.env') && requirements.includes('私钥块'));
add('requirements include account lifecycle gate', requirements.includes('账号数据生命周期门禁') && requirements.includes('GET /account/export') && requirements.includes('DELETE /account') && requirements.includes('错误密码尝试必须进入服务端限流') && requirements.includes('旧 access token 必须立即失效') && requirements.includes('CORS 预检必须允许 DELETE') && requirements.includes('当前用户媒体文件'));
add('requirements include accessibility offline gate', requirements.includes('可访问性与离线可用门禁') && requirements.includes('npm run accessibility:check') && requirements.includes('离线导航回退') && requirements.includes('runtime-config.js'));
add('requirements include legal consent gate', requirements.includes('用户协议与隐私政策同意门禁') && requirements.includes('docs/terms.md') && requirements.includes('未同意前不得创建本地用户') && requirements.includes('同意记录必须写入状态层'));
add('requirements include support diagnostics gate', requirements.includes('支持诊断包门禁') && requirements.includes('导出脱敏诊断包') && requirements.includes('敏感字段扫描') && requirements.includes('不得包含昵称'));
add('requirements include feedback complaint gate', requirements.includes('反馈与投诉') && requirements.includes('暖窝动态和评论必须可被投诉') && requirements.includes('投诉记录至少包含提交人') && requirements.includes('投诉补充说明必须在保存前拦截') && requirements.includes('历史本地数据迁移') && requirements.includes('云同步或备份'));
add('requirements include pwa update lifecycle gate', requirements.includes('PWA 更新生命周期门禁') && requirements.includes('npm run pwa:cache:check') && requirements.includes('检查更新') && requirements.includes('SKIP_WAITING') && requirements.includes('旧缓存'));

const apiContract = readFileSync('docs/api-contract.md', 'utf8');
add('api contract exists', apiContract.includes('POST `/auth/register`') && apiContract.includes('POST `/auth/sign-in`') && apiContract.includes('GET `/app-state`') && apiContract.includes('POST `/app-state/backups`') && apiContract.includes('服务端所有权校验'));
add('api contract requires password security', apiContract.includes('不得明文保存密码') && apiContract.includes('带盐哈希') && apiContract.includes('ACCOUNT_EXISTS'));
add('api contract requires token hash storage', apiContract.includes('不得明文保存 access token') && apiContract.includes('仅保存 token 哈希') && apiContract.includes('常量时间比较') && apiContract.includes('轮换 refresh token'));
add('api contract requires auth rate limit', apiContract.includes('RATE_LIMITED') && apiContract.includes('Retry-After') && apiContract.includes('CORS 会暴露') && apiContract.includes('注册、登录、刷新、退出、账号注销密码确认和监控事件接口必须有服务端限流'));
add('api contract documents refresh retry', apiContract.includes('刷新会话并重试一次') && apiContract.includes('重新登录') && apiContract.includes('refreshExpiresAt'));
add('api contract documents request id tracing', apiContract.includes('X-Request-ID') && apiContract.includes('requestId') && apiContract.includes('结构化 JSON 访问日志'));
add('api contract documents json content type boundary', apiContract.includes('UNSUPPORTED_MEDIA_TYPE') && apiContract.includes('+json') && apiContract.includes('GET,POST,PUT,DELETE,OPTIONS') && apiContract.includes('Cache-Control: no-store') && apiContract.includes('Cross-Origin-Opener-Policy') && apiContract.includes('request/header/keep-alive timeouts'));
add('api contract documents account lifecycle', apiContract.includes('GET `/account/export`') && apiContract.includes('DELETE `/account`') && apiContract.includes('passwordHash') && apiContract.includes('旧 access token 必须立即失效'));
add('api contract documents backup retention', apiContract.includes('PET_BACKUP_RETENTION_MAX') && apiContract.includes('只保留最新 N 份'));
const backendDoc = readFileSync('docs/backend.md', 'utf8');
add('backend docs exist', backendDoc.includes('npm run server:start') && backendDoc.includes('npm run server:test') && backendDoc.includes('生产注意事项'));
add('backend docs include auth account and monitoring rate limit', backendDoc.includes('PET_AUTH_RATE_LIMIT_MAX') && backendDoc.includes('PET_TRUST_PROXY') && backendDoc.includes('X-Forwarded-For') && backendDoc.includes('PET_MONITORING_RATE_LIMIT_MAX') && backendDoc.includes('账号注销密码确认') && backendDoc.includes('常量时间比较') && backendDoc.includes('RATE_LIMITED') && backendDoc.includes('Redis、网关或托管 WAF'));
add('backend docs include server production config check', backendDoc.includes('npm run server:check:production') && backendDoc.includes('NODE_ENV=production') && backendDoc.includes('通配 CORS') && backendDoc.includes('PET_REFRESH_TOKEN_TTL_MS') && backendDoc.includes('PET_SERVER_REQUEST_TIMEOUT_MS') && backendDoc.includes('轮换 refresh token'));
add('backend docs include production startup fail-fast', backendDoc.includes('server:start') && backendDoc.includes('启动会失败') && backendDoc.includes('正式环境'));
add('backend docs include request id logging', backendDoc.includes('请求追踪与日志') && backendDoc.includes('X-Request-ID') && backendDoc.includes('PET_SERVER_LOG_LEVEL'));
add('backend docs include container deployment', backendDoc.includes('\u5bb9\u5668\u5316\u8fd0\u884c') && backendDoc.includes('pet-companion-data:/data') && backendDoc.includes('PET_SERVER_HOST=0.0.0.0'));
add('backend docs include sqlite storage', backendDoc.includes('PET_STORAGE_DRIVER=sqlite') && backendDoc.includes('PET_SQLITE_FILE') && backendDoc.includes('node:sqlite') && backendDoc.includes('/ready'));
add('backend docs include server local media storage', backendDoc.includes('PET_MEDIA_STORAGE_DRIVER') && backendDoc.includes('PET_MEDIA_LOCAL_DIR') && backendDoc.includes('/media/uploads') && backendDoc.includes('checks.media') && backendDoc.includes('ready'));
add('backend docs include backup restore drill', backendDoc.includes('备份与恢复演练') && backendDoc.includes('npm run backup:drill') && backendDoc.includes('WAL/SHM') && backendDoc.includes('PET_BACKUP_RETENTION_MAX'));
add('backend docs include account lifecycle', backendDoc.includes('GET /account/export') && backendDoc.includes('DELETE /account') && backendDoc.includes('账号注销') && backendDoc.includes('媒体文件'));
add('backend docs include api body cors timeout and security headers', backendDoc.includes('UNSUPPORTED_MEDIA_TYPE') && backendDoc.includes('GET,POST,PUT,DELETE,OPTIONS') && backendDoc.includes('Cache-Control: no-store') && backendDoc.includes('Cross-Origin-Opener-Policy') && backendDoc.includes('Node HTTP request/header/keep-alive 超时'));
const privacyDoc = readFileSync('docs/privacy.md', 'utf8');
add('privacy implementation notes exist', privacyDoc.includes('GET /account/export') && privacyDoc.includes('DELETE /account') && privacyDoc.includes('密码哈希') && privacyDoc.includes('宠伴记隐私政策') && privacyDoc.includes('图片删除') && privacyDoc.includes('远端媒体文件') && !privacyDoc.includes('Before a public'));
const termsDoc = readFileSync('docs/terms.md', 'utf8');
add('user agreement exists', termsDoc.includes('宠伴记用户协议') && termsDoc.includes('服务范围') && termsDoc.includes('同意版本') && termsDoc.includes('兽医诊断') && !termsDoc.includes('正式上线前'));

const runtimeConfig = readFileSync('runtime-config.js', 'utf8');
const runtimeConfigExample = readFileSync('runtime-config.example.js', 'utf8');
const runtimeConfigDoc = readFileSync('docs/runtime-config.md', 'utf8');
add('runtime config files exist', runtimeConfig.includes('PET_COMPANION_CONFIG') && runtimeConfigExample.includes('PET_COMPANION_CONFIG') && runtimeConfigDoc.includes('运行时配置'));
add('runtime config has no obvious secrets', !/token|cookie|private[_-]?key|password/i.test(runtimeConfig));

const headers = readFileSync('_headers', 'utf8');
add('static security headers exist', headers.includes('Content-Security-Policy') && headers.includes('X-Content-Type-Options: nosniff') && headers.includes('Permissions-Policy'));

const serverRouter = readFileSync('server/router.js', 'utf8');
const serverAuth = readFileSync('server/auth.js', 'utf8');
const serverConfig = readFileSync('server/config.js', 'utf8');
const serverHealth = readFileSync('server/health.js', 'utf8');
const serverLifecycle = readFileSync('server/lifecycle.js', 'utf8');
const serverLogger = readFileSync('server/logger.js', 'utf8');
const serverIndex = readFileSync('server/index.js', 'utf8');
const serverRateLimit = readFileSync('server/rateLimit.js', 'utf8');
const serverState = readFileSync('server/state.js', 'utf8');
const serverMedia = readFileSync('server/media.js', 'utf8');
const serverStorage = readFileSync('server/storage.js', 'utf8');
const serverHttp = readFileSync('server/http.js', 'utf8');
const serverTest = readFileSync('scripts/server-test.mjs', 'utf8');
const mediaUploadRouteIndex = serverRouter.indexOf("url.pathname === '/media/uploads'");
const mediaUploadAuthIndex = serverRouter.indexOf('const { user } = requireAuth(db, request);', mediaUploadRouteIndex);
const mediaUploadBodyIndex = serverRouter.indexOf('const body = await readJsonBody(request);', mediaUploadRouteIndex);
add('server api routes exist', serverRouter.includes('/auth/register') && serverRouter.includes('/auth/sign-in') && serverRouter.includes('/app-state') && serverRouter.includes('/monitoring/events'));
add('server account lifecycle routes exist', serverRouter.includes('/account/export') && serverRouter.includes('DELETE /account') && serverRouter.includes('exportAccountData') && serverRouter.includes('deleteAccount'));
add('server production config validation exists', serverConfig.includes('getServerRuntimeChecks') && serverConfig.includes('assertProductionServerConfig') && serverConfig.includes('PET_CORS_ORIGIN is not wildcard') && serverConfig.includes('PET_CORS_ORIGIN is not placeholder') && serverConfig.includes('PET_SERVER_HOST is not loopback') && serverConfig.includes('PET_AUTH_SECRET is not placeholder') && serverConfig.includes('PET_REFRESH_TOKEN_TTL_MS not shorter than access token') && serverConfig.includes('PET_BACKUP_RETENTION_MAX within production bounds') && serverConfig.includes('PET_TRUST_PROXY is boolean') && serverConfig.includes('PET_SERVER_REQUEST_TIMEOUT_MS within production bounds') && serverConfig.includes('PET_SERVER_HEADERS_TIMEOUT_MS not greater than request timeout') && serverConfig.includes('PET_MONITORING_RATE_LIMIT_MAX within production bounds'));
add('server entry fails fast in production', serverIndex.includes('assertProductionServerConfig()') && serverIndex.indexOf('assertProductionServerConfig()') < serverIndex.indexOf('server.listen'));
add('server production config rejects unsafe defaults', serverConfig.includes("corsOrigin !== '*'") && serverConfig.includes('hasPlaceholderValue') && serverConfig.includes('PET_MEDIA_S3_BUCKET is not placeholder when s3 media is used') && serverConfig.includes('server-data') && serverConfig.includes('PET_AUTH_RATE_LIMIT_MAX within production bounds') && serverConfig.includes('PET_TRUST_PROXY is boolean') && serverConfig.includes('PET_MONITORING_RATE_LIMIT_MAX within production bounds') && serverConfig.includes('authSecret.length >= 32') && serverConfig.includes('refreshTokenTtl >= accessTokenTtl') && serverConfig.includes('backupRetentionMax >= 3') && serverConfig.includes('requestTimeout >= 5 * 1000') && serverConfig.includes('headersTimeout <= requestTimeout'));
add('server production config requires sqlite storage', serverConfig.includes('PET_STORAGE_DRIVER is sqlite in production') && serverConfig.includes('PET_SQLITE_FILE is absolute') && serverConfig.includes('PET_SQLITE_FILE is not local default'));
add('server production config requires persistent local media storage', serverConfig.includes('PET_MEDIA_STORAGE_DRIVER is local or s3 in production') && serverConfig.includes('PET_MEDIA_LOCAL_DIR is absolute when local media is used') && serverConfig.includes('PET_MEDIA_LOCAL_DIR is not local default'));
add('server health readiness routes exist', serverRouter.includes('/health') && serverRouter.includes('/ready') && serverRouter.includes('getHealth') && serverRouter.includes('getReadiness'));
add('server readiness probes storage and media', serverHealth.includes('getReadiness') && serverHealth.includes('probeStorage') && serverHealth.includes('probeMediaStorage') && serverHealth.includes('checks.media') && serverHealth.includes('not_ready'));
add('server readiness uses storage and media probes', serverHealth.includes('./storage.js') && serverHealth.includes('./media.js') && serverHealth.includes('probeStorage()') && serverHealth.includes('probeMediaStorage()'));
add('server lifecycle supports graceful shutdown', serverLifecycle.includes('installGracefulShutdown') && serverLifecycle.includes('SIGTERM') && serverLifecycle.includes('SIGINT') && serverLifecycle.includes('server.close') && serverLifecycle.includes('timeoutMs'));
add('server entry installs graceful shutdown', serverIndex.includes('installGracefulShutdown(server)'));
add('server configures http timeouts', serverIndex.includes('configureServerTimeouts') && serverIndex.includes('requestTimeout') && serverIndex.includes('headersTimeout') && serverIndex.includes('keepAliveTimeout'));
add('server storage writes atomically with backup', serverStorage.includes('atomicWriteDb') && serverStorage.includes('rename(tempFile, DB_FILE)') && serverStorage.includes('DB_BACKUP_FILE') && serverStorage.includes('copyCurrentPrimaryToBackup'));
add('server sqlite storage driver exists', serverStorage.includes('DatabaseSync') && serverStorage.includes('STORAGE_DRIVER') && serverStorage.includes('app_state') && serverStorage.includes('PRAGMA journal_mode = WAL'));
add('server storage probe supports sqlite', serverStorage.includes('probeStorage') && serverStorage.includes("driver: 'sqlite'") && serverStorage.includes('app_meta'));
add('server media upload module exists', serverMedia.includes('uploadMedia') && serverMedia.includes('MEDIA_STORAGE_DRIVER') && serverMedia.includes('storeS3Media') && serverMedia.includes('AWS4-HMAC-SHA256'));
add('server media deletion module exists', serverMedia.includes('deleteMedia') && serverMedia.includes('deleteUserMedia') && serverMedia.includes('assertUserOwnsMediaKey') && serverMedia.includes('deleteLocalMedia') && serverMedia.includes('deleteS3Media'));
add('server media readiness probe exists', serverMedia.includes('probeMediaStorage') && serverMedia.includes("driver: 'local'") && serverMedia.includes("driver: 's3'") && serverMedia.includes('external_evidence_required'));
add('server local media serving exists', serverMedia.includes('readLocalMedia') && serverRouter.includes('mediaMatch') && serverRouter.includes('/media/uploads') && serverRouter.includes('Cross-Origin-Opener-Policy'));
add('server media deletion route is authenticated', serverRouter.includes("mediaMatch && request.method === 'DELETE'") && serverRouter.includes('deleteMedia({ user, key: mediaMatch[1] })') && serverRouter.includes('requireAuth(db, request)'));
add('server storage recovers from backup', serverStorage.includes('isJsonParseError') && serverStorage.includes('readNormalizedFile(DB_BACKUP_FILE)') && serverStorage.includes('refreshBackup: false'));
add('server request id tracing exists', serverHttp.includes('createRequestContext') && serverHttp.includes('X-Request-ID') && serverHttp.includes('Access-Control-Expose-Headers') && serverHttp.includes('Retry-After') && serverRouter.includes('createRequestContext'));
add('server enforces json content type and delete cors', serverHttp.includes('GET,POST,PUT,DELETE,OPTIONS') && serverHttp.includes('UNSUPPORTED_MEDIA_TYPE') && serverHttp.includes('+json') && serverHttp.includes('application/json') && serverHttp.includes("'Cache-Control': 'no-store'") && serverHttp.includes("Pragma: 'no-cache'") && serverHttp.includes("Vary: 'Origin'") && serverHttp.includes('Referrer-Policy') && serverHttp.includes('Permissions-Policy') && serverHttp.includes('Cross-Origin-Opener-Policy'));
add('server authenticates media upload before parsing body', mediaUploadRouteIndex >= 0 && mediaUploadAuthIndex > mediaUploadRouteIndex && mediaUploadBodyIndex > mediaUploadAuthIndex);
add('server structured access logger exists', serverLogger.includes('logAccess') && serverLogger.includes('api_request') && serverHttp.includes('attachRequestLogger') && serverHttp.includes('durationMs'));
add('server auth account and monitoring routes use rate limit', serverRouter.includes('assertRateLimit') && serverRouter.includes('auth:register') && serverRouter.includes('auth:sign-in') && serverRouter.includes('auth:refresh') && serverRouter.includes('auth:sign-out') && serverRouter.includes('account:delete') && serverRouter.includes('monitoring:events'));
add('server rate limit module exists', serverRateLimit.includes('AUTH_RATE_LIMIT_MAX') && serverRateLimit.includes('AUTH_RATE_LIMIT_WINDOW_MS') && serverRateLimit.includes('TRUST_PROXY') && serverRateLimit.includes('x-forwarded-for') && serverRateLimit.includes('Retry-After') && serverRateLimit.includes('RATE_LIMITED'));
add('server monitoring rate limit config exists', serverConfig.includes('PET_MONITORING_RATE_LIMIT_MAX') && serverConfig.includes('PET_MONITORING_RATE_LIMIT_WINDOW_MS') && serverRouter.includes('MONITORING_RATE_LIMIT_MAX'));
add('server auth issues tokens', serverAuth.includes('accessToken') && serverAuth.includes('refreshToken') && serverAuth.includes('requireAuth'));
add('server auth hashes passwords', serverAuth.includes('scryptSync') && serverAuth.includes('timingSafeEqual') && serverAuth.includes('passwordHash') && !serverAuth.includes('password: password'));
add('server auth hashes tokens with production secret', serverAuth.includes('createHmac') && serverAuth.includes('AUTH_SECRET') && serverAuth.includes('hashToken') && serverAuth.includes('accessTokenHash') && serverAuth.includes('refreshTokenHash') && !serverAuth.includes('accessToken: `pat_') && !serverAuth.includes('refreshToken: `prt_'));
add('server auth compares token hashes safely', serverAuth.includes('tokenHashEqual') && serverAuth.includes('timingSafeEqual') && serverAuth.includes('item.accessTokenHash') && serverAuth.includes('item.refreshTokenHash'));
add('server auth rotates refresh tokens', serverAuth.includes('REFRESH_TOKEN_TTL_MS') && serverAuth.includes('refreshExpiresAt') && serverAuth.includes('nextRefreshToken') && serverAuth.includes('session.refreshTokenHash = hashToken(nextRefreshToken)'));
  add('server auth rejects invalid credentials', serverAuth.includes('INVALID_CREDENTIALS') && serverAuth.includes('ACCOUNT_EXISTS') && serverAuth.includes('密码至少需要 8 位'));
  add('server account lifecycle deletes owned data', serverAuth.includes('exportAccountData') && serverAuth.includes('deleteAccount') && serverAuth.includes('delete db.states[user.id]') && serverAuth.includes('delete db.backups[user.id]') && serverRouter.includes('deleteUserMedia({ user, keys: mediaKeys })') && serverRouter.includes('collectAccountMediaKeys'));
  add('server account export sanitizes legacy state and backups', serverAuth.includes("import { sanitizeState } from './state.js'") && serverAuth.includes('state: db.states[user.id] ? sanitizeState(db.states[user.id]) : null') && serverAuth.includes('state: sanitizeState(backup.state)') && serverTest.includes('legacy_backup_report') && serverTest.includes("JSON.stringify(result.payload).includes('pat_secret')"));
  add('server state backup exists', serverState.includes('createBackup') && serverState.includes('restoreBackup') && serverState.includes('sanitizeState'));
  add('server state sanitizes complaint secrets', serverState.includes('SENSITIVE_REPORT_PATTERN') && serverState.includes('sanitizeReportDetail') && serverState.includes('sanitizeReports(state.reports)') && serverTest.includes('raw-client') && serverTest.includes('storedRawBackup'));
  add('server state deduplicates recent complaints', serverState.includes('REPORT_DUPLICATE_WINDOW_MS') && serverState.includes('isRecentDuplicateReport') && serverState.includes('kept.some(item => isRecentDuplicateReport(item, report))') && serverTest.includes('duplicate_report') && serverTest.includes('result.payload.state.reports.length, 1'));
  add('server state enforces backup retention', serverState.includes('BACKUP_RETENTION_MAX') && serverState.includes('slice(-BACKUP_RETENTION_MAX)'));
add('server state enforces ownership', serverState.includes('assertStateOwnership') && serverState.includes('FORBIDDEN_RESOURCE') && serverState.includes('ownerId !== user.id'));
add('server smoke test exists', serverTest.includes('server api contract smoke') && serverTest.includes('/app-state/backups') && serverTest.includes('/auth/sign-in'));
add('server smoke test verifies production config fail-fast', serverTest.includes('assertProductionConfigValidation') && serverTest.includes('assertProductionServerConfig') && serverTest.includes('PET_CORS_ORIGIN is not wildcard') && serverTest.includes('PET_CORS_ORIGIN is not placeholder') && serverTest.includes('PET_MEDIA_S3_ENDPOINT is not placeholder when s3 media is used') && serverTest.includes('PET_AUTH_SECRET is not placeholder') && serverTest.includes('PET_TRUST_PROXY is boolean') && serverTest.includes('PET_REFRESH_TOKEN_TTL_MS not shorter than access token') && serverTest.includes('PET_BACKUP_RETENTION_MAX within production bounds') && serverTest.includes('PET_SERVER_REQUEST_TIMEOUT_MS within production bounds') && serverTest.includes('PET_SERVER_HEADERS_TIMEOUT_MS not greater than request timeout'));
add('server smoke test verifies sqlite storage driver', serverTest.includes('assertSqliteStorageDriver') && serverTest.includes('PET_STORAGE_DRIVER') && serverTest.includes('PET_SQLITE_FILE') && serverTest.includes("readiness.driver, 'sqlite'"));
add('server smoke test verifies media upload', serverTest.includes('/media/uploads') && serverTest.includes("storageDriver, 'local'") && serverTest.includes('result.payload.url.startsWith'));
add('server smoke test verifies media deletion', serverTest.includes('uploadedMediaUrl') && serverTest.includes('otherMediaToken') && serverTest.includes('MEDIA_FORBIDDEN') && serverTest.includes("method: 'DELETE'") && serverTest.includes("result.payload.code, 'MEDIA_NOT_FOUND'") && serverTest.includes('result.payload.deleted, false'));
add('server smoke test verifies media readiness', serverTest.includes('assertMediaStorageReadinessProbe') && serverTest.includes('probeMediaStorage') && serverTest.includes('checks.media.writable') && serverTest.includes('external_evidence_required'));
add('server smoke test verifies storage recovery', serverTest.includes("writeFile(dbFile, '{broken-json'") && serverTest.includes('readDb()') && serverTest.includes('backupSnapshot'));
add('server smoke test verifies request id tracing', serverTest.includes('req_test_trace_001') && serverTest.includes('payload.requestId, result.requestId') && serverTest.includes('PET_SERVER_LOG_LEVEL'));
add('server smoke test verifies http timeouts', serverTest.includes('server.requestTimeout, 30000') && serverTest.includes('server.headersTimeout, 15000') && serverTest.includes('server.keepAliveTimeout, 5000'));
add('server smoke test verifies json content type cors and security headers', serverTest.includes('access-control-allow-methods') && serverTest.includes('access-control-expose-headers') && serverTest.includes('UNSUPPORTED_MEDIA_TYPE') && serverTest.includes('text/plain') && serverTest.includes('assertJsonNoStore') && serverTest.includes('cross-origin-opener-policy') && serverTest.includes('unauthInvalidMedia'));
add('server smoke test verifies graceful shutdown', serverTest.includes('assertGracefulShutdownLifecycle') && serverTest.includes("processLike.emit('SIGTERM')") && serverTest.includes('closeCalls, 1'));
add('server smoke test verifies readiness', serverTest.includes('/ready') && serverTest.includes('checks.storage.writable') && serverTest.includes('checks.media.writable') && serverTest.includes("status, 'ready'"));
add('server smoke test rejects forbidden resources', serverTest.includes('forbiddenState') && serverTest.includes('FORBIDDEN_RESOURCE') && serverTest.includes('403'));
add('server smoke test verifies password auth', serverTest.includes('/auth/register') && serverTest.includes('INVALID_CREDENTIALS') && serverTest.includes('passwordHash') && serverTest.includes('DemoPass123'));
add('server smoke test verifies token hashes', serverTest.includes('accessTokenHash') && serverTest.includes('refreshTokenHash') && serverTest.includes('accessToken, undefined') && serverTest.includes('refreshToken, undefined'));
add('server smoke test verifies refresh token rotation', serverTest.includes('rotatedRefreshToken') && serverTest.includes('assert.notEqual(result.payload.refreshToken, refreshToken)') && serverTest.includes('refreshExpiresAt') && serverTest.includes('expiredRefreshToken'));
add('server smoke test verifies sign-out invalidates access token', serverTest.includes('rotatedAccessToken') && serverTest.includes('/auth/sign-out') && serverTest.includes('/app-state') && serverTest.includes("result.payload.code, 'UNAUTHORIZED'"));
add('server smoke test verifies auth account and monitoring rate limit', serverTest.includes('PET_AUTH_RATE_LIMIT_MAX') && serverTest.includes('PET_TRUST_PROXY') && serverTest.includes('assertRateLimitTrustProxyBoundary') && serverTest.includes('retry-after') && serverTest.includes('PET_MONITORING_RATE_LIMIT_MAX') && serverTest.includes('/monitoring/events') && serverTest.includes('/account') && serverTest.includes('x-forwarded-for') && serverTest.includes('RATE_LIMITED') && serverTest.includes('429'));
add('server smoke test verifies account lifecycle', serverTest.includes('/account/export') && serverTest.includes("'/account'") && serverTest.includes('delete-me@example.com') && serverTest.includes('passwordHash, undefined') && serverTest.includes('deleteMediaUrl') && serverTest.includes('result.payload.media.deletedFiles >= 1'));
add('server smoke test verifies backup retention', serverTest.includes('retention-0') && serverTest.includes('retention-20') && serverTest.includes('result.payload.length, 20'));

const failed = checks.filter(check => !check.pass);
for (const check of checks) {
  console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` :: ${check.detail}` : ''}`);
}

if (failed.length) {
  console.error(`\n${failed.length} check(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} checks passed.`);




