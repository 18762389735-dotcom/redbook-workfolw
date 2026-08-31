# Desktop XHS Collector

Batch 04.1 的桌面采集采用 Option B：Electron 专用 Xiaohongshu BrowserWindow + 现有 `xhsBridge` + Beav-derived extractors + Electron Collector Service。

## 为什么不继续 Option A

Electron 44 可以接受扩展目录并识别 MV3，但兼容性 spike 观察到 background service worker registration failed（status code 2），因此扩展只能作为开发 fallback。项目不修改 MV3→MV2，不 monkey patch Electron，也不降低安全配置。

## 会话与数据流

```text
Workbench Renderer
  └─ narrow contextBridge IPC
Electron Main
  ├─ BrowserWindow(partition: persist:redbook-xhs)
  │    └─ xhs-preload → page main world: vendor/beav/xhs-collector/xhsBridge.js
  ├─ Electron Collector Service
  │    └─ shared extractors / collector payload helpers
  └─ Node fetch → 127.0.0.1:<random>/api/*
       └─ Signal / Creator Store → Discovery / Opportunity
```

XHS BrowserWindow 使用 `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`。页面只能产生和被读取公开响应；页面 JS 不接触 localhost API。Electron 不读取、导出或保存 Cookie、密码、localStorage 登录凭证，用户在应用内正常登录一次即可依赖 Chromium 的 persistent partition 保持会话。

## 操作与任务

发现页的桌面版控件支持：打开小红书、采集当前页、采集当前博主、采集近期基线。任务写入注入 runtime root 下的 `collector-tasks.json`，状态为 `queued`、`running`、`completed`、`partial`、`failed` 或 `cancelled`。基线默认 12 条、最多 20 条，详情窗口严格串行，间隔 3–6 秒；取消只阻止下一篇，已经 ingest 的真实数据不回滚。

所有采集结果先经过统一 Signal/Creator normalizer，再由 Main process POST 本地 API。重复 note 只保留一个 Signal，并在 observations 中保留不同 provider/task 的 provenance。采集失败、登录失效、验证码或风控会直接显示错误，不生成演示数据。

## 安全边界

- Workbench 与 XHS 窗口均使用窄 preload IPC，不暴露 `fs`、`path`、`shell`、`child_process` 或 generic invoke。
- 生产 localhost API 不返回 wildcard CORS；Electron Main 的无 Origin 请求无需 CORS。Chrome fallback 只有显式配置的 extension origin 才能跨域。
- 不实现自动登录、自动发布、自动点赞/关注、验证码绕过或高频抓取。
- 关闭/销毁窗口时使用 settle-once 生命周期 helper，延迟 load、closed、timeout 回调不得访问 destroyed Electron object。

## 开发与分发

开发时可以继续运行 `npm run desktop` 或加载 `vendor/beav/xhs-collector` 的 unpacked extension。正式 NSIS 安装包将把 `xhsBridge.js`、extractors、collector helpers 与 `vendor/beav/LICENSE` 一并打包；普通用户不应需要安装 Node/npm 或手动开启 Chrome developer mode。

真实 XHS 登录与采集只能在本地人工进行，CI 只执行 structural smoke，不伪造平台数据。

### Native Beav real-E2E fallback (current validation path)

由于 Electron 44 的 MV3 service worker 兼容性仍属于冻结实验，真实平台验证不再
依赖 Electron 内嵌采集器。启动 Workbench 后，在 Chrome/Edge 加载
`extension/beav-redbook/src`，原生 Beav background 将已提取的 XHS payload 通过
`http://127.0.0.1:43127` 发送到本地 Connector。Connector 仅作传输/适配边界，
不重写 donor 的页面识别、提取、队列或节奏；Electron Collector 代码继续保留为
experimental fallback。
