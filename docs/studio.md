# Token Speed Studio

公开网页：<https://token-speed-studio.cansiny0320.chatgpt.site>。网页连接本机桌面软件后测速，桌面软件也可独立使用。安装包与校验文件：<https://github.com/Cansiny0320/token-speed-tester/releases/tag/desktop-v1.0.0>。

## 使用

1. 安装适合当前系统的 Token Speed Studio。支持 macOS Apple Silicon / Intel、Windows x64、Linux x64。首版未签名；Windows / Linux 的实机验证状态见发布说明。
2. 安装 Codex CLI，运行 `codex login`，使用 ChatGPT 订阅账号登录。软件自动查找 Codex；找不到或版本过旧时，在软件中选择最新可执行文件。主动测速使用独立临时会话，登录凭证留在本机。
3. 在桌面端直接选择模型、推理强度、提示词、次数和超时，开始测速。API 模式使用 OpenAI Chat Completions 或 Anthropic Messages，API Key 仅保留在当前运行会话。
4. 如需网页操作：点击软件右上角「本机运行」，将配对码和端口填入网页，再在软件中确认该网站来源。允许浏览器访问本地网络。配对码 5 分钟有效，连接令牌 8 小时有效，只允许绑定的网站使用；退出软件会使连接失效。
5. 可导出 JSON、CSV、HTML；JSON 可以重新导入网页。浏览器仅在本机保留最近 6 份报告。失败或取消的轮次不进入汇总。

网站打不开、浏览器不支持本地网络访问或拒绝权限时，可直接使用桌面端。端口被占用时软件会选择空闲端口，请使用软件显示的实际端口。

## CLI

原有 API 命令保持兼容。Codex 模式不需要 `--api-key`：

```sh
pnpm build
node dist/index.mjs --provider codex --runs 1 --effort low --timeout 120000 --output-format terminal
node dist/index.mjs --provider codex --model gpt-5.2-codex --codex-path /path/to/codex --output-format json --output codex-report.json
```

上面显式模型仅为参数示例，请选用本机账号当前可用的模型。省略 `--model` 使用本机 Codex 配置模型。`--max-tokens` 只对 API 模式生效，Codex 使用提示词控制输出长度，并由 `--timeout` 限制单轮耗时。`Ctrl+C` 取消当前轮并退出，不会把部分结果作为成功结果。

## 指标

- 初始化耗时包含本地进程启动、握手和会话准备，不计入 TTFT。
- TTFT 从请求发出到第一段可见文本，不把推理过程算作可见输出。没有可见文本时网页显示不可用。
- 平均输出速度包含首字等待，使用服务端 output 减已报告 reasoning；缺少服务端用量时，使用完整可见文本的本地分词估算。来源在指标和导出中分别标明。
- 「首批后速度」使用首段至末段文本的时长，分子仅统计首批之后到达的本地估算 token，同一到达时间的整批 token 一起排除。
- 只有完整消息、没有流式 delta 时，文本和服务端用量仍可查看，TTFT、曲线和峰值显示不可用；旧 CLI 报告拒绝这种缺少流式计时的样本。
- 模型解析后再选择分词器；报告记录编码以及模型映射/回退来源。未知模型沿用 `cl100k_base` 统一估算，不将其声明为模型的真实编码。
- TPS 曲线和峰值使用本地分词与流式分块到达时间，均为估算，不代表服务端逐 token 生成时刻。实时预览使用轻量估算，完成后用统一分词结果校正。
- 每轮新建临时 Codex 会话，禁用工具、MCP、插件和 hooks；尝试工具调用会让该轮失败。测速可能消耗订阅额度。
- Studio JSON 保存运行状态、实际模型、推理强度、运行版本、服务档位、分词/计时来源和原始用量；CSV/HTML 同步说明计量来源。原 CLI 的 JSON/CSV/HTML 继续使用原指标结构。
- 每轮独立进程与会话；小样本适合快速观察。比较时同时核对服务档位、输入缓存和输出长度，不能把不同任务的结果直接排名。

## 历史会话分析

切换到「历史会话分析」，选择近 7 天或指定的本地日期范围，点击「分析历史会话」。桌面版和已配对网页均可使用，支持取消、查看部分结果以及导出 JSON/CSV。扫描与主动测速互斥，避免分词和文件读取影响测速。

- 本机读取 `CODEX_HOME`（缺省 `~/.codex`）下的 `sessions` 和 `archived_sessions`；不启动 Codex、不请求模型、不读取登录文件、不修改会话。
- 按文件更新时间筛选候选文件，再按每条事件时间决定是否纳入；旧日期目录里最近更新的长会话也会扫描。日期范围的结束日包含当天，内部使用下一天零点的排他边界。
- 逐行读取文件发现时的字节快照，扫描时新增的内容留到下次。显示已读文件/字节、坏行、未完整尾行、超长记录、读取失败和去重数量。超过 16 MiB 的单行、超过 100 万字符的消息跳过并计入超长记录。
- 新格式优先使用按 `response_id` 去重的逐请求用量；同轮旧版 `token_count` 镜像不重复累计。旧格式通过累计差分统计，先读取范围前的基线；累计重置时仅采纳有记录的最新请求用量，不能恢复的部分计入覆盖问题。
- 输出 token 是模型总输出，可能包含推理、工具参数等，不等于可见正文。模型、effort、服务档位按当时记录分组，缺失为未知，轮内变化标为混用。
- 「模型首 token 等待」直接来自完成事件，与主动测速的首个可见文本等待口径不同。整轮耗时包括工具、等待和多次推理；跨范围轮次不进入轮次耗时与首 token 分布。
- 消息速度用本地完整文本分词除以消息生命周期估算，记录编码；零时长、缺失起止时间不生成速度。没有逐 delta 数据，不提供历史 TPS 曲线或峰值。分位数采用排序后线性插值，显示有效样本量。
- 网页和导出只包含指标、时间、状态、模型设置、会话/轮次 ID；不包含标题、目录、正文、工具参数或凭证。正文只在本机瞬时用于分词，历史分析结果不自动写入浏览器存储。导出文件是用户主动保存的统计报告。
- 新旧日志字段覆盖不同，结果仅代表本机保留的日志，不代表账号全部使用量；取消或读取异常会明确显示覆盖信息。

## 本地开发与构建

三个目录分别安装依赖，避免改变已有 CLI 的依赖结构：

```sh
pnpm install
pnpm --dir apps/site install
pnpm --dir apps/desktop install
pnpm --dir apps/site dev
pnpm --dir apps/desktop dev
```

网页开发地址为 `http://127.0.0.1:5173`。只在非打包软件中允许这些本地开发来源。网页类型合同由 `scripts/sync-studio-web.mjs` 从 `src/studio/types.ts` 同步；不要单独修改 `apps/site/src/protocol.ts`。

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --dir apps/desktop exec tsc --noEmit
pnpm --dir apps/desktop build
pnpm --dir apps/desktop exec electron-builder --mac --arm64 --x64 --publish never
pnpm --dir apps/desktop exec electron-builder --win --x64 --publish never
pnpm --dir apps/desktop exec electron-builder --linux --x64 --publish never
```

打包结果在 `apps/desktop/release/`。推荐在相应系统执行打包命令；跨平台打包的额外工具可能不可用。`.github/workflows/desktop.yml` 提供手动触发的三平台构建与 artifact 上传，不自动发布 GitHub Release，不触发 npm 发布。macOS 签名/公证和 Windows 签名证书尚未配置。

## Sites 与下载发布

`apps/site/.openai/hosting.json` 保存站点 ID；软件与网页的站点地址由 `scripts/sync-studio-web.mjs` 同步。本站是静态前端，测速请求发送到访问者电脑的 `127.0.0.1`，没有云端测速服务。

Sites 通过独立源码发布副本同步，避免提交主仓其他未完成工作。先构建网页，再用 Sites source helper 同步和打包，保存版本并部署为 public。下载清单 `apps/site/src/downloads.json` 与 GitHub Release 安装包一同准备；发布安装包并回读真实 URL 成功后，再部署包含下载入口的网页。未配置的平台会明确显示状态。大型安装包需要独立的下载托管，例如 GitHub Releases。

回滚：Sites 可部署前一保存版本；本地撤回本次新增模块和 CLI 连接补丁即可恢复原 API CLI，注意保留其他会话的修改。
