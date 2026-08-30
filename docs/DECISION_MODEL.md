# Decision Model

Decision 将一条 Match 转成一条行动建议。它不重新评分 Matching，也不改变 Platform Discovery。

## 状态

- `QUALIFIED`：`strategy_readiness = ready_for_deconstruct`
- `WATCH`：存在真实账号/当前相关性，但平台置信度仍低，需要继续观察
- `HOLD`：存在具体 blocker、账号不适配或明确缺少当前上下文
- `INSUFFICIENT_EVIDENCE`：账号资料不足或无法形成稳定判断
- `NO_MATCHABLE_SIGNAL`：保留为未来无可匹配信号的显式语义；当前无 Cluster 时 API 返回空 decisions/opportunities

本版本将 `missing_account_context` 固定映射为 `INSUFFICIENT_EVIDENCE`；`missing_current_context` 固定映射为 `HOLD`。每条 Decision 完整保留 supporting sample IDs、reasons、missing evidence、limitations、privacy constraints 和 next step。

## Opportunity 与人工选择

Opportunity 只是 Decision 的可读 View Model，加上按 `clusterId` 存储的用户状态，不重新计算任何分数。WATCH/HOLD 仍可由用户选择；此时 `selectedDecisionSnapshot` 保存原始 Decision status，并写入 `manualOverride = true`。这表示用户越过建议，而不是系统把 WATCH/HOLD 篡改成 QUALIFIED。
