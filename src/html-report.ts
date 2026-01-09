import type { Config } from "./config.js";
import type { CalculatedMetrics, StatsResult } from "./metrics.js";
import type { Lang, Messages } from "./i18n.js";

// Color palette for the technical dashboard theme
const PALETTE = {
  bg: "#0a0a0f",
  bgSecondary: "#12121a",
  bgCard: "#1a1a24",
  border: "#2a2a3a",
  text: "#e4e4eb",
  textMuted: "#6a6a7a",
  accent: "#00f5ff",
  accentSecondary: "#ff00aa",
  accentTertiary: "#ffcc00",
  grid: "#1a1a24",
};

const CHART_COLORS = [
  "#00f5ff", // cyan
  "#ff00aa", // magenta
  "#ffcc00", // yellow
  "#00ff88", // green
  "#ff6600", // orange
  "#aa00ff", // purple
];

interface HTMLReportOptions {
  config: Config;
  singleResults: CalculatedMetrics[];
  stats: StatsResult;
  lang: Lang;
  messages: Messages;
}

function formatNumber(num: number, decimals: number = 2): string {
  return num.toFixed(decimals);
}

function formatTime(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

function generateSpeedChart(results: CalculatedMetrics[], messages: Messages): string {
  const allTps = results.flatMap((r) => r.tps);
  if (allTps.length === 0) {
    return `<div class="no-data">${messages.noChartData || "No data available"}</div>`;
  }

  const maxTps = Math.max(...allTps, 1);
  const maxDuration = Math.max(...results.map((r) => r.tps.length));
  const width = 800;
  const height = 320;
  const padding = { top: 30, right: 30, bottom: 45, left: 55 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Generate average TPS line
  const avgTps: number[] = [];
  for (let i = 0; i < maxDuration; i++) {
    const values = results.map((r) => r.tps[i] ?? 0);
    avgTps.push(values.reduce((a, b) => a + b, 0) / values.length);
  }

  // Generate polylines and gradients for each run
  const polylines = results
    .map((result, idx) => {
      const color = CHART_COLORS[idx % CHART_COLORS.length];
      let points = "";
      let areaPoints = `${padding.left},${height - padding.bottom} `;

      result.tps.forEach((tps, i) => {
        const x = padding.left + (i / Math.max(maxDuration - 1, 1)) * chartWidth;
        const y = padding.top + chartHeight - (tps / maxTps) * chartHeight;
        points += `${x},${y} `;
        areaPoints += `${x},${y} `;
      });
      areaPoints += `${padding.left + chartWidth},${height - padding.bottom}`;

      return `
      <defs>
        <linearGradient id="grad-${idx}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:${color};stop-opacity:0.3"/>
          <stop offset="100%" style="stop-color:${color};stop-opacity:0"/>
        </linearGradient>
      </defs>
      <polygon
        points="${areaPoints.trim()}"
        fill="url(#grad-${idx})"
        class="area-${idx}"
      />
      <polyline
        fill="none"
        stroke="${color}"
        stroke-width="2.5"
        points="${points.trim()}"
        class="line line-${idx}"
        data-run="${idx + 1}"
      >
        <animate
          attributeName="stroke-dasharray"
          from="0,2000"
          to="2000,0"
          dur="1.5s"
          fill="freeze"
          calcMode="spline"
          keySplines="0.4 0 0.2 1"
        />
      </polyline>
      ${result.tps
        .map((tps, i) => {
          const x = padding.left + (i / Math.max(maxDuration - 1, 1)) * chartWidth;
          const y = padding.top + chartHeight - (tps / maxTps) * chartHeight;
          return `<circle cx="${x}" cy="${y}" r="4" fill="${PALETTE.bg}" stroke="${color}" stroke-width="2" class="dot-${idx}" opacity="0"><title>${messages.htmlAverageTps || "Avg TPS"} ${i}s: ${tps.toFixed(1)}</title>
          <animate attributeName="opacity" from="0" to="1" begin="${0.5 + i * 0.05}s" dur="0.3s" fill="freeze"/>
        </circle>`;
        })
        .join("")}
    `;
    })
    .join("\n      ");

  // Generate average line
  let avgPoints = "";
  avgTps.forEach((tps, i) => {
    const x = padding.left + (i / Math.max(maxDuration - 1, 1)) * chartWidth;
    const y = padding.top + chartHeight - (tps / maxTps) * chartHeight;
    avgPoints += `${x},${y} `;
  });

  // Generate Y-axis labels
  const yLabels = [];
  for (let i = 0; i <= 5; i++) {
    const value = Math.round((maxTps * i) / 5);
    const y = padding.top + chartHeight - (i / 5) * chartHeight;
    yLabels.push(
      `<text x="${padding.left - 12}" y="${y + 4}" text-anchor="end" font-size="11" fill="${PALETTE.textMuted}">${value}</text>`
    );
    if (i > 0) {
      const yLine = padding.top + chartHeight - (i / 5) * chartHeight;
      yLabels.push(
        `<line x1="${padding.left}" y1="${yLine}" x2="${width - padding.right}" y2="${yLine}" stroke="${PALETTE.border}" stroke-width="1" opacity="0.5"/>`
      );
    }
  }

  // Generate X-axis labels
  const xLabels = [];
  const xSteps = Math.min(maxDuration, 10);
  for (let i = 0; i < xSteps; i++) {
    const x = padding.left + (i / Math.max(xSteps - 1, 1)) * chartWidth;
    const label = i.toString();
    xLabels.push(
      `<text x="${x}" y="${height - padding.bottom + 20}" text-anchor="middle" font-size="11" fill="${PALETTE.textMuted}">${label}${messages.htmlSpeedChartHover}</text>`
    );
  }

  return `
    <svg viewBox="0 0 ${width} ${height}" class="chart" id="speedChart">
      <style>
        #speedChart .line { stroke-dasharray: 2000; stroke-dashoffset: 0; }
        #speedChart .line:hover { stroke-width: 4; filter: drop-shadow(0 0 8px currentColor); }
        #speedChart circle { transition: all 0.2s ease; cursor: pointer; }
        #speedChart circle:hover { r: 6; stroke-width: 3; }
      </style>
      <!-- Grid background -->
      <rect x="${padding.left}" y="${padding.top}" width="${chartWidth}" height="${chartHeight}" fill="${PALETTE.bgCard}" rx="4"/>
      ${yLabels.join("\n      ")}
      ${xLabels.join("\n      ")}
      <!-- Axes -->
      <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="${PALETTE.border}" stroke-width="2"/>
      <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="${PALETTE.border}" stroke-width="2"/>
      <!-- Data lines -->
      ${polylines}
      <!-- Average line -->
      <polyline
        fill="none"
        stroke="${PALETTE.text}"
        stroke-width="2"
        stroke-dasharray="6,4"
        opacity="0.7"
        points="${avgPoints.trim()}"
      />
      <!-- Axis labels -->
      <text x="${padding.left + chartWidth / 2}" y="${height - 8}" text-anchor="middle" font-size="11" fill="${PALETTE.textMuted}">TIME (${messages.htmlSpeedChartHover})</text>
      <text x="12" y="${padding.top + chartHeight / 2}" text-anchor="middle" font-size="11" fill="${PALETTE.textMuted}" transform="rotate(-90, 12, ${padding.top + chartHeight / 2})">TPS</text>
    </svg>
    <div class="chart-legend">
      <div class="legend-item">
        <span class="legend-line avg"></span>
        <span>${messages.htmlSummarySection}</span>
      </div>
      ${results
        .map((_, idx) => {
          const color = CHART_COLORS[idx % CHART_COLORS.length];
          return `
        <div class="legend-item">
          <span class="legend-line" style="background: ${color};"></span>
          <span>${messages.htmlRun} ${idx + 1}</span>
        </div>`;
        })
        .join("")}
    </div>
  `;
}

function generateTPSHistogram(stats: StatsResult, messages: Messages): string {
  const allTps = stats.mean.tps;
  if (allTps.length === 0) {
    return `<div class="no-data">${messages.noTpsData || "No TPS data available"}</div>`;
  }

  const maxTps = Math.max(...allTps);
  const width = 400;
  const height = 280;
  const padding = { top: 25, right: 20, bottom: 40, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const bars = allTps
    .map((tps, i) => {
      const barWidth = chartWidth / allTps.length - 2;
      const x = padding.left + (i / allTps.length) * chartWidth;
      const barHeight = (tps / maxTps) * chartHeight;
      const y = padding.top + chartHeight - barHeight;
      const hue = 180 + (tps / maxTps) * 60; // cyan to blue range
      const color = `hsl(${hue}, 100%, 60%)`;

      return `
      <rect
        x="${x}"
        y="${y}"
        width="${barWidth}"
        height="${barHeight}"
        fill="${color}"
        class="bar"
        data-second="${i}"
        data-tps="${tps.toFixed(2)}"
        rx="2"
      >
        <title>${messages.htmlAverageTps || "Average TPS"} ${i}s: ${tps.toFixed(1)}</title>
        <animate
          attributeName="height"
          from="0"
          to="${barHeight}"
          dur="0.8s"
          fill="freeze"
          calcMode="spline"
          keySplines="0.4 0 0.2 1"
          begin="${i * 0.05}s"
        />
        <animate
          attributeName="y"
          from="${height - padding.bottom}"
          to="${y}"
          dur="0.8s"
          fill="freeze"
          calcMode="spline"
          keySplines="0.4 0 0.2 1"
          begin="${i * 0.05}s"
        />
      </rect>
    `;
    })
    .join("");

  // Generate Y-axis labels
  const yLabels = [];
  for (let i = 0; i <= 5; i++) {
    const value = Math.round((maxTps * i) / 5);
    const y = padding.top + chartHeight - (i / 5) * chartHeight;
    yLabels.push(
      `<text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="${PALETTE.textMuted}">${value}</text>`
    );
  }

  // Generate X-axis labels
  const xLabels = [];
  const xSteps = Math.min(allTps.length, 8);
  for (let i = 0; i < xSteps; i++) {
    const x = padding.left + (i / Math.max(xSteps - 1, 1)) * chartWidth;
    const label = i.toString();
    xLabels.push(
      `<text x="${x}" y="${height - padding.bottom + 18}" text-anchor="middle" font-size="11" fill="${PALETTE.textMuted}">${label}${messages.htmlSpeedChartHover}</text>`
    );
  }

  return `
    <svg viewBox="0 0 ${width} ${height}" class="chart" id="tpsChart">
      <style>
        #tpsChart .bar { transition: all 0.2s ease; cursor: pointer; opacity: 0.9; }
        #tpsChart .bar:hover { opacity: 1; filter: brightness(1.2); }
      </style>
      <!-- Grid background -->
      <rect x="${padding.left}" y="${padding.top}" width="${chartWidth}" height="${chartHeight}" fill="${PALETTE.bgCard}" rx="4"/>
      ${yLabels.join("\n      ")}
      ${xLabels.join("\n      ")}
      <!-- Axes -->
      <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="${PALETTE.border}" stroke-width="2"/>
      <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="${PALETTE.border}" stroke-width="2"/>
      ${bars}
    </svg>
  `;
}

export function generateHTMLReport(options: HTMLReportOptions): string {
  const { config, singleResults, stats, lang, messages } = options;

  const isZh = lang === "zh";
  const testTime = new Date().toLocaleString(isZh ? "zh-CN" : "en-US");

  // Summary cards with accent colors
  const summaryCards = [
    {
      label: messages.statsLabels.ttft,
      value: formatTime(stats.mean.ttft),
      detail: `${messages.statsHeaders.min}: ${formatTime(stats.min.ttft)} · ${messages.statsHeaders.max}: ${formatTime(stats.max.ttft)}`,
      accent: PALETTE.accent,
    },
    {
      label: messages.statsLabels.averageSpeed,
      value: formatNumber(stats.mean.averageSpeed),
      detail: `${messages.statsHeaders.min}: ${formatNumber(stats.min.averageSpeed)} · ${messages.statsHeaders.max}: ${formatNumber(stats.max.averageSpeed)}`,
      accent: PALETTE.accentSecondary,
      unit: messages.htmlSpeed,
    },
    {
      label: messages.statsLabels.peakSpeed,
      value: formatNumber(stats.mean.peakSpeed),
      detail: `${messages.statsHeaders.min}: ${formatNumber(stats.min.peakSpeed)} · ${messages.statsHeaders.max}: ${formatNumber(stats.max.peakSpeed)}`,
      accent: PALETTE.accentTertiary,
      unit: messages.htmlSpeed,
    },
    {
      label: messages.statsLabels.totalTokens,
      value: formatNumber(stats.mean.totalTokens, 0),
      detail: `${messages.statsHeaders.min}: ${formatNumber(stats.min.totalTokens, 0)} · ${messages.statsHeaders.max}: ${formatNumber(stats.max.totalTokens, 0)}`,
      accent: "#00ff88",
    },
  ];

  // Details table rows
  const detailRows = singleResults
    .map(
      (result, idx) => `
        <tr>
          <td><span class="run-badge">${idx + 1}</span></td>
          <td>${formatTime(result.ttft)}</td>
          <td>${formatTime(result.totalTime)}</td>
          <td>${result.totalTokens}</td>
          <td>${formatNumber(result.averageSpeed)}</td>
          <td>${formatNumber(result.peakSpeed)}</td>
          <td>${result.peakTps}</td>
        </tr>
  `
    )
    .join("");

  // Stats table rows
  const statsRows = [
    {
      metric: messages.statsLabels.ttft,
      mean: formatTime(stats.mean.ttft),
      min: formatTime(stats.min.ttft),
      max: formatTime(stats.max.ttft),
      stdDev: formatTime(stats.stdDev.ttft),
    },
    {
      metric: messages.statsLabels.totalTime,
      mean: formatTime(stats.mean.totalTime),
      min: formatTime(stats.min.totalTime),
      max: formatTime(stats.max.totalTime),
      stdDev: formatTime(stats.stdDev.totalTime),
    },
    {
      metric: messages.statsLabels.totalTokens,
      mean: formatNumber(stats.mean.totalTokens, 1),
      min: formatNumber(stats.min.totalTokens, 0),
      max: formatNumber(stats.max.totalTokens, 0),
      stdDev: formatNumber(stats.stdDev.totalTokens, 1),
    },
    {
      metric: messages.statsLabels.averageSpeed,
      mean: formatNumber(stats.mean.averageSpeed),
      min: formatNumber(stats.min.averageSpeed),
      max: formatNumber(stats.max.averageSpeed),
      stdDev: formatNumber(stats.stdDev.averageSpeed),
    },
    {
      metric: messages.statsLabels.peakSpeed,
      mean: formatNumber(stats.mean.peakSpeed),
      min: formatNumber(stats.min.peakSpeed),
      max: formatNumber(stats.max.peakSpeed),
      stdDev: formatNumber(stats.stdDev.peakSpeed),
    },
    {
      metric: messages.statsLabels.peakTps,
      mean: formatNumber(stats.mean.peakTps),
      min: formatNumber(stats.min.peakTps),
      max: formatNumber(stats.max.peakTps),
      stdDev: formatNumber(stats.stdDev.peakTps),
    },
  ]
    .map(
      (row) => `
        <tr>
          <td class="metric-name">${row.metric}</td>
          <td class="value-primary">${row.mean}</td>
          <td>${row.min}</td>
          <td>${row.max}</td>
          <td>${row.stdDev}</td>
        </tr>
  `
    )
    .join("");

  const speedChart = generateSpeedChart(singleResults, messages);
  const tpsChart = generateTPSHistogram(stats, messages);

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${messages.htmlTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: ${PALETTE.bg};
      --bg-secondary: ${PALETTE.bgSecondary};
      --bg-card: ${PALETTE.bgCard};
      --border: ${PALETTE.border};
      --text: ${PALETTE.text};
      --text-muted: ${PALETTE.textMuted};
      --accent: ${PALETTE.accent};
      --accent-secondary: ${PALETTE.accentSecondary};
      --accent-tertiary: ${PALETTE.accentTertiary};
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'JetBrains Mono', 'SF Mono', 'Consolas', monospace;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 0;
      min-height: 100vh;
      position: relative;
      overflow-x: hidden;
    }

    /* Scanline overlay */
    body::before {
      content: "";
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(0, 245, 255, 0.015) 2px,
        rgba(0, 245, 255, 0.015) 4px
      );
      pointer-events: none;
      z-index: 1000;
    }

    /* Grid background */
    body::after {
      content: "";
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image:
        linear-gradient(var(--border) 1px, transparent 1px),
        linear-gradient(90deg, var(--border) 1px, transparent 1px);
      background-size: 40px 40px;
      opacity: 0.3;
      pointer-events: none;
      z-index: -1;
    }

    .container {
      max-width: 1280px;
      margin: 0 auto;
      padding: 32px 24px;
    }

    /* Header */
    header {
      position: relative;
      margin-bottom: 40px;
      padding: 48px 32px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      clip-path: polygon(0 0, calc(100% - 24px) 0, 100% 24px, 100% 100%, 24px 100%, 0 calc(100% - 24px));
    }

    header::before {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--accent), var(--accent-secondary), var(--accent-tertiary));
    }

    header .badge {
      position: absolute;
      top: 16px;
      right: 16px;
      padding: 4px 12px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      font-size: 10px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--accent);
    }

    header h1 {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 4px;
      background: linear-gradient(135deg, var(--accent) 0%, var(--accent-secondary) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    header .subtitle {
      font-size: 12px;
      color: var(--text-muted);
      letter-spacing: 1px;
      text-transform: uppercase;
    }

    /* Decorative corner brackets */
    .corner-bracket {
      position: absolute;
      width: 20px;
      height: 20px;
      border-color: var(--accent);
      border-style: solid;
      pointer-events: none;
    }
    .corner-bracket.tl { top: 8px; left: 8px; border-width: 2px 0 0 2px; }
    .corner-bracket.tr { top: 8px; right: 8px; border-width: 2px 2px 0 0; }
    .corner-bracket.bl { bottom: 8px; left: 8px; border-width: 0 0 2px 2px; }
    .corner-bracket.br { bottom: 8px; right: 8px; border-width: 0 2px 2px 0; }

    /* Section */
    .section {
      background: var(--bg-card);
      border: 1px solid var(--border);
      padding: 24px;
      margin-bottom: 20px;
      position: relative;
    }

    .section::before {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      width: 4px;
      height: 100%;
      background: linear-gradient(180deg, var(--accent), var(--accent-secondary));
    }

    .section-title {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 20px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .section-title::after {
      content: "";
      flex: 1;
      height: 1px;
      background: var(--border);
    }

    /* Config grid */
    .config-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
    }

    .config-item {
      padding: 12px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      position: relative;
    }

    .config-item.wide {
      grid-column: 1 / -1;
    }

    .config-item::before {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      width: 8px;
      height: 8px;
      background: var(--accent);
      clip-path: polygon(0 0, 100% 0, 0 100%);
    }

    .config-label {
      font-size: 10px;
      color: var(--text-muted);
      margin-bottom: 4px;
      letter-spacing: 1px;
      text-transform: uppercase;
    }

    .config-value {
      font-size: 13px;
      font-weight: 500;
      color: var(--text);
      word-break: break-all;
    }

    /* Summary cards */
    .summary-cards {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
    }

    .card {
      padding: 20px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      position: relative;
      overflow: hidden;
      transition: all 0.3s ease;
    }

    .card::before {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: var(--card-accent, var(--accent));
    }

    .card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 32px rgba(0, 245, 255, 0.1);
      border-color: var(--card-accent, var(--accent));
    }

    .card-label {
      font-size: 10px;
      color: var(--text-muted);
      margin-bottom: 8px;
      letter-spacing: 2px;
      text-transform: uppercase;
    }

    .card-value {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 4px;
      color: var(--card-accent, var(--accent));
    }

    .card-unit {
      font-size: 14px;
      font-weight: 400;
      color: var(--text-muted);
      margin-left: 4px;
    }

    .card-detail {
      font-size: 10px;
      color: var(--text-muted);
      letter-spacing: 1px;
    }

    /* Charts */
    .charts-container {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 20px;
    }

    .chart-wrapper {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      padding: 20px;
      position: relative;
    }

    .chart-wrapper::before {
      content: "";
      position: absolute;
      top: 8px;
      left: 8px;
      width: 6px;
      height: 6px;
      background: var(--accent);
    }

    .chart-title {
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 16px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    .chart {
      width: 100%;
      height: auto;
      display: block;
    }

    .chart-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 16px;
      font-size: 11px;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      background: var(--bg);
      border: 1px solid var(--border);
    }

    .legend-line {
      width: 16px;
      height: 2px;
      border-radius: 1px;
    }

    .legend-line.avg {
      background: repeating-linear-gradient(90deg, var(--text) 0px, var(--text) 4px, transparent 4px, transparent 8px);
      height: 3px;
    }

    .no-data {
      text-align: center;
      padding: 40px;
      color: var(--text-muted);
      font-size: 12px;
      letter-spacing: 2px;
      text-transform: uppercase;
    }

    /* Table */
    .table-wrapper {
      overflow-x: auto;
      max-height: 400px;
      overflow-y: auto;
      border: 1px solid var(--border);
    }

    .table-wrapper::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }

    .table-wrapper::-webkit-scrollbar-track {
      background: var(--bg-secondary);
    }

    .table-wrapper::-webkit-scrollbar-thumb {
      background: var(--border);
      border-radius: 4px;
    }

    .table-wrapper::-webkit-scrollbar-thumb:hover {
      background: var(--accent);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    th, td {
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }

    th {
      background: var(--bg-secondary);
      font-weight: 600;
      color: var(--text-muted);
      letter-spacing: 1px;
      text-transform: uppercase;
      font-size: 10px;
      position: sticky;
      top: 0;
      z-index: 10;
    }

    tr:hover {
      background: rgba(0, 245, 255, 0.05);
    }

    .run-badge {
      display: inline-block;
      width: 24px;
      height: 24px;
      line-height: 24px;
      text-align: center;
      background: var(--bg);
      border: 1px solid var(--border);
      font-weight: 600;
    }

    .metric-name {
      font-weight: 600;
      color: var(--text);
    }

    .value-primary {
      color: var(--accent);
      font-weight: 600;
    }

    /* Footer */
    footer {
      text-align: center;
      margin-top: 40px;
      padding: 24px;
      color: var(--text-muted);
      font-size: 11px;
      letter-spacing: 2px;
      text-transform: uppercase;
      border-top: 1px solid var(--border);
    }

    footer strong {
      color: var(--accent);
    }

    /* Animations */
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .section, header {
      animation: fadeInUp 0.6s ease backwards;
    }

    .section:nth-child(1) { animation-delay: 0.1s; }
    .section:nth-child(2) { animation-delay: 0.2s; }
    .section:nth-child(3) { animation-delay: 0.3s; }
    .section:nth-child(4) { animation-delay: 0.4s; }
    .section:nth-child(5) { animation-delay: 0.5s; }

    /* Responsive */
    @media (max-width: 1024px) {
      .summary-cards,
      .config-grid {
        grid-template-columns: repeat(2, 1fr);
      }
      .charts-container {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 640px) {
      .container {
        padding: 16px;
      }
      header {
        padding: 24px 16px;
      }
      header h1 {
        font-size: 20px;
        letter-spacing: 2px;
      }
      .summary-cards,
      .config-grid {
        grid-template-columns: 1fr;
      }
      .card-value {
        font-size: 24px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <span class="badge">Performance Report</span>
      <div class="corner-bracket tl"></div>
      <div class="corner-bracket tr"></div>
      <div class="corner-bracket bl"></div>
      <div class="corner-bracket br"></div>
      <h1>${messages.htmlReportTitle}</h1>
      <div class="subtitle">${messages.htmlTestTime}: ${testTime}</div>
    </header>

    <section class="section">
      <div class="section-title">// ${messages.htmlConfigSection}</div>
      <div class="config-grid">
        <div class="config-item">
          <span class="config-label">${messages.configLabels.provider}</span>
          <span class="config-value">${config.provider.toUpperCase()}</span>
        </div>
        <div class="config-item">
          <span class="config-label">${messages.configLabels.model}</span>
          <span class="config-value">${escapeHtml(config.model)}</span>
        </div>
        <div class="config-item">
          <span class="config-label">${messages.configLabels.maxTokens}</span>
          <span class="config-value">${config.maxTokens}</span>
        </div>
        <div class="config-item">
          <span class="config-label">${messages.configLabels.runs}</span>
          <span class="config-value">${config.runCount}</span>
        </div>
        <div class="config-item wide">
          <span class="config-label">${messages.configLabels.prompt}</span>
          <span class="config-value">"${escapeHtml(config.prompt)}"</span>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-title">// ${messages.htmlSummarySection}</div>
      <div class="summary-cards">
        ${summaryCards
          .map(
            (card) => `
        <div class="card" style="--card-accent: ${card.accent}">
          <div class="card-label">${card.label}</div>
          <div class="card-value">${card.value}<span class="card-unit">${card.unit || ""}</span></div>
          <div class="card-detail">${card.detail}</div>
        </div>
        `
          )
          .join("")}
      </div>
    </section>

    <section class="section">
      <div class="section-title">// ${messages.htmlChartsSection}</div>
      <div class="charts-container">
        <div class="chart-wrapper">
          <div class="chart-title">${messages.speedChartTitle}</div>
          ${speedChart}
        </div>
        <div class="chart-wrapper">
          <div class="chart-title">${messages.htmlTpsDistribution}</div>
          ${tpsChart}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-title">// ${messages.statsSummaryTitle(stats.sampleSize)}</div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>${messages.statsHeaders.metric}</th>
              <th>${messages.statsHeaders.mean}</th>
              <th>${messages.statsHeaders.min}</th>
              <th>${messages.statsHeaders.max}</th>
              <th>${messages.statsHeaders.stdDev}</th>
            </tr>
          </thead>
          <tbody>
            ${statsRows}
          </tbody>
        </table>
      </div>
    </section>

    <section class="section">
      <div class="section-title">// ${messages.htmlDetailsSection}</div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>${messages.htmlRun}</th>
              <th>${messages.resultLabels.ttft}</th>
              <th>${messages.resultLabels.totalTime}</th>
              <th>${messages.resultLabels.totalTokens}</th>
              <th>${messages.resultLabels.averageSpeed}</th>
              <th>${messages.resultLabels.peakSpeed}</th>
              <th>${messages.resultLabels.peakTps}</th>
            </tr>
          </thead>
          <tbody>
            ${detailRows}
          </tbody>
        </table>
      </div>
    </section>

    <footer>
      Generated by <strong>token-speed-test</strong> // LLM API Streaming Performance Tool
    </footer>
  </div>
</body>
</html>`;
}
