import type { Config } from "./config.js";
import type { CalculatedMetrics, StatsResult } from "./metrics.js";
import type { Lang, Messages } from "./i18n.js";

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

function generateSpeedChart(
  results: CalculatedMetrics[],
  messages: Messages
): string {
  const allTps = results.flatMap((r) => r.tps);
  if (allTps.length === 0) {
    return `<div class="no-data">${messages.noChartData}</div>`;
  }

  const maxTps = Math.max(...allTps, 1);
  const maxDuration = Math.max(...results.map((r) => r.tps.length));
  const width = 800;
  const height = 300;
  const padding = { top: 20, right: 30, bottom: 40, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const colors = [
    "#3b82f6", // blue
    "#10b981", // green
    "#f59e0b", // amber
    "#ef4444", // red
    "#8b5cf6", // purple
    "#ec4899", // pink
  ];

  // Generate average TPS line
  const avgTps: number[] = [];
  for (let i = 0; i < maxDuration; i++) {
    const values = results.map((r) => r.tps[i] ?? 0);
    avgTps.push(values.reduce((a, b) => a + b, 0) / values.length);
  }

  // Generate polylines for each run
  const polylines = results.map((result, idx) => {
    const color = colors[idx % colors.length];
    let points = "";
    result.tps.forEach((tps, i) => {
      const x = padding.left + (i / Math.max(maxDuration - 1, 1)) * chartWidth;
      const y = padding.top + chartHeight - (tps / maxTps) * chartHeight;
      points += `${x},${y} `;
    });
    return `<polyline
      fill="none"
      stroke="${color}"
      stroke-width="2"
      points="${points.trim()}"
      class="line-${idx}"
      data-run="${idx + 1}"
      opacity="0.6"
    />`;
  }).join("\n    ");

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
      `<text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-size="12">${value}</text>`
    );
    if (i > 0) {
      const yLine = padding.top + chartHeight - (i / 5) * chartHeight;
      yLabels.push(
        `<line x1="${padding.left}" y1="${yLine}" x2="${width - padding.right}" y2="${yLine}" stroke="#e5e7eb" stroke-dasharray="4"/>`
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
      `<text x="${x}" y="${height - padding.bottom + 20}" text-anchor="middle" font-size="12">${label}${messages.htmlSpeedChartHover}</text>`
    );
  }

  return `
    <svg viewBox="0 0 ${width} ${height}" class="chart" id="speedChart">
      <style>
        #speedChart polyline { transition: opacity 0.2s, stroke-width 0.2s; cursor: pointer; }
        #speedChart polyline:hover { opacity: 1 !important; stroke-width: 3; }
      </style>
      ${yLabels.join("\n      ")}
      ${xLabels.join("\n      ")}
      <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="#9ca3af" stroke-width="1"/>
      <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="#9ca3af" stroke-width="1"/>
      ${polylines}
      <polyline
        fill="none"
        stroke="#1f2937"
        stroke-width="3"
        stroke-dasharray="8,4"
        points="${avgPoints.trim()}"
      />
      <text x="${padding.left + chartWidth / 2}" y="${height - 5}" text-anchor="middle" font-size="12" fill="#6b7280">Time (${messages.htmlSpeedChartHover})</text>
      <text x="15" y="${padding.top + chartHeight / 2}" text-anchor="middle" font-size="12" fill="#6b7280" transform="rotate(-90, 15, ${padding.top + chartHeight / 2})">${messages.htmlTps}</text>
    </svg>
    <div class="chart-legend">
      <div class="legend-item">
        <span class="legend-line" style="background: #1f2937; height: 3px;"></span>
        <span>${messages.htmlSummarySection}</span>
      </div>
      ${results.map((_, idx) => {
        const color = colors[idx % colors.length];
        return `
        <div class="legend-item">
          <span class="legend-line" style="background: ${color};"></span>
          <span>${messages.htmlRun} ${idx + 1}</span>
        </div>`;
      }).join("")}
    </div>
  `;
}

function generateTPSHistogram(
  stats: StatsResult,
  messages: Messages
): string {
  const allTps = stats.mean.tps;
  if (allTps.length === 0) {
    return `<div class="no-data">${messages.noTpsData}</div>`;
  }

  const maxTps = Math.max(...allTps);
  const width = 400;
  const height = 250;
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const bars = allTps.map((tps, i) => {
    const barWidth = chartWidth / allTps.length - 2;
    const x = padding.left + (i / allTps.length) * chartWidth;
    const barHeight = (tps / maxTps) * chartHeight;
    const y = padding.top + chartHeight - barHeight;

    return `
      <rect
        x="${x}"
        y="${y}"
        width="${barWidth}"
        height="${barHeight}"
        fill="#3b82f6"
        class="bar"
        data-second="${i}"
        data-tps="${tps.toFixed(2)}"
        opacity="0.8"
      >
        <title>${messages.htmlAverageTps} ${i}s: ${tps.toFixed(2)} ${messages.htmlTps}</title>
      </rect>
    `;
  }).join("");

  // Generate Y-axis labels
  const yLabels = [];
  for (let i = 0; i <= 5; i++) {
    const value = Math.round((maxTps * i) / 5);
    const y = padding.top + chartHeight - (i / 5) * chartHeight;
    yLabels.push(
      `<text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-size="12">${value}</text>`
    );
  }

  // Generate X-axis labels
  const xLabels = [];
  const xSteps = Math.min(allTps.length, 8);
  for (let i = 0; i < xSteps; i++) {
    const x = padding.left + (i / Math.max(xSteps - 1, 1)) * chartWidth;
    const label = i.toString();
    xLabels.push(
      `<text x="${x}" y="${height - padding.bottom + 20}" text-anchor="middle" font-size="12">${label}${messages.htmlSpeedChartHover}</text>`
    );
  }

  return `
    <svg viewBox="0 0 ${width} ${height}" class="chart" id="tpsChart">
      <style>
        #tpsChart .bar { transition: opacity 0.2s; cursor: pointer; }
        #tpsChart .bar:hover { opacity: 1; }
      </style>
      ${yLabels.join("\n      ")}
      ${xLabels.join("\n      ")}
      <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="#9ca3af" stroke-width="1"/>
      <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="#9ca3af" stroke-width="1"/>
      ${bars}
    </svg>
  `;
}

export function generateHTMLReport(options: HTMLReportOptions): string {
  const { config, singleResults, stats, lang, messages } = options;

  const isZh = lang === "zh";
  const testTime = new Date().toLocaleString(isZh ? "zh-CN" : "en-US");

  // Summary cards
  const summaryCards = [
    {
      label: messages.statsLabels.ttft,
      value: formatTime(stats.mean.ttft),
      detail: `${messages.statsHeaders.min}: ${formatTime(stats.min.ttft)} / ${messages.statsHeaders.max}: ${formatTime(stats.max.ttft)}`,
    },
    {
      label: messages.statsLabels.averageSpeed,
      value: `${formatNumber(stats.mean.averageSpeed)} ${messages.htmlSpeed}`,
      detail: `${messages.statsHeaders.min}: ${formatNumber(stats.min.averageSpeed)} / ${messages.statsHeaders.max}: ${formatNumber(stats.max.averageSpeed)}`,
    },
    {
      label: messages.statsLabels.peakSpeed,
      value: `${formatNumber(stats.mean.peakSpeed)} ${messages.htmlSpeed}`,
      detail: `${messages.statsHeaders.min}: ${formatNumber(stats.min.peakSpeed)} / ${messages.statsHeaders.max}: ${formatNumber(stats.max.peakSpeed)}`,
    },
    {
      label: messages.statsLabels.totalTokens,
      value: formatNumber(stats.mean.totalTokens, 0),
      detail: `${messages.statsHeaders.min}: ${formatNumber(stats.min.totalTokens, 0)} / ${messages.statsHeaders.max}: ${formatNumber(stats.max.totalTokens, 0)}`,
    },
  ];

  // Details table rows
  const detailRows = singleResults.map((result, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${formatTime(result.ttft)}</td>
          <td>${formatTime(result.totalTime)}</td>
          <td>${result.totalTokens}</td>
          <td>${formatNumber(result.averageSpeed)}</td>
          <td>${formatNumber(result.peakSpeed)}</td>
          <td>${result.peakTps}</td>
        </tr>
  `).join("");

  // Stats table rows
  const statsRows = [
    { metric: messages.statsLabels.ttft, mean: formatTime(stats.mean.ttft), min: formatTime(stats.min.ttft), max: formatTime(stats.max.ttft), stdDev: formatTime(stats.stdDev.ttft) },
    { metric: messages.statsLabels.totalTime, mean: formatTime(stats.mean.totalTime), min: formatTime(stats.min.totalTime), max: formatTime(stats.max.totalTime), stdDev: formatTime(stats.stdDev.totalTime) },
    { metric: messages.statsLabels.totalTokens, mean: formatNumber(stats.mean.totalTokens, 1), min: formatNumber(stats.min.totalTokens, 0), max: formatNumber(stats.max.totalTokens, 0), stdDev: formatNumber(stats.stdDev.totalTokens, 1) },
    { metric: messages.statsLabels.averageSpeed, mean: formatNumber(stats.mean.averageSpeed), min: formatNumber(stats.min.averageSpeed), max: formatNumber(stats.max.averageSpeed), stdDev: formatNumber(stats.stdDev.averageSpeed) },
    { metric: messages.statsLabels.peakSpeed, mean: formatNumber(stats.mean.peakSpeed), min: formatNumber(stats.min.peakSpeed), max: formatNumber(stats.max.peakSpeed), stdDev: formatNumber(stats.stdDev.peakSpeed) },
    { metric: messages.statsLabels.peakTps, mean: formatNumber(stats.mean.peakTps), min: formatNumber(stats.min.peakTps), max: formatNumber(stats.max.peakTps), stdDev: formatNumber(stats.stdDev.peakTps) },
  ].map(row => `
        <tr>
          <td>${row.metric}</td>
          <td>${row.mean}</td>
          <td>${row.min}</td>
          <td>${row.max}</td>
          <td>${row.stdDev}</td>
        </tr>
  `).join("");

  const speedChart = generateSpeedChart(singleResults, messages);
  const tpsChart = generateTPSHistogram(stats, messages);

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${messages.htmlTitle}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #f8fafc;
      color: #1f2937;
      line-height: 1.6;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    header {
      text-align: center;
      margin-bottom: 30px;
      padding: 30px 20px;
      background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
      border-radius: 12px;
      color: white;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    header h1 {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 10px;
    }
    header .subtitle {
      font-size: 14px;
      opacity: 0.9;
    }
    .section {
      background: white;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    .section-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 16px;
      color: #1f2937;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-title::before {
      content: "";
      width: 4px;
      height: 20px;
      background: #3b82f6;
      border-radius: 2px;
    }
    .config-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
    }
    .config-item {
      display: flex;
      flex-direction: column;
    }
    .config-label {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 4px;
    }
    .config-value {
      font-size: 14px;
      font-weight: 500;
      color: #1f2937;
    }
    .summary-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
    }
    .card {
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      border-radius: 10px;
      padding: 20px;
      border: 1px solid #e5e7eb;
    }
    .card-label {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 8px;
    }
    .card-value {
      font-size: 28px;
      font-weight: 700;
      color: #3b82f6;
      margin-bottom: 4px;
    }
    .card-detail {
      font-size: 11px;
      color: #9ca3af;
    }
    .charts-container {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 20px;
    }
    .chart-wrapper {
      background: #fafafa;
      border-radius: 8px;
      padding: 16px;
      border: 1px solid #e5e7eb;
    }
    .chart-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
      color: #374151;
    }
    .chart {
      width: 100%;
      height: auto;
      display: block;
    }
    .chart-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin-top: 12px;
      font-size: 12px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .legend-line {
      width: 24px;
      height: 2px;
      border-radius: 1px;
    }
    .no-data {
      text-align: center;
      padding: 40px;
      color: #9ca3af;
      font-size: 14px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    th {
      background: #f9fafb;
      font-weight: 600;
      color: #374151;
      position: sticky;
      top: 0;
    }
    tr:hover {
      background: #f9fafb;
    }
    .table-wrapper {
      overflow-x: auto;
      max-height: 400px;
      overflow-y: auto;
    }
    footer {
      text-align: center;
      margin-top: 30px;
      padding: 20px;
      color: #9ca3af;
      font-size: 12px;
    }
    @media (max-width: 768px) {
      .summary-cards,
      .charts-container {
        grid-template-columns: 1fr;
      }
      header h1 {
        font-size: 22px;
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
      <h1>${messages.htmlReportTitle}</h1>
      <div class="subtitle">${messages.htmlTestTime}: ${testTime}</div>
    </header>

    <section class="section">
      <div class="section-title">${messages.htmlConfigSection}</div>
      <div class="config-grid">
        <div class="config-item">
          <span class="config-label">${messages.configLabels.provider}</span>
          <span class="config-value">${config.provider}</span>
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
        <div class="config-item" style="grid-column: 1 / -1;">
          <span class="config-label">${messages.configLabels.prompt}</span>
          <span class="config-value">${escapeHtml(config.prompt)}</span>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-title">${messages.htmlSummarySection}</div>
      <div class="summary-cards">
        ${summaryCards.map(card => `
        <div class="card">
          <div class="card-label">${card.label}</div>
          <div class="card-value">${card.value}</div>
          <div class="card-detail">${card.detail}</div>
        </div>
        `).join("")}
      </div>
    </section>

    <section class="section">
      <div class="section-title">${messages.htmlChartsSection}</div>
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
      <div class="section-title">${messages.statsSummaryTitle(stats.sampleSize)}</div>
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
      <div class="section-title">${messages.htmlDetailsSection}</div>
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
      Generated by <strong>token-speed-test</strong> • LLM API Token Streaming Performance Tool
    </footer>
  </div>
</body>
</html>`;
}
