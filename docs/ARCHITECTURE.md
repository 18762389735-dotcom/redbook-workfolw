# 架构

当前系统保持四层分离：`apps/web` 是 React/Vite renderer，`server` 只装配本地 HTTP，`core` 保存与 Shell 无关的业务规则和 Store，`providers` 负责把 XHS/Collector 原始字段归一化。`vendor/beav/xhs-collector` 是开发期真实采集入口，不属于业务层。

```text
XHS 公开页面（正常登录会话）
  → Beav-derived xhsBridge / extractors
  → Chrome 本地持久化采集任务（queued/running/completed/partial/failed/cancelled）
  ├→ POST /api/creators/ingest → CreatorStore
  └→ POST /api/signals/ingest  → SignalStore
                                  ↓
                 GET /api/discovery（即时纯函数构建）
                                  ↓
                       发现页证据查看器
```

## 持久化边界

- `SignalStore(filePath)` 与 `CreatorStore(filePath)` 都由调用方注入完整路径，Core 不认识仓库目录、React 或浏览器生命周期。
- 开发环境默认使用 `data/signals.json` 与 `data/creators.json`，均不进入 Git。
- `server/index.mjs` 支持 `REDBOOK_RUNTIME_ROOT`。未来 Electron main process 应传入 `app.getPath('userData')`，使安装、升级与源码目录完全解耦。
- Signal 与 Creator 使用独立文件；禁止回到单体 `workspace.json`。

## 采集边界

可见笔记只保存 API、当前页面 URL 或真实 DOM anchor 中观察到的链接；搜索 keyword 只来自真实 `/search_result?keyword=...` URL。Creator Profile 只接受实际 `/user/profile/...` 页面 URL。近期基线默认 12、最大 20，逐篇 detail 间隔 3–6 秒，可取消，任务状态保存在 `chrome.storage.local`，关闭 popup 不会丢失。

扩展不读取、导出或保存 Cookie/密码，不绕过验证码或风控。上游涉及手工读取 Cookie/请求签名的路径没有复制。

## Discovery 边界

`core/discovery` 只接收 Signals、Creator Snapshots 和可注入的 `now`。它不知道账号定位、个人偏好、知识库、材料或项目，所以相同平台数据必然产生相同平台结果。输出不是 Opportunity；Matching、Decision、LLM 和 Writing 均不在本批次。

## 桌面目标

React/Vite 只是未来 Electron 的 renderer，不是最终分发形态。预留 `desktop/` 作为正式 App Shell；当前不提前实现 Electron。打包路线与数据迁移约束见 `DESKTOP_DISTRIBUTION.md`。
