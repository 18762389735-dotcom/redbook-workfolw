# 小红书采集助手（Redbook Workflow working copy）

这是 Redbook Workflow 对 Beav `Plugin/src` 的完整浏览器工作副本，用于
Chrome / Edge 的真实小红书采集验证。它保留 Beav 的页面识别、提取、队列和
低频节奏；Redbook-owned connector 只负责把已结构化的 note / creator payload
发送到工作台本机的 loopback API。

## 加载

1. 先启动 Redbook Workflow（开发时 `npm run desktop`，或使用已安装应用）。
2. 打开 Chrome/Edge 扩展管理页并开启开发者模式。
3. 选择本目录下的 `src`：`extension/beav-redbook/src`。
4. 在小红书页面点击浏览器扩展图标，使用弹窗或侧边栏中的采集操作。

## 正式连接

工作台提供固定 loopback connector：`http://127.0.0.1:43127`。note、creator
和主页笔记批量结果通过该连接器进入 Signal / Creator Store。连接器不可用时
会明确提示“工作台未启动”，不会切换到 Beav Desktop / Knowledge 作为隐藏后端。

## 安全与边界

- 只采集当前页面已经返回的公开内容。
- 不读取或保存 Cookie、密码、登录 localStorage 或 token。
- 不自动登录、不绕验证码/风控、不自动发布或高频抓取。
- 平台安全确认仍需用户主动确认；没有确认不会执行 XHS 保存动作。
- 上游更新检查默认关闭；发布由 Redbook Workflow 安装包负责。

完整 donor 来源、许可证和修改边界见 [`REDBOOK_FORK.md`](REDBOOK_FORK.md)、
[`docs/BEAV_ATTRIBUTION.md`](../../docs/BEAV_ATTRIBUTION.md) 与仓库根目录
[`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md)。
