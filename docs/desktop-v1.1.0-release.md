# Token Speed Studio 1.1.0

新增本机 Codex 历史会话分析，并修正主动测速的计量口径。网页与桌面软件请一起更新至 1.1.0；更新后须完全退出旧桌面进程再启动，以加载新增的本地接口。

- 历史分析支持近 7 天、自定义日期、按模型 / 推理强度 / 服务档位分组、轮次明细、取消与 JSON / CSV 导出。
- 只读取本机保留的会话与归档，不调用模型。正文仅用于本机分词，不进入网页或导出；消息速度明确标为估算。
- 主动测速修正首批 token 的计数，记录实际模型的分词编码和服务档位；没有流式数据时不再生成 TTFT、曲线或峰值。
- 233 项测试、lint、TypeScript 检查及 CLI / 网页 / 桌面构建通过。已核对真实日志的用量统计，并验证桌面历史扫描、网页筛选、取消、导出和窄屏布局。

网页：https://token-speed-studio.cansiny0320.chatgpt.site

安装包继续覆盖 macOS Apple Silicon / Intel、Windows x64、Linux x64。`SHA256SUMS.txt` 提供校验值。macOS 安装包未签名或公证；Windows 与 Linux 未进行本次版本的对应系统实机验证。
