# 小红书 AI 内容运营工作台（Batch 01）

本地、人工可控的小红书公开内容采集基础。当前只做真实 Signal 的采集、独立持久化和“发现”展示；没有 Agent 分析、机会生成、自动写作、自动发布或图片生成。

## 启动

需要 Node.js 20+：

```bash
npm install
npm run dev
```

打开 `http://localhost:5173`。接着按 [`vendor/beav/xhs-collector/README.md`](vendor/beav/xhs-collector/README.md) 加载精简 Chrome 扩展。实际采集数据保存为本机 `data/signals.json`，刷新页面后仍会存在。

## 验证

```bash
npm test
npm run build
```

## 边界

只能采集当前页面已经加载的公开响应，默认低频人工触发。它不读取/保存登录凭据，不绕过验证码或风控。字段未知时以“暂无”显示，绝不用 fixture 冒充平台数据。
