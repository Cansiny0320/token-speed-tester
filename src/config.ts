import { getMessages, resolveLang, type Lang } from "./i18n.js";

export type Provider = "anthropic" | "openai";

export interface Config {
  provider: Provider;
  apiKey: string;
  baseURL?: string;
  model: string;
  maxTokens: number;
  runCount: number;
  prompt: string;
  lang: Lang;
}

export interface ParsedArgs {
  apiKey: string;
  provider?: Provider;
  url?: string;
  model?: string;
  maxTokens?: number;
  runs?: number;
  prompt?: string;
  lang?: string;
}

const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: "claude-opus-4-5-20251101",
  openai: "gpt-5.2",
};

const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_RUNS = 3;
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
    prompt,
    lang: langInput,
  } = args;
  const lang = resolveLang(langInput);
  const messages = getMessages(lang);
  const finalPrompt = prompt ?? messages.defaultPrompt;

  // 验证必填参数
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("API Key is required. Use --api-key or -k to provide it.");
  }

  // 验证 provider
  if (provider !== "anthropic" && provider !== "openai") {
    throw new Error(`Invalid provider: ${provider}. Must be 'anthropic' or 'openai'.`);
  }

  // 验证数值参数
  if (!Number.isFinite(maxTokens) || !Number.isInteger(maxTokens) || maxTokens <= 0) {
    throw new Error(`Invalid max-tokens: ${maxTokens}. Must be a positive integer.`);
  }

  if (!Number.isFinite(runs) || !Number.isInteger(runs) || runs <= 0) {
    throw new Error(`Invalid runs: ${runs}. Must be a positive integer.`);
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
    prompt: finalPrompt.trim(),
    lang,
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

  if (
    !Number.isFinite(config.maxTokens) ||
    !Number.isInteger(config.maxTokens) ||
    config.maxTokens <= 0
  ) {
    return { valid: false, error: "maxTokens must be a positive integer" };
  }

  if (
    !Number.isFinite(config.runCount) ||
    !Number.isInteger(config.runCount) ||
    config.runCount <= 0
  ) {
    return { valid: false, error: "runCount must be a positive integer" };
  }

  if (!config.prompt || config.prompt.trim() === "") {
    return { valid: false, error: "prompt cannot be empty" };
  }

  if (config.lang !== "zh" && config.lang !== "en") {
    return { valid: false, error: `Invalid lang: ${config.lang}` };
  }

  return { valid: true };
}
// test
