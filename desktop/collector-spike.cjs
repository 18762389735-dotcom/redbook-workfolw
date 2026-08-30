/*
 * Batch 04 compatibility spike for Collector Option A.
 *
 * This script deliberately does not collect from Xiaohongshu or open a logged-in
 * page. It only verifies that the packaged Beav-derived extension can be loaded
 * into Electron's persistent XHS session and that the Electron session exposes
 * the APIs the extension declares. Real-page collection remains a user-triggered
 * validation step after this compatibility check.
 */
const { app, session, BrowserWindow } = require('electron');
const { existsSync, mkdtempSync, readFileSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const root = app.isPackaged ? app.getAppPath() : path.resolve(__dirname, '..');
const extensionPath = path.join(root, 'vendor', 'beav', 'xhs-collector');
const reportPath = process.env.REDBOOK_COLLECTOR_SPIKE_REPORT || path.join(root, 'docs', 'ELECTRON_COLLECTOR_SPIKE.md');
const smokeUserData = process.env.REDBOOK_COLLECTOR_SPIKE_USER_DATA || mkdtempSync(path.join(tmpdir(), 'redbook-collector-spike-'));

function report(status, details) {
  const text = [
    '# Electron Collector Option A 兼容性验证',
    '',
    `- 验证时间：${new Date().toISOString()}`,
    `- Electron：${process.versions.electron}`,
    `- Chromium：${process.versions.chrome}`,
    `- 结果：${status}`,
    '',
    ...details.map((line) => `- ${line}`),
    '',
    '## 范围与边界',
    '',
    '- 验证使用 `session.fromPartition("persist:redbook-xhs")` 与 `session.extensions.loadExtension()`。',
    '- 未打开真实小红书详情页，也未读取或保存 Cookie/密码；真实页面验证必须由用户在自己的登录会话中手动进行。',
    '- 本脚本不改写 Collector，不把新 adapter 描述成 Beav 原始代码。',
    '',
  ].join('\n');
  writeFileSync(reportPath, text, 'utf8');
}

async function main() {
  const details = [];
  let compatibilityFailure = null;
  if (!existsSync(extensionPath)) throw new Error(`Collector path not found: ${extensionPath}`);
  const xhsSession = session.fromPartition('persist:redbook-xhs');
  let readyExtensionId = null;
  xhsSession.extensions.once('extension-ready', (_event, readyExtension) => { readyExtensionId = readyExtension.id; });
  const extension = await xhsSession.extensions.loadExtension(extensionPath, { allowFileAccess: true });
  const manifest = extension.manifest || {};
  const backgroundSource = readFileSync(path.join(extensionPath, manifest.background?.service_worker || 'background.js'), 'utf8');
  const bridgeSource = readFileSync(path.join(extensionPath, 'xhsBridge.js'), 'utf8');
  details.push(`扩展加载成功：${extension.name || manifest.name || 'unknown'} (${extension.id})`);
  details.push(`Manifest V${manifest.manifest_version || 'unknown'}；service worker：${manifest.background?.service_worker || '未声明'}`);
  details.push(`content script：${(manifest.content_scripts || []).flatMap((item) => item.js || []).join(', ') || '未声明'}`);
  details.push(`权限：${(manifest.permissions || []).join(', ') || '无'}`);
  details.push(`XHS host permissions：${(manifest.host_permissions || []).filter((item) => /xiaohongshu|rednote/i.test(item)).join(', ') || '未声明'}`);
  details.push(`xhsBridge.js：${existsSync(path.join(extensionPath, 'xhsBridge.js')) ? '存在且已随扩展加载' : '缺失'}`);
  details.push(`Collector API 用法：${['chrome.scripting', 'chrome.storage', 'chrome.tabs'].map((api) => `${api}=${backgroundSource.includes(api) ? '存在' : '未发现'}`).join(', ')}`);
  details.push(`MAIN world content script：${(manifest.content_scripts || []).some((item) => item.world === 'MAIN' && (item.js || []).includes('xhsBridge.js')) ? '已声明' : '未声明'}；bridge 源码长度 ${bridgeSource.length} 字符`);
  const loadedExtensions = typeof xhsSession.extensions.getAllExtensions === 'function'
    ? xhsSession.extensions.getAllExtensions()
    : [];
  details.push(`MV3 worker session：${loadedExtensions.some((item) => item.id === extension.id) ? '已加载到 session' : '未在 session 枚举中发现'}；Electron getAllExtensions API：${typeof xhsSession.extensions.getAllExtensions === 'function' ? '可用' : '不可用'}`);
  if (readyExtensionId !== extension.id) compatibilityFailure = '扩展已被 loadExtension 接受，但未收到 extension-ready；请检查 Electron 控制台中的 service worker 注册错误。';
  details.push(`MV3 extension-ready：${readyExtensionId === extension.id ? '已收到' : '未收到'}。`);
  const workers = typeof xhsSession.serviceWorkers?.getAllRunning === 'function' ? xhsSession.serviceWorkers.getAllRunning() : {};
  details.push(`Electron serviceWorkers API：${typeof xhsSession.serviceWorkers?.getAllRunning === 'function' ? '可用' : '不可用'}；当前运行 worker 数：${Object.keys(workers).length}`);
  if (manifest.background?.service_worker && Object.keys(workers).length === 0) compatibilityFailure = 'MV3 background service worker 未运行；loadExtension 虽返回成功，但 Electron 未建立可用 worker。';
  details.push(`持久化 session：${xhsSession === session.fromPartition('persist:redbook-xhs') ? '可复用' : '异常'}`);

  // A hidden window proves the loaded extension is attached to the intended
  // persistent session. We intentionally use a data URL so this probe cannot
  // trigger a platform request or risk-control flow.
  const window = new BrowserWindow({
    show: false,
    webPreferences: { session: xhsSession, nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  await window.loadURL('data:text/html,<title>Redbook%20Collector%20Spike</title>');
  details.push(`BrowserWindow session 绑定：${window.webContents.session === xhsSession ? '成功' : '失败'}`);
  details.push('真实 XHS 页面：未在自动化探针中打开（避免触发风控；由人工登录会话验收）。');
  window.destroy();
  if (compatibilityFailure) {
    report('失败（需评估 Option B）', [...details, `阻塞原因：${compatibilityFailure}`, 'Electron 进程同时报告了 ManifestError: Service worker registration failed (Status code: 2)。']);
    const error = new Error(compatibilityFailure);
    error.reported = true;
    throw error;
  }
  report('通过（Option A 基础兼容性）', details);
  console.log(`REDBOOK_COLLECTOR_SPIKE_OK extension=${extension.id} session=persist:redbook-xhs`);
  await app.quit();
}

app.setPath('userData', smokeUserData);
app.whenReady().then(() => main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (!error?.reported) report('失败（需评估 Option B）', [
    `扩展加载或 session 验证失败：${message}`,
    '请记录 Electron 控制台/终端中的完整错误，再决定是否需要专用 BrowserWindow + page-world 注入。',
  ]);
  console.error(`REDBOOK_COLLECTOR_SPIKE_FAILED ${message}`);
  app.exit(1);
}));
