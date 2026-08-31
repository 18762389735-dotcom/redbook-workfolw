# 小红书 AI 内容运营工作台

本地、人工可控的小红书内容运营工作台。当前已包含真实 Signal 采集基础、账号/机会基础数据、Electron Windows 桌面壳与安装包流水线；没有 LLM 自动分析、自动写作、自动发布或图片生成。

当前版本包含受 Beav 非商业许可证约束的派生 Collector 组件，公开 binary 仅用于非商业使用。请阅读 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)、[`docs/BEAV_ATTRIBUTION.md`](docs/BEAV_ATTRIBUTION.md) 与随安装包分发的 `vendor/beav/LICENSE`。未来商业化需要取得 Beav 作者商业许可，或重写所有受限制的派生 Collector 代码。

## 普通用户

从 GitHub Releases 下载 `Redbook-Workflow-Setup-*-x64.exe`，安装后直接双击“Redbook Workflow”。应用会把用户数据保存到 Windows 的 Electron `userData` 目录（通常位于 `%APPDATA%\Redbook Workflow`），升级或重新安装不会清空这些数据。当前安装包未做代码签名，Windows SmartScreen 可能显示额外提示。

## 开发者启动

需要 Node.js 20+：

```bash
npm install
npm run dev
```

打开 `http://localhost:5173`（仅 Web 开发预览）。进行今天的真实采集验证时，请先启动桌面壳（已安装 EXE 或 `npm run desktop`），再在 Chrome 的“加载已解压的扩展程序”中选择完整原生 Beav working copy 的 manifest 目录：
`extension/beav-redbook/src`。桌面壳必须先启动，它会在
`http://127.0.0.1:43127` 提供 Redbook loopback connector；扩展将 Beav 已提取的 note/creator payload
发送到该 connector，再进入 Signal/Creator Store。Electron 内嵌 Collector 仍是 experimental fallback，
不作为今天的真实平台验收路径。实际采集数据保存为本机 `data/signals.json`，刷新页面后仍会存在。

桌面壳开发与本地验证：

```bash
npm run desktop
npm run desktop:smoke
npm run desktop:collector-spike
npm run desktop:collector-smoke
npm run desktop:lifecycle-smoke
```

## 验证

```bash
npm test
npm run build
npm run package:win
npm run desktop:packaged-smoke
powershell -ExecutionPolicy Bypass -File desktop/installer-smoke.ps1
```

GitHub Actions 会在 Windows runner 上重复这些检查，并在 Release 中上传 NSIS 安装包、SHA256 校验文件和 smoke evidence。

## 边界

只能采集当前页面已经加载的公开响应，默认低频人工触发。它不读取/保存登录凭据，不绕过验证码或风控。字段未知时以“暂无”显示，绝不用 fixture 冒充平台数据。
