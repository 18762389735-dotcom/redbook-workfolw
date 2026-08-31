# 面试项目总结：小红书 AI 内容运营工作台

## 项目定位

这是一个面向内容创作者的 Local-first AI 内容决策工作台。它不把“生成一段文字”作为唯一价值，而是把真实小红书内容转成可追溯的素材、机会判断、创作草稿和发布复盘记录。

当前项目状态是 **Interview Prototype / Local-first MVP**。已验证的核心链路为：

```text
真实小红书内容 → Material / Signal → Opportunity → Writing → Review
```

## 用户问题

内容创作者每天面对的主要成本不是打字，而是发现选题、判断投入价值、验证证据、形成内容方案，以及发布后复盘。传统写作工具往往从“请生成一篇文章”开始，无法说明为什么现在值得写、证据是否完整、是否适合当前账号。

## 产品流程

1. 用户在自己的正常浏览器会话中采集公开的小红书笔记和博主资料；
2. 浏览器扩展把结构化结果送入本地 Connector，形成 Signal、Observation 和 Creator；
3. 素材库允许用户从真实 Signal 发起 Opportunity evaluation；
4. Opportunity 展示判断状态、理由、真实引用、置信度和 missing evidence；
5. 用户把机会转成 Brief，再生成可以继续编辑的 Draft；
6. 发布不自动执行，用户人工标记 URL、发布时间和 24h / 72h 指标，形成 Review。

## 我负责的工作

- 将产品目标从单纯“采集/写作”收束为“证据驱动的内容决策”；
- 设计 Signal、Observation、Creator canonical identity 和机会证据链；
- 实现本地 Connector、SignalStore、CreatorStore、Opportunity evaluation、DraftStore、PublishRecord 和 Review persistence；
- 接通 Chrome / Chromium 扩展与本地工作台，确保真实平台数据可以进入后续业务层；
- 为稀疏证据场景补充 evidence degradation，使缺少 baseline、cluster 或账号资料时仍能得到低置信度机会，而不是白屏或直接归零；
- 通过 smoke、持久化重启测试、任务取消竞态测试和安全边界测试整理 Release Candidate 证据。

## 技术架构

### 采集层

浏览器扩展在真实 XHS 页面中观察页面已经返回的公开结构化响应，并复用 Beav 的 XHS response interception、page observer、browser collection 和 task queue 能力。采集层不读取或导出 Cookie、密码和登录凭证。

### Redbook 业务层

本项目自有的 Connector、SignalStore、CreatorStore、Observation semantics、Opportunity evaluation、evidence degradation、account matching、Writing、DraftStore、PublishRecord 和 Review 负责把平台证据变成内容决策。

### 数据边界

Signal 记录一篇笔记的当前平台事实，Observation 记录何时、通过哪个任务和语境观察到它。Opportunity 保存判断证据和用户状态，Draft 与 PublishRecord 通过 ID 连接回 Opportunity；runtime 数据放在用户数据目录，不进入安装包或 GitHub。

## 关键决策

### 从 Electron Collector 转向浏览器扩展

最初尝试过在 Electron 内嵌 XHS 页面并移植 Beav Collector。实际成本集中在 MAIN world / isolated world 通信、BrowserWindow 生命周期、MV3 兼容性和真实登录态验证。为尽快得到可用的真实数据链路，项目转向 Chrome / Edge 中原生运行 Beav Extension，再用一个很薄的 Redbook Connector 接回本地工作台。

### Capture 与 Analysis 分层

采集层只负责获得真实平台响应和任务状态，分析层只接收结构化 Signal / Creator。这样既能复用成熟采集能力，也能让机会判断和 Writing 在没有浏览器的情况下进行确定性测试。

### Evidence degradation

真实数据经常是不完整的：作者 baseline 可能不足，账号资料可能还没同步，跨作者 cluster 也可能尚未形成。系统不降低算法本身的阈值，而是把这些信息转成低 confidence 和明确 missing evidence，让用户仍然可以从素材进入机会和创作。

### Human-in-the-loop

v0.1 不自动发布，也不绕过平台安全提示。用户负责确认采集、选择 Opportunity、编辑 Draft、标记发布和录入复盘指标，系统负责保留证据和状态。

### Reuse over rewrite

通用 XHS 采集能力优先复用 Beav；Redbook 把工程投入集中在“真实平台证据 → 内容机会判断 → 可编辑创作”的差异化层，而不是重新写一套页面抓取器。

## 真人验证与已知问题

已验证的真实链路包括：单笔记采集、Creator profile、Creator baseline、canonical creator linkage、Discovery baseline、Signal → Opportunity，以及 Opportunity → Writing renderer。工程测试还覆盖了本地 Connector、任务取消竞态、重启持久化、Electron 安全边界和打包资源边界。

仍明确保留为后续工作的部分：XHS keyword / visible search batch、自动发布、账号画像历史本人笔记关联、AI profile fallback 真人 UI，以及完整真人发布与复盘验收。它们不是本次面试展示中被隐藏的“已完成”功能。

## 下一步计划

如果继续迭代，优先完成一次脱敏的完整人工发布/复盘验收，再评估搜索批量采集和账号历史内容关联。不会先扩大自动化范围，也不会在没有真实证据的情况下调低判断标准。

## 开源署名

XHS 浏览器采集层部分基于或参考 [Jamailar/Beav](https://github.com/Jamailar/Beav)。本仓库保留 `vendor/beav/LICENSE`、`THIRD_PARTY_NOTICES.md` 和 [`docs/BEAV_ATTRIBUTION.md`](BEAV_ATTRIBUTION.md)，相关代码受 MIT License – Non-Commercial Use Only 约束；Redbook 自有业务层不应被描述为 Beav 原始代码。
