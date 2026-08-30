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

### Option A（优先）— `session.loadExtension()`

将 `vendor/beav/xhs-collector` 作为 packaged resource 随安装包分发，在专用 persistent XHS session 中自动加载。此路线最大化复用已经真实验证的 Collector，需优先做小型技术验证：确认 Electron 目标版本对 Manifest V3、content script MAIN world、`chrome.scripting`、`chrome.storage.local`、tabs 与 background service worker 的支持情况。

### Option B（仅在 A 不足时）— 专用 XHS BrowserWindow

使用 persistent partition 的 Electron BrowserWindow，并在 page world 注入现有 `xhsBridge` 与最小采集适配。只有确认 Option A 所需 Chrome APIs 不足后才评估；当前不得为此重写 Collector。

## 后续验收

正式版本必须验证：单个 `.exe` 下载与安装、双击启动、无 Node/npm、应用内 XHS 正常登录且会话持久、Collector 可用、全部数据位于 userData、升级不丢数据、GitHub Release 可直接下载安装。

Batch 02 不实现 Electron、打包脚本或 CI；本文件只冻结兼容方向，避免引入阻碍桌面化的架构债。
