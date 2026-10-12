# Token Speed Studio：已批准设计

2026-10-12 用户批准 Sites 公开网页、桌面端和本机 Codex 订阅账号测速；补充 Linux 支持，要求保护另一个会话正在优化的代码。

## 产品与边界

- Sites 公开网页免登录可访问；连接本机软件并在本机确认配对后执行测速。未连接时可浏览、导入报告和查看下载入口。
- Electron 软件复用网页界面，支持 macOS arm64/x64、Windows x64、Linux x64，首版未签名。软件独立使用无需网站在线。
- Codex 使用本机已登录的 `codex app-server`（stdio JSON-RPC），不上传或复制登录凭证。检查 ChatGPT 账号、动态列模型，每轮独立临时会话。
- 保留 OpenAI Chat Completions、Anthropic Messages 和原有 CLI，增加 Codex CLI 模式。
- 配置模型、推理强度、提示词、重复次数、超时；Codex 不声称支持 API 的 max_tokens 硬上限。
- 本地服务仅监听 127.0.0.1。精确校验 Origin、Host，使用短期配对码、桌面确认和会话令牌；不把原始 app-server 或任意执行命令暴露给网站。
- 软件内的本地 UI 使用隔离的 preload 接口；禁用 renderer Node.js。网页与桌面以固定的测速操作交互。
- 报告和历史保存在本地，不包含 API Key、配对令牌、账号邮箱或 Codex 凭证。允许 JSON/CSV/HTML 导出。

## 指标合同

所有时间来自本地单调时钟，网页传输/渲染不参与计时。初始化耗时与请求耗时分开。

- TTFT：提交该轮 turn/API 请求到首段可见文本；没有文本时 null。
- 最终 Token 用量：保留服务端 input、cached input、output、reasoning 字段和来源；缺少 usage 时使用完整可见文本分词估算。
- 可见输出估计与推理用量分开；实时 TPS、峰值、分块到达时间明确标为估算，不能当作逐 token 服务端时间。
- 完成后对完整文本统一分词，把 token 映射到其最后字节所在的分块；避免分块边界改变总数。
- 总耗时、含等待的平均输出速度、纯输出阶段速度分别标注。仅成功样本参与多轮汇总；失败/中断保留结果和原因。
- 每轮记录模型、推理强度、运行版本、实际用量、状态，便于复现。纯文本基准禁用本地工具、MCP、插件和 hooks；出现工具事件中止该轮。

## 架构与协作

新增 `src/studio/`（协议、Codex、运行器、配对服务）、`apps/site/`（React + Vite 静态网页）、`apps/desktop/`（Electron 壳）。现有 metrics/tokenizer 优先复用；另一个会话完成后才串行修改 CLI/client/config 的连接点。

Sites 仅发布前端静态资源，Codex/API 调用在访问者本机。公开网页需要浏览器允许访问本机网络；不支持或拒绝时提示使用桌面界面。Sites 发布使用独立临时源码仓库，避免把主仓其他会话改动纳入提交。

## 压力测试结论

- 不依赖浏览器 CORS 直接调用各家模型 API；统一由配对后的本机执行。
- 网站刷新可重新读取运行状态；断线不重复提交；主动取消、超时和软件退出均清理自己启动的子进程。
- 不读取已有 Codex 会话；临时目录/新会话避免项目提示词干扰。版本/登录/模型不兼容提供具体错误。
- 浏览器拒绝本地连接、配对过期、错误 Origin、失效令牌、端口冲突、Codex 缺失/退出/限流都进入可恢复错误状态。
- Mac 可本机验证；Windows/Linux 的安装与运行须按实际环境报告，不以构建配置代替验收。签名证书未提供，首版保留未签名状态。

## 参考

- https://learn.chatgpt.com/docs/app-server
- https://www.electronjs.org/docs/latest/tutorial/security
- https://developer.chrome.com/blog/local-network-access
