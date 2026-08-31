const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { XhsSession, isUsableWindow, safeDestroyWindow } = require('./xhs-session.cjs');
const { ElectronCollector } = require('./electron-collector.cjs');
const { stopChildProcess } = require('./process-lifecycle.cjs');
const { sendToWindow } = require('./window-ipc.cjs');
const { pageShimSource } = require('./beav-extension-adapter.cjs');
const { loadRedbookXhsOverlayCompanionSource } = require('./beav-source-loader.cjs');

let serverProcess;
let serverUrl;
let workbenchWindow;
let xhsSession;
let collector;
let serverStopPromise = null;
let appShutdownInProgress = false;

function projectRoot() { return app.isPackaged ? app.getAppPath() : path.resolve(__dirname, '..'); }
function runtimeRoot() { return path.resolve(process.env.REDBOOK_DESKTOP_RUNTIME_DIR || app.getPath('userData')); }
function serverEntry() { const entry = path.join(projectRoot(), 'server', 'index.mjs'); if (!existsSync(entry)) throw new Error(`Server entry not found: ${entry}`); return entry; }
function beavXhsSources() {
  const root = path.join(projectRoot(), 'vendor', 'beav', 'plugin-xhs');
  const names = { xhsBridge: 'xhsBridge.js', pageRouteBridge: 'pageRouteBridge.js', pageObserver: 'pageObserver.js' };
  return Object.fromEntries([...Object.entries(names).map(([key, name]) => {
    const source = path.join(root, name);
    if (!existsSync(source)) throw new Error(`Beav XHS source not found: ${source}`);
    return [key, readFileSync(source, 'utf8')];
  }), ['pageShim', pageShimSource()]]);
}
function isOwnedXhsSender(sender) {
  if (!xhsSession?.ownsWebContents(sender) || sender?.isDestroyed?.()) return false;
  try { return /^https:\/\/(www\.)?(xiaohongshu\.com|rednote\.com)\//i.test(sender.getURL()); } catch { return false; }
}
function isLocalAppUrl(url) { try { return serverUrl && new URL(url).origin === new URL(serverUrl).origin; } catch { return false; } }
function waitForServer(child, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let output = ''; let settled = false;
    const timer = setTimeout(() => finish(new Error(`Server ready timeout: ${output.slice(-1000)}`)), timeoutMs);
    const finish = (error, url) => { if (settled) return; settled = true; clearTimeout(timer); if (error) reject(error); else resolve(url); };
    child.stdout.on('data', (chunk) => { output += chunk.toString(); const match = output.match(/REDBOOK_READY\s+(http:\/\/127\.0\.0\.1:\d+)/); if (match) finish(null, match[1]); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.once('error', finish); child.once('exit', (code) => { if (!settled) finish(new Error(`Server exited before ready (${code}): ${output.slice(-1000)}`)); });
  });
}
async function startLocalServer() {
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', REDBOOK_RUNTIME_ROOT: runtimeRoot(), HOST: '127.0.0.1', PORT: '0' };
  const workingDirectory = app.isPackaged ? path.dirname(process.execPath) : projectRoot();
  serverProcess = spawn(process.execPath, [serverEntry(), '--production'], { cwd: workingDirectory, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  serverUrl = await waitForServer(serverProcess); return serverUrl;
}
async function stopLocalServer() {
  if (serverStopPromise) return serverStopPromise;
  const child = serverProcess;
  serverProcess = null;
  if (!child) return;
  serverStopPromise = stopChildProcess(child).finally(() => { serverStopPromise = null; });
  return serverStopPromise;
}

function broadcastTask(task) { if (task) sendToWindow(workbenchWindow, 'desktop:collector-task-changed', task); }
function registerIpc() {
  ipcMain.on('desktop:beav-xhs-sources-sync', (event) => {
    if (!xhsSession?.ownsWebContents(event.sender)) { event.returnValue = null; return; }
    event.returnValue = { ...beavXhsSources(), overlayCompanion: loadRedbookXhsOverlayCompanionSource() };
  });
  ipcMain.handle('desktop:open-xhs', () => xhsSession.open());
  ipcMain.handle('desktop:xhs-status', () => xhsSession.status());
  ipcMain.handle('desktop:collect-visible', () => collector.collectVisible());
  ipcMain.handle('desktop:collect-creator', () => collector.collectCreator());
  ipcMain.handle('desktop:beav-xhs-collector-action', (event, action, payload) => {
    if (!isOwnedXhsSender(event.sender)) throw new Error('只允许小红书会话调用采集器');
    if (action === 'save-xhs') return collector.collectBeavCurrentNote();
    if (action === 'xhs:collect-current-blogger') return collector.collectBeavCurrentCreator();
    if (action === 'redbook:xhs:collect-confirmed-creator') return collector.collectBeavConfirmedCreator(payload?.profileId);
    throw new Error('不支持的 Beav XHS 采集消息');
  });
  ipcMain.handle('desktop:beav-xhs-profile-click', (event, payload) => {
    if (!isOwnedXhsSender(event.sender)) throw new Error('只允许小红书会话绑定博主');
    return collector.confirmBeavOverlayProfile(payload);
  });
  ipcMain.handle('desktop:collect-creator-baseline', (_event, limit) => collector.collectCreatorBaseline(limit));
  ipcMain.handle('desktop:cancel-collector-task', (_event, taskId) => collector.cancel(taskId));
  ipcMain.handle('desktop:list-collector-tasks', () => collector.listTasks());
}

async function checkSmoke() {
  const root = runtimeRoot(); const sourceRoot = projectRoot();
  if (root === sourceRoot || root.startsWith(`${sourceRoot}${path.sep}`) || root.startsWith(`${process.resourcesPath}${path.sep}`)) throw new Error(`runtime root is inside app resources: ${root}`);
  const endpoints = ['/api/account', '/api/discovery', '/api/opportunities']; const responses = await Promise.all(endpoints.map((endpoint) => fetch(`${serverUrl}${endpoint}`)));
  if (responses.some((response) => !response.ok)) throw new Error(`API smoke failed: ${responses.map((response) => response.status).join(',')}`);
  if (process.env.REDBOOK_SMOKE_WRITE_ACCOUNT === '1') { const response = await fetch(`${serverUrl}/api/account`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: 'Desktop Smoke Account', positioning: 'temporary smoke test' }) }); if (!response.ok) throw new Error('smoke account write failed'); }
  if (process.env.REDBOOK_SMOKE_EXPECT_ACCOUNT === '1') { const account = await (await fetch(`${serverUrl}/api/account`)).json(); if (account.displayName !== 'Desktop Smoke Account') throw new Error('smoke account was not persisted'); }
  if (process.argv.includes('--collector-smoke')) { const evidence = await collector.structuralSmoke(); console.log(`REDBOOK_DESKTOP_COLLECTOR_SMOKE_OK ${JSON.stringify(evidence)}`); }
  if (process.argv.includes('--lifecycle-smoke')) { const evidence = await xhsSession.lifecycleSmoke(); console.log(`REDBOOK_XHS_LIFECYCLE_SMOKE_OK ${JSON.stringify(evidence)}`); }
  const marker = `REDBOOK_DESKTOP_SMOKE_OK ${serverUrl}`;
  console.log(marker);
  if (process.env.REDBOOK_DESKTOP_RUNTIME_DIR) { mkdirSync(root, { recursive: true }); writeFileSync(path.join(root, 'desktop-smoke-result.txt'), marker, 'utf8'); }
}

async function createWorkbench() {
  workbenchWindow = new BrowserWindow({ width: 1440, height: 960, minWidth: 1120, minHeight: 720, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
  workbenchWindow.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  workbenchWindow.webContents.on('will-navigate', (event, url) => { if (!isLocalAppUrl(url)) { event.preventDefault(); if (/^https?:\/\//i.test(url)) shell.openExternal(url); } });
  await workbenchWindow.loadURL(serverUrl);
}

function smokeRendererLoad() {
  return new Promise((resolve, reject) => {
    const target = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
    const contents = target.webContents;
    let settled = false;
    let closed = false;
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      if (!contents.isDestroyed()) {
        contents.removeListener('did-finish-load', onFinish);
        contents.removeListener('did-fail-load', onFail);
        contents.removeListener('render-process-gone', onGone);
      }
      if (!closed && !target.isDestroyed()) target.removeListener('closed', onClosed);
    };
    const finish = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      safeDestroyWindow(target).finally(() => error ? reject(error) : resolve());
    };
    const onFinish = async () => {
      if (!isUsableWindow(target) || contents.isDestroyed()) return finish(new Error('Renderer window was destroyed before verification'));
      try {
        const childCount = await contents.executeJavaScript('document.getElementById("root")?.childElementCount || 0');
        if (!childCount) throw new Error('Renderer root remained empty after load');
        finish();
      } catch (error) { finish(error); }
    };
    const onFail = (_event, errorCode, errorDescription, validatedUrl) => finish(new Error(`Renderer load failed (${errorCode}): ${errorDescription} ${validatedUrl || ''}`.trim()));
    const onGone = (_event, details) => finish(new Error(`Renderer process exited: ${details?.reason || 'unknown'}`));
    const onClosed = () => { closed = true; finish(new Error('Renderer window closed before verification')); };
    timer = setTimeout(() => finish(new Error('Renderer load smoke timeout')), 15000);
    contents.once('did-finish-load', onFinish);
    contents.once('did-fail-load', onFail);
    contents.once('render-process-gone', onGone);
    target.once('closed', onClosed);
    target.loadURL(serverUrl).catch((error) => finish(error));
  });
}

async function main() {
  await app.whenReady();
  await startLocalServer();
  xhsSession = new XhsSession({ preloadPath: path.join(__dirname, 'xhs-preload.cjs'), onStatusChanged: (status) => sendToWindow(workbenchWindow, 'desktop:xhs-status-changed', status) });
  collector = new ElectronCollector({ xhsSession, serverUrl, runtimeRoot: runtimeRoot(), onTaskChanged: broadcastTask });
  registerIpc();
  if (process.argv.includes('--smoke-test')) {
    try { await checkSmoke(); await smokeRendererLoad(); console.log('REDBOOK_DESKTOP_RENDERER_SMOKE_OK'); await stopLocalServer(); app.exit(0); } catch (error) { console.error(`REDBOOK_DESKTOP_SMOKE_FAILED ${error.message}`); await stopLocalServer(); app.exit(1); }
    return;
  }
  await createWorkbench();
}

app.on('window-all-closed', async () => {
  // Smoke probes create hidden XHS windows without a workbench window; do not
  // quit while the probe is still persisting its task evidence.
  if (process.argv.includes('--smoke-test')) return;
  await xhsSession?.close(); await stopLocalServer(); app.quit();
});
app.on('before-quit', (event) => {
  if (appShutdownInProgress || (!serverProcess && !xhsSession?.getWindow?.())) return;
  event.preventDefault();
  appShutdownInProgress = true;
  Promise.all([xhsSession?.close?.(), stopLocalServer()]).catch(() => {}).finally(() => app.quit());
});
main().catch(async (error) => { console.error(`REDBOOK_DESKTOP_SMOKE_FAILED ${error.message}`); await stopLocalServer(); app.exit(1); });
