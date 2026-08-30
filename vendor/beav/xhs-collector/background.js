/* Local adapter around the attributed Beav-derived extractors. */
import { extractObservedNoteFeed, extractVisibleContext, extractXhsBloggerNotesPayload, extractXhsBloggerPayload } from './beavExtractors.js';
import { extractCandidateCards, buildVisibleSignalPayload } from './collector-payload.js';

const DEFAULT_ENDPOINT = 'http://localhost:5173/api/signals/ingest';
const TASKS_KEY = 'collectorTasks';
const ACTIVE_TASK_KEY = 'activeCollectorTaskId';
const xhsUrl = (url) => /^https:\/\/(www\.)?(xiaohongshu\.com|rednote\.com)\//.test(url || '');
const profileUrl = (url) => xhsUrl(url) && /^\/user\/profile\//i.test(new URL(url).pathname);
const now = () => new Date().toISOString();

async function endpoint(path = '/api/signals/ingest') {
  const configured = (await chrome.storage.local.get('endpoint')).endpoint || DEFAULT_ENDPOINT;
  return new URL(path, new URL(configured).origin).toString();
}

async function readTasks() { return (await chrome.storage.local.get(TASKS_KEY))[TASKS_KEY] || []; }
async function saveTask(task) {
  const tasks = await readTasks();
  const index = tasks.findIndex((item) => item.id === task.id);
  if (index >= 0) tasks[index] = task; else tasks.unshift(task);
  await chrome.storage.local.set({ [TASKS_KEY]: tasks.slice(0, 20), [ACTIVE_TASK_KEY]: task.id });
  return task;
}
async function updateTask(task, patch) { Object.assign(task, patch, { updatedAt: now() }); await saveTask(task); return task; }
async function createTask(method, total = 1) {
  return saveTask({ id: crypto.randomUUID(), method, status: 'queued', createdAt: now(), updatedAt: now(), progress: { current: 0, total }, result: { received: 0, created: 0, updated: 0, duplicates: 0 }, failures: [] });
}
async function currentTask() {
  const stored = await chrome.storage.local.get([TASKS_KEY, ACTIVE_TASK_KEY]);
  return (stored[TASKS_KEY] || []).find((item) => item.id === stored[ACTIVE_TASK_KEY]) || null;
}
async function isCancelled(task) { return (await readTasks()).find((item) => item.id === task.id)?.status === 'cancelled'; }
async function pageResponses(tabId) {
  const [{ result = [] } = {}] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: () => window.__REDBOX_XHS_RESPONSES__ || [] });
  return result;
}

async function postJson(path, body) {
  const response = await fetch(await endpoint(path), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || '本地工作台拒绝了采集数据');
  return payload;
}

async function collectVisibleNotes(tab, task) {
  await updateTask(task, { status: 'running', startedAt: now() });
  const records = await pageResponses(tab.id);
  const [{ result: context = { links: [], keyword: null, pageUrl: tab.url } } = {}] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: extractVisibleContext });
  if (await isCancelled(task)) throw new Error('任务已取消');
  const links = new Map((context.links || []).map((item) => [String(item.noteId), item.url]));
  const currentId = new URL(context.pageUrl || tab.url).pathname.match(/\/(?:explore|discovery\/item)\/([^/?#]+)/)?.[1];
  const pageUrl = new URL(tab.url);
  const observedKeyword = /^\/search_result\/?$/i.test(pageUrl.pathname) ? pageUrl.searchParams.get('keyword') : null;
  const capturedAt = now();
  const signals = extractCandidateCards(records).map((raw) => {
    const noteId = String(raw.note_id || raw.noteId || raw.id || '');
    const observedUrl = links.get(noteId) || (noteId === currentId ? context.pageUrl || tab.url : null);
    return buildVisibleSignalPayload(raw, { url: observedUrl, keyword: context.keyword || observedKeyword || null, taskId: task.id, capturedAt, provider: 'beav-derived-browser-extension' });
  });
  if (!signals.length) throw new Error('当前页面尚未观察到可采集的公开笔记。请刷新页面后再试。');
  const result = await postJson('/api/signals/ingest', { signals });
  await updateTask(task, { status: 'completed', completedAt: now(), progress: { current: signals.length, total: signals.length }, result });
  return result;
}

async function collectCreator(tab, task) {
  if (!profileUrl(tab.url)) throw new Error('请先打开真实的小红书博主页。');
  await updateTask(task, { status: 'running', startedAt: now() });
  const [{ result: creator } = {}] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: extractXhsBloggerPayload });
  const capturedAt = now();
  const result = await postJson('/api/creators/ingest', { creators: [{ ...creator, profileUrl: tab.url, source: { provider: 'beav-derived-browser-extension', method: 'creator-profile', taskId: task.id, capturedAt } }] });
  await updateTask(task, { status: 'completed', completedAt: now(), progress: { current: 1, total: 1 }, result, creator });
  return result;
}

function waitForTab(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error('笔记页面加载超时')); }, timeoutMs);
    const listener = (changedId, info) => {
      if (changedId !== tabId || info.status !== 'complete') return;
      clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status !== 'complete') return;
      clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); resolve();
    }).catch(() => {});
  });
}
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function readDetail(note, profile, task) {
  let detailTab;
  try {
    detailTab = await chrome.tabs.create({ url: note.url, active: false });
    await waitForTab(detailTab.id);
    const [{ result: detail } = {}] = await chrome.scripting.executeScript({ target: { tabId: detailTab.id }, world: 'MAIN', func: extractObservedNoteFeed, args: [note.noteId, 6000] });
    const raw = detail || note.raw || { note_id: note.noteId, display_title: note.title, cover: note.coverUrl };
    const user = raw.user || raw.author || {};
    return { ...raw, url: note.url, user: { ...user, user_id: user.user_id || user.userId || profile.userId, nickname: user.nickname || user.name || profile.nickname }, source: { provider: 'beav-derived-browser-extension', method: 'creator-baseline', keyword: null, taskId: task.id, capturedAt: now() } };
  } finally { if (detailTab?.id) await chrome.tabs.remove(detailTab.id).catch(() => {}); }
}
function addCounts(target, addition) { for (const key of ['received', 'created', 'updated', 'duplicates']) target[key] += Number(addition?.[key]) || 0; }

async function runBaseline(tab, task, limit) {
  try {
    await updateTask(task, { status: 'running', startedAt: now() });
    const [{ result: profile } = {}] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: extractXhsBloggerNotesPayload, args: [limit, 'auto'] });
    const notes = (profile?.notes || []).slice(0, limit);
    task.progress.total = notes.length;
    task.profile = { userId: profile?.userId || null, nickname: profile?.nickname || null, source: profile?.source || tab.url, collectionMode: profile?.collectionMode || null, apiError: profile?.apiError || null };
    await saveTask(task);
    if (!notes.length) throw new Error(profile?.apiError || '未从博主页取得近期公开笔记');
    for (const note of notes) {
      if (await isCancelled(task)) { await updateTask(task, { status: 'cancelled', completedAt: now() }); return; }
      try { addCounts(task.result, await postJson('/api/signals/ingest', { signals: [await readDetail(note, profile, task)] })); }
      catch (error) { task.failures.push({ noteId: note.noteId, url: note.url, error: error instanceof Error ? error.message : String(error) }); }
      task.progress.current += 1;
      await saveTask(task);
      if (task.progress.current < notes.length) await delay(3000 + Math.floor(Math.random() * 3001));
    }
    await updateTask(task, { status: task.failures.length ? (task.result.received ? 'partial' : 'failed') : 'completed', completedAt: now() });
  } catch (error) {
    const cancelled = await isCancelled(task);
    await updateTask(task, { status: cancelled ? 'cancelled' : task.result.received ? 'partial' : 'failed', completedAt: now(), error: error instanceof Error ? error.message : String(error) });
  }
}

async function cancelTask(taskId) {
  const tasks = await readTasks();
  const task = tasks.find((item) => item.id === taskId);
  if (!task || !['queued', 'running'].includes(task.status)) return false;
  task.status = 'cancelled'; task.updatedAt = now();
  await chrome.storage.local.set({ [TASKS_KEY]: tasks });
  return true;
}

chrome.runtime.onInstalled.addListener(async () => {
  const tasks = await readTasks();
  let changed = false;
  for (const task of tasks) if (['queued', 'running'].includes(task.status)) { task.status = task.result?.received ? 'partial' : 'failed'; task.error = '扩展更新后任务中断'; task.updatedAt = now(); changed = true; }
  if (changed) await chrome.storage.local.set({ [TASKS_KEY]: tasks });
});

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  (async () => {
    if (message.type === 'collector:status') return respond({ task: await currentTask(), tasks: await readTasks() });
    if (message.type === 'collector:config') return respond({ endpoint: await endpoint('/api/signals/ingest') });
    if (message.type === 'collector:set-endpoint') { await chrome.storage.local.set({ endpoint: message.endpoint || DEFAULT_ENDPOINT }); return respond({ ok: true }); }
    if (message.type === 'collector:cancel') return respond({ ok: await cancelTask(message.taskId) });
    if (!['collector:collect', 'collector:creator', 'collector:baseline'].includes(message.type)) return respond({ error: '未知请求' });
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !xhsUrl(tab.url)) return respond({ error: '请先打开小红书或 RedNote 的公开页面。' });
    if (message.type === 'collector:baseline') {
      if (!profileUrl(tab.url)) return respond({ error: '请先打开真实的小红书博主页。' });
      const limit = Math.min(20, Math.max(1, Math.round(Number(message.limit) || 12)));
      const task = await createTask('creator-baseline', limit);
      runBaseline(tab, task, limit);
      return respond({ task });
    }
    const task = await createTask(message.type === 'collector:creator' ? 'creator-profile' : 'visible-notes');
    try {
      const result = message.type === 'collector:creator' ? await collectCreator(tab, task) : await collectVisibleNotes(tab, task);
      return respond({ task, result });
    } catch (error) {
      await updateTask(task, { status: await isCancelled(task) ? 'cancelled' : 'failed', completedAt: now(), error: error instanceof Error ? error.message : String(error) });
      return respond({ task, error: error instanceof Error ? error.message : String(error) });
    }
  })().catch((error) => respond({ error: error instanceof Error ? error.message : String(error) }));
  return true;
});
