# Token Speed Studio 1.0.0

公开网页：https://token-speed-studio.cansiny0320.chatgpt.site

新增共享的网页与桌面测速工作台，支持本机已登录的 ChatGPT 订阅账号（Codex app-server）、OpenAI Chat Completions 和 Anthropic Messages。网页通过配对码及桌面确认连接本机软件；桌面端可以独立使用。

- 实时文本、TTFT、TPS 曲线、服务端用量、多轮统计和本地历史。
- JSON / CSV / HTML 报告导出及 Studio JSON 报告导入。
- Codex CLI 入口：`--provider codex`，支持模型、推理强度、超时及可执行文件路径。
- 每轮隔离 Codex 会话并禁用工具，支持取消；失败或取消轮次不进入汇总。

## 安装包

| 系统 | 文件 |
| --- | --- |
| macOS Apple Silicon | `Token-Speed-Studio-1.0.0-mac-arm64.dmg` 或 `.zip` |
| macOS Intel | `Token-Speed-Studio-1.0.0-mac-x64.dmg` 或 `.zip` |
| Windows x64 | `Token-Speed-Studio-1.0.0-win-x64.exe` |
| Linux x64 | `Token-Speed-Studio-1.0.0-linux-x86_64.AppImage` 或 `Token-Speed-Studio-1.0.0-linux-amd64.deb` |

`SHA256SUMS.txt` 提供文件校验。首版未签名或公证。Codex 测试前需安装 Codex CLI 并使用 ChatGPT 账号执行 `codex login`；软件内支持手动选择 Codex 路径。

## 验证与限制

- 215 项自动化测试通过；lint、TypeScript 检查、CLI / 网页 / 桌面构建通过。
- macOS Apple Silicon 打包应用已完成真实 Codex 测速；CLI 也完成真实调用与 JSON 报告生成。
- Chrome 已通过公开网页配对、读取本机状态并发起真实 Codex 测速；本次内置浏览器连接超时，可改用 Chrome 或桌面端。
- macOS Intel、Windows、Linux 安装包已生成，但尚未进行对应系统的实机安装运行验证。
- 文本 token 和 TPS 曲线是本地估算；服务端用量独立记录，不把推理 token 计入可见输出。不同版本、提示词和推理强度的结果不宜直接比较。
- 浏览器需允许访问本机网络。不支持该能力时，请使用桌面端。
