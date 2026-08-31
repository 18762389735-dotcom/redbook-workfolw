# Beav 代码署名与许可证

本项目不是 Beav，也没有复制 Beav Desktop UI、Official Auth、Payment、云服务、RedClaw、Video、Ecommerce 或 Cover Studio 等模块。

上游仓库：[Jamailar/Beav](https://github.com/Jamailar/Beav)

Copied upstream file:

- `Plugin/src/xhsBridge.js` → `vendor/beav/xhs-collector/xhsBridge.js`

该文件用于在网页主世界旁路记录已经成功返回的小红书/RedNote JSON 响应；本项目仅增加了 attribution 文件头，未删除原作者版权或许可信息。

Local derived/new files (written for this project, not copied as Beav originals):

- `vendor/beav/xhs-collector/background.js`
- `vendor/beav/xhs-collector/popup.html`
- `vendor/beav/xhs-collector/popup.js`
- `vendor/beav/xhs-collector/manifest.json`
- `vendor/beav/xhs-collector/collector-payload.js`

`vendor/beav/xhs-collector/beavExtractors.js` is highly derived extractor logic and is documented separately from the thin adapter files above.

`collector-payload.js` 是本项目新增的纯 payload helper，供 Chrome fallback 与 Electron Collector 共用；它不是 Beav 原始文件。

本批次的 page-resident vertical slice 位于 `vendor/beav/plugin-xhs/`：`xhsBridge.js`、`pageObserver.js`、`pageRouteBridge.js`、`captureRuntime.js` 与 `THIRD_PARTY_NOTICES.txt` 是与 donor 字节一致的复制文件，具体 SHA-256 见 `vendor/beav/plugin-xhs/SOURCE_MANIFEST.json`。`reference/background.js` 仅为只读 donor snapshot，不进入 runtime 或安装包。

`vendor/beav/plugin-xhs/background-xhs-derived.js` 仅定向抽取 donor `Plugin/src/background.js` 的 `extractXhsNotePayload` 与 `extractXhsBloggerPayload` 函数；`redbook-payload-adapter.js`、`desktop/beav-extension-adapter.cjs` 及 Electron 接线是本项目新写的薄 adapter，不是 Beav 原始文件。

`beavExtractors.js` 高度派生自上游 `Plugin/src/background.js` 中的 `extractXhsBloggerPayload` 与 `extractXhsBloggerNotesPayload`，并复用了 Blogger Notes 的 API/RPA fallback、DOM note links、INITIAL_STATE 和 `user_posted` 观察思路。`extractObservedNoteFeed` 仅派生自 `extractXhsNoteFeedByUrlFromCurrentPage` 的安全 `readFeedFromStore` 部分，用于等待页面自身已经发出且被 xhsBridge 观察到的 `/feed` 响应。本地修改包括：默认 12 / 最大 20 条、unknown 指标保留 `null`、只保留所需字段、移除 Desktop/RedClaw 连接。上游涉及手工读取 Cookie、localStorage 与请求签名的直接 feed 请求路径没有复制。

`background.js`、`popup.*` 与 `manifest.json` 是本项目新写的 adapter、持久化任务状态和最小扩展界面，不应被描述为 Beav 原始代码。

本轮新增的 `extension/beav-redbook/` 是从本地 donor `Plugin/` 完整复制的
Redbook-owned Chrome working copy。复制的原始文件保留在其原相对目录，
并保留 `src/THIRD_PARTY_NOTICES.txt`；`REDBOOK_FORK.md` 记录了 donor 快照、
许可证和修改边界。新增的 `src/redbookConnector.js` 以及复制版
`src/background.js` 中的转发调用属于 Redbook 代码，只负责把 donor 已生成
的 note/creator payload 发送到本机 connector，不重新解析 XHS 页面。
working copy 仅打开了 donor `pageObserver.js` 已有的
`ACCOUNT_BINDING_FEATURE_ENABLED` 开关，以显示原生“保存博主”控件；这不是新的
身份识别或页面提取逻辑，donor 原文件本身未修改。

上游 LICENSE 原文已从用户提供的本地 `Beav-main.zip` 不加修改地复制到 `vendor/beav/LICENSE`。该许可证标为“MIT License – Non-Commercial Use Only”；使用、分发或商业化前须遵守其正文并取得所需许可。
