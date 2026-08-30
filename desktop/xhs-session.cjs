const { BrowserWindow, session, shell } = require('electron');

const PARTITION = 'persist:redbook-xhs';
const isXhsUrl = (value) => {
  try { return /(^|\.)(xiaohongshu\.com|rednote\.com)$/i.test(new URL(value).hostname); } catch { return false; }
};

function isUsableWindow(target) {
  if (!target || target.isDestroyed()) return false;
  const contents = target.webContents;
  return Boolean(contents && !contents.isDestroyed());
}

function safeWindowUrl(target) {
  if (!isUsableWindow(target)) return null;
  const contents = target.webContents;
  return contents.isDestroyed() ? null : contents.getURL();
}

function safeDestroyWindow(target, timeoutMs = 5000) {
  if (!target || target.isDestroyed()) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    let timer;
    let closed = false;
    const cleanup = () => {
      clearTimeout(timer);
      // Cleanup only runs while the native object is still usable. The
      // `closed` callback itself never reads any BrowserWindow property.
      if (!closed && !target.isDestroyed()) target.removeListener('closed', onClosed);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onClosed = () => { closed = true; finish(); };
    timer = setTimeout(finish, timeoutMs);
    target.once('closed', onClosed);
    try { target.destroy(); } catch { finish(); }
  });
}

function loadWindow(target, url, timeoutMs = 30000) {
  if (!isUsableWindow(target)) return Promise.reject(new Error('BrowserWindow 已销毁，无法加载页面'));
  const contents = target.webContents;
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    let closed = false;
    const cleanup = () => {
      clearTimeout(timer);
      if (closed) return;
      contents.removeListener('did-finish-load', onFinish);
      contents.removeListener('did-fail-load', onFail);
      // The closed path has already removed the native event source. For all
      // other paths, remove the one-shot listener while the window is usable.
      if (!target.isDestroyed()) target.removeListener('closed', onClosed);
    };
    const finish = (error) => { if (settled) return; settled = true; cleanup(); error ? reject(error) : resolve(); };
    const onFinish = () => finish();
    const onFail = (_event, errorCode, errorDescription) => finish(new Error(`XHS 页面加载失败 (${errorCode}): ${errorDescription}`));
    // Mark the state before settling; no native object is dereferenced here.
    const onClosed = () => { closed = true; finish(new Error('XHS BrowserWindow 在页面加载完成前关闭')); };
    timer = setTimeout(() => finish(new Error('XHS 页面加载超时')), timeoutMs);
    contents.once('did-finish-load', onFinish);
    contents.once('did-fail-load', onFail);
    target.once('closed', onClosed);
    if (!isUsableWindow(target) || contents.isDestroyed()) return finish(new Error('BrowserWindow 在开始加载前已销毁'));
    target.loadURL(url).catch((error) => finish(error));
  });
}

class XhsSession {
  constructor({ preloadPath, onStatusChanged } = {}) {
    this.preloadPath = preloadPath;
    this.onStatusChanged = onStatusChanged || (() => {});
    this.window = null;
    this.ready = false;
    this.windows = new Set();
    this.openPromise = null;
  }

  get partition() { return PARTITION; }

  status() {
    const target = this.window;
    if (!isUsableWindow(target)) return { open: false, ready: false, partition: PARTITION, url: null };
    const contents = target.webContents;
    return { open: true, ready: this.ready, partition: PARTITION, url: contents.isDestroyed() ? null : contents.getURL() };
  }

  emitStatus() { this.onStatusChanged(this.status()); }

  configureWindow(target) {
    const contents = target.webContents;
    this.windows.add(contents);
    contents.setWindowOpenHandler(({ url }) => {
      if (!isXhsUrl(url) && /^https?:\/\//i.test(url)) shell.openExternal(url);
      return { action: isXhsUrl(url) ? 'allow' : 'deny' };
    });
    const onNavigate = (event, url) => {
      if (!isUsableWindow(target)) return;
      if (!isXhsUrl(url)) { event.preventDefault(); if (/^https?:\/\//i.test(url)) shell.openExternal(url); }
    };
    contents.on('will-navigate', onNavigate);
    // Capture plain JS references before destruction; closed never reads native properties.
    const onClosed = () => {
      // Do not touch target.webContents, target.id, getURL(), or any native
      // property after Electron has emitted `closed`.
      this.windows.delete(contents);
      if (this.window === target) {
        this.window = null;
        this.ready = false;
        this.emitStatus();
      }
    };
    target.once('closed', onClosed);
    const onStart = () => { if (this.window === target && isUsableWindow(target)) { this.ready = false; this.emitStatus(); } };
    const onFinish = () => { if (this.window === target && isUsableWindow(target)) { this.ready = true; this.emitStatus(); } };
    contents.on('did-start-loading', onStart);
    contents.on('did-finish-load', onFinish);
  }

  createWindow({ show = true } = {}) {
    const target = new BrowserWindow({
      show,
      width: 1280,
      height: 900,
      minWidth: 980,
      minHeight: 680,
      title: '小红书会话',
      webPreferences: { partition: PARTITION, preload: this.preloadPath, nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    this.configureWindow(target);
    return target;
  }

  async createHidden(url) {
    const target = this.createWindow({ show: false });
    try { await loadWindow(target, url); return target; }
    catch (error) { await safeDestroyWindow(target); throw error; }
  }

  async open(url = 'https://www.xiaohongshu.com/') {
    if (isUsableWindow(this.window)) { this.window.show(); this.window.focus(); this.emitStatus(); return this.status(); }
    if (this.openPromise) return this.openPromise;
    const target = this.createWindow({ show: true });
    this.window = target;
    this.ready = false;
    this.emitStatus();
    this.openPromise = (async () => {
      try {
        await loadWindow(target, url);
        if (!isUsableWindow(target) || this.window !== target) throw new Error('XHS BrowserWindow 在加载期间已关闭');
        this.ready = true;
        this.emitStatus();
        return this.status();
      } catch (error) {
        if (this.window === target) { this.window = null; this.ready = false; this.emitStatus(); }
        await safeDestroyWindow(target);
        throw error;
      } finally { this.openPromise = null; }
    })();
    return this.openPromise;
  }

  getWindow() { return isUsableWindow(this.window) ? this.window : null; }
  ownsWebContents(contents) { return this.windows.has(contents); }

  async close() {
    const target = this.window;
    this.window = null;
    this.ready = false;
    this.emitStatus();
    await safeDestroyWindow(target);
  }

  async lifecycleSmoke() {
    const dataUrl = 'data:text/html,<title>Lifecycle%20Smoke</title>';
    for (let index = 0; index < 5; index += 1) {
      await this.open(dataUrl);
      await this.close();
      await this.open(dataUrl);
      await this.close();
    }
    for (let index = 0; index < 10; index += 1) {
      const hidden = await this.createHidden(dataUrl);
      await safeDestroyWindow(hidden);
    }
    const pending = this.createWindow({ show: false });
    const pendingLoad = loadWindow(pending, dataUrl, 1000).catch(() => null);
    await safeDestroyWindow(pending);
    await pendingLoad;
    await this.open(dataUrl);
    // Intentionally leave one XHS window alive; the smoke harness then calls
    // app.exit(), covering the app-quit-while-window-exists race.
    return { openCloseReopen: 5, hiddenCreateDestroy: 10, pendingLoadDestroy: true, appQuitWithXhsWindow: true };
  }
}

module.exports = { XhsSession, PARTITION, isXhsUrl, isUsableWindow, safeWindowUrl, safeDestroyWindow, waitForDestroyed: safeDestroyWindow, loadWindow };
