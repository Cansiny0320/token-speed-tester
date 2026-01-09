import type { Config } from "./config.js";
import type { CalculatedMetrics, StatsResult } from "./metrics.js";

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
  stats: StatsResult
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
    runs: results.map((r) => ({
      ttft: Math.round(r.ttft * 100) / 100,
      totalTime: Math.round(r.totalTime * 100) / 100,
      totalTokens: r.totalTokens,
      averageSpeed: Math.round(r.averageSpeed * 100) / 100,
      peakSpeed: Math.round(r.peakSpeed * 100) / 100,
      peakTps: Math.round(r.peakTps * 100) / 100,
      tps: r.tps,
    })),
    stats: {
      mean: {
        ttft: Math.round(stats.mean.ttft * 100) / 100,
        totalTime: Math.round(stats.mean.totalTime * 100) / 100,
        totalTokens: Math.round(stats.mean.totalTokens * 100) / 100,
        averageSpeed: Math.round(stats.mean.averageSpeed * 100) / 100,
        peakSpeed: Math.round(stats.mean.peakSpeed * 100) / 100,
        peakTps: Math.round(stats.mean.peakTps * 100) / 100,
      },
      min: {
        ttft: Math.round(stats.min.ttft * 100) / 100,
        totalTime: Math.round(stats.min.totalTime * 100) / 100,
        totalTokens: stats.min.totalTokens,
        averageSpeed: Math.round(stats.min.averageSpeed * 100) / 100,
        peakSpeed: Math.round(stats.min.peakSpeed * 100) / 100,
        peakTps: Math.round(stats.min.peakTps * 100) / 100,
      },
      max: {
        ttft: Math.round(stats.max.ttft * 100) / 100,
        totalTime: Math.round(stats.max.totalTime * 100) / 100,
        totalTokens: stats.max.totalTokens,
        averageSpeed: Math.round(stats.max.averageSpeed * 100) / 100,
        peakSpeed: Math.round(stats.max.peakSpeed * 100) / 100,
        peakTps: Math.round(stats.max.peakTps * 100) / 100,
      },
      p50: {
        ttft: Math.round(stats.percentiles.ttft.p50 * 100) / 100,
        totalTime: Math.round(stats.percentiles.totalTime.p50 * 100) / 100,
        totalTokens: Math.round(stats.percentiles.totalTokens.p50 * 100) / 100,
        averageSpeed: Math.round(stats.percentiles.averageSpeed.p50 * 100) / 100,
        peakSpeed: Math.round(stats.percentiles.peakSpeed.p50 * 100) / 100,
        peakTps: Math.round(stats.percentiles.peakTps.p50 * 100) / 100,
      },
      p95: {
        ttft: Math.round(stats.percentiles.ttft.p95 * 100) / 100,
        totalTime: Math.round(stats.percentiles.totalTime.p95 * 100) / 100,
        totalTokens: Math.round(stats.percentiles.totalTokens.p95 * 100) / 100,
        averageSpeed: Math.round(stats.percentiles.averageSpeed.p95 * 100) / 100,
        peakSpeed: Math.round(stats.percentiles.peakSpeed.p95 * 100) / 100,
        peakTps: Math.round(stats.percentiles.peakTps.p95 * 100) / 100,
      },
      p99: {
        ttft: Math.round(stats.percentiles.ttft.p99 * 100) / 100,
        totalTime: Math.round(stats.percentiles.totalTime.p99 * 100) / 100,
        totalTokens: Math.round(stats.percentiles.totalTokens.p99 * 100) / 100,
        averageSpeed: Math.round(stats.percentiles.averageSpeed.p99 * 100) / 100,
        peakSpeed: Math.round(stats.percentiles.peakSpeed.p99 * 100) / 100,
        peakTps: Math.round(stats.percentiles.peakTps.p99 * 100) / 100,
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
  stats: StatsResult
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
    `TTFT (ms),${stats.mean.ttft.toFixed(2)},${stats.percentiles.ttft.p50.toFixed(2)},${stats.percentiles.ttft.p95.toFixed(2)},${stats.percentiles.ttft.p99.toFixed(2)},${stats.min.ttft.toFixed(2)},${stats.max.ttft.toFixed(2)}`
  );
  lines.push(
    `Total Time (ms),${stats.mean.totalTime.toFixed(2)},${stats.percentiles.totalTime.p50.toFixed(2)},${stats.percentiles.totalTime.p95.toFixed(2)},${stats.percentiles.totalTime.p99.toFixed(2)},${stats.min.totalTime.toFixed(2)},${stats.max.totalTime.toFixed(2)}`
  );
  lines.push(
    `Total Tokens,${stats.mean.totalTokens.toFixed(2)},${stats.percentiles.totalTokens.p50.toFixed(2)},${stats.percentiles.totalTokens.p95.toFixed(2)},${stats.percentiles.totalTokens.p99.toFixed(2)},${stats.min.totalTokens},${stats.max.totalTokens}`
  );
  lines.push(
    `Average Speed (tokens/s),${stats.mean.averageSpeed.toFixed(2)},${stats.percentiles.averageSpeed.p50.toFixed(2)},${stats.percentiles.averageSpeed.p95.toFixed(2)},${stats.percentiles.averageSpeed.p99.toFixed(2)},${stats.min.averageSpeed.toFixed(2)},${stats.max.averageSpeed.toFixed(2)}`
  );
  lines.push(
    `Peak Speed (tokens/s),${stats.mean.peakSpeed.toFixed(2)},${stats.percentiles.peakSpeed.p50.toFixed(2)},${stats.percentiles.peakSpeed.p95.toFixed(2)},${stats.percentiles.peakSpeed.p99.toFixed(2)},${stats.min.peakSpeed.toFixed(2)},${stats.max.peakSpeed.toFixed(2)}`
  );
  lines.push(
    `Peak TPS,${stats.mean.peakTps.toFixed(2)},${stats.percentiles.peakTps.p50.toFixed(2)},${stats.percentiles.peakTps.p95.toFixed(2)},${stats.percentiles.peakTps.p99.toFixed(2)},${stats.min.peakTps.toFixed(2)},${stats.max.peakTps.toFixed(2)}`
  );
  lines.push("");

  // Individual runs section
  lines.push("# Individual Runs");
  lines.push(
    "Run,TTFT (ms),Total Time (ms),Total Tokens,Average Speed (tokens/s),Peak Speed (tokens/s),Peak TPS"
  );
  results.forEach((r, i) => {
    lines.push(
      `${i + 1},${r.ttft.toFixed(2)},${r.totalTime.toFixed(2)},${r.totalTokens},${r.averageSpeed.toFixed(2)},${r.peakSpeed.toFixed(2)},${r.peakTps.toFixed(2)}`
    );
  });

  return lines.join("\n");
}
