# Desktop shell

Batch 04 的 Electron App Shell。Renderer 仍是 `apps/web` 的 Vite build；Electron 负责启动 production Server、注入临时或 `app.getPath('userData')` runtime root，并加载动态 localhost URL。

## Developer

```bash
npm run desktop
npm run desktop:smoke
npm run desktop:packaged-smoke
npm run desktop:collector-spike
npm run desktop:collector-smoke
npm run desktop:lifecycle-smoke
```

`desktop:smoke` 会在临时 runtime 目录启动两次应用，验证 Account 写入、退出、重启后仍可读取，并输出 `REDBOOK_DESKTOP_PERSISTENCE_OK`。正式应用默认不创建 Node API，BrowserWindow 使用 `nodeIntegration: false`、`contextIsolation: true` 与 sandbox；外部链接交给系统浏览器。

Windows 安装包由 electron-builder NSIS 生成，用户数据不写入安装目录或 resources。Collector 兼容性 spike 独立记录在 `docs/ELECTRON_COLLECTOR_SPIKE.md`。

打包与安装器验证：

```bash
npm run package:win
powershell -NoProfile -ExecutionPolicy Bypass -File desktop/installer-smoke.ps1
```

`desktop:collector-spike` 当前记录到 Electron 44 的 MV3 service worker 注册阻塞；它是冻结的 Option A 信息性检查，不会阻止 Windows 安装包生成。桌面版正式采用 Option B：`xhs-session.cjs` 创建 `persist:redbook-xhs` 会话，`xhs-preload.cjs` 注入现有 bridge，`electron-collector.cjs` 通过本地 API 写入 Signal/Creator Store。结构化检查由 `desktop:collector-smoke` 与 `desktop:lifecycle-smoke` 覆盖；真实登录和采集仍需人工验收。
