export const SUPPORTED_LANGS = ["zh", "en"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

export const DEFAULT_LANG: Lang = "zh";

export interface Messages {
  defaultPrompt: string;
  appTitle: string;
  runningTests: string;
  streamingOutput: string;
  testComplete: string;
  errorPrefix: string;
  unknownError: string;
  configLabels: {
    provider: string;
    model: string;
    maxTokens: string;
    runs: string;
    prompt: string;
  };
  runLabel: (index: number) => string;
  runProgressLabel: (current: number, total: number) => string;
  reportTitle: string;
  speedChartTitle: string;
  tpsHistogramTitle: string;
  noChartData: string;
  noTpsData: string;
  statsSummaryTitle: (sampleSize: number) => string;
  statsHeaders: {
    metric: string;
    mean: string;
    min: string;
    max: string;
    stdDev: string;
  };
  statsLabels: {
    ttft: string;
    totalTime: string;
    totalTokens: string;
    averageSpeed: string;
    peakSpeed: string;
    peakTps: string;
  };
  resultLabels: {
    ttft: string;
    totalTime: string;
    totalTokens: string;
    averageSpeed: string;
    peakSpeed: string;
    peakTps: string;
  };
}

const zhMessages: Messages = {
  defaultPrompt: "写一篇关于 AI 的短文",
  appTitle: "🚀 Token 速度测试工具",
  runningTests: "⏳ 正在运行测试...",
  streamingOutput: "模型输出 (流式):",
  testComplete: "✅ 测试完成!",
  errorPrefix: "❌ 错误",
  unknownError: "❌ 发生未知错误",
  configLabels: {
    provider: "Provider",
    model: "Model",
    maxTokens: "Max Tokens",
    runs: "Runs",
    prompt: "Prompt",
  },
  runLabel: (index: number) => `[运行 ${index}]`,
  runProgressLabel: (current: number, total: number) => `[运行 ${current}/${total}]`,
  reportTitle: "Token 速度测试报告",
  speedChartTitle: "Token 速度趋势图 (TPS)",
  tpsHistogramTitle: "TPS 分布",
  noChartData: "没有可用于图表的数据",
  noTpsData: "没有 TPS 数据可用",
  statsSummaryTitle: (sampleSize: number) => `统计汇总 (N=${sampleSize})`,
  statsHeaders: {
    metric: "指标",
    mean: "均值",
    min: "最小值",
    max: "最大值",
    stdDev: "标准差",
  },
  statsLabels: {
    ttft: "TTFT (ms)",
    totalTime: "总耗时 (ms)",
    totalTokens: "总 Token 数",
    averageSpeed: "平均速度",
    peakSpeed: "峰值速度",
    peakTps: "峰值 TPS",
  },
  resultLabels: {
    ttft: "TTFT",
    totalTime: "总耗时",
    totalTokens: "总 Token 数",
    averageSpeed: "平均速度",
    peakSpeed: "峰值速度",
    peakTps: "峰值 TPS",
  },
};

const enMessages: Messages = {
  defaultPrompt: "Write a short essay about AI",
  appTitle: "🚀 Token Speed Test",
  runningTests: "⏳ Running tests...",
  streamingOutput: "Model output (streaming):",
  testComplete: "✅ Tests complete!",
  errorPrefix: "❌ Error",
  unknownError: "❌ An unknown error occurred",
  configLabels: {
    provider: "Provider",
    model: "Model",
    maxTokens: "Max Tokens",
    runs: "Runs",
    prompt: "Prompt",
  },
  runLabel: (index: number) => `[Run ${index}]`,
  runProgressLabel: (current: number, total: number) => `[Run ${current}/${total}]`,
  reportTitle: "Token Speed Test Report",
  speedChartTitle: "Token Speed Trend (TPS)",
  tpsHistogramTitle: "TPS Distribution",
  noChartData: "No data available for chart",
  noTpsData: "No TPS data available",
  statsSummaryTitle: (sampleSize: number) => `Summary (N=${sampleSize})`,
  statsHeaders: {
    metric: "Metric",
    mean: "Mean",
    min: "Min",
    max: "Max",
    stdDev: "Std Dev",
  },
  statsLabels: {
    ttft: "TTFT (ms)",
    totalTime: "Total Time (ms)",
    totalTokens: "Total Tokens",
    averageSpeed: "Avg Speed",
    peakSpeed: "Peak Speed",
    peakTps: "Peak TPS",
  },
  resultLabels: {
    ttft: "TTFT",
    totalTime: "Total Time",
    totalTokens: "Total Tokens",
    averageSpeed: "Avg Speed",
    peakSpeed: "Peak Speed",
    peakTps: "Peak TPS",
  },
};

export function isSupportedLang(value: string): value is Lang {
  return SUPPORTED_LANGS.includes(value as Lang);
}

export function resolveLang(value?: string): Lang {
  if (!value) {
    return DEFAULT_LANG;
  }
  const normalized = value.toLowerCase();
  if (!isSupportedLang(normalized)) {
    throw new Error(`Invalid lang: ${value}. Must be 'zh' or 'en'.`);
  }
  return normalized;
}

export function getMessages(lang: Lang): Messages {
  return lang === "en" ? enMessages : zhMessages;
}
