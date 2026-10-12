import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { BenchmarkConfig, CodexInfo, ModelInfo, TokenUsage } from "./types.js";
import { spawn } from "node:child_process";
import { access, mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { RpcConnection } from "./rpc.js";
import { isRecord } from "./types.js";

export interface CodexStreamResult {
  elapsedMs: number;
  usage?: TokenUsage;
  model: string;
}
export interface CodexThread {
  threadId: string;
  model: string;
  serviceTier: string | null;
}
const disabledFeatures = [
  "shell_tool",
  "unified_exec",
  "apply_patch_freeform",
  "apps",
  "connectors",
  "plugins",
  "remote_plugin",
  "hooks",
  "codex_hooks",
  "plugin_hooks",
  "multi_agent",
  "collab",
  "js_repl",
  "code_mode",
  "code_mode_only",
  "computer_use",
  "browser_use",
  "image_generation",
  "memory_tool",
  "memories",
  "shell_snapshot",
  "tool_search",
  "tool_suggest",
];
export async function resolveCodex(executable?: string): Promise<{ command: string; args: string[] }> {
  const home = homedir();
  const candidates = executable
    ? [executable]
    : [
        ...(process.platform === "darwin"
          ? [
              "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex",
              "/Applications/Codex.app/Contents/Resources/codex",
              path.join(home, "Applications", "ChatGPT.app", "Contents", "Resources", "codex-cli", "CodexCLI.app", "Contents", "MacOS", "codex"),
            ]
          : []),
        ...(process.env.PATH ?? "").split(path.delimiter).filter(Boolean).flatMap(dir =>
          process.platform === "win32" ? [path.join(dir, "codex.exe"), path.join(dir, "codex.cmd")] : [path.join(dir, "codex")]),
        path.join(home, ".local", "bin", "codex"),
        "/opt/homebrew/bin/codex",
        "/usr/local/bin/codex",
        ...(process.env.APPDATA ? [path.join(process.env.APPDATA, "npm", "codex.cmd")] : []),
      ];
  if (!executable && process.platform !== "win32") {
    const nvm = path.join(home, ".nvm", "versions", "node");
    const versions = await readdir(nvm).catch(() => [] as string[]);
    versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    candidates.push(...versions.map(version => path.join(nvm, version, "bin", "codex")));
  }
  for (const candidate of candidates) {
    try {
      await access(candidate);
      const resolved = await realpath(candidate);
      if (/\.cmd$/i.test(resolved)) {
        const script = path.join(path.dirname(resolved), "node_modules", "@openai", "codex", "bin", "codex.js");
        await access(script);
        return { command: process.execPath, args: [script] };
      }
      if (/\.[cm]?js$/i.test(resolved)) return { command: process.execPath, args: [resolved] };
      return { command: resolved, args: [] };
    }
    catch { /* Try the next known installation location without invoking a shell. */ }
  }
  throw new Error("未找到 Codex。请安装 Codex CLI 并运行 codex login，或在桌面软件中选择可执行文件。");
}
function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Codex 返回了不兼容的数据，请升级 Codex CLI 后重试。");
  return value;
}
function readUsage(value: unknown): TokenUsage | undefined {
  if (!isRecord(value)) return;
  const usage: TokenUsage = {};
  for (const [source, target] of [
    ["inputTokens", "inputTokens"],
    ["cachedInputTokens", "cachedInputTokens"],
    ["outputTokens", "outputTokens"],
    ["reasoningOutputTokens", "reasoningTokens"],
  ] as const) {
    const number = value[source];
    if (typeof number === "number" && Number.isFinite(number) && number >= 0) usage[target] = number;
  }
  return usage;
}
export class CodexSession {
  private child: ChildProcessWithoutNullStreams;
  private rpc: RpcConnection;
  private directory: string;
  private closing?: Promise<void>;
  version?: string;
  private configuredModel?: string;
  private runtimeConfig: Record<string, unknown> = {};
  private constructor(child: ChildProcessWithoutNullStreams, directory: string) {
    this.child = child;
    this.directory = directory;
    this.rpc = new RpcConnection(child.stdout, child.stdin);
    // stderr may contain account/configuration data: consume it, never forward it to the Site.
    child.stderr.resume();
    child.on("error", error => this.rpc.close(new Error(`无法启动 Codex：${error.message}`)));
    child.on("exit", code => this.rpc.close(new Error(`Codex 进程已退出（${code ?? "signal"}）。请检查本机登录和版本。`)));
  }

  static async open(executable?: string, signal?: AbortSignal): Promise<CodexSession> {
    signal?.throwIfAborted();
    const resolved = await resolveCodex(executable);
    const directory = await mkdtemp(path.join(tmpdir(), "token-speed-codex-"));
    const env = { ...process.env };
    delete env.OPENAI_API_KEY;
    delete env.CODEX_API_KEY;
    if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = "1";
    const overrides = [
      "model_provider=\"openai\"",
      "approval_policy=\"never\"",
      "sandbox_mode=\"read-only\"",
      "web_search=\"disabled\"",
      "project_doc_max_bytes=0",
      "notify=[]",
      // Replace this subprocess's feature table. A newer desktop app can leave structured
      // feature settings that an older CLI cannot parse; never rewrite the user's config.
      `features={${[...disabledFeatures, "multi_agent_v2"].map(feature => `${feature}=false`).join(",")}}`,
    ];
    const child = spawn(resolved.command, [...resolved.args, "app-server", "--listen", "stdio://", ...overrides.flatMap(value => ["-c", value])], {
      cwd: directory,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const session = new CodexSession(child, directory);
    const abort = () => {
      void session.close();
    };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const initialized = record(await session.rpc.request("initialize", {
        clientInfo: { name: "token_speed_studio", title: "Token Speed Studio", version: "1.0.0" },
      }));
      session.version = typeof initialized.userAgent === "string" ? initialized.userAgent : undefined;
      session.rpc.notify("initialized");
      const response = record(await session.rpc.request("config/read", { includeLayers: false }).catch(() => {
        throw new Error("当前 Codex CLI 无法读取配置。请升级 Codex CLI，或在桌面软件中选择最新 Codex 可执行文件。");
      }));
      const config = isRecord(response.config) ? response.config : {};
      session.configuredModel = typeof config.model === "string" ? config.model : undefined;
      if (isRecord(config.mcp_servers)) {
        // Thread overrides merge into existing entries. Only override activation flags:
        // copying the config/read wire representation back can change transport types.
        session.runtimeConfig.mcp_servers = Object.fromEntries(Object.keys(config.mcp_servers)
          .map(name => [name, { enabled: false, required: false }]));
      }
      signal?.throwIfAborted();
      return session;
    }
    catch (error) {
      await session.close();
      throw error;
    }
    finally {
      signal?.removeEventListener("abort", abort);
    }
  }

  async info(): Promise<CodexInfo> {
    const response = record(await this.rpc.request("account/read", { refreshToken: false }));
    const account = isRecord(response.account) ? response.account : {};
    if (account.type !== "chatgpt") {
      return { available: true, authenticated: false, models: [], error: "Codex 尚未使用 ChatGPT 订阅账号登录。请先在终端运行 codex login。" };
    }
    const models: ModelInfo[] = [];
    let cursor: string | undefined;
    do {
      const page = record(await this.rpc.request("model/list", { limit: 100, ...(cursor ? { cursor } : {}) }));
      if (Array.isArray(page.data)) {
        for (const entry of page.data) {
          if (!isRecord(entry)) continue;
          const id = typeof entry.model === "string" ? entry.model : entry.id;
          if (typeof id !== "string") continue;
          const efforts = Array.isArray(entry.supportedReasoningEfforts)
            ? entry.supportedReasoningEfforts.flatMap(item => isRecord(item) && typeof item.reasoningEffort === "string" ? [item.reasoningEffort] : [])
            : [];
          models.push({ id, name: typeof entry.displayName === "string" ? entry.displayName : id, efforts, defaultEffort: typeof entry.defaultReasoningEffort === "string" ? entry.defaultReasoningEffort : undefined, isDefault: entry.isDefault === true });
        }
      }
      cursor = typeof page.nextCursor === "string" ? page.nextCursor : undefined;
    } while (cursor && models.length < 500);
    return { available: true, authenticated: true, models, configuredModel: this.configuredModel, version: this.version, plan: typeof account.planType === "string" ? account.planType : undefined };
  }

  async prepare(config: BenchmarkConfig): Promise<CodexThread> {
    const auth = record(await this.rpc.request("account/read", { refreshToken: false }));
    if (!isRecord(auth.account) || auth.account.type !== "chatgpt") throw new Error("请先使用 ChatGPT 订阅账号运行 codex login。");
    const response = record(await this.rpc.request("thread/start", {
      cwd: this.directory,
      ephemeral: true,
      approvalPolicy: "never",
      sandbox: "read-only",
      modelProvider: "openai",
      ...(config.model !== "auto" ? { model: config.model } : {}),
      baseInstructions: "You are participating in a text-generation speed benchmark. Answer the user's prompt with plain text only. Never call tools, access files, run commands, browse, or delegate.",
      config: this.runtimeConfig,
    }));
    const thread = record(response.thread);
    if (typeof thread.id !== "string") throw new Error("Codex 未返回会话 ID。");
    return { threadId: thread.id, model: typeof response.model === "string" ? response.model : config.model, serviceTier: typeof response.serviceTier === "string" ? response.serviceTier : null };
  }

  async run(thread: CodexThread, config: BenchmarkConfig, onText: (text: string, elapsedMs: number, streamed?: boolean) => void, signal: AbortSignal): Promise<CodexStreamResult> {
    signal.throwIfAborted();
    let usage: TokenUsage | undefined;
    let turnId: string | undefined;
    let receivedText = false;
    const start = performance.now();
    let resolveTurn!: (result: CodexStreamResult) => void;
    let rejectTurn!: (error: Error) => void;
    const completion = new Promise<CodexStreamResult>((resolve, reject) => {
      resolveTurn = resolve;
      rejectTurn = reject;
    });
    // The server may end the turn before the turn/start reply; attach rejection handling now.
    void completion.catch(() => {});
    const abort = () => {
      if (turnId) void this.rpc.request("turn/interrupt", { threadId: thread.threadId, turnId }, 2000).catch(() => {});
      rejectTurn(new Error("测速已取消。"));
    };
    this.rpc.onClose = rejectTurn;
    this.rpc.onNotification = (method, params) => {
      if (!isRecord(params) || (params.threadId && params.threadId !== thread.threadId)) return;
      if (method === "item/agentMessage/delta" && typeof params.delta === "string") {
        receivedText = true;
        onText(params.delta, performance.now() - start);
      }
      else if (method === "thread/tokenUsage/updated" && isRecord(params.tokenUsage)) {
        usage = readUsage(params.tokenUsage.last);
      }
      else if (method === "item/started" && isRecord(params.item)) {
        const type = params.item.type;
        if (typeof type === "string" && ["commandExecution", "fileChange", "mcpToolCall", "dynamicToolCall", "collabToolCall", "webSearch"].includes(type)) {
          rejectTurn(new Error("模型尝试使用工具，该轮不作为纯文本测速样本。"));
          abort();
        }
      }
      else if (method === "item/completed" && isRecord(params.item) && params.item.type === "agentMessage" && !receivedText && typeof params.item.text === "string") {
        receivedText = true;
        onText(params.item.text, performance.now() - start, false);
      }
      else if (method === "turn/completed" && isRecord(params.turn)) {
        if (params.turn.status === "completed") {
          resolveTurn({ elapsedMs: performance.now() - start, usage, model: thread.model });
        }
        else {
          const error = isRecord(params.turn.error) ? params.turn.error : {};
          rejectTurn(new Error(typeof error.message === "string" ? error.message : params.turn.status === "interrupted" ? "测速已取消。" : "Codex 测速失败。"));
        }
      }
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      const response = record(await this.rpc.request("turn/start", {
        threadId: thread.threadId,
        input: [{ type: "text", text: config.prompt }],
        effort: config.effort,
      }));
      if (isRecord(response.turn) && typeof response.turn.id === "string") turnId = response.turn.id;
      signal.throwIfAborted();
      return await completion;
    }
    finally {
      signal.removeEventListener("abort", abort);
      this.rpc.onNotification = undefined;
      this.rpc.onClose = undefined;
    }
  }

  close(): Promise<void> {
    this.closing ??= this.shutdown();
    return this.closing;
  }

  private async shutdown(): Promise<void> {
    this.rpc.close();
    this.child.stdin.end();
    this.child.kill();
    if (this.child.exitCode === null) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          this.child.kill("SIGKILL");
          resolve();
        }, 1500);
        this.child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    await rm(this.directory, { recursive: true, force: true });
  }
}
export async function inspectCodex(executable?: string): Promise<CodexInfo> {
  let session: CodexSession | undefined;
  try {
    session = await CodexSession.open(executable);
    return await session.info();
  }
  catch (error) {
    return { available: false, authenticated: false, models: [], error: error instanceof Error ? error.message : "无法连接 Codex。" };
  }
  finally {
    await session?.close();
  }
}
