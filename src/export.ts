import type { Config } from "./config.js";
import type { CalculatedMetrics, StatsResult } from "./metrics.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface ExportData {
  timestamp: string;
  config: {
    provider: string;
    model: string;
    maxTokens: number;
    runCount: number;
    prompt: string;
  };
  runs: ExportRun[];
  stats: ExportStats;
}

export interface ExportRun {
  ttft: number;
  totalTime: number;
  totalTokens: number;
  averageSpeed: number;
  peakSpeed: number;
  peakTps: number;
  tps: number[];
}

export interface ExportStats {
  mean: ExportMetrics;
  min: ExportMetrics;
  max: ExportMetrics;
  p50: ExportMetrics;
  p95: ExportMetrics;
  p99: ExportMetrics;
}

export interface ExportMetrics {
  ttft: number;
  totalTime: number;
  totalTokens: number;
  averageSpeed: number;
  peakSpeed: number;
  peakTps: number;
}

/**
 * Generate JSON export data
 */
export function generateJSONExport(
  config: Config,
  results: CalculatedMetrics[],
  stats: StatsResult,
): string {
  const exportData: ExportData = {
    timestamp: new Date().toISOString(),
    config: {
      provider: config.provider,
      model: config.model,
      maxTokens: config.maxTokens,
      runCount: config.runCount,
      prompt: config.prompt,
    },
    runs: results.map(r => ({
      ttft: round2(r.ttft),
      totalTime: round2(r.totalTime),
      totalTokens: r.totalTokens,
      averageSpeed: round2(r.averageSpeed),
      peakSpeed: round2(r.peakSpeed),
      peakTps: round2(r.peakTps),
      tps: r.tps,
    })),
    stats: {
      mean: {
        ttft: round2(stats.mean.ttft),
        totalTime: round2(stats.mean.totalTime),
        totalTokens: round2(stats.mean.totalTokens),
        averageSpeed: round2(stats.mean.averageSpeed),
        peakSpeed: round2(stats.mean.peakSpeed),
        peakTps: round2(stats.mean.peakTps),
      },
      min: {
        ttft: round2(stats.min.ttft),
        totalTime: round2(stats.min.totalTime),
        totalTokens: stats.min.totalTokens,
        averageSpeed: round2(stats.min.averageSpeed),
        peakSpeed: round2(stats.min.peakSpeed),
        peakTps: round2(stats.min.peakTps),
      },
      max: {
        ttft: round2(stats.max.ttft),
        totalTime: round2(stats.max.totalTime),
        totalTokens: stats.max.totalTokens,
        averageSpeed: round2(stats.max.averageSpeed),
        peakSpeed: round2(stats.max.peakSpeed),
        peakTps: round2(stats.max.peakTps),
      },
      p50: {
        ttft: round2(stats.percentiles.ttft.p50),
        totalTime: round2(stats.percentiles.totalTime.p50),
        totalTokens: round2(stats.percentiles.totalTokens.p50),
        averageSpeed: round2(stats.percentiles.averageSpeed.p50),
        peakSpeed: round2(stats.percentiles.peakSpeed.p50),
        peakTps: round2(stats.percentiles.peakTps.p50),
      },
      p95: {
        ttft: round2(stats.percentiles.ttft.p95),
        totalTime: round2(stats.percentiles.totalTime.p95),
        totalTokens: round2(stats.percentiles.totalTokens.p95),
        averageSpeed: round2(stats.percentiles.averageSpeed.p95),
        peakSpeed: round2(stats.percentiles.peakSpeed.p95),
        peakTps: round2(stats.percentiles.peakTps.p95),
      },
      p99: {
        ttft: round2(stats.percentiles.ttft.p99),
        totalTime: round2(stats.percentiles.totalTime.p99),
        totalTokens: round2(stats.percentiles.totalTokens.p99),
        averageSpeed: round2(stats.percentiles.averageSpeed.p99),
        peakSpeed: round2(stats.percentiles.peakSpeed.p99),
        peakTps: round2(stats.percentiles.peakTps.p99),
      },
    },
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Generate CSV export data
 */
export function generateCSVExport(
  config: Config,
  results: CalculatedMetrics[],
  stats: StatsResult,
): string {
  const lines: string[] = [];

  // Header with metadata
  lines.push("# Token Speed Test Results");
  lines.push(`# Timestamp: ${new Date().toISOString()}`);
  lines.push(`# Provider: ${config.provider}`);
  lines.push(`# Model: ${config.model}`);
  lines.push(`# Runs: ${config.runCount}`);
  lines.push(`# Prompt: ${config.prompt}`);
  lines.push("");

  // Statistics section
  lines.push("# Statistics");
  lines.push("Metric,Mean,P50,P95,P99,Min,Max");
  lines.push(
    `TTFT (ms),${stats.mean.ttft.toFixed(2)},${stats.percentiles.ttft.p50.toFixed(2)},${stats.percentiles.ttft.p95.toFixed(2)},${stats.percentiles.ttft.p99.toFixed(2)},${stats.min.ttft.toFixed(2)},${stats.max.ttft.toFixed(2)}`,
  );
  lines.push(
    `Total Time (ms),${stats.mean.totalTime.toFixed(2)},${stats.percentiles.totalTime.p50.toFixed(2)},${stats.percentiles.totalTime.p95.toFixed(2)},${stats.percentiles.totalTime.p99.toFixed(2)},${stats.min.totalTime.toFixed(2)},${stats.max.totalTime.toFixed(2)}`,
  );
  lines.push(
    `Total Tokens,${stats.mean.totalTokens.toFixed(2)},${stats.percentiles.totalTokens.p50.toFixed(2)},${stats.percentiles.totalTokens.p95.toFixed(2)},${stats.percentiles.totalTokens.p99.toFixed(2)},${stats.min.totalTokens},${stats.max.totalTokens}`,
  );
  lines.push(
    `Average Speed (tokens/s),${stats.mean.averageSpeed.toFixed(2)},${stats.percentiles.averageSpeed.p50.toFixed(2)},${stats.percentiles.averageSpeed.p95.toFixed(2)},${stats.percentiles.averageSpeed.p99.toFixed(2)},${stats.min.averageSpeed.toFixed(2)},${stats.max.averageSpeed.toFixed(2)}`,
  );
  lines.push(
    `Peak Speed (tokens/s),${stats.mean.peakSpeed.toFixed(2)},${stats.percentiles.peakSpeed.p50.toFixed(2)},${stats.percentiles.peakSpeed.p95.toFixed(2)},${stats.percentiles.peakSpeed.p99.toFixed(2)},${stats.min.peakSpeed.toFixed(2)},${stats.max.peakSpeed.toFixed(2)}`,
  );
  lines.push(
    `Peak TPS,${stats.mean.peakTps.toFixed(2)},${stats.percentiles.peakTps.p50.toFixed(2)},${stats.percentiles.peakTps.p95.toFixed(2)},${stats.percentiles.peakTps.p99.toFixed(2)},${stats.min.peakTps.toFixed(2)},${stats.max.peakTps.toFixed(2)}`,
  );
  lines.push("");

  // Individual runs section
  lines.push("# Individual Runs");
  lines.push(
    "Run,TTFT (ms),Total Time (ms),Total Tokens,Average Speed (tokens/s),Peak Speed (tokens/s),Peak TPS",
  );
  results.forEach((r, i) => {
    lines.push(
      `${i + 1},${r.ttft.toFixed(2)},${r.totalTime.toFixed(2)},${r.totalTokens},${r.averageSpeed.toFixed(2)},${r.peakSpeed.toFixed(2)},${r.peakTps.toFixed(2)}`,
    );
  });

  return lines.join("\n");
}
