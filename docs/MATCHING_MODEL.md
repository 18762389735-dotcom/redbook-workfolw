# Matching Model

Matching 回答“已经存在的平台 Signal 是否与当前账号有关”，不重新评估平台热度，也不修改 Discovery 的强度、置信度、Cluster、Outlier 或支持样本。

## 输入边界

输入仅为实时 `Discovery`、Cluster 已列出的支持 Signals、用户在 `account.json` 明确保存的 `AccountProfile` 以及注入的当前时间。Knowledge、Draft、浏览器历史、系统 Memory 和未确认个人信息均不可读取。

Candidate corpus 由 Cluster 名称、支持样本标题及每篇最多 240 字真实正文组成。Account corpus 使用定位、领域、受众、内容支柱、价值承诺和优势；弱项不增加适配。Current Context 单独使用最近状态、项目、工具、学习和目标。

## 确定性规则

Tokenizer 生成英文/数字小写词和中文二字 token，去重并删除少量明确 stop words。完整内容支柱、定位或 Current item 的直接 substring match 强于普通 token overlap，不使用 LLM、embedding 或综合分。

- Account Fit：`aligned / adjacent / not_aligned / unknown`
- Current Relevance：`supported / moderate / unsupported / unknown`
- Matching Confidence：仅 `low / medium`，且绝不提高 Platform Confidence
- Strategy Readiness：按账号上下文、内容边界、账号适配、平台置信度、当前上下文的固定优先级判断

`contentBoundaries` 只产生可见 blocker，不删除机会；`privacyConstraints` 原样透传给后续工作区，不影响平台或账号分数。相同输入产生相同 matches；只有 `run_id` 和 `generated_at` 属于运行元数据。
