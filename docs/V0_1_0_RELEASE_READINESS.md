# v0.1.0 Release Readiness Audit

本文件是工程审计，不是 Release 宣布。真实小红书人工验收完成前，不得声称 v0.1.0 ready。

## AUTOMATED PASS

- `npm ci` 在冻结 lockfile 下完成。
- `npm test`、`npm run build` 通过。
- Desktop startup/shutdown、collector structural smoke、lifecycle smoke 通过。
- 临时 runtime root 的 Signal、Creator、Opportunity state、Account 和 Collector Task Store 重启读回通过。
- Collector cancellation/completion race、destroyed window IPC guard 和 malformed task state 回归测试通过。
- Production localhost origin 拒绝、Node no-Origin、显式开发扩展 Origin 和无 wildcard CORS 回归通过。
- Windows NSIS package、packaged smoke、隔离目录 installer install/launch/uninstall smoke 通过。
- package boundary 排除了 `data/`、`test/`、`release/`，并携带 Beav LICENSE 与 `THIRD_PARTY_NOTICES.md`。

## MANUAL PENDING

以下项目必须由明天有人在 packaged/installed Desktop App 中完成：

- 小红书专用 session 的正常登录、关闭应用后重新打开的登录态持久化。
- 当前页真实公开内容采集并进入 Signal Store。
- 当前博主采集及真实 `profileUrl`。
- 12 条近期基线的低频执行、取消、失败提示和最终 ingest。
- 真实数据驱动的 Discovery / Outlier / Cluster 及 Opportunity 下游复核。

本轮无人值守，未执行扫码、密码输入、验证码、风控处理或真人浏览；以上均为 `MANUAL E2E PENDING`，不是模拟通过。

## KNOWN NON-BLOCKER

- `npm ci` 报告依赖树存在 1 个 high severity audit finding 及若干 deprecated warning；未在本轮升级依赖。
- Electron Option A 的 MV3 service worker 失败仍保留为冻结实验记录；正式路线为 Option B，不尝试修活 Option A。
- Windows 安装包未签名时可能出现 SmartScreen 提示；签名不属于本轮范围。

## BLOCKER

- 真实 XHS 登录持久化、当前页/博主/基线采集和真实数据下游链路仍待人工验证。因此当前不能宣布 `v0.1.0 READY` 或 `REAL_XHS_E2E_PASS`。
- 若 GitHub Windows workflow 无法由当前环境 dispatch 或未完成，则远端 CI 证据仍是发布前置条件。

工程自动化条件全部通过时，最多只能称为 `ENGINEERING PRECONDITIONS PASS`；总体发布结论仍取决于上述人工项目。
