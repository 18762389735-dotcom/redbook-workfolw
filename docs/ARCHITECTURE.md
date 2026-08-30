# Batch 01 架构

本批次只实现“真实公开内容 → Signal Store → 发现页”。`apps/web` 是 Vite React 界面；`server/index.mjs` 仅负责 HTTP 装配；`core/signals` 负责 Schema、持久化和 ingest；`providers/xiaohongshu/normalize.mjs` 是唯一允许认识 XHS/Beav 原始字段的适配边界；`vendor/beav/xhs-collector` 是可独立加载的 Chrome 扩展。

```text
小红书公开页面（用户自己的正常登录态）
  → Beav xhsBridge 旁路观察已返回响应
  → 精简 Collector 人工任务队列
  → POST /api/signals/ingest
  → normalizeXiaohongshuSignal
  → data/signals.json（按 noteId upsert）
  → GET /api/signals → 发现页
```

`data/signals.json` 是独立的运行时数据，不属于旧项目的 `.data/workspace.json`，也不进入 Git。没有页面轮询 Agent Job；采集和其余页面互不阻塞。任务失败不会保存数据。小博主候选筛选是透明的 UI 筛选：已知粉丝数不超过 10,000 且已知赞/藏/评之和至少 100；缺失字段不进入该筛选。

后续 Batch 才可实现 Signals 之上的 Discovery、Matching、Decision、Opportunities、知识编辑与写作持久化。
