const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('node:child_process');
const { existsSync, mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');

let serverProcess;
let serverUrl;
function projectRoot() { return app.isPackaged ? app.getAppPath() : path.resolve(__dirname, '..'); }
function runtimeRoot() { return path.resolve(process.env.REDBOOK_DESKTOP_RUNTIME_DIR || app.getPath('userData')); }
function serverEntry() { const entry = path.join(projectRoot(), 'server', 'index.mjs'); if (!existsSync(entry)) throw new Error(`Server entry not found: ${entry}`); return entry; }
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
async function stopLocalServer() { if (!serverProcess || serverProcess.killed) return; const child = serverProcess; serverProcess = null; child.kill(); await new Promise((resolve) => child.once('exit', resolve)); }
async function checkSmoke() {
  const root = runtimeRoot(); const sourceRoot = projectRoot();
  if (root === sourceRoot || root.startsWith(`${sourceRoot}${path.sep}`) || root.startsWith(`${process.resourcesPath}${path.sep}`)) throw new Error(`runtime root is inside app resources: ${root}`);
  const endpoints = ['/api/account', '/api/discovery', '/api/opportunities']; const responses = await Promise.all(endpoints.map((endpoint) => fetch(`${serverUrl}${endpoint}`)));
  if (responses.some((response) => !response.ok)) throw new Error(`API smoke failed: ${responses.map((response) => response.status).join(',')}`);
  if (process.env.REDBOOK_SMOKE_WRITE_ACCOUNT === '1') { const response = await fetch(`${serverUrl}/api/account`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: 'Desktop Smoke Account', positioning: 'temporary smoke test' }) }); if (!response.ok) throw new Error('smoke account write failed'); }
  if (process.env.REDBOOK_SMOKE_EXPECT_ACCOUNT === '1') { const account = await (await fetch(`${serverUrl}/api/account`)).json(); if (account.displayName !== 'Desktop Smoke Account') throw new Error('smoke account was not persisted'); }
  const marker = `REDBOOK_DESKTOP_SMOKE_OK ${serverUrl}`;
  console.log(marker);
  if (process.env.REDBOOK_DESKTOP_RUNTIME_DIR) { mkdirSync(root, { recursive: true }); writeFileSync(path.join(root, 'desktop-smoke-result.txt'), marker, 'utf8'); }
}
async function createWorkbench() {
  const window = new BrowserWindow({ width: 1440, height: 960, minWidth: 1120, minHeight: 720, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  window.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, url) => { if (!isLocalAppUrl(url)) { event.preventDefault(); if (/^https?:\/\//i.test(url)) shell.openExternal(url); } });
  await window.loadURL(serverUrl);
}
async function main() { await app.whenReady(); await startLocalServer(); if (process.argv.includes('--smoke-test')) { try { await checkSmoke(); await stopLocalServer(); app.exit(0); } catch (error) { console.error(`REDBOOK_DESKTOP_SMOKE_FAILED ${error.message}`); await stopLocalServer(); app.exit(1); } return; } await createWorkbench(); }
app.on('window-all-closed', async () => { await stopLocalServer(); app.quit(); });
app.on('before-quit', () => { if (serverProcess && !serverProcess.killed) serverProcess.kill(); });
main().catch(async (error) => { console.error(`REDBOOK_DESKTOP_SMOKE_FAILED ${error.message}`); await stopLocalServer(); app.exit(1); });
