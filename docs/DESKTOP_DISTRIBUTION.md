# Windows 桌面分发目标

## 最终交付链

```text
GitHub Repository
  → GitHub Actions
  → GitHub Release
  → Windows x64 NSIS Installer (.exe)
  → 用户安装并双击运行
```

普通用户最终不需要 Node.js、npm、Chrome developer mode 或手动加载 unpacked extension。React/Vite 继续作为 renderer；正式 App Shell 预留在 `desktop/`，后续可参考旧 redbook 已验证的 `desktop/main.cjs`、electron-builder、NSIS 与 `package:win` 思路，但不复制旧运行架构。

## Runtime data

Electron main process 应以 `app.getPath('userData')` 作为 runtime root，并把完整文件路径注入 Store。预期结构：

```text
userData/
  signals.json
  creators.json
  opportunities.json
  knowledge/
  drafts/
  settings.json
```

Core 不得硬编码仓库或安装目录。安装包资源与用户数据必须分离，重新安装或升级 EXE 不得清空 userData。开发期仍可把 `data/` 作为默认 runtime root。

## Collector packaging 调查顺序

### Option A（优先）— `session.loadExtension()`（Batch 04 spike 结果）

将 `vendor/beav/xhs-collector` 作为 packaged resource 随安装包分发，在专用 persistent XHS session 中自动加载。此路线最大化复用已经真实验证的 Collector，需优先做小型技术验证：确认 Electron 目标版本对 Manifest V3、content script MAIN world、`chrome.scripting`、`chrome.storage.local`、tabs 与 background service worker 的支持情况。

Batch 04 已在 Electron 44.0.0 上运行了 `npm run desktop:collector-spike`。扩展目录可以被 `session.extensions.loadExtension()` 接受，Manifest V3、`xhsBridge.js`、MAIN world 声明及 `chrome.scripting` / `chrome.storage` / `chrome.tabs` 用法均可被静态检查；但 Electron 控制台报告 `ManifestError: Service worker registration failed (Status code: 2)`，且 `serviceWorkers.getAllRunning()` 没有可运行的 worker。因此 Option A 当前只能视为“资源可加载”，不能视为 Collector 可用，已冻结为阻塞项。完整证据见 [`ELECTRON_COLLECTOR_SPIKE.md`](ELECTRON_COLLECTOR_SPIKE.md)。本轮不改写扩展，也不自动切换实现路线。

### Option B（当前正式路线）— 专用 XHS BrowserWindow

Electron 44 的兼容性 spike 已确认 Option A 的 MV3 service worker 无法运行，因此 Option A 已冻结为失败实验，不再修改扩展 manifest 或降低 Electron 安全配置。Batch 04.1 的正式路线是专用 persistent BrowserWindow：`persist:redbook-xhs` 分区、正常小红书登录、`xhs-preload.cjs` 注入现有 `xhsBridge.js`，并由 Electron Main 的 Collector Service 读取页面已经产生的公开响应后提交 localhost API。

XHS BrowserWindow 与 Workbench 都使用 `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`。Renderer 只拿到 `desktop/preload.cjs` 的窄 IPC；XHS 页面不会获得 Node API，也不会向 localhost API 直接发请求。登录状态只依赖 Chromium session persistence，应用不读取或导出 Cookie、密码或 localStorage 登录凭证。

开发阶段保留 Chrome unpacked extension 作为 fallback；普通用户路径不需要 Chrome developer mode 或手动加载扩展。完整采集任务与安全边界见 [`DESKTOP_COLLECTOR.md`](DESKTOP_COLLECTOR.md)。

## 后续验收

正式版本必须验证：单个 `.exe` 下载与安装、双击启动、无 Node/npm、应用内 XHS 正常登录且会话持久、Collector 可用、全部数据位于 userData、升级不丢数据、GitHub Release 可直接下载安装。

Batch 04.1 已实现 Option B 的结构化桌面 Collector 骨架；真实登录、公开页面采集和基线任务仍必须在本地人工验收。Option A 失败实验只保留为兼容性记录，不作为普通用户路径。

## 签名与发布边界

当前 NSIS 安装包未配置 Windows 代码签名证书，Release 会明确标注 unsigned；普通用户首次安装可能遇到 SmartScreen 提示。后续如购买证书，只需在 CI 的打包步骤注入签名配置，不应把证书或私钥提交到仓库。
