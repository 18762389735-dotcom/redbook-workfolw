# Beav 代码署名与许可证

本项目不是 Beav，也没有复制 Beav Desktop UI、Official Auth、Payment、云服务、RedClaw、Video、Ecommerce 或 Cover Studio 等模块。

上游仓库：[Jamailar/Beav](https://github.com/Jamailar/Beav)

Copied upstream file:

- `Plugin/src/xhsBridge.js` → `vendor/beav/xhs-collector/xhsBridge.js`

该文件用于在网页主世界旁路记录已经成功返回的小红书/RedNote JSON 响应；本项目仅增加了 attribution 文件头，未删除原作者版权或许可信息。

Local derived/new files:

- `vendor/beav/xhs-collector/background.js`
- `vendor/beav/xhs-collector/popup.html`
- `vendor/beav/xhs-collector/popup.js`
- `vendor/beav/xhs-collector/manifest.json`

以上 adapter、手工任务队列和最小扩展界面由本项目编写，不应被描述为 Beav 原始代码。

上游 LICENSE 原文已从用户提供的本地 `Beav-main.zip` 不加修改地复制到 `vendor/beav/LICENSE`。该许可证标为“MIT License – Non-Commercial Use Only”；使用、分发或商业化前须遵守其正文并取得所需许可。
