/**
 * 单次流式测试的原始计时数据
 */
export interface StreamMetrics {
  ttft: number; // Time to First Token (ms)
  tokens: number[]; // 每个 token 的到达时间（相对开始时间，单位：ms）
  totalTokens: number;
  totalTime: number;
}

/**
 * 计算后的统计指标
 */
export interface CalculatedMetrics {
  ttft: number; // Time to First Token (ms)
  totalTime: number; // 总耗时 (ms)
  totalTokens: number; // 总 token 数
  averageSpeed: number; // 平均速度 (tokens/s)
  peakSpeed: number; // 峰值速度 (tokens/s)
  peakTps: number; // 峰值 TPS (tokens/s)
  tps: number[]; // 每秒 token 数 (TPS curve)
}

/**
 * 百分位数统计
 */
export interface PercentileMetrics {
  p50: number; // 中位数
  p95: number; // 95th 百分位
  p99: number; // 99th 百分位
}

/**
 * 多次测试的统计结果
 */
export interface StatsResult {
  mean: CalculatedMetrics;
  min: CalculatedMetrics;
  max: CalculatedMetrics;
  stdDev: CalculatedMetrics;
  percentiles: {
    ttft: PercentileMetrics;
    totalTime: PercentileMetrics;
    totalTokens: PercentileMetrics;
    averageSpeed: PercentileMetrics;
    peakSpeed: PercentileMetrics;
    peakTps: PercentileMetrics;
  };
  sampleSize: number;
}

/**
 * 计算 TTFT (Time to First Token)
 */
export function calculateTTFT(metrics: StreamMetrics): number {
  return metrics.ttft;
}

/**
 * 计算平均速度 (tokens/s)
 */
export function calculateAverageSpeed(metrics: StreamMetrics): number {
  if (metrics.totalTime <= 0) {
    return 0;
  }
  return (metrics.totalTokens / metrics.totalTime) * 1000;
}

/**
 * 计算峰值速度 - 最快连续 N 个 token 的平均速度
 */
const MIN_PEAK_WINDOW_MS = 50;

export function calculatePeakSpeed(metrics: StreamMetrics, windowSize: number = 10): number {
  if (metrics.tokens.length < windowSize) {
    // 如果 token 数少于窗口大小，使用全部 token 计算
    if (metrics.tokens.length < 2) {
      return 0;
    }
    const totalTime = metrics.tokens[metrics.tokens.length - 1] - metrics.tokens[0];
    const durationMs = Math.max(totalTime, MIN_PEAK_WINDOW_MS);
    return ((metrics.tokens.length - 1) / durationMs) * 1000;
  }

  let maxSpeed = 0;
  for (let i = 0; i <= metrics.tokens.length - windowSize; i++) {
    const startTime = metrics.tokens[i];
    const endTime = metrics.tokens[i + windowSize - 1];
    const duration = endTime - startTime;
    const durationMs = Math.max(duration, MIN_PEAK_WINDOW_MS);
    const speed = ((windowSize - 1) / durationMs) * 1000;
    maxSpeed = Math.max(maxSpeed, speed);
  }

  return maxSpeed;
}

/**
 * 计算 TPS (Tokens Per Second) 曲线
 */
export function calculateTPS(metrics: StreamMetrics): number[] {
  if (metrics.tokens.length === 0) {
    return [];
  }

  const totalDuration = metrics.tokens[metrics.tokens.length - 1];
  const totalSeconds = Math.ceil(totalDuration / 1000);

  if (totalSeconds <= 0) {
    return metrics.tokens.length > 0 ? [metrics.tokens.length] : [];
  }

  const tps: number[] = new Array(totalSeconds).fill(0);

  // 计算每秒内的 token 数
  for (const tokenTime of metrics.tokens) {
    const secondIndex = Math.floor(tokenTime / 1000);
    if (secondIndex < tps.length) {
      tps[secondIndex]++;
    }
  }

  return tps;
}

/**
 * 从 StreamMetrics 计算完整的指标
 */
export function calculateMetrics(metrics: StreamMetrics): CalculatedMetrics {
  const tps = calculateTPS(metrics);
  return {
    ttft: calculateTTFT(metrics),
    totalTime: metrics.totalTime,
    totalTokens: metrics.totalTokens,
    averageSpeed: calculateAverageSpeed(metrics),
    peakSpeed: calculatePeakSpeed(metrics),
    peakTps: tps.length > 0 ? Math.max(...tps) : 0,
    tps,
  };
}

/**
 * 计算一组数值的平均值
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * 计算一组数值的标准差
 */
function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squareDiffs = values.map(v => (v - avg) ** 2);
  return Math.sqrt(mean(squareDiffs));
}

/**
 * 计算一组数值的百分位数
 * @param values 已排序的数值数组
 * @param p 百分位 (0-100)
 */
function calculatePercentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];

  // 使用线性插值方法计算百分位数
  const index = (p / 100) * (values.length - 1);
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  const fraction = index - lowerIndex;

  if (lowerIndex === upperIndex) {
    return values[lowerIndex];
  }

  return values[lowerIndex] + fraction * (values[upperIndex] - values[lowerIndex]);
}

/**
 * 计算一组数值的多个百分位数
 */
export function calculatePercentiles(values: number[]): PercentileMetrics {
  if (values.length === 0) {
    return { p50: 0, p95: 0, p99: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: calculatePercentile(sorted, 50),
    p95: calculatePercentile(sorted, 95),
    p99: calculatePercentile(sorted, 99),
  };
}

/**
 * 从多个 CalculatedMetrics 计算统计结果
 */
export function calculateStats(allMetrics: CalculatedMetrics[]): StatsResult {
  if (allMetrics.length === 0) {
    throw new Error("Cannot calculate stats from empty metrics array");
  }

  const sampleSize = allMetrics.length;

  // 提取各项指标的数组
  const ttfts = allMetrics.map(m => m.ttft);
  const totalTimes = allMetrics.map(m => m.totalTime);
  const totalTokens = allMetrics.map(m => m.totalTokens);
  const averageSpeeds = allMetrics.map(m => m.averageSpeed);
  const peakSpeeds = allMetrics.map(m => m.peakSpeed);
  const peakTpsValues = allMetrics.map(m => m.peakTps);

  // 找到最长的 TPS 数组
  const maxTpsLength = Math.max(...allMetrics.map(m => m.tps.length));
  const avgTps: number[] = [];
  for (let i = 0; i < maxTpsLength; i++) {
    const values = allMetrics.map(m => m.tps[i] ?? 0);
    avgTps.push(mean(values));
  }

  return {
    mean: {
      ttft: mean(ttfts),
      totalTime: mean(totalTimes),
      totalTokens: mean(totalTokens),
      averageSpeed: mean(averageSpeeds),
      peakSpeed: mean(peakSpeeds),
      peakTps: mean(peakTpsValues),
      tps: avgTps,
    },
    min: {
      ttft: Math.min(...ttfts),
      totalTime: Math.min(...totalTimes),
      totalTokens: Math.min(...totalTokens),
      averageSpeed: Math.min(...averageSpeeds),
      peakSpeed: Math.min(...peakSpeeds),
      peakTps: Math.min(...peakTpsValues),
      tps: [],
    },
    max: {
      ttft: Math.max(...ttfts),
      totalTime: Math.max(...totalTimes),
      totalTokens: Math.max(...totalTokens),
      averageSpeed: Math.max(...averageSpeeds),
      peakSpeed: Math.max(...peakSpeeds),
      peakTps: Math.max(...peakTpsValues),
      tps: [],
    },
    stdDev: {
      ttft: standardDeviation(ttfts),
      totalTime: standardDeviation(totalTimes),
      totalTokens: standardDeviation(totalTokens),
      averageSpeed: standardDeviation(averageSpeeds),
      peakSpeed: standardDeviation(peakSpeeds),
      peakTps: standardDeviation(peakTpsValues),
      tps: [],
    },
    percentiles: {
      ttft: calculatePercentiles(ttfts),
      totalTime: calculatePercentiles(totalTimes),
      totalTokens: calculatePercentiles(totalTokens),
      averageSpeed: calculatePercentiles(averageSpeeds),
      peakSpeed: calculatePercentiles(peakSpeeds),
      peakTps: calculatePercentiles(peakTpsValues),
    },
    sampleSize,
  };
}

/**
 * 格式化速度显示
 */
export function formatSpeed(tokensPerSecond: number): string {
  return tokensPerSecond.toFixed(2);
}

/**
 * 格式化时间显示
 */
export function formatTime(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}
