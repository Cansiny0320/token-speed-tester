/** Shared, JSON-only contract. Copied to the static Site by sync-studio-web.mjs. */
export type BenchmarkProvider = "codex" | "openai" | "anthropic";
export type Effort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "ultra";
export type RunStatus = "preparing" | "running" | "completed" | "cancelled" | "failed";
export interface BenchmarkConfig {
  provider: BenchmarkProvider;
  model: string;
  effort: Effort;
  prompt: string;
  runs: number;
  maxTokens: number;
  timeoutMs: number;
  apiKey?: string;
  baseURL?: string;
}
export type PublicConfig = Omit<BenchmarkConfig, "apiKey">;
export interface TokenUsage {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
}
export interface RunMeasurement {
  text: string;
  ttftMs: number | null;
  elapsedMs: number;
  estimatedTokens: number;
  outputTokens: number;
  tokenSource: "provider" | "estimated";
  averageTps: number;
  generationTps: number | null;
  peakTps: number | null;
  tps: number[];
  usage?: TokenUsage;
  /** Optional on reports written before measurement provenance was recorded. */
  tokenizer?: { encoding: string; source: "model" | "fallback" };
  timingSource?: "stream" | "unavailable";
}
export interface BenchmarkRun extends RunMeasurement {
  index: number;
  status: RunStatus;
  initMs: number;
  model?: string;
  runtimeVersion?: string;
  serviceTier?: string | null;
  error?: string;
}
export interface BenchmarkSnapshot {
  id: string;
  version: number;
  phase: "idle" | RunStatus;
  startedAt: string | null;
  config: PublicConfig | null;
  runs: BenchmarkRun[];
}
export interface ModelInfo {
  id: string;
  name: string;
  efforts: string[];
  defaultEffort?: string;
  isDefault: boolean;
}
export interface CodexInfo {
  configuredModel?: string;
  version?: string;
  available: boolean;
  authenticated: boolean;
  plan?: string;
  models: ModelInfo[];
  error?: string;
}
export interface StudioInfo {
  version: string;
  platform: string;
  codex: CodexInfo;
}
export interface PairingInfo {
  code: string;
  port: number;
  expiresAt: number;
  siteUrl: string;
  error?: string;
}
export interface DesktopAPI {
  info: () => Promise<StudioInfo>;
  state: () => Promise<BenchmarkSnapshot>;
  run: (config: BenchmarkConfig) => Promise<BenchmarkSnapshot>;
  cancel: () => Promise<void>;
  pairing: () => Promise<PairingInfo>;
  selectCodex: () => Promise<boolean>;
  openSite: () => Promise<void>;
  historyStart: (config: HistoryConfig) => Promise<HistoryState>;
  historyState: () => Promise<HistoryState>;
  historyCancel: () => Promise<void>;
}

export interface HistoryConfig {
  /** ISO instants: inclusive start, exclusive end. The UI supplies local-day boundaries. */
  from: string;
  to: string;
}
export interface HistoryMessageMetric {
  phase: string;
  estimatedTokens: number;
  durationMs: number | null;
  estimatedTps: number | null;
  encoding: string;
  encodingSource: "model" | "fallback";
}
export interface HistoryTurn {
  sessionId: string;
  turnId: string;
  model: string;
  effort: string;
  serviceTier: string;
  startedAt: string | null;
  completedAt: string | null;
  status: "completed" | "interrupted" | "unfinished";
  partial: boolean;
  durationMs: number | null;
  modelTtftMs: number | null;
  requests: number;
  usage: TokenUsage;
  usageSource: "request" | "legacy" | "unavailable";
  messages: HistoryMessageMetric[];
}
export interface HistoryDistribution {
  count: number;
  p50: number | null;
  p95: number | null;
}
export interface HistoryGroup {
  model: string;
  effort: string;
  serviceTier: string;
  turns: number;
  completed: number;
  usageTurns: number;
  requests: number;
  usage: TokenUsage;
  cacheRatio: number | null;
  durationMs: HistoryDistribution;
  modelTtftMs: HistoryDistribution;
  estimatedMessageTps: HistoryDistribution;
}
export interface HistoryCoverage {
  filesRead: number;
  filesSkippedByTime: number;
  unreadableFiles: number;
  malformedLines: number;
  incompleteLines: number;
  oversizedLines: number;
  duplicateRecords: number;
  legacyCounterResets: number;
  skippedUsageEvents: number;
  untimedMessages: number;
  missingUsageTurns: number;
}
export interface HistoryReport {
  schemaVersion: 1;
  generatedAt: string;
  range: HistoryConfig;
  coverage: HistoryCoverage;
  summary: HistoryGroup;
  groups: HistoryGroup[];
  turns: HistoryTurn[];
}
export interface HistoryState {
  id: string;
  phase: "idle" | "scanning" | "completed" | "cancelled" | "failed";
  progress: { filesTotal: number; filesRead: number; bytesTotal: number; bytesRead: number };
  report: HistoryReport | null;
  error?: string;
}
export const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
  provider: "codex",
  model: "auto",
  effort: "low",
  prompt: "请用中文写一篇约 500 字的短文，介绍大语言模型如何改变日常学习。直接输出正文，不使用工具，不读取文件，不执行命令。",
  runs: 3,
  maxTokens: 1024,
  timeoutMs: 120000,
};
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function parseBenchmarkConfig(value: unknown): BenchmarkConfig {
  if (!isRecord(value)) throw new Error("无效的测速配置。");
  const provider = value.provider;
  if (provider !== "codex" && provider !== "openai" && provider !== "anthropic") {
    throw new Error("请选择 Codex、OpenAI 或 Anthropic。");
  }
  const effort = value.effort ?? "low";
  if (effort !== "none" && effort !== "minimal" && effort !== "low" && effort !== "medium" && effort !== "high" && effort !== "xhigh" && effort !== "max" && effort !== "ultra") {
    throw new Error("不支持的推理强度。");
  }
  const prompt = typeof value.prompt === "string" ? value.prompt.trim() : "";
  if (!prompt || prompt.length > 32000) throw new Error("提示词须为 1–32000 个字符。");
  const model = typeof value.model === "string" ? value.model.trim() : "auto";
  if (!model || model.length > 200) throw new Error("请输入模型名称。");
  const bounded = (key: string, fallback: number, min: number, max: number) => {
    const number = value[key] ?? fallback;
    if (typeof number !== "number" || !Number.isInteger(number) || number < min || number > max) {
      throw new Error(`${key} 须为 ${min}–${max} 之间的整数。`);
    }
    return number;
  };
  const apiKey = typeof value.apiKey === "string" ? value.apiKey.trim() : undefined;
  if (provider !== "codex" && (!apiKey || apiKey.length > 4096)) throw new Error("请填写有效的 API Key。");
  const baseURL = typeof value.baseURL === "string" ? value.baseURL.trim() : undefined;
  if (baseURL) {
    const url = new URL(baseURL);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error("Base URL 只支持不含凭证、查询参数和片段的 HTTP(S) 地址。");
    }
  }
  return {
    provider,
    model,
    effort,
    prompt,
    runs: bounded("runs", 3, 1, 30),
    maxTokens: bounded("maxTokens", 1024, 1, 32768),
    timeoutMs: bounded("timeoutMs", 120000, 5000, 600000),
    ...(provider === "codex" ? {} : { apiKey, baseURL }),
  };
}
export function publicConfig(config: BenchmarkConfig): PublicConfig {
  const { apiKey: _apiKey, ...rest } = config;
  return rest;
}
export function emptyMeasurement(): RunMeasurement {
  return {
    text: "",
    ttftMs: null,
    elapsedMs: 0,
    estimatedTokens: 0,
    outputTokens: 0,
    tokenSource: "estimated",
    averageTps: 0,
    generationTps: null,
    peakTps: null,
    tps: [],
  };
}
