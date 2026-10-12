# 实施计划

依据：`docs/superpowers/specs/2026-10-12-history-analysis-design.md`，用户已批准。

## 1. 修复主动测速

文件：`src/tokenizer.ts`、`src/studio/{measurement,codex,runner,cli,types}.ts`、对应 tests、`apps/site/src/{main,reports}.tsx/ts`。

先增加有意义的失败测试：大首块、同刻分块、非流式完成、auto 解析与服务档位。随后修正分块分子、记录分词来源、保留不可用计时、解析后创建 meter。新报告字段向后兼容，旧 CLI 不伪造计时。

验证：focused Vitest（关闭缓存）；根 typecheck。只使用 mock Codex / localhost API，不消耗模型额度。

## 2. 本地历史解析与扫描

文件：新增 `src/studio/history.ts` 和必要的独立历史类型/汇总模块，`tests/studio-history.test.ts`。

实现输入日期验证、逐行/分块文件读取、快照边界、后台状态与取消；按 ID 去重并兼容新旧用量、累计基线与重置。只保存已脱敏指标，汇总分组与覆盖信息。分词器沿用主动测速的显式估算口径。

测试：现代请求用量与旧 token_count 不双计、归档副本、长会话跨范围、重复和重置、晚到字段、无时间/零时长、坏行、部分尾行、取消、原文不出现在序列化结果。确保不读 auth/config 凭证。

## 3. 接入本地传输与 UI

文件：`src/studio/bridge.ts`、`apps/desktop/src/{main,preload}.ts`、`src/studio/types.ts`、`apps/site/src/{transport,main}.ts(x)`，新增历史视图/导出模块及样式。

新增受现有鉴权保护的 history start/state/cancel 接口与 IPC；更新配对说明。历史视图使用现有视觉体系，展示独立指标、缺失值、进度和取消结果；支持分组、明细、JSON/CSV 导出。合同通过 `scripts/sync-studio-web.mjs` 同步，不能手改生成的 protocol.ts。

测试：未配对拒绝、错误来源拒绝、合法启动/取消/回读、输入验证。浏览器检查日期、扫描、明细、空态、导出和窄屏。

## 4. 集成验收

- `pnpm lint`（只检查）、`pnpm typecheck`（noEmit）、`pnpm test`。
- `pnpm build`（生成 dist 与复制模板）。
- `node scripts/sync-studio-web.mjs`（同步前端合同与站点配置）。
- `pnpm --dir apps/site build`（类型检查并生成静态资源）。
- `pnpm --dir apps/desktop exec tsc --noEmit`、`pnpm --dir apps/desktop build`（本地构建，不打包发布）。
- 本机近 7 天真实日志扫描，复核数量/字段缺失/进度响应；不把真实正文写测试 fixture。
- `git diff --check`，复核改动范围，保留用户已有 dirty changes。

## 风险与回滚

日志格式变化按未知/缺失处理；分词和 item 时间仅为估算。大文件逐行处理并让出事件循环，取消立即停止读取。失败回报受控信息，避免路径和正文泄露。

回滚仅撤回本计划新增历史模块及本次修改片段，保留既有未提交实现；不执行 reset/clean。所有操作仅本地，commit/push/部署仍须另有授权。

## 验收结果（2026-10-12）

- 以上四步已完成。`pnpm lint`、根 / site / desktop TypeScript 检查、CLI 与 desktop 构建通过；desktop 构建包含网页生产构建。
- `pnpm test --cache=false`：17 个测试文件、233 项测试通过。新增覆盖旧版无 turn ID 的多轮边界、跨范围与中断轮次不进入完成耗时分布。
- 固定范围 `2026-10-05T16:00:00Z` 至 `2026-10-12T09:30:00Z`：3,020 次请求、259 个完成轮次，用量与独立逐请求去重脚本逐项一致。约 193 MB 候选日志在 1.45 秒处理完；并行 100 ms 响应探针最大延迟约 70 ms。
- 已配对本地网页验证：近 7 天、日期校验、空结果、分组筛选、分页、取消 / 部分结果、JSON / CSV 下载。两种导出均为 276 轮，字段检查未含正文、工具参数或路径。390 px 窄屏无页面横向溢出，浏览器未记录错误。
- 主动测速回归使用 mock Codex / localhost API，未执行消耗订阅额度的模型请求；桌面 IPC 完成类型检查与构建，未重新启动用户正在运行的桌面实例。
- `git diff --check` 通过。未 commit、push、打包发布或部署。

## 发布跟进

用户随后授权 push 与部署，并要求打开新版。旧桌面进程加载新界面时缺少 `studio:history-state` handler；退出旧进程后，新版桌面端已完成真实扫描（36 个文件、279 个轮次）。发布版本升级至 1.1.0，并同步更新安装包入口。
