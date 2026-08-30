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

### Option B（仅在 A 不足时）— 专用 XHS BrowserWindow

使用 persistent partition 的 Electron BrowserWindow，并在 page world 注入现有 `xhsBridge` 与最小采集适配。只有确认 Option A 所需 Chrome APIs 不足后才评估；当前不得为此重写 Collector。

## 后续验收

正式版本必须验证：单个 `.exe` 下载与安装、双击启动、无 Node/npm、应用内 XHS 正常登录且会话持久、Collector 可用、全部数据位于 userData、升级不丢数据、GitHub Release 可直接下载安装。

Option B 只在后续明确批准并完成设计后评估；不得在本 Batch 为绕过 spike 失败而重写 Collector。当前桌面壳、安装包和 CI 已可独立工作，Collector 兼容性失败不会阻塞 EXE 构建。

## 签名与发布边界

当前 NSIS 安装包未配置 Windows 代码签名证书，Release 会明确标注 unsigned；普通用户首次安装可能遇到 SmartScreen 提示。后续如购买证书，只需在 CI 的打包步骤注入签名配置，不应把证书或私钥提交到仓库。
