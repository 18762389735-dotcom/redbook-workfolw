const { join } = require('node:path');
const { isUsableWindow, safeWindowUrl, safeDestroyWindow } = require('./xhs-session.cjs');
const { executePageFunction, sanitizeDiagnosticText } = require('./page-execution.cjs');
const { normalizeOverlayClick } = require('./redbook-xhs-overlay-policy.cjs');

const now = () => new Date().toISOString();
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const safeEvidenceValue = (value) => sanitizeDiagnosticText(value == null || value === '' ? 'none' : value).replace(/[\r\n]+/g, ' ').slice(0, 120);
const profileEvidenceSummary = (evidence) => {
  const firstLink = evidence?.observedProfileLinks?.[0];
  return [
    `pathname=${safeEvidenceValue(String(evidence?.pathname || '/').split(/[?#]/)[0])}`,
    `profilePathId=${safeEvidenceValue(evidence?.profilePathId)}`,
    `stateBranch=${safeEvidenceValue(evidence?.stateIdentity?.branch)}`,
    `stateUserId=${safeEvidenceValue(evidence?.stateIdentity?.userId)}`,
    `publicHandle=${safeEvidenceValue(evidence?.publicHandle)}`,
    `profileLinks=${Number(evidence?.observedProfileLinks?.length) || 0}`,
    `profileLinkId=${safeEvidenceValue(firstLink?.profileId)}`,
    `profileMetrics=${evidence?.evidence?.hasProfileMetrics === true ? 'present' : 'absent'}`,
  ].join(', ');
};
const isProfileRecognitionFailure = (error) => error?.stage === 'page-function' && /当前页面未识别到可验证的博主公开资料/.test(error.message || '');

// Executed in XHS Main World only. It reads the three known public state
// branches and a scalar identity/display field; it never serializes the state.
function inspectClickedXhsProfileState(expectedProfileId) {
  const expected = String(expectedProfileId || '').trim();
  const unwrap = (value) => value?._rawValue && typeof value._rawValue === 'object' ? value._rawValue : value?.value && typeof value.value === 'object' ? value.value : value;
  const readState = () => {
    if (window.__INITIAL_STATE__ && typeof window.__INITIAL_STATE__ === 'object') return window.__INITIAL_STATE__;
    for (const script of document.scripts || []) {
      const text = script.textContent || '';
      if (!text.includes('window.__INITIAL_STATE__=')) continue;
      try { return JSON.parse(text.replace('window.__INITIAL_STATE__=', '').replace(/undefined/g, 'null').replace(/;$/, '')); } catch { return null; }
    }
    return null;
  };
  const state = readState();
  const branches = [
    ['user.userPageData', state?.user?.userPageData],
    ['user.profile', state?.user?.profile],
    ['user.userInfo', state?.user?.userInfo],
  ];
  for (const [branch, value] of branches) {
    const raw = unwrap(value);
    if (!raw || typeof raw !== 'object') continue;
    const basic = raw.basic_info || raw.basicInfo || raw;
    const userId = String(raw.userId || raw.user_id || raw.id || basic.userId || basic.user_id || '').trim();
    if (!userId || userId !== expected) continue;
    return { confirmed: true, stateBranch: branch, stateUserId: userId, nickname: String(raw.nickname || raw.nickName || basic.nickname || basic.nickName || '').trim() || null };
  }
  return { confirmed: false };
}

class ElectronCollector {
  constructor({ xhsSession, serverUrl, runtimeRoot, onTaskChanged } = {}) {
    this.xhsSession = xhsSession;
    this.serverUrl = serverUrl;
    this.tasksPromise = import('../core/tasks/collector-task-store.mjs').then(({ CollectorTaskStore }) => new CollectorTaskStore(join(runtimeRoot, 'collector-tasks.json')));
    this.onTaskChanged = onTaskChanged || (() => {});
    this.modulesPromise = Promise.all([
      import('../providers/xiaohongshu/normalize.mjs'),
      import('../providers/xiaohongshu/normalize-creator.mjs'),
      import('../providers/xiaohongshu/collector-payload.mjs'),
      import('../vendor/beav/xhs-collector/beavExtractors.js'),
      import('../vendor/beav/plugin-xhs/background-xhs-derived.js'),
      import('../vendor/beav/plugin-xhs/redbook-payload-adapter.js'),
    ]).then(([signal, creator, payload, extractors, beavRuntime, beavAdapter]) => ({ signal, creator, payload, extractors, beavRuntime, beavAdapter }));
  }

  async emit(task) { if (task) this.onTaskChanged(task); return task; }
  async taskStore() { return this.tasksPromise; }

  async createTask(method, total = 0) { return this.emit(await (await this.taskStore()).create(method, total)); }

  async updateTask(id, patch) { return this.emit(await (await this.taskStore()).update(id, patch)); }

  async post(path, body) {
    const response = await fetch(new URL(path, this.serverUrl), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `本地 API 返回 ${response.status}`);
    return payload;
  }

  async page(window, functionValue, args = [], label = 'page') {
    if (!isUsableWindow(window)) throw new Error('请先打开小红书会话');
    const contents = window.webContents;
    if (contents.isDestroyed()) throw new Error('小红书会话已关闭');
    return executePageFunction(contents, functionValue, args, label);
  }

  async collectVisible() {
    const window = this.xhsSession.getWindow();
    if (!window) throw new Error('请先点击“打开小红书”');
    const url = safeWindowUrl(window);
    if (!url) throw new Error('小红书会话已关闭');
    if (!/^https:\/\/(www\.)?(xiaohongshu\.com|rednote\.com)\//i.test(url)) throw new Error('当前小红书会话不是可采集的公开页面');
    const [{ payload, extractors, signal }] = [await this.modulesPromise];
    const task = await this.createTask('visible-notes', 0);
    try {
      await this.updateTask(task.id, { status: 'running', startedAt: now() });
      const responses = await this.page(window, () => window.__REDBOX_XHS_RESPONSES__ || [], [], 'visible-responses');
      const context = await this.page(window, extractors.extractVisibleContext, [], 'visible-context');
      const links = new Map((context.links || []).map((item) => [String(item.noteId), item.url]));
      const currentId = new URL(context.pageUrl || url).pathname.match(/\/(?:explore|discovery\/item)\/([^/?#]+)/)?.[1];
      const observedKeyword = /^\/search_result\/?$/i.test(new URL(url).pathname) ? new URL(url).searchParams.get('keyword') : null;
      const capturedAt = now();
      const cards = payload.extractCandidateCards(responses);
      const rawSignals = cards.map((raw) => {
        const noteId = String(raw.note_id || raw.noteId || raw.id || '');
        const observedUrl = links.get(noteId) || (noteId === currentId ? context.pageUrl || url : null);
        return payload.buildVisibleSignalPayload(raw, { url: observedUrl, keyword: context.keyword || observedKeyword || null, taskId: task.id, capturedAt });
      });
      if (!rawSignals.length) throw new Error('当前页面尚未观察到可采集的公开笔记。请刷新页面后再试。');
      const normalized = rawSignals.map((raw) => signal.normalizeXiaohongshuSignal(raw, raw.source));
      const result = await this.post('/api/signals/ingest', { signals: normalized });
      await this.updateTask(task.id, { status: 'completed', completedAt: now(), progress: { current: normalized.length, total: normalized.length }, result });
      return { task: await (await this.taskStore()).get(task.id), result };
    } catch (error) {
      const failed = await this.updateTask(task.id, { status: 'failed', completedAt: now(), error: error.message || String(error) });
      throw Object.assign(new Error(error.message || String(error)), { task: failed });
    }
  }

  async collectCreator() {
    const window = this.xhsSession.getWindow();
    if (!window) throw new Error('请先点击“打开小红书”');
    const profileUrl = safeWindowUrl(window);
    if (!profileUrl || !/^https:\/\/(www\.)?(xiaohongshu\.com|rednote\.com)\//i.test(profileUrl)) throw new Error('请在小红书会话中打开博主主页');
    const [{ creator, extractors, payload }] = [await this.modulesPromise];
    const task = await this.createTask('creator-profile', 1);
    try {
      await this.updateTask(task.id, { status: 'running', startedAt: now() });
      let raw;
      try {
        raw = await this.page(window, extractors.extractXhsBloggerPayload, [], 'creator-profile');
      } catch (error) {
        if (!isProfileRecognitionFailure(error)) throw error;
        let evidence;
        try {
          evidence = await this.page(window, extractors.inspectXhsPublicProfileEvidence, [], 'creator-evidence');
        } catch { throw error; }
        const diagnostic = new Error(`${error.message}\nProfile evidence: ${profileEvidenceSummary(evidence)}`);
        diagnostic.stage = error.stage;
        throw diagnostic;
      }
      const source = { provider: 'beav-derived-electron-session', method: 'creator-profile', taskId: task.id, capturedAt: now() };
      const canonicalProfileUrl = raw.profileUrl || profileUrl;
      const normalized = creator.normalizeXiaohongshuCreator(payload.buildCreatorSignalPayload(raw, { profileUrl: canonicalProfileUrl, taskId: task.id, capturedAt: source.capturedAt }), source);
      const result = await this.post('/api/creators/ingest', { creators: [normalized] });
      await this.updateTask(task.id, { status: 'completed', completedAt: now(), progress: { current: 1, total: 1 }, result, creator: normalized });
      return { task: await (await this.taskStore()).get(task.id), result, creator: normalized };
    } catch (error) {
      const failed = await this.updateTask(task.id, { status: 'failed', completedAt: now(), error: error.message || String(error) });
      throw Object.assign(new Error(error.message || String(error)), { task: failed });
    }
  }

  async collectBeavCurrentNote() {
    const window = this.xhsSession.getWindow();
    const pageUrl = safeWindowUrl(window);
    if (!pageUrl || !/^https:\/\/(www\.)?(xiaohongshu\.com|rednote\.com)\//i.test(pageUrl)) throw new Error('请在小红书会话中打开公开笔记');
    const [{ signal, beavRuntime, beavAdapter }] = [await this.modulesPromise];
    const task = await this.createTask('visible-notes', 1);
    try {
      await this.updateTask(task.id, { status: 'running', startedAt: now() });
      const raw = await this.page(window, beavRuntime.extractXhsNotePayload, [], 'beav-current-note');
      const source = { provider: 'beav-derived-electron-session', method: 'visible-notes', taskId: task.id, capturedAt: now() };
      const input = beavAdapter.beavNotePayloadToSignalInput(raw, source);
      const normalized = signal.normalizeXiaohongshuSignal(input, source);
      const result = await this.post('/api/signals/ingest', { signals: [normalized] });
      await this.updateTask(task.id, { status: 'completed', completedAt: now(), progress: { current: 1, total: 1 }, result });
      return { task: await (await this.taskStore()).get(task.id), result };
    } catch (error) {
      const failed = await this.updateTask(task.id, { status: 'failed', completedAt: now(), error: error.message || String(error) });
      throw Object.assign(new Error(error.message || String(error)), { task: failed });
    }
  }

  async collectBeavCurrentCreator() {
    const window = this.xhsSession.getWindow();
    const pageUrl = safeWindowUrl(window);
    if (!pageUrl || !/^https:\/\/(www\.)?(xiaohongshu\.com|rednote\.com)\//i.test(pageUrl)) throw new Error('请在小红书会话中打开博主主页');
    const [{ creator, beavRuntime, beavAdapter }] = [await this.modulesPromise];
    const task = await this.createTask('creator-profile', 1);
    try {
      await this.updateTask(task.id, { status: 'running', startedAt: now() });
      const raw = await this.page(window, beavRuntime.extractXhsBloggerPayload, [], 'beav-current-creator');
      const source = { provider: 'beav-derived-electron-session', method: 'creator-profile', taskId: task.id, capturedAt: now() };
      const input = beavAdapter.beavCreatorPayloadToCreatorInput(raw, source);
      const normalized = creator.normalizeXiaohongshuCreator(input, source);
      const result = await this.post('/api/creators/ingest', { creators: [normalized] });
      await this.updateTask(task.id, { status: 'completed', completedAt: now(), progress: { current: 1, total: 1 }, result, creator: normalized });
      return { task: await (await this.taskStore()).get(task.id), result, creator: normalized };
    } catch (error) {
      const failed = await this.updateTask(task.id, { status: 'failed', completedAt: now(), error: error.message || String(error) });
      throw Object.assign(new Error(error.message || String(error)), { task: failed });
    }
  }

  async confirmBeavOverlayProfile(payload = {}) {
    const window = this.xhsSession.getWindow();
    const pageUrl = safeWindowUrl(window);
    const click = normalizeOverlayClick(payload);
    if (!window || !pageUrl || !click) return { confirmed: false, reason: 'profile-click-context-expired' };
    const { profileId, pathname } = click;
    if (!/^\/search_result(?:_ai)?\/?$/i.test(new URL(pageUrl).pathname)) return { confirmed: false, reason: 'not-search-profile-overlay' };
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const evidence = await this.page(window, inspectClickedXhsProfileState, [profileId], 'beav-overlay-profile-state');
      if (evidence?.confirmed === true) return { confirmed: true, profileId, pathname, nickname: evidence.nickname || null, confirmedAt: now() };
      if (attempt < 9) await sleep(100);
    }
    return { confirmed: false, reason: 'clicked-profile-id-state-mismatch' };
  }

  async collectBeavConfirmedCreator(profileId) {
    const window = this.xhsSession.getWindow();
    const pageUrl = safeWindowUrl(window);
    const expected = String(profileId || '').trim();
    if (!pageUrl || !/^[A-Za-z0-9_-]+$/.test(expected)) throw new Error('已确认的博主上下文无效');
    if (!/^\/search_result(?:_ai)?\/?$/i.test(new URL(pageUrl).pathname)) throw new Error('博主资料层已离开搜索页面，请重新点击博主');
    const [{ creator, beavRuntime, beavAdapter }] = [await this.modulesPromise];
    const task = await this.createTask('creator-profile', 1);
    try {
      await this.updateTask(task.id, { status: 'running', startedAt: now() });
      const raw = await this.page(window, beavRuntime.extractXhsBloggerPayload, [expected], 'beav-confirmed-creator');
      const source = { provider: 'beav-derived-electron-session', method: 'creator-profile', taskId: task.id, capturedAt: now() };
      const input = beavAdapter.beavCreatorPayloadToCreatorInput(raw, source);
      if (input.userId !== expected) throw new Error('Beav creator payload identity mismatch');
      const normalized = creator.normalizeXiaohongshuCreator(input, source);
      const result = await this.post('/api/creators/ingest', { creators: [normalized] });
      await this.updateTask(task.id, { status: 'completed', completedAt: now(), progress: { current: 1, total: 1 }, result, creator: normalized });
      return { task: await (await this.taskStore()).get(task.id), result, creator: normalized };
    } catch (error) {
      const failed = await this.updateTask(task.id, { status: 'failed', completedAt: now(), error: error.message || String(error) });
      throw Object.assign(new Error(error.message || String(error)), { task: failed });
    }
  }

  async collectCreatorBaseline(limitInput = 12) {
    const window = this.xhsSession.getWindow();
    if (!window) throw new Error('请先点击“打开小红书”');
    const profileUrl = safeWindowUrl(window);
    if (!profileUrl || !/^https:\/\/(www\.)?(xiaohongshu\.com|rednote\.com)\//i.test(profileUrl)) throw new Error('请在小红书会话中打开博主主页');
    const limit = Math.min(20, Math.max(1, Math.round(Number(limitInput) || 12)));
    const [{ extractors, payload, signal }] = [await this.modulesPromise];
    const task = await this.createTask('creator-baseline', limit);
    this.runBaseline(task, window, profileUrl, limit, extractors, payload, signal).catch(() => {});
    return { task };
  }

  async runBaseline(task, window, profileUrl, limit, extractors, payload, signal) {
    let notes = [];
    try {
      await this.updateTask(task.id, { status: 'running', startedAt: now() });
      const profile = await this.page(window, extractors.extractXhsBloggerNotesPayload, [limit, 'auto'], 'creator-notes');
      notes = (profile?.notes || []).slice(0, limit);
      await this.updateTask(task.id, { progress: { total: notes.length }, profile: { userId: profile?.userId || null, nickname: profile?.nickname || null, source: profile?.source || profileUrl || null, collectionMode: profile?.collectionMode || null, apiError: profile?.apiError || null } });
      if (!notes.length) throw new Error(profile?.apiError || '未从博主页取得近期公开笔记');
      for (let index = 0; index < notes.length; index += 1) {
        const current = await (await this.taskStore()).get(task.id);
        if (current?.status === 'cancelled') return;
        const note = notes[index];
        try {
          const detailWindow = await this.xhsSession.createHidden(note.url);
          try {
            const detail = await this.page(detailWindow, extractors.extractObservedNoteFeed, [note.noteId, 6000], 'observed-note-feed');
            const raw = detail || note.raw || { note_id: note.noteId, display_title: note.title, cover: note.coverUrl };
            const capturedAt = now();
            const rawSignal = payload.buildBaselineSignalPayload(raw, { url: note.url, taskId: task.id, capturedAt });
            const normalized = signal.normalizeXiaohongshuSignal(rawSignal, rawSignal.source);
            const result = await this.post('/api/signals/ingest', { signals: [normalized] });
            const latest = await (await this.taskStore()).get(task.id);
            await this.updateTask(task.id, { result: { received: (latest?.result.received || 0) + (result.received || 0), created: (latest?.result.created || 0) + (result.created || 0), updated: (latest?.result.updated || 0) + (result.updated || 0), duplicates: (latest?.result.duplicates || 0) + (result.duplicates || 0) }, progress: { current: index + 1 } });
          } finally { await safeDestroyWindow(detailWindow); }
        } catch (error) {
          const latest = await (await this.taskStore()).get(task.id);
          await this.updateTask(task.id, { failures: [...(latest?.failures || []), { noteId: note.noteId, url: note.url, error: error.message || String(error) }], progress: { current: index + 1 } });
        }
        if (index < notes.length - 1) await sleep(3000 + Math.floor(Math.random() * 3001));
      }
      const latest = await (await this.taskStore()).get(task.id);
      if (latest?.status === 'cancelled') return;
      await this.updateTask(task.id, { status: latest.failures.length ? (latest.result.received ? 'partial' : 'failed') : 'completed', completedAt: now() });
    } catch (error) {
      const latest = await (await this.taskStore()).get(task.id);
      await this.updateTask(task.id, { status: latest?.status === 'cancelled' ? 'cancelled' : latest?.result.received ? 'partial' : 'failed', completedAt: now(), error: error.message || String(error) });
    }
  }

  async cancel(taskId) { return this.emit(await (await this.taskStore()).cancel(taskId)); }
  async getStatus() { return this.xhsSession.status(); }
  async listTasks() { return (await this.taskStore()).list(); }

  async structuralSmoke() {
    const [{ extractors, payload, beavRuntime, beavAdapter }] = [await this.modulesPromise];
    if (typeof extractors.extractVisibleContext !== 'function' || typeof extractors.extractObservedNoteFeed !== 'function' || typeof extractors.extractXhsBloggerPayload !== 'function' || typeof extractors.extractXhsBloggerNotesPayload !== 'function') throw new Error('Beav-derived extractors import failed');
    const task = await this.createTask('visible-notes', 0);
    await this.updateTask(task.id, { status: 'running' });
    const hidden = await this.xhsSession.createHidden('data:text/html,<title>Collector%20Smoke</title>');
    try {
      const mainWorld = await this.page(hidden, () => ({
        bridgeType: typeof window.redbookXhsBridge,
        installed: window.__REDBOX_XHS_BRIDGE_INSTALLED__ === true,
        responses: Array.isArray(window.__REDBOX_XHS_RESPONSES__),
        nodeGlobals: ['require', 'process', 'Buffer'].filter((key) => typeof window[key] !== 'undefined'),
      }), [], 'bridge-main-world-smoke');
      const isolatedWorld = await hidden.webContents.executeJavaScriptInIsolatedWorld(9876, [{ code: `(async () => ({
        bridgeType: typeof window.redbookXhsBridge,
        bridgeKeys: window.redbookXhsBridge ? Object.keys(window.redbookXhsBridge).sort() : [],
        ping: window.redbookXhsBridge && typeof window.redbookXhsBridge.ping === 'function' ? window.redbookXhsBridge.ping() : null,
        shimType: typeof window.chrome?.runtime?.sendMessage,
        unknownMessage: await window.chrome.runtime.sendMessage({ type: '__smoke_unknown__' }).then(() => ({ resolved: true })).catch((error) => ({ rejected: true, error: String(error?.message || error) })),
        observer: window.__REDBOOK_BEAV_PAGE_OBSERVER_INSTALLED__ === true,
        shim: window.__REDBOOK_BEAV_XHS_SHIM_INSTALLED__ === true,
        companion: window.__REDBOOK_XHS_OVERLAY_COMPANION_INSTALLED__ === true,
        observerError: window.__REDBOOK_BEAV_PAGE_OBSERVER_ERROR__ || null,
        nodeGlobals: ['require', 'process', 'Buffer'].filter((key) => typeof window[key] !== 'undefined'),
      }))()` }], true);
      const bridge = { mainWorld, isolatedWorld };
      const expectedKeys = ['confirmProfileClick', 'ping', 'sendCollectorMessage'];
      if (mainWorld.bridgeType !== 'undefined' || !mainWorld.installed || !mainWorld.responses || mainWorld.nodeGlobals.length) throw new Error(`xhs-preload Main World boundary failed: ${JSON.stringify(mainWorld)}`);
      if (isolatedWorld.bridgeType !== 'object' || JSON.stringify(isolatedWorld.bridgeKeys) !== JSON.stringify(expectedKeys) || isolatedWorld.ping?.bridge !== 'redbook-xhs' || isolatedWorld.ping?.version !== 1 || isolatedWorld.shimType !== 'function' || isolatedWorld.unknownMessage?.rejected !== true || !isolatedWorld.observer || !isolatedWorld.shim || !isolatedWorld.companion || isolatedWorld.nodeGlobals.length) throw new Error(`xhs-preload isolated transport failed: ${JSON.stringify(isolatedWorld)}`);
      if (typeof beavRuntime.extractXhsNotePayload !== 'function' || typeof beavRuntime.extractXhsBloggerPayload !== 'function' || typeof beavAdapter.beavNotePayloadToSignalInput !== 'function' || typeof beavAdapter.beavCreatorPayloadToCreatorInput !== 'function') throw new Error('Beav XHS runtime import failed');
      await this.updateTask(task.id, { status: 'cancelled', completedAt: now() });
      return { partition: this.xhsSession.partition, bridge, extractCandidateCards: typeof payload.extractCandidateCards === 'function', taskId: task.id };
    } finally {
      // No callback below this point is allowed to use the temporary window.
      await safeDestroyWindow(hidden);
    }
  }
}

module.exports = { ElectronCollector };
