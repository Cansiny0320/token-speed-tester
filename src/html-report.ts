import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "./config.js";
import type { CalculatedMetrics, StatsResult } from "./metrics.js";
import type { Lang, Messages } from "./i18n.js";

const CHART_COLORS = [
  "#00f5ff", // cyan
  "#ff00aa", // magenta
  "#ffcc00", // yellow
  "#00ff88", // green
  "#ff6600", // orange
  "#aa00ff", // purple
];

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
};

interface HTMLReportOptions {
  config: Config;
  singleResults: CalculatedMetrics[];
  stats: StatsResult;
  lang: Lang;
  messages: Messages;
}

interface TemplateData {
  lang: Lang;
  title: string;
  reportTitle: string;
  testTimeLabel: string;
  testTime: string;
  configSection: string;
  summarySection: string;
  chartsSection: string;
  statsTitle: string;
  detailsSection: string;
  configGrid: string;
  summaryCards: string;
  charts: string;
  statsTable: string;
  detailsTable: string;
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

function loadTemplate(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return readFileSync(resolve(__dirname, "template.html"), "utf-8");
}

function replaceTemplate(template: string, data: TemplateData): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    result = result.replaceAll(new RegExp(`{{${key}}}`, "g"), value);
  }
  return result;
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

  const avgTps: number[] = [];
  for (let i = 0; i < maxDuration; i++) {
    const values = results.map((r) => r.tps[i] ?? 0);
    avgTps.push(values.reduce((a, b) => a + b, 0) / values.length);
  }

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

  let avgPoints = "";
  avgTps.forEach((tps, i) => {
    const x = padding.left + (i / Math.max(maxDuration - 1, 1)) * chartWidth;
    const y = padding.top + chartHeight - (tps / maxTps) * chartHeight;
    avgPoints += `${x},${y} `;
  });

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

  const xLabels = [];
  const xSteps = Math.min(maxDuration, 10);
  for (let i = 0; i < xSteps; i++) {
    const x = padding.left + (i / Math.max(xSteps - 1, 1)) * chartWidth;
    const label = i.toString();
    xLabels.push(
      `<text x="${x}" y="${height - padding.bottom + 20}" text-anchor="middle" font-size="11" fill="${PALETTE.textMuted}">${label}${messages.htmlTimeUnit}</text>`
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
      <rect x="${padding.left}" y="${padding.top}" width="${chartWidth}" height="${chartHeight}" fill="${PALETTE.bgCard}" rx="4"/>
      ${yLabels.join("\n      ")}
      ${xLabels.join("\n      ")}
      <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="${PALETTE.border}" stroke-width="2"/>
      <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="${PALETTE.border}" stroke-width="2"/>
      ${polylines}
      <polyline
        fill="none"
        stroke="${PALETTE.text}"
        stroke-width="2"
        stroke-dasharray="6,4"
        opacity="0.7"
        points="${avgPoints.trim()}"
      />
      <text x="${padding.left + chartWidth / 2}" y="${height - 8}" text-anchor="middle" font-size="11" fill="${PALETTE.textMuted}">TIME (${messages.htmlTimeUnit})</text>
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
      const hue = 180 + (tps / maxTps) * 60;
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

  const yLabels = [];
  for (let i = 0; i <= 5; i++) {
    const value = Math.round((maxTps * i) / 5);
    const y = padding.top + chartHeight - (i / 5) * chartHeight;
    yLabels.push(
      `<text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="${PALETTE.textMuted}">${value}</text>`
    );
  }

  const xLabels = [];
  const xSteps = Math.min(allTps.length, 8);
  for (let i = 0; i < xSteps; i++) {
    const x = padding.left + (i / Math.max(xSteps - 1, 1)) * chartWidth;
    const label = i.toString();
    xLabels.push(
      `<text x="${x}" y="${height - padding.bottom + 18}" text-anchor="middle" font-size="11" fill="${PALETTE.textMuted}">${label}${messages.htmlTimeUnit}</text>`
    );
  }

  return `
    <svg viewBox="0 0 ${width} ${height}" class="chart" id="tpsChart">
      <style>
        #tpsChart .bar { transition: all 0.2s ease; cursor: pointer; opacity: 0.9; }
        #tpsChart .bar:hover { opacity: 1; filter: brightness(1.2); }
      </style>
      <rect x="${padding.left}" y="${padding.top}" width="${chartWidth}" height="${chartHeight}" fill="${PALETTE.bgCard}" rx="4"/>
      ${yLabels.join("\n      ")}
      ${xLabels.join("\n      ")}
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

  const configGridHtml = `
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
    `;

  const summaryCardsHtml = summaryCards
    .map(
      (card) => `
        <div class="card" style="--card-accent: ${card.accent}">
          <div class="card-label">${card.label}</div>
          <div class="card-value">${card.value}<span class="card-unit">${card.unit || ""}</span></div>
          <div class="card-detail">${card.detail}</div>
        </div>
      `
    )
    .join("");

  const chartsHtml = `
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
    `;

  const statsTableHtml = `
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
    `;

  const detailsTableHtml = `
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
    `;

  const data: TemplateData = {
    lang,
    title: messages.htmlTitle,
    reportTitle: messages.htmlReportTitle,
    testTimeLabel: messages.htmlTestTime,
    testTime,
    configSection: messages.htmlConfigSection,
    summarySection: messages.htmlSummarySection,
    chartsSection: messages.htmlChartsSection,
    statsTitle: messages.statsSummaryTitle(stats.sampleSize),
    detailsSection: messages.htmlDetailsSection,
    configGrid: configGridHtml,
    summaryCards: summaryCardsHtml,
    charts: chartsHtml,
    statsTable: statsTableHtml,
    detailsTable: detailsTableHtml,
  };

  const template = loadTemplate();
  return replaceTemplate(template, data);
}
