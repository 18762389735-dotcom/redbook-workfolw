const { join } = require('node:path');
const { isUsableWindow, safeWindowUrl, safeDestroyWindow } = require('./xhs-session.cjs');

const now = () => new Date().toISOString();
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const invoke = (fn, args = []) => `(${fn.toString()})(${args.map((value) => JSON.stringify(value)).join(',')})`;

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
    ]).then(([signal, creator, payload, extractors]) => ({ signal, creator, payload, extractors }));
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

  async page(window, functionValue, args = []) {
    if (!isUsableWindow(window)) throw new Error('请先打开小红书会话');
    const contents = window.webContents;
    if (contents.isDestroyed()) throw new Error('小红书会话已关闭');
    return contents.executeJavaScript(invoke(functionValue, args), true);
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
      const responses = await this.page(window, () => window.__REDBOX_XHS_RESPONSES__ || []);
      const context = await this.page(window, extractors.extractVisibleContext);
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
      const raw = await this.page(window, extractors.extractXhsBloggerPayload);
      const source = { provider: 'beav-derived-electron-session', method: 'creator-profile', taskId: task.id, capturedAt: now() };
      const normalized = creator.normalizeXiaohongshuCreator(payload.buildCreatorSignalPayload(raw, { profileUrl, taskId: task.id, capturedAt: source.capturedAt }), source);
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
      const profile = await this.page(window, extractors.extractXhsBloggerNotesPayload, [limit, 'auto']);
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
            const detail = await this.page(detailWindow, extractors.extractObservedNoteFeed, [note.noteId, 6000]);
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
    const [{ extractors, payload }] = [await this.modulesPromise];
    if (typeof extractors.extractVisibleContext !== 'function' || typeof extractors.extractObservedNoteFeed !== 'function' || typeof extractors.extractXhsBloggerPayload !== 'function' || typeof extractors.extractXhsBloggerNotesPayload !== 'function') throw new Error('Beav-derived extractors import failed');
    const task = await this.createTask('visible-notes', 0);
    await this.updateTask(task.id, { status: 'running' });
    const hidden = await this.xhsSession.createHidden('data:text/html,<title>Collector%20Smoke</title>');
    try {
      const bridge = await this.page(hidden, () => ({ installed: window.__REDBOX_XHS_BRIDGE_INSTALLED__ === true, responses: Array.isArray(window.__REDBOX_XHS_RESPONSES__) }));
      if (!bridge.installed || !bridge.responses) throw new Error('xhs-preload bridge injection flags missing');
      await this.updateTask(task.id, { status: 'cancelled', completedAt: now() });
      return { partition: this.xhsSession.partition, bridge, extractCandidateCards: typeof payload.extractCandidateCards === 'function', taskId: task.id };
    } finally {
      // No callback below this point is allowed to use the temporary window.
      await safeDestroyWindow(hidden);
    }
  }
}

module.exports = { ElectronCollector };
