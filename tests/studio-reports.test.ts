/// <reference lib="dom" />
import { describe, expect, it } from "vitest";
import { historyExport, historyRange } from "../apps/site/src/history-reports.js";
import { demoReport, measurementNote, parseReport } from "../apps/site/src/reports.js";
import { HistoryAnalyzer } from "../src/studio/history.js";

describe("measurement report compatibility", () => {
  it("imports old reports and new untimed reports without inventing zero timing", () => {
    const snapshot = demoReport();
    expect(parseReport(JSON.stringify({ schemaVersion: 1, snapshot })).runs).toHaveLength(3);
    Object.assign(snapshot.runs[0], { ttftMs: null, peakTps: null, generationTps: null, tps: [], timingSource: "unavailable", tokenizer: { encoding: "cl100k_base", source: "fallback" }, serviceTier: "priority" });
    const imported = parseReport(JSON.stringify({ schemaVersion: 1, snapshot }));
    expect(imported.runs[0].ttftMs).toBeNull();
    expect(measurementNote(imported.runs[0])).toContain("回退编码");
    expect(measurementNote(imported.runs[0])).toContain("priority");
    expect(measurementNote(imported.runs[0])).toContain("缺少流式计时");
  });

  it("converts inclusive local dates to an exclusive next-day boundary", () => {
    const range = historyRange("2026-10-12", "2026-10-12");
    expect(new Date(range.from).getHours()).toBe(0);
    expect(new Date(range.to).getDate()).toBe(13);
    expect(() => historyRange("2026-02-30", "2026-03-01")).toThrow();
    expect(() => historyRange("2026-10-13", "2026-10-12")).toThrow();
  });

  it("labels partial exports and escapes CSV cells", async () => {
    const analyzer = new HistoryAnalyzer("/nonexistent-codex-history-test");
    analyzer.start({ from: "2026-10-12", to: "2026-10-13" });
    analyzer.cancel();
    const state = await analyzer.settled();
    expect(JSON.parse(historyExport(state, "json")).phase).toBe("cancelled");
    state.report!.turns.push({ sessionId: "=HYPERLINK(\"bad\")", turnId: "t", model: "unknown", effort: "unknown", serviceTier: "unknown", startedAt: null, completedAt: null, status: "unfinished", partial: false, durationMs: null, modelTtftMs: null, requests: 0, usage: {}, usageSource: "unavailable", messages: [] });
    expect(historyExport(state, "csv")).toContain("'=");
    expect(historyExport(state, "csv")).toContain("cancelled");
    expect(() => historyExport({ ...state, phase: "scanning" }, "json")).toThrow();
  });
});
