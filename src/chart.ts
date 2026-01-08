import stringWidth from "string-width";
import type { CalculatedMetrics, StatsResult } from "./metrics.js";

const BLOCK_CHAR = "█";
const CHART_WIDTH = 50;
const CHART_HEIGHT = 10;
const STAT_LABEL_WIDTH = 15;
const STAT_VALUE_WIDTH = 10;
const Y_LABEL_WIDTH = 4;

function padEndWidth(text: string, width: number): string {
  const currentWidth = stringWidth(text);
  if (currentWidth >= width) {
    return text;
  }
  return text + " ".repeat(width - currentWidth);
}

function padStartWidth(text: string, width: number): string {
  const currentWidth = stringWidth(text);
  if (currentWidth >= width) {
    return text;
  }
  return " ".repeat(width - currentWidth) + text;
}

/**
 * 渲染速度趋势图
 */
export function renderSpeedChart(tps: number[], maxSpeed?: number): string {
  if (tps.length === 0) {
    return "No data available for chart";
  }

  const actualMax = maxSpeed ?? Math.max(...tps, 1);
  const maxVal = Math.max(actualMax, 1);

  const buildRow = (label: string, bars: string) =>
    `│ ${padStartWidth(label, Y_LABEL_WIDTH)} ┤${bars} │`;
  const emptyRow = buildRow("0", " ".repeat(CHART_WIDTH));
  const chartWidth = stringWidth(emptyRow) - 2;
  const axisPrefix = `│ ${padStartWidth("", Y_LABEL_WIDTH)} ┼`;

  const lines: string[] = [];
  lines.push("Token 速度趋势图 (TPS)");

  // Y 轴标签和边框
  lines.push("┌" + "─".repeat(chartWidth) + "┐");

  for (let row = CHART_HEIGHT - 1; row >= 0; row--) {
    const value = (row / (CHART_HEIGHT - 1)) * maxVal;
    const label = value.toFixed(0);

    let bars = "";
    for (let col = 0; col < CHART_WIDTH; col++) {
      const index = Math.floor((col / CHART_WIDTH) * tps.length);
      const tpsValue = tps[index] ?? 0;
      const normalizedHeight = (tpsValue / maxVal) * (CHART_HEIGHT - 1);
      bars += normalizedHeight >= row ? BLOCK_CHAR : " ";
    }

    lines.push(buildRow(label, bars));
  }

  // X 轴
  lines.push(`${axisPrefix}${"─".repeat(CHART_WIDTH)} │`);
  lines.push("└" + "─".repeat(chartWidth) + "┘");

  // X 轴标签 (时间标记)
  const xLabels = generateXLabels(tps.length, 6);
  const labelLine = new Array(CHART_WIDTH).fill(" ");
  const maxIndex = Math.max(tps.length - 1, 1);
  for (const label of xLabels) {
    const seconds = parseInt(label.replace("s", ""), 10);
    const position = Math.min(
      CHART_WIDTH - 1,
      Math.round((seconds / maxIndex) * (CHART_WIDTH - 1))
    );
    for (let i = 0; i < label.length && position + i < CHART_WIDTH; i++) {
      labelLine[position + i] = label[i];
    }
  }
  lines.push(" ".repeat(stringWidth(axisPrefix)) + labelLine.join(""));

  return lines.join("\n");
}

/**
 * 生成 X 轴时间标签
 */
function generateXLabels(dataPoints: number, maxLabels: number): string[] {
  if (dataPoints <= 1) {
    return ["0s"];
  }

  const labels: string[] = [];
  const step = Math.max(1, Math.floor(dataPoints / maxLabels));

  for (let i = 0; i < dataPoints; i += step) {
    labels.push(`${i}s`);
  }

  // 确保最后一个标签是结束时间
  if (labels[labels.length - 1] !== `${dataPoints - 1}s`) {
    labels.push(`${dataPoints - 1}s`);
  }

  return labels;
}

/**
 * 渲染 TPS 直方图
 */
export function renderTPSHistogram(tps: number[]): string {
  if (tps.length === 0) {
    return "No TPS data available";
  }

  const lines: string[] = [];
  lines.push("TPS 分布");

  // 计算分布区间
  const maxTps = Math.max(...tps, 1);
  const buckets = 10;
  const bucketSize = maxTps / buckets;
  const histogram = new Array(buckets).fill(0);

  for (const t of tps) {
    const bucketIndex = Math.min(Math.floor(t / bucketSize), buckets - 1);
    histogram[bucketIndex]++;
  }

  const maxCount = Math.max(...histogram, 1);

  const labels = histogram.map((_, i) => {
    const bucketStart = (i * bucketSize).toFixed(1);
    const bucketEnd = ((i + 1) * bucketSize).toFixed(1);
    return `${bucketStart}-${bucketEnd}`;
  });
  const labelWidth = Math.max(...labels.map((l) => stringWidth(l)));

  for (let i = 0; i < buckets; i++) {
    const label = padEndWidth(labels[i], labelWidth);
    const count = histogram[i];
    const barLength = Math.round((count / maxCount) * CHART_WIDTH);
    const bar = BLOCK_CHAR.repeat(barLength);

    const countSuffix = count > 0 ? ` ${count}` : "";
    lines.push(`${label} │${bar}${countSuffix}`);
  }

  return lines.join("\n");
}

/**
 * 渲染统计汇总表
 */
export function renderStatsTable(stats: StatsResult): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("统计汇总 (N=" + stats.sampleSize + ")");

  // 表头
  const headerRow =
    "│ " +
    padEndWidth("指标", STAT_LABEL_WIDTH) +
    " │ " +
    padStartWidth("均值", STAT_VALUE_WIDTH) +
    " │ " +
    padStartWidth("最小值", STAT_VALUE_WIDTH) +
    " │ " +
    padStartWidth("最大值", STAT_VALUE_WIDTH) +
    " │ " +
    padStartWidth("标准差", STAT_VALUE_WIDTH) +
    " │";

  const tableWidth = stringWidth(headerRow) - 2;
  lines.push("┌" + "─".repeat(tableWidth) + "┐");
  lines.push(headerRow);
  lines.push("├" + "─".repeat(tableWidth) + "┤");

  // TTFT
  lines.push(
    formatStatRow(
      "TTFT (ms)",
      stats.mean.ttft,
      stats.min.ttft,
      stats.max.ttft,
      stats.stdDev.ttft,
      "f"
    )
  );
  lines.push("├" + "─".repeat(tableWidth) + "┤");

  // 总耗时
  lines.push(
    formatStatRow(
      "总耗时 (ms)",
      stats.mean.totalTime,
      stats.min.totalTime,
      stats.max.totalTime,
      stats.stdDev.totalTime,
      "f"
    )
  );
  lines.push("├" + "─".repeat(tableWidth) + "┤");

  // 总 token 数
  lines.push(
    formatStatRow(
      "总 Token 数",
      stats.mean.totalTokens,
      stats.min.totalTokens,
      stats.max.totalTokens,
      stats.stdDev.totalTokens,
      "f"
    )
  );
  lines.push("├" + "─".repeat(tableWidth) + "┤");

  // 平均速度
  lines.push(
    formatStatRow(
      "平均速度",
      stats.mean.averageSpeed,
      stats.min.averageSpeed,
      stats.max.averageSpeed,
      stats.stdDev.averageSpeed,
      "f"
    )
  );
  lines.push("├" + "─".repeat(tableWidth) + "┤");

  // 峰值速度
  lines.push(
    formatStatRow(
      "峰值速度",
      stats.mean.peakSpeed,
      stats.min.peakSpeed,
      stats.max.peakSpeed,
      stats.stdDev.peakSpeed,
      "f"
    )
  );

  lines.push("└" + "─".repeat(tableWidth) + "┘");

  return lines.join("\n");
}

/**
 * 格式化统计表格的一行
 */
function formatStatRow(
  label: string,
  mean: number,
  min: number,
  max: number,
  stdDev: number,
  format: "f" | "d"
): string {
  const fmt = (n: number) => (format === "f" ? n.toFixed(2) : n.toFixed(0));

  return (
    "│ " +
    padEndWidth(label, STAT_LABEL_WIDTH) +
    " │ " +
    padStartWidth(fmt(mean), STAT_VALUE_WIDTH) +
    " │ " +
    padStartWidth(fmt(min), STAT_VALUE_WIDTH) +
    " │ " +
    padStartWidth(fmt(max), STAT_VALUE_WIDTH) +
    " │ " +
    padStartWidth(fmt(stdDev), STAT_VALUE_WIDTH) +
    " │"
  );
}

/**
 * 格式化时间显示（带小数）
 */
function formatTimeWithDecimals(ms: number): string {
  if (ms === Math.floor(ms)) {
    return `${ms.toFixed(0)}ms`;
  }
  return `${ms.toFixed(2)}ms`;
}

/**
 * 渲染单次测试结果
 */
export function renderSingleResult(metrics: CalculatedMetrics, runIndex: number): string {
  const lines: string[] = [];
  lines.push(`\n[运行 ${runIndex + 1}]`);
  lines.push(`  TTFT: ${formatTimeWithDecimals(metrics.ttft)}`);
  lines.push(`  总耗时: ${formatTimeWithDecimals(metrics.totalTime)}`);
  lines.push(`  总 Token 数: ${metrics.totalTokens}`);
  lines.push(`  平均速度: ${metrics.averageSpeed.toFixed(2)} tokens/s`);
  lines.push(`  峰值速度: ${metrics.peakSpeed.toFixed(2)} tokens/s`);
  return lines.join("\n");
}

/**
 * 渲染完整的测试报告
 */
export function renderReport(stats: StatsResult): string {
  const lines: string[] = [];

  lines.push("\n" + "═".repeat(72));
  lines.push("Token 速度测试报告");
  lines.push("═".repeat(72));

  // 汇总统计
  lines.push(renderStatsTable(stats));

  // 速度趋势图
  if (stats.mean.tps.length > 0) {
    lines.push("\n" + renderSpeedChart(stats.mean.tps));
  }

  // TPS 直方图
  if (stats.mean.tps.length > 0) {
    lines.push("\n" + renderTPSHistogram(stats.mean.tps));
  }

  return lines.join("\n");
}
