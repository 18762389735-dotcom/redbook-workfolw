# 精简 Beav-derived 小红书 Collector

在 Chrome 的 `chrome://extensions` 打开开发者模式，选择“加载已解压的扩展程序”，并选择本目录。代码更新后先在扩展页点击“重新加载”。启动本地工作台，然后在已登录的 Chrome 中访问并刷新小红书/RedNote 公开页面。

- “采集当前页”：采集页面已经加载的公开笔记；真实搜索页会保存 URL 中的 keyword。
- “采集当前博主”：仅在 `/user/profile/...` 博主页采集公开 Creator Snapshot。
- “采集近期笔记基线”：仅在博主页启用，默认 12、最大 20，逐篇详情间隔 3–6 秒。任务保存在 `chrome.storage.local`，关闭 popup 不会清掉状态，可重新打开查看进度或取消。

它只旁路读取页面已经返回的公开响应，不读取、导出或存储 Cookie、密码；不做高频抓取、验证码绕过或发布。若页面没有被桥接观察到的笔记，扩展会失败并明确提示，绝不发送演示数据。开发期 unpacked extension 不是最终交付体验，桌面打包路线见 `docs/DESKTOP_DISTRIBUTION.md`。

来源与许可证见 `docs/BEAV_ATTRIBUTION.md`。
