# Release Candidate Test Matrix

本矩阵只记录当前 Release Candidate 的工程不变量。它不替代真实小红书人工验收，也不改变 Discovery、Matching、Decision 或 Opportunity 规则。

| Invariant | Test / smoke | Automated? | Packaged? | CI? | Real XHS required? | Current result |
| --- | --- | --- | --- | --- | --- | --- |
| Server startup | `test/server-runtime.test.mjs`, `desktop:smoke` | Yes | Yes | Yes | No | PASS |
| Server shutdown | `test/process-lifecycle.test.mjs`, `desktop:smoke` | Yes | Yes | Yes | No | PASS |
| Localhost origin security | `test/cors.test.mjs` | Yes | Indirect | Yes | No | PASS |
| Electron preload boundary | `test/desktop-architecture.test.mjs` | Yes | Yes | Yes | No | PASS |
| XHS window security | `desktop:lifecycle-smoke`, `desktop:collector-smoke` | Yes (structural) | Resource included | Yes (structural) | No | PASS (STRUCTURAL) |
| Collector task persistence | `test/collector-task-store.test.mjs` | Yes | Runtime path covered | Yes | No | PASS |
| Collector cancellation | `test/collector-task-store.test.mjs`, lifecycle smoke | Yes | Structural | Yes | No | PASS |
| Collector lifecycle / destroy races | `test/window-ipc.test.mjs`, `desktop:lifecycle-smoke` | Yes | Structural | Yes | No | PASS |
| Signal persistence | `test/runtime-restart.test.mjs` | Yes | Runtime path covered | Yes | No | PASS |
| Creator persistence | `test/runtime-restart.test.mjs` | Yes | Runtime path covered | Yes | No | PASS |
| Opportunity state persistence | `test/runtime-restart.test.mjs` | Yes | Runtime path covered | Yes | No | PASS |
| Restart persistence | `desktop:smoke`, `desktop:packaged-smoke`, `test/runtime-restart.test.mjs` | Yes | Yes | Yes | No | PASS |
| Packaged runtime resources | `test/release-boundary.test.mjs`, `desktop:packaged-smoke` | Yes | Yes | Yes | No | PASS |
| Third-party license notices | package resource audit and installer smoke | Yes | Yes | Yes | No | PASS |
| Installer install | `desktop/installer-smoke.ps1` | Yes | Yes | Yes (workflow equivalent) | No | PASS |
| Installer launch | `desktop/installer-smoke.ps1` | Yes | Yes | Yes (workflow equivalent) | No | PASS |
| Installer uninstall | `desktop/installer-smoke.ps1` in isolated temp install | Yes | Yes | Yes (workflow equivalent) | No | PASS |
| XHS login persistence | Manual packaged-app test | No | Pending | No | Yes | MANUAL E2E PENDING |
| Current-page collection | Manual packaged-app test | No | Pending | No | Yes | MANUAL E2E PENDING |
| Creator collection | Manual packaged-app test | No | Pending | No | Yes | MANUAL E2E PENDING |
| 12-note baseline | Manual packaged-app test | No | Pending | No | Yes | MANUAL E2E PENDING |
| Downstream Discovery / Opportunity on real data | Manual packaged-app test | No | Pending | No | Yes | MANUAL E2E PENDING |

“PASS (STRUCTURAL)” 表示只验证了窗口、桥接、提取器和任务边界；本轮没有登录、验证码或真实平台数据，因此不得解释为 `REAL_PLATFORM_VALIDATED`。
