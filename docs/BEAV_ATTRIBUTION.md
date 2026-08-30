# Beav 代码署名与许可证

本项目不是 Beav，也没有复制 Beav Desktop UI、Official Auth、Payment、云服务、RedClaw、Video、Ecommerce 或 Cover Studio 等模块。

上游仓库：[Jamailar/Beav](https://github.com/Jamailar/Beav)

Copied upstream file:

- `Plugin/src/xhsBridge.js` → `vendor/beav/xhs-collector/xhsBridge.js`

该文件用于在网页主世界旁路记录已经成功返回的小红书/RedNote JSON 响应；本项目仅增加了 attribution 文件头，未删除原作者版权或许可信息。

Local derived/new files:

- `vendor/beav/xhs-collector/beavExtractors.js`
- `vendor/beav/xhs-collector/background.js`
- `vendor/beav/xhs-collector/popup.html`
- `vendor/beav/xhs-collector/popup.js`
- `vendor/beav/xhs-collector/manifest.json`

`beavExtractors.js` 高度派生自上游 `Plugin/src/background.js` 中的 `extractXhsBloggerPayload` 与 `extractXhsBloggerNotesPayload`，并复用了 Blogger Notes 的 API/RPA fallback、DOM note links、INITIAL_STATE 和 `user_posted` 观察思路。`extractObservedNoteFeed` 仅派生自 `extractXhsNoteFeedByUrlFromCurrentPage` 的安全 `readFeedFromStore` 部分，用于等待页面自身已经发出且被 xhsBridge 观察到的 `/feed` 响应。本地修改包括：默认 12 / 最大 20 条、unknown 指标保留 `null`、只保留所需字段、移除 Desktop/RedClaw 连接。上游涉及手工读取 Cookie、localStorage 与请求签名的直接 feed 请求路径没有复制。

`background.js`、`popup.*` 与 `manifest.json` 是本项目新写的 adapter、持久化任务状态和最小扩展界面，不应被描述为 Beav 原始代码。

上游 LICENSE 原文已从用户提供的本地 `Beav-main.zip` 不加修改地复制到 `vendor/beav/LICENSE`。该许可证标为“MIT License – Non-Commercial Use Only”；使用、分发或商业化前须遵守其正文并取得所需许可。
