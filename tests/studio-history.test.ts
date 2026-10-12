import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HistoryAnalyzer } from "../src/studio/history.js";

const directories: string[] = [];
const range = { from: "2026-10-12T00:00:00.000Z", to: "2026-10-13T00:00:00.000Z" };
const at = "2026-10-12T01:00:00.000Z";
const event = (type: string, payload: object, timestamp = at) => ({ type, timestamp, payload });
const usage = (output: number, input = 100) => ({ input_tokens: input, cached_input_tokens: input / 2, output_tokens: output, reasoning_output_tokens: 2 });
const meta = event("session_meta", { id: "session-1", cwd: "/private/work", base_instructions: "PRIVATE INSTRUCTIONS" });
const context = event("turn_context", { turn_id: "turn-1", model: "gpt-4o", effort: "high" });
const started = event("event_msg", { type: "task_started", turn_id: "turn-1", started_at: Date.parse(at) / 1000 });
const completed = event("event_msg", { type: "task_complete", turn_id: "turn-1", duration_ms: 4000, time_to_first_token_ms: 500 }, "2026-10-12T01:00:04.000Z");
const token = (output: number, timestamp = at) => event("event_msg", { type: "token_count", info: { total_token_usage: usage(output), last_token_usage: usage(output) } }, timestamp);
const record = (id: string, output: number) => event("token_usage_record", { thread_id: "session-1", turn_id: "turn-1", response_id: id, usage: usage(output) });
const message = (id: string, duration = 2000) => event("event_msg", { type: "item_completed", thread_id: "session-1", turn_id: "turn-1", started_at_ms: Date.parse(at) + 1000, completed_at_ms: Date.parse(at) + 1000 + duration, item: { type: "AgentMessage", id, phase: "final_answer", content: [{ type: "output_text", text: "PRIVATE ANSWER hello world" }] } });

afterEach(async () => {
  await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});
async function fixture(events: unknown[], archive = false) {
  const dir = await mkdtemp(path.join(tmpdir(), "studio-history-"));
  directories.push(dir);
  const folder = path.join(dir, archive ? "archived_sessions" : "sessions", "2025", "01", "01");
  await mkdir(folder, { recursive: true });
  const file = path.join(folder, "rollout.jsonl");
  await writeFile(file, events.map(x => JSON.stringify(x)).join("\n") + "\n");
  return { dir, file };
}
async function analyze(dir: string) {
  const analyzer = new HistoryAnalyzer(dir);
  analyzer.start(range);
  const state = await analyzer.settled();
  expect(state.phase).toBe("completed");
  return state.report!;
}

describe("local Codex history analysis", () => {
  it("prefers request usage, deduplicates copies and never returns conversation content", async () => {
    const records = [meta, started, context, record("response-1", 10), token(10), record("response-1", 10), message("message-1"), completed];
    const { dir, file } = await fixture(records);
    await mkdir(path.join(dir, "archived_sessions"));
    await writeFile(path.join(dir, "archived_sessions", "copy.jsonl"), await readFile(file));
    const report = await analyze(dir);
    expect(report.turns).toHaveLength(1);
    expect(report.summary.usage.outputTokens).toBe(10);
    expect(report.summary.requests).toBe(1);
    expect(report.summary.cacheRatio).toBe(0.5);
    expect(report.turns[0]).toMatchObject({ usageSource: "request", durationMs: 4000, modelTtftMs: 500, serviceTier: "unknown" });
    expect(report.turns[0].messages).toHaveLength(1);
    expect(report.turns[0].messages[0].estimatedTps).toBeGreaterThan(0);
    expect(JSON.stringify(report)).not.toMatch(/PRIVATE|\/private\/work|base_instructions/);
  });

  it("uses pre-range cumulative baselines for legacy logs, rather than summing totals", async () => {
    const before = "2026-10-11T23:59:00.000Z";
    const prior = event("event_msg", { type: "token_count", info: { total_token_usage: usage(10) } }, before);
    const next = event("event_msg", { type: "token_count", info: { total_token_usage: usage(30, 200), last_token_usage: usage(20) } });
    const { dir } = await fixture([meta, started, context, prior, next, next, completed]);
    const report = await analyze(dir);
    expect(report.summary.usage).toMatchObject({ outputTokens: 20, inputTokens: 100 });
    expect(report.turns[0].usageSource).toBe("legacy");
  });

  it("handles counter resets and missing usage without inventing zero measurements", async () => {
    const reset = event("event_msg", { type: "token_count", info: { total_token_usage: usage(5, 50), last_token_usage: usage(5, 50) } }, "2026-10-12T01:00:02.000Z");
    const { dir } = await fixture([meta, started, context, token(10), reset, completed, event("event_msg", { type: "task_started", turn_id: "turn-2" }), event("event_msg", { type: "task_complete", turn_id: "turn-2" })]);
    const report = await analyze(dir);
    expect(report.summary.usage.outputTokens).toBe(15);
    expect(report.coverage.legacyCounterResets).toBe(1);
    expect(report.coverage.missingUsageTurns).toBe(1);
    expect(report.turns.find(t => t.turnId === "turn-2")).toMatchObject({ durationMs: null, modelTtftMs: null, usage: {} });
  });

  it("does not invent message timings, and does not count legacy message mirrors twice", async () => {
    const { dir } = await fixture([meta, started, context, message("m0", 0), event("response_item", { type: "message", role: "assistant", id: "m0", content: [{ type: "output_text", text: "PRIVATE ANSWER hello world" }] }), event("response_item", { type: "message", role: "assistant", id: "old", content: [{ type: "output_text", text: "legacy answer" }] }), completed]);
    const report = await analyze(dir);
    expect(report.turns[0].messages).toHaveLength(2);
    expect(report.turns[0].messages.every(m => m.estimatedTps === null)).toBe(true);
    expect(report.summary.estimatedMessageTps.count).toBe(0);
  });

  it("finds archived and old-directory sessions, tracks settings, and excludes out-of-range events", async () => {
    const settings = event("event_msg", { type: "thread_settings_applied", thread_settings: { model: "gpt-4o", reasoning_effort: "high", service_tier: "priority" } }, "2026-10-11T23:00:00.000Z");
    const { dir } = await fixture([meta, settings, started, context, record("r", 10), completed, event("token_usage_record", { thread_id: "session-1", turn_id: "turn-other", response_id: "future", usage: usage(9999) }, range.to)], true);
    const report = await analyze(dir);
    expect(report.summary.usage.outputTokens).toBe(10);
    expect(report.groups[0]).toMatchObject({ model: "gpt-4o", effort: "high", serviceTier: "priority" });
  });

  it("reports corrupt and partial lines without leaking their contents", async () => {
    const { dir, file } = await fixture([meta, started, context, completed]);
    await writeFile(file, await readFile(file, "utf8") + "PRIVATE broken line\n{\"PRIVATE\":");
    const report = await analyze(dir);
    expect(report.coverage.malformedLines).toBe(1);
    expect(report.coverage.incompleteLines).toBe(1);
    expect(JSON.stringify(report)).not.toContain("PRIVATE");
  });

  it("separates legacy user turns without lifecycle IDs and keeps missing timings unavailable", async () => {
    const user = (timestamp: string) => event("response_item", { type: "message", role: "user", content: [{ text: "PRIVATE QUESTION" }] }, timestamp);
    const { dir } = await fixture([meta, event("turn_context", { model: "gpt-4o", effort: "high" }), user(at), token(10), user("2026-10-12T01:01:00.000Z"), token(30, "2026-10-12T01:01:01.000Z")]);
    const report = await analyze(dir);
    expect(report.turns).toHaveLength(2);
    expect(report.turns.map(t => t.usage.outputTokens).sort((a, b) => a! - b!)).toEqual([10, 20]);
    expect(report.turns.every(t => t.durationMs === null && t.modelTtftMs === null)).toBe(true);
    expect(report.summary.durationMs.count).toBe(0);
  });

  it("excludes interrupted and boundary-crossing turns from completed timing distributions", async () => {
    const before = "2026-10-11T23:59:59.000Z";
    const { dir } = await fixture([meta, event("event_msg", { type: "task_started", turn_id: "turn-1" }, before), context, record("r", 10), completed, event("event_msg", { type: "task_started", turn_id: "turn-2" }), event("event_msg", { type: "turn_aborted", turn_id: "turn-2", duration_ms: 2000, time_to_first_token_ms: 100 })]);
    const report = await analyze(dir);
    expect(report.turns.find(t => t.turnId === "turn-1")?.partial).toBe(true);
    expect(report.turns.find(t => t.turnId === "turn-2")?.status).toBe("interrupted");
    expect(report.summary.durationMs.count).toBe(0);
    expect(report.summary.modelTtftMs.count).toBe(0);
    expect(report.summary.usage.outputTokens).toBe(10);
  });

  it("supports cancellation, validates ranges, and can run again", async () => {
    const { dir } = await fixture([meta, started, context, completed]);
    const analyzer = new HistoryAnalyzer(dir);
    expect(() => analyzer.start({ from: "invalid", to: range.to })).toThrow();
    expect(() => analyzer.start({ from: range.to, to: range.from })).toThrow();
    analyzer.start(range);
    expect(() => analyzer.start(range)).toThrow();
    analyzer.cancel();
    expect((await analyzer.settled()).phase).toBe("cancelled");
    analyzer.start(range);
    expect((await analyzer.settled()).phase).toBe("completed");
  });
});
