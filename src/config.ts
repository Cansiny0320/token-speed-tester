export type Provider = "anthropic" | "openai";

export interface Config {
  provider: Provider;
  apiKey: string;
  baseURL?: string;
  model: string;
  maxTokens: number;
  runCount: number;
  prompt: string;
}

export interface ParsedArgs {
  apiKey: string;
  provider?: Provider;
  url?: string;
  model?: string;
  maxTokens?: number;
  runs?: number;
  prompt?: string;
}

const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: "claude-opus-4-5-20251101",
  openai: "gpt-5.2",
};

const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_RUNS = 3;
const DEFAULT_PROMPT = "写一篇关于 AI 的短文";

/**
 * 解析命令行参数并生成配置
 */
export function parseConfig(args: ParsedArgs): Config {
  const {
    apiKey,
    provider = "anthropic",
    url,
    model,
    maxTokens = DEFAULT_MAX_TOKENS,
    runs = DEFAULT_RUNS,
    prompt = DEFAULT_PROMPT,
  } = args;

  // 验证必填参数
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("API Key is required. Use --api-key or -k to provide it.");
  }

  // 验证 provider
  if (provider !== "anthropic" && provider !== "openai") {
    throw new Error(`Invalid provider: ${provider}. Must be 'anthropic' or 'openai'.`);
  }

  // 验证数值参数
  if (maxTokens <= 0) {
    throw new Error(`Invalid max-tokens: ${maxTokens}. Must be a positive number.`);
  }

  if (runs <= 0) {
    throw new Error(`Invalid runs: ${runs}. Must be a positive number.`);
  }

  // 使用默认模型或用户指定的模型
  const finalModel = model || DEFAULT_MODELS[provider];

  return {
    provider,
    apiKey: apiKey.trim(),
    baseURL: url?.trim(),
    model: finalModel,
    maxTokens,
    runCount: runs,
    prompt: prompt.trim(),
  };
}

/**
 * 获取默认模型名称
 */
export function getDefaultModel(provider: Provider): string {
  return DEFAULT_MODELS[provider];
}

/**
 * 验证配置有效性
 */
export function validateConfig(config: Config): { valid: boolean; error?: string } {
  if (!config.apiKey) {
    return { valid: false, error: "API Key is required" };
  }

  if (config.provider !== "anthropic" && config.provider !== "openai") {
    return { valid: false, error: `Invalid provider: ${config.provider}` };
  }

  if (config.maxTokens <= 0) {
    return { valid: false, error: "maxTokens must be positive" };
  }

  if (config.runCount <= 0) {
    return { valid: false, error: "runCount must be positive" };
  }

  if (!config.prompt || config.prompt.trim() === "") {
    return { valid: false, error: "prompt cannot be empty" };
  }

  return { valid: true };
}
// test
