# Overnight Release Hardening Report

项目：Redbook Workflow（小红书 AI 内容运营工作台）  
分支：`codex/overnight-release-hardening`  
工作目录：`F:\最新工作台\redbook-workfolw-overnight`

## 1. 基线与提交

- Base SHA：`d7b6112eb859864702baac4e12a8475ee005c18e`
- Final hardening code SHA：`2bfc04464c9030c34dee11df5afbaa9a527dc347`
- 本报告随后作为独立文档提交；最终仓库 HEAD 以提交历史为准。
- Commits made：
  - `a9c639e fix: harden desktop server shutdown lifecycle`
  - `bddf8d0 fix: preserve cancelled collector task state`
  - `8d55003 fix: guard desktop renderer event delivery`
  - `2bfc044 test: cover release and task boundaries`
- Branch pushed：是，推送到 `origin/codex/overnight-release-hardening`；未推送 `main`，未 force push。

## 2. 修改文件

- `desktop/main.cjs`
- `desktop/process-lifecycle.cjs`
- `desktop/window-ipc.cjs`
- `core/tasks/collector-task-store.mjs`
- `test/process-lifecycle.test.mjs`
- `test/collector-task-store.test.mjs`
- `test/runtime-restart.test.mjs`
- `test/window-ipc.test.mjs`
- `test/release-boundary.test.mjs`
- `docs/RELEASE_RC_TEST_MATRIX.md`
- `docs/V0_1_0_RELEASE_READINESS.md`
- `OVERNIGHT_REPORT.md`

## 3. Bugs found and fixed

### Mechanical bugs fixed

1. Desktop server shutdown 在 child process 已经退出后仍等待未触发的 `exit` 事件，可能使 Electron 退出挂起。新增 settle-once、已退出检测和有界 timeout 的 `stopChildProcess`，并让 `before-quit` 复用一次 shutdown promise。
2. Collector task 的 cancel/completion race 允许迟到的 `completed` 覆盖 `cancelled`。现在 `cancelled` 是终态，状态集合也进行校验。
3. Renderer task/status event 发送只检查了 BrowserWindow，未检查已销毁的 `webContents`。新增窄化的 `sendToWindow` guard，避免 native object race。

### Test gaps filled

- child process 已退出、正常终止、终止超时；
- collector cancel/completion race、终态错误持久化、缺失/损坏 task store；
- 临时 runtime root 下各 Store 的实例 A 写入、实例 B 重启读回；
- destroyed webContents 不接收事件；
- package 文件边界与第三方声明存在性。

未发现需要修改业务算法的问题；没有触碰 Matching、Decision、Opportunity、Discovery、Outlier 规则。

## 4. 自动化验证

| Gate | Result |
| --- | --- |
| `npm ci` | PASS；冻结 lockfile 安装。npm audit 报告 1 个 high finding 及 deprecated warnings，未升级依赖。 |
| `npm test` | PASS；19 个测试文件、96 个测试，0 failed / 0 skipped。 |
| `npm run build` | PASS；Vite 6.4.2，44 modules。 |
| `npm run desktop:smoke` | PASS；startup、shutdown、restart persistence。 |
| `npm run desktop:collector-smoke` | PASS；固定 partition、bridge、extractor structural checks。 |
| `npm run desktop:lifecycle-smoke` | PASS；5 次 open/close/reopen、10 次 hidden create/destroy、pending-load destroy、app quit。 |
| `npm run package:win` | PASS；Electron 44 / electron-builder 26.15.3。 |
| `npm run desktop:packaged-smoke` | PASS；packaged startup/restart persistence。 |
| `desktop/installer-smoke.ps1` | PASS；隔离临时目录 install/launch/uninstall，安装目录已移除。 |

首次在未构建 `dist/` 时运行 `npm test` 的 server-runtime 用例失败，原因是环境前置顺序（renderer 尚未 build）；执行 `npm run build` 后完整测试通过，分类为 `ENVIRONMENT_FAILURE`，不是代码回归。

## 5. Packaging / distribution

- Installer：`Redbook-Workflow-Setup-0.1.0-x64.exe`
- 本地大小：`120,578,708` bytes
- 本地 SHA-256：`C0B56C4DD497B21FE6144AAA4D417E195C41090020719FEF535FBCAAB1218C04`
- GitHub artifact：`redbook-workflow-windows-x64`，run `33324601942`，约 `120,581,269` bytes。
- `release/win-unpacked/resources` 确认存在：`app.asar`、`vendor/beav/LICENSE`、`THIRD_PARTY_NOTICES.md`。
- asar 顶层仅含运行时目录（`core`、`desktop`、`dist`、`providers`、`server`、`vendor` 等）；未发现项目级 `data/`、`test/`、`release/`、`.env`、cookie 或凭据文件。
- `package.json` 明确排除 `data/`、`test/`、`release/`；runtime 数据仍由 userData 路径承载。
- installer smoke 使用隔离临时安装/runtime 路径，未触碰真实 `%APPDATA%` 用户数据；未证明也未设计为卸载时删除 userData。

## 6. CI

- `gh` 已登录并成功 dispatch `build-windows-x64.yml`。
- Run ID：`33324601942`
- URL：<https://github.com/18762389735-dotcom/redbook-workfolw/actions/runs/33324601942>
- Conclusion：`success`
- Windows job：`build-windows-x64` success（约 2m26s）。
- 所有 workflow steps（build、tests、package、packaged smoke、collector/lifecycle smoke、license、installer smoke、checksum、artifact upload）均 success。
- 仅有 GitHub Actions Node.js 20 deprecation annotation，归类为 `ENVIRONMENT_FAILURE` / non-blocking warning；未修改 workflow trigger。

## 7. Persistence / lifecycle / security

- Restart persistence：Signal、Creator、Opportunity state、Account、Collector Task Store 均在临时 runtime root 实例重启后读回；PASS。
- Collector cancellation：queued/running cancel、completion race、重复 cancel、terminal task、malformed/missing store 均有覆盖；PASS。未发明新的 task state。
- Shutdown/process leak：server child 已退出和 timeout 场景有界；smoke 后未发现 overnight 路径下残留 Electron/server child（仅当前审计 PowerShell 进程匹配自身命令行）；PASS。
- Localhost security：现有 CORS 回归覆盖 same-origin、Node no-Origin、evil Origin GET/POST、错误 Host、显式开发 extension Origin，且无 wildcard ACAO；PASS。
- Electron boundary：Workbench/XHS 均保持 `nodeIntegration:false`、`contextIsolation:true`、`sandbox:true`；preload 仅暴露窄接口，无 fs/path/shell/child_process/generic invoke；PASS。
- XHS page 不获得 localhost API credential/path；本轮未进行真实登录或平台请求。

## 8. Real XHS / business review boundary

以下项目今晚没有真人参与，全部保留为 `MANUAL E2E PENDING`：

- XHS login persistence；
- current-page collection；
- creator collection；
- 12-note baseline；
- 真实数据驱动的 Discovery / Outlier / Cluster / Opportunity 下游链路。

没有 `BUSINESS_REVIEW_REQUIRED` 修复项；业务算法保持冻结。上述人工验证不应被结构 smoke、fixture 或 mock 替代。

## 9. Remaining blockers and verdict

- 发布前 blocker：上述真实 XHS packaged-app 人工验收尚未完成；因此不能宣布 `V0.1.0 RELEASE PASS`、`v0.1.0 READY` 或 `REAL_XHS_E2E_PASS`。
- 已知 non-blocker：依赖 audit warning、未签名安装包可能触发 SmartScreen、Option A MV3 实验失败记录。
- 原主 worktree `F:\最新工作台\redbook-workfolw` 及其 `ci-artifact/` 未触碰。
- 当前 overnight worktree 在报告提交后应保持 clean；仅允许存在 gitignored `dist/` / `release/` / `node_modules/` 等构建产物。

最终 verdict：`OVERNIGHT_ENGINEERING_CONDITIONAL_PASS`
