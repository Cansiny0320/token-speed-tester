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
  peakTps: number;
  tps: number[];
  usage?: TokenUsage;
}
export interface BenchmarkRun extends RunMeasurement {
  index: number;
  status: RunStatus;
  initMs: number;
  model?: string;
  runtimeVersion?: string;
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
    peakTps: 0,
    tps: [],
  };
}
