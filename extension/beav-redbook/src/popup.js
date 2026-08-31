const serverStatusEl = document.getElementById('server-status');
const pageMetaEl = document.getElementById('page-meta');
const resultEl = document.getElementById('result');
const actionHintEl = document.getElementById('action-hint');
const updatePanelEl = document.getElementById('update-panel');
const updateStatusEl = document.getElementById('update-status');
const updateMetaEl = document.getElementById('update-meta');
const platformSafetyNoticeDialog = document.getElementById('platform-safety-notice-dialog');
const platformSafetyNoticeTitle = document.getElementById('platform-safety-notice-title');
const platformSafetyNoticeDescription = document.getElementById('platform-safety-notice-description');
const platformSafetyNoticeConfirm = document.getElementById('platform-safety-notice-confirm');
const REDBOOK_FORMAL_MODE = true;

const buttons = {
  checkUpdate: document.getElementById('check-update'),
  openUpdateSource: document.getElementById('open-update-source'),
  openWorkbench: document.getElementById('open-workbench'),
  openSettings: document.getElementById('open-settings'),
  primary: document.getElementById('save-primary'),
};

let activeTab = null;
const actionSupport = { primary: false };
let primaryActionType = 'save-page-link';
let captureTypeEl = null;
let refreshTimer = null;
let connectionRefreshTimer = null;
let popupOpenedAt = Date.now();
let primaryBusy = false;
let resolvePlatformSafetyNoticeDialog = null;
let desktopConnection = {
  state: 'checking',
  ingestAllowed: false,
  context: null,
};

init().catch((error) => {
  showResult(error instanceof Error ? error.message : String(error), 'error');
});

async function init() {
  bindPlatformSafetyNoticeDialog();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab || null;

  const url = String(activeTab?.url || '');
  const host = safeHost(url);
  const title = String(activeTab?.title || '').trim();

  pageMetaEl.textContent = host
    ? `${title || '未命名页面'}\n${host}`
    : '未检测到可操作页面';

  await refreshConnectionStatus();

  ensureCaptureTypeElement();
  if (!REDBOOK_FORMAL_MODE) await refreshUpdateStatus(false);
  await refreshPageInfo();
  startRefreshLoop();
  startConnectionRefreshLoop();

  buttons.primary.addEventListener('click', () => runAction(primaryActionType));
  buttons.openWorkbench.addEventListener('click', () => void openWorkbench());
  buttons.openSettings.addEventListener('click', () => chrome.runtime.openOptionsPage());
  buttons.checkUpdate.addEventListener('click', () => void runUpdateCheck());
  buttons.openUpdateSource.addEventListener('click', () => void openUpdateSource());
  window.addEventListener('unload', () => {
    stopRefreshLoop();
    stopConnectionRefreshLoop();
  }, { once: true });
}

function inferPageInfoFromUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || ''));
  } catch {
    return null;
  }

  const hostname = String(parsed.hostname || '').toLowerCase();
  const pathname = String(parsed.pathname || '');

  if (hostname === 'mp.weixin.qq.com') {
    return {
      kind: 'wechat-article',
      action: 'save-page-link',
      label: '保存公众号文章到工作台',
      description: '当前页面已识别为公众号文章，将完整保存正文、图片和排版。',
      primaryEnabled: true,
      detected: true,
    };
  }

  if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com') || hostname === 'youtu.be') {
    const isVideoPage = pathname.startsWith('/watch') || pathname.startsWith('/shorts/') || hostname === 'youtu.be';
    if (isVideoPage) {
      return {
        kind: 'youtube',
        action: 'save-youtube',
        label: '保存YouTube视频到工作台',
        description: '当前页面已识别为 YouTube 视频页。',
        primaryEnabled: true,
        detected: true,
      };
    }

    return createLinkFallbackPageInfo({
      kind: 'youtube-generic',
      description: '当前页面还没有稳定识别到有效的视频内容。',
    });
  }

  if (/(^|\.)xiaohongshu\.com$/i.test(hostname)) {
    return createLinkFallbackPageInfo({
      kind: 'xhs-pending',
      description: '当前页面还没有稳定识别到有效的小红书笔记内容。',
    });
  }

  if (/(^|\.)douyin\.com$/i.test(hostname)) {
    return createLinkFallbackPageInfo({
      kind: 'douyin-pending',
      description: '当前页面还没有稳定识别到有效的抖音视频内容。',
    });
  }

  return createLinkFallbackPageInfo();
}

async function runAction(type) {
  if (!activeTab?.id) {
    showResult('没有可用的当前标签页', 'error');
    return;
  }
  await refreshConnectionStatus(true);
  if (!desktopConnection.ingestAllowed) return;
  setBusy(true);
  showResult(isXhsSaveAction(type) ? '请先确认账号安全提示…' : '正在保存...', 'success');
  try {
    if (isXhsSaveAction(type)) {
      const confirmed = await ensurePlatformSaveSafetyNotice(type);
      if (!confirmed) {
        showResult('已取消保存', 'waiting');
        return;
      }
    }
    const result = await sendMessage({ type, tabId: activeTab.id });
    if (!result?.success) {
      throw new Error(result?.error || '保存失败');
    }
    const detail = result.duplicate
      ? (result.updated ? '工作台中已存在，已更新已有内容。' : '工作台中已存在，已跳过重复保存。')
      : `保存成功${result.noteId ? `：${result.noteId}` : ''}`;
    showResult(detail, 'success');
  } catch (error) {
    showResult(error instanceof Error ? error.message : String(error), 'error');
  } finally {
    setBusy(false);
  }
}

function isXhsSaveAction(type) {
  return String(type || '') === 'save-xhs';
}

// Derived from Beav Plugin/src/sidepanel.js showPlatformSaveSafetyNotice and
// ensurePlatformSaveSafetyNotice. Redbook adaptation only changes the DOM
// bindings and reuses the existing background acknowledgement messages.
function bindPlatformSafetyNoticeDialog() {
  platformSafetyNoticeDialog?.addEventListener('close', () => {
    const resolve = resolvePlatformSafetyNoticeDialog;
    resolvePlatformSafetyNoticeDialog = null;
    resolve?.(platformSafetyNoticeDialog.returnValue === 'confirm');
  });
}

function showPlatformSaveSafetyNotice(notice) {
  const title = String(notice?.title || '请先确认已登录小号');
  const description = String(notice?.description || '频繁保存内容可能触发平台风控，影响账号正常使用。请先在当前浏览器登录专门用于采集的小号，再继续保存。');
  const confirmLabel = String(notice?.confirmLabel || '我已登录小号，继续保存');
  if (!platformSafetyNoticeDialog?.showModal) {
    return Promise.resolve(window.confirm(`${title}\n\n${description}\n\n点击“确定”表示：${confirmLabel}`));
  }
  platformSafetyNoticeTitle.textContent = title;
  platformSafetyNoticeDescription.textContent = description;
  platformSafetyNoticeConfirm.textContent = confirmLabel;
  return new Promise((resolve) => {
    resolvePlatformSafetyNoticeDialog = resolve;
    platformSafetyNoticeDialog.showModal();
  });
}

async function ensurePlatformSaveSafetyNotice(action) {
  const requirement = await sendMessage({
    type: 'capture:platform-save-safety-notice:get',
    action,
    tabId: activeTab?.id || 0,
  });
  if (!requirement?.success) {
    throw new Error(requirement?.error || '无法读取账号安全提示');
  }
  if (!requirement.required) return true;
  if (!await showPlatformSaveSafetyNotice(requirement.notice)) return false;
  const acknowledgement = await sendMessage({
    type: 'capture:platform-save-safety-notice:acknowledge',
    platform: requirement.platform,
  });
  if (!acknowledgement?.success) {
    throw new Error(acknowledgement?.error || '无法确认账号安全提示');
  }
  return true;
}

async function runUpdateCheck() {
  if (REDBOOK_FORMAL_MODE) return;
  setUpdateButtonsBusy(true);
  updateStatusEl.textContent = '正在检查插件更新...';
  updateStatusEl.className = 'status';
  try {
    await refreshUpdateStatus(true);
  } finally {
    setUpdateButtonsBusy(false);
  }
}

async function openUpdateSource() {
  buttons.openUpdateSource.disabled = true;
  try {
    await sendMessage({ type: 'plugin-update:open-source' });
  } finally {
    buttons.openUpdateSource.disabled = false;
  }
}

async function openWorkbench() {
  buttons.openWorkbench.disabled = true;
  try {
    const response = await sendMessage({ type: 'sidepanel:open' });
    if (!response?.success) {
      throw new Error(response?.error || '无法打开 Redbook 工作台');
    }
    window.close();
  } catch (error) {
    showResult(error instanceof Error ? error.message : String(error), 'error');
  } finally {
    buttons.openWorkbench.disabled = false;
  }
}

function setUpdateButtonsBusy(busy) {
  buttons.checkUpdate.disabled = busy;
  buttons.openUpdateSource.disabled = busy;
}

function setBusy(busy) {
  primaryBusy = busy;
  applyPrimaryButtonState();
}

function applyButtonState(button, enabled) {
  button.disabled = !enabled;
}

function applyPrimaryButtonState() {
  applyButtonState(
    buttons.primary,
    !primaryBusy && actionSupport.primary && desktopConnection.ingestAllowed,
  );
}

function ensureCaptureTypeElement() {
  if (captureTypeEl) return;
  captureTypeEl = document.createElement('div');
  captureTypeEl.className = 'capture-type';
  pageMetaEl.insertAdjacentElement('afterend', captureTypeEl);
}

async function refreshUpdateStatus(forceRefresh) {
  const response = await sendMessage({
    type: forceRefresh ? 'plugin-update:check' : 'plugin-update:get-status',
    refresh: forceRefresh,
  }).catch(() => null);

  const update = normalizeUpdateState(response?.update);
  if (!update.hasUpdate) {
    updatePanelEl?.classList.add('hidden');
    updateMetaEl.classList.add('hidden');
    updateMetaEl.textContent = '';
    return;
  }

  updatePanelEl?.classList.remove('hidden');
  updateStatusEl.textContent = `发现新版本 ${update.latestVersion}，当前版本 ${update.currentVersion}`;
  updateStatusEl.className = 'status error';

  const lines = [
    `当前版本：${update.currentVersion}`,
    `更新源版本：${update.latestVersion}`,
  ];
  if (update.lastCheckedAt) {
    lines.push(`最近检查：${formatDateTime(update.lastCheckedAt)}`);
  }
  lines.push('更新方式：打开更新页下载安装包，重新加载扩展。');

  updateMetaEl.textContent = lines.join('\n');
  updateMetaEl.classList.remove('hidden');
}

async function refreshPageInfo() {
  const url = String(activeTab?.url || '');
  const inspect = await sendMessage({ type: 'inspect-page', tabId: activeTab?.id || 0 }).catch(() => null);
  const pageInfo = normalizePageInfo(inspect?.pageInfo || inferPageInfoFromUrl(url));

  primaryActionType = pageInfo.action || 'save-page-link';
  actionSupport.primary = Boolean(activeTab?.id) && pageInfo.primaryEnabled !== false;

  buttons.primary.textContent = pageInfo.label || '保存到工作台';
  buttons.primary.classList.toggle('btn-primary', Boolean(pageInfo.detected));
  buttons.primary.classList.toggle('btn-secondary', !pageInfo.detected);

  if (actionHintEl) {
    actionHintEl.textContent = pageInfo.detected ? '' : (pageInfo.statusText || '未检测到内容');
    actionHintEl.classList.toggle('hidden', Boolean(pageInfo.detected));
  }

  captureTypeEl.textContent = pageInfo.description || '';
  applyPrimaryButtonState();
}

function startRefreshLoop() {
  stopRefreshLoop();
  popupOpenedAt = Date.now();

  const tick = async () => {
    await refreshPageInfo().catch(() => {});
    const elapsed = Date.now() - popupOpenedAt;
    const delay = elapsed < 2500 ? 120 : 450;
    refreshTimer = window.setTimeout(tick, delay);
  };

  refreshTimer = window.setTimeout(tick, 120);
}

function startConnectionRefreshLoop() {
  stopConnectionRefreshLoop();
  const tick = async () => {
    await refreshConnectionStatus().catch(() => {});
    connectionRefreshTimer = window.setTimeout(tick, 2_000);
  };
  connectionRefreshTimer = window.setTimeout(tick, 2_000);
}

function stopRefreshLoop() {
  if (!refreshTimer) return;
  window.clearTimeout(refreshTimer);
  refreshTimer = null;
}

function stopConnectionRefreshLoop() {
  if (!connectionRefreshTimer) return;
  window.clearTimeout(connectionRefreshTimer);
  connectionRefreshTimer = null;
}

async function refreshConnectionStatus(forceRefresh = false) {
  const health = await sendMessage({ type: 'healthcheck', forceRefresh }).catch((error) => ({
    success: false,
    error: error instanceof Error ? error.message : String(error),
  }));
  desktopConnection = normalizeDesktopConnection(health);
  renderDesktopConnection();
  applyPrimaryButtonState();
  return desktopConnection;
}

function normalizeDesktopConnection(health) {
  if (health?.success) {
    const context = health.context && typeof health.context === 'object' ? health.context : null;
    if (context?.supported !== false && context?.ingest?.allowed !== true) {
      return { state: 'initializing', ingestAllowed: false, context };
    }
    return { state: 'ready', ingestAllowed: true, context };
  }

  const code = normalizeText(health?.code).toUpperCase();
  const availability = normalizeText(health?.details?.availability).toLowerCase();
  const phase = normalizeText(health?.phase).toLowerCase();
  if (
    code === 'APP_STARTING'
    || code === 'APP_SHUTTING_DOWN'
    || availability === 'app_starting'
    || availability === 'app_shutting_down'
    || phase === 'bridge_reconnect'
  ) {
    return { state: 'recovering', ingestAllowed: false, context: null };
  }
  if (/UPGRADE|PROTOCOL_MISMATCH|AUTHENTICATION_FAILED|VERSION_STALE/.test(code)) {
    return { state: 'attention', ingestAllowed: false, context: null };
  }
  return { state: 'offline', ingestAllowed: false, context: null };
}

function renderDesktopConnection() {
  const spaceName = normalizeText(desktopConnection.context?.space?.name);
  if (desktopConnection.state === 'ready') {
    serverStatusEl.textContent = desktopConnection.context?.supported === false
      ? '已连接 · 可保存到工作台'
      : (spaceName ? `已连接 · 当前空间：${spaceName}` : '已连接 · 当前空间已准备就绪');
    serverStatusEl.className = 'status ok';
    return;
  }
  if (desktopConnection.state === 'initializing') {
    serverStatusEl.textContent = spaceName
      ? `已连接 · 正在初始化「${spaceName}」`
      : '已连接 · 正在初始化当前空间';
    serverStatusEl.className = 'status waiting';
    return;
  }
  if (desktopConnection.state === 'recovering') {
    serverStatusEl.textContent = '小红书采集助手正在恢复连接，请稍候…';
    serverStatusEl.className = 'status';
    return;
  }
  if (desktopConnection.state === 'attention') {
    serverStatusEl.textContent = '连接需要处理，请重新加载小红书采集助手';
    serverStatusEl.className = 'status error';
    return;
  }
  serverStatusEl.textContent = '小红书 AI 运营工作台未启动';
  serverStatusEl.className = 'status error';
}

function normalizePageInfo(pageInfo) {
  if (!pageInfo || typeof pageInfo !== 'object') {
    return createLinkFallbackPageInfo();
  }

  return {
    kind: pageInfo.kind || 'generic',
    action: pageInfo.action || 'save-page-link',
    label: pageInfo.label || '仅保存链接到工作台',
    description: pageInfo.description || '当前页面可作为链接收藏保存到工作台。',
    primaryEnabled: pageInfo.primaryEnabled !== false,
    detected: Boolean(pageInfo.detected),
    statusText: pageInfo.statusText || '未检测到内容',
  };
}

function createLinkFallbackPageInfo(overrides = {}) {
  return {
    kind: 'generic',
    action: 'save-page-link',
    label: '仅保存链接到工作台',
    description: '当前页面可作为链接收藏保存到工作台。',
    primaryEnabled: true,
    detected: false,
    statusText: '未检测到内容',
    ...overrides,
  };
}

function normalizeUpdateState(value) {
  const currentVersion = normalizeText(chrome.runtime.getManifest()?.version) || '0.0.0';
  if (!value || typeof value !== 'object') {
    return {
      currentVersion,
      latestVersion: currentVersion,
      hasUpdate: false,
      lastCheckedAt: null,
      sourceUrl: '',
      lastError: '',
      checkStatus: 'idle',
    };
  }
  const latestVersion = normalizeText(value.latestVersion) || currentVersion;
  return {
    currentVersion: normalizeText(value.currentVersion) || currentVersion,
    latestVersion,
    hasUpdate: Boolean(value.hasUpdate),
    lastCheckedAt: normalizeText(value.lastCheckedAt) || null,
    sourceUrl: normalizeText(value.sourceUrl),
    lastError: normalizeText(value.lastError),
    checkStatus: normalizeText(value.checkStatus) || 'idle',
  };
}

function normalizeText(value) {
  return String(value || '').trim();
}

function formatDateTime(value) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) {
    return '未知';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function showResult(message, type) {
  resultEl.className = `panel result ${type}`;
  resultEl.textContent = message;
}

function sendMessage(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function safeHost(rawUrl) {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return '';
  }
}
