import type { BenchmarkRun, BenchmarkSnapshot } from "./protocol";
import { DEFAULT_BENCHMARK_CONFIG, emptyMeasurement, isRecord, parseBenchmarkConfig, publicConfig } from "./protocol";

export const formatNumber = (value: number | null | undefined, digits = 1) => value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("zh-CN", { maximumFractionDigits: digits });
export const formatMs = (value: number | null | undefined) => value == null ? "—" : value < 1000 ? `${formatNumber(value, 0)} ms` : `${formatNumber(value / 1000, 2)} s`;
export const statusText = { idle: "等待开始", preparing: "正在准备", running: "测速中", completed: "已完成", cancelled: "已取消", failed: "失败" };
export function measurementNote(run?: BenchmarkRun): string {
  if (!run) return "等待测速";
  const tokenizer = run.tokenizer
    ? `${run.tokenizer.encoding}${run.tokenizer.source === "fallback" ? "（回退编码，未确认模型映射）" : "（模型映射）"}`
    : "旧报告未记录编码";
  return `文本估算：${tokenizer}；服务档位：${run.serviceTier ?? "未记录"}${run.timingSource === "unavailable" ? "；缺少流式计时" : ""}`;
}
export function summary(runs: BenchmarkRun[]) {
  const completed = runs.filter(run => run.status === "completed");
  const values = completed.flatMap(run => run.ttftMs === null ? [] : [run.ttftMs]).sort((a, b) => a - b);
  const percentile = (p: number) => {
    if (!values.length) return null;
    const at = (values.length - 1) * p;
    const a = Math.floor(at);
    const b = Math.ceil(at);
    return values[a] + (values[b] - values[a]) * (at - a);
  };
  return { count: completed.length, p50: percentile(0.5), p95: percentile(0.95), average: completed.length ? completed.reduce((sum, run) => sum + run.averageTps, 0) / completed.length : null };
}
function escape(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]!));
}
export function downloadReport(snapshot: BenchmarkSnapshot, format: "json" | "csv" | "html") {
  let content: string;
  if (format === "json") {
    content = JSON.stringify({ schemaVersion: 1, snapshot }, null, 2);
  }
  else if (format === "csv") {
    content = "\uFEFFround,status,model,effort,service_tier,ttft_ms,elapsed_ms,output_tokens,token_source,estimated_tokens,average_tps,estimated_generation_tps,reasoning_tokens,input_tokens,cached_input_tokens,encoding,encoding_source,timing_source,output_characters\r\n" + snapshot.runs.map(run => [run.index, run.status, run.model ?? snapshot.config?.model, snapshot.config?.effort, run.serviceTier, run.ttftMs, run.elapsedMs, run.outputTokens, run.tokenSource, run.estimatedTokens, run.averageTps, run.generationTps, run.usage?.reasoningTokens, run.usage?.inputTokens, run.usage?.cachedInputTokens, run.tokenizer?.encoding, run.tokenizer?.source, run.timingSource, run.text.length].map(value => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`).join(",")).join("\r\n");
  }
  else {
    content = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Token Speed Studio 测速报告</title><style>body{max-width:1000px;margin:40px auto;padding:24px;background:#101820;color:#e8eff3;font:16px system-ui}table{width:100%;border-collapse:collapse}td,th{padding:12px;text-align:left;border-bottom:1px solid #334454}pre{white-space:pre-wrap;background:#18232d;padding:20px}small{color:#8ea2b1}</style><h1>Token Speed Studio</h1><p>${escape(snapshot.config?.provider)} · ${escape(snapshot.config?.model)} · ${escape(snapshot.startedAt)}</p><small>文本 Token 和曲线为本地估算；服务端用量单独记录。只有成功轮次用于汇总。</small><table><thead><tr><th>轮次</th><th>状态</th><th>首字延迟</th><th>平均输出</th><th>输出 Token</th><th>总耗时</th></tr></thead><tbody>${snapshot.runs.map(run => `<tr><td>${run.index}</td><td>${escape(statusText[run.status])}</td><td>${formatMs(run.ttftMs)}</td><td>${formatNumber(run.averageTps)} tok/s</td><td>${run.outputTokens} (${escape(run.tokenSource)})</td><td>${formatMs(run.elapsedMs)}</td></tr>`).join("")}</tbody></table>${snapshot.runs.map(run => `<h2>第 ${run.index} 轮</h2><p><small>${escape(measurementNote(run))}</small></p>${run.error ? `<p>${escape(run.error)}</p>` : ""}<pre>${escape(run.text)}</pre>`).join("")}</html>`;
  }
  const blob = new Blob([content], { type: format === "json" ? "application/json" : format === "csv" ? "text/csv;charset=utf-8" : "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `token-speed-${snapshot.id.slice(0, 8)}.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function parseReport(text: string): BenchmarkSnapshot {
  if (text.length > 12 * 1024 * 1024) throw new Error("报告超过 12 MB。");
  const data: unknown = JSON.parse(text);
  if (!isRecord(data) || data.schemaVersion !== 1 || !isRecord(data.snapshot)) throw new Error("请选择 Token Speed Studio 导出的 JSON 报告。");
  const snapshot = data.snapshot;
  const statuses = ["completed", "failed", "cancelled"];
  if (typeof snapshot.id !== "string" || !statuses.includes(String(snapshot.phase)) || !Array.isArray(snapshot.runs) || snapshot.runs.length > 30 || !isRecord(snapshot.config)) throw new Error("报告格式不正确，或测速尚未完成。");
  const config = snapshot.config;
  if (snapshot.startedAt !== null && (typeof snapshot.startedAt !== "string" || !Number.isFinite(Date.parse(snapshot.startedAt)))) throw new Error("报告时间无效。");
  if (typeof snapshot.version !== "number" || !Number.isFinite(snapshot.version)) throw new Error("报告版本无效。");
  if (!["codex", "openai", "anthropic"].includes(String(config.provider)) || typeof config.model !== "string" || typeof config.prompt !== "string" || typeof config.effort !== "string") throw new Error("报告配置无效。");
  for (const run of snapshot.runs) {
    if (!isRecord(run) || !statuses.includes(String(run.status)) || typeof run.text !== "string" || !Array.isArray(run.tps) || run.tps.length > 1000 || !run.tps.every(n => typeof n === "number" && Number.isFinite(n) && n >= 0)) throw new Error("报告轮次无效。");
    if ((run.model !== undefined && typeof run.model !== "string") || (run.error !== undefined && typeof run.error !== "string") || (run.runtimeVersion !== undefined && typeof run.runtimeVersion !== "string")) throw new Error("报告文字字段无效。");
    if (run.tokenSource !== "estimated" && run.tokenSource !== "provider") throw new Error("Token 来源无效。");
    if (run.generationTps !== null && (typeof run.generationTps !== "number" || !Number.isFinite(run.generationTps))) throw new Error("报告速度无效。");
    if (run.usage !== undefined && (!isRecord(run.usage) || Object.values(run.usage).some(value => typeof value !== "number" || !Number.isFinite(value) || value < 0))) throw new Error("报告用量无效。");
    if (run.peakTps !== null && (typeof run.peakTps !== "number" || !Number.isFinite(run.peakTps) || run.peakTps < 0)) throw new Error("报告峰值无效。");
    if (run.serviceTier != null && typeof run.serviceTier !== "string") throw new Error("报告服务档位无效。");
    if (run.timingSource !== undefined && run.timingSource !== "stream" && run.timingSource !== "unavailable") throw new Error("报告计时来源无效。");
    if (run.tokenizer !== undefined && (!isRecord(run.tokenizer) || typeof run.tokenizer.encoding !== "string" || !["model", "fallback"].includes(String(run.tokenizer.source)))) throw new Error("报告分词来源无效。");
    for (const key of ["index", "elapsedMs", "estimatedTokens", "outputTokens", "averageTps", "initMs"]) {
      if (typeof run[key] !== "number" || !Number.isFinite(run[key]) || run[key] < 0) throw new Error("报告指标无效。");
    }
    if (run.ttftMs !== null && (typeof run.ttftMs !== "number" || !Number.isFinite(run.ttftMs))) throw new Error("报告首字延迟无效。");
  }
  // Imported reports never restore any authentication field.
  snapshot.config = publicConfig(parseBenchmarkConfig({ ...config, apiKey: "imported-report" }));
  return snapshot as unknown as BenchmarkSnapshot;
}
export function demoReport(): BenchmarkSnapshot {
  const curves = [[32, 56, 61, 67, 51, 18], [28, 54, 64, 59, 48, 21], [38, 61, 65, 70, 57, 20]];
  return { id: "demo-example", version: 1, phase: "completed", startedAt: new Date().toISOString(), config: publicConfig(DEFAULT_BENCHMARK_CONFIG), runs: curves.map((tps, i) => ({
    ...emptyMeasurement(),
    index: i + 1,
    status: "completed",
    initMs: 180 + i * 20,
    model: "示例模型",
    ttftMs: [380, 412, 352][i],
    elapsedMs: 5400 + i * 80,
    estimatedTokens: tps.reduce((a, b) => a + b, 0),
    outputTokens: tps.reduce((a, b) => a + b, 0),
    tokenSource: "estimated",
    averageTps: tps.reduce((a, b) => a + b, 0) / (5.4 + i * 0.08),
    generationTps: 62 + i,
    peakTps: Math.max(...tps),
    tps,
    text: "这是一份演示报告，没有调用模型，也不会消耗订阅额度。\n\n真实测速时，这里会逐段显示模型输出。首字延迟从请求发出时开始计时；曲线展示每秒接收到的可见文本 Token 估算。\n\n连接本机软件后，选择模型和提示词，即可开始自己的测试。",
  })) };
}
