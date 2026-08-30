# Platform Discovery 模型

## 证据对象

**Signal** 是一条归一化的小红书公开笔记事实。正常发现笔记与 Creator Baseline 共用同一 Schema；后者只通过 `source.method = "creator-baseline"` 标识采集用途。

**Creator Snapshot** 是某次从真实博主页取得的作者公开资料快照，包括 userId、profileUrl 与可观察指标。缺失字段保持 `null`，不以 0 代替 unknown。

**Creator Baseline** 是同一 authorId 的近期公开笔记集合。Outlier 计算会排除目标笔记，只使用点赞为有限数字的样本；至少 3 篇才足以判断。

## Outlier

第一版使用透明规则：

```text
medianLikes = median(valid recent baseline likes)
ratio = targetLikes / max(medianLikes, 10)
```

- 有效基线不少于 3 且 ratio ≥ 5：`observed`
- 有效基线不少于 3 且 ratio < 5：`not_observed`
- 目标点赞缺失或有效基线少于 3：`insufficient`

粉丝数只提供证据完整度上下文，不是异常判断前置条件。粉丝未知时仍可得到 `observed`，但 confidence 降为 `low`。

## 时间层

以传入的 `now` 计算：发布时间距今不超过 30 天为 `current`，超过 30 天为 `reference`，缺失或无法可信计算为 `unknown`。unknown 不会被归入 reference。

## Signal Cluster

目前只有两种可解释来源：

- Search Context Cluster：按真实 `source.keyword` 分组，仅说明同一次搜索语境中出现这些样本。
- Independent-author title overlap：标题二字共现，至少 3 位独立作者；3 位为 low，4 位及以上最多 medium。

Cluster 始终保留 supporting signal IDs、current/reference/unknown 分层、独立作者数、已观察 outlier、缺失证据、限制和建议补证动作。第一版不输出 high confidence、strong signal 或加权总分。

## Confidence 与 missing evidence

Confidence 表示现有平台证据的完整程度，不表示“值得写”。`missingEvidence` 会明确列出缺 Creator Snapshot、粉丝、目标点赞、至少 3 条作者基线、当前时间样本、独立作者或 observed outlier 等缺口，方便用户人工补采。

## 与 Matching 的边界

Discovery 是纯平台证据层，固定输出：

```text
account_fit_status = "not_evaluated"
personal_fit_status = "not_evaluated"
```

它不读取我的账号定位、偏好、状态、材料、知识库、项目或职业信息，也不判断可写性。未来只有 Matching 才能把平台证据与个人上下文连接；Decision 和 Opportunity 必须位于 Matching 之后。
