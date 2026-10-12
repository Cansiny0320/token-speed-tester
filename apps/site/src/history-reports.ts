import type { HistoryConfig, HistoryState } from "./protocol";

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function recentHistoryDates(days = 7) {
  const now = new Date();
  const first = new Date(now);
  first.setDate(first.getDate() - days + 1);
  return { from: localDate(first), to: localDate(now) };
}
export function historyRange(from: string, to: string): HistoryConfig {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || localDate(start) !== from || localDate(end) !== to || start > end) {
    throw new Error("请选择有效日期，开始日期不能晚于结束日期。");
  }
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}
export function historyExport(state: HistoryState, format: "json" | "csv"): string {
  if (!state.report || state.phase === "scanning") throw new Error("请等待扫描结束，或取消后导出部分结果。");
  if (format === "json") return JSON.stringify({ schemaVersion: 1, phase: state.phase, report: state.report }, null, 2);
  const rows: unknown[][] = [["scan_status", "session_id", "turn_id", "model", "effort", "service_tier", "turn_status", "partial_range", "started_at", "completed_at", "duration_ms", "model_ttft_ms", "request_count", "usage_source", "input_tokens", "cached_input_tokens", "output_tokens_including_reasoning", "reasoning_tokens", "visible_message_count", "timed_message_count", "estimated_message_tokens", "message_encoding"]];
  for (const t of state.report.turns) {
    rows.push([state.phase, t.sessionId, t.turnId, t.model, t.effort, t.serviceTier, t.status, t.partial, t.startedAt, t.completedAt, t.durationMs, t.modelTtftMs, t.requests, t.usageSource, t.usage.inputTokens, t.usage.cachedInputTokens, t.usage.outputTokens, t.usage.reasoningTokens, t.messages.length, t.messages.filter(m => m.estimatedTps !== null).length, t.messages.length ? t.messages.reduce((sum, m) => sum + m.estimatedTokens, 0) : null, [...new Set(t.messages.map(m => `${m.encoding}:${m.encodingSource}`))].join(";")]);
  }
  return "\uFEFF" + rows.map(row => row.map((value) => {
    let text = String(value ?? "");
    if (typeof value === "string" && /^[=+@\-\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }).join(",")).join("\r\n");
}
export function downloadHistory(state: HistoryState, format: "json" | "csv") {
  const content = historyExport(state, format);
  const url = URL.createObjectURL(new Blob([content], { type: format === "json" ? "application/json" : "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `codex-history-${state.id.slice(0, 8)}.${format}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
