import type { HistoryConfig, HistoryCoverage, HistoryDistribution, HistoryGroup, HistoryMessageMetric, HistoryReport, HistoryState, HistoryTurn, TokenUsage } from "./types.js";
import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { setImmediate as yieldIO } from "node:timers/promises";
import { createTokenizerWithInfo } from "../tokenizer.js";
import { isRecord } from "./types.js";

const MAX_LINE_BYTES = 16 * 1024 * 1024;
const usageKeys = ["inputTokens", "cachedInputTokens", "outputTokens", "reasoningTokens"] as const;
type Settings = Pick<HistoryTurn, "model" | "effort" | "serviceTier">;
const unknownSettings = (): Settings => ({ model: "unknown", effort: "unknown", serviceTier: "unknown" });
function label(value: unknown): string {
  return typeof value === "string" && value.length > 0 && value.length <= 200 ? value : "unknown";
}
function nonnegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
function timestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}
function epochSeconds(value: unknown): number | null {
  const seconds = nonnegative(value);
  return seconds !== null && seconds < 8640000000000 ? seconds * 1000 : null;
}
function readUsage(value: unknown): TokenUsage {
  if (!isRecord(value)) return {};
  const result: TokenUsage = {};
  for (const [source, key] of [["input_tokens", "inputTokens"], ["cached_input_tokens", "cachedInputTokens"], ["output_tokens", "outputTokens"], ["reasoning_output_tokens", "reasoningTokens"]] as const) {
    const number = nonnegative(value[source]);
    if (number !== null) result[key] = number;
  }
  return result;
}
function addUsage(target: TokenUsage, value: TokenUsage) {
  for (const key of usageKeys) {
    if (value[key] !== undefined) target[key] = (target[key] ?? 0) + value[key];
  }
}
function hasUsage(value: TokenUsage): boolean {
  return usageKeys.some(key => value[key] !== undefined);
}
function distribution(values: number[]): HistoryDistribution {
  values.sort((a, b) => a - b);
  const percentile = (p: number) => {
    if (!values.length) return null;
    const at = (values.length - 1) * p;
    return values[Math.floor(at)] + (values[Math.ceil(at)] - values[Math.floor(at)]) * (at - Math.floor(at));
  };
  return { count: values.length, p50: percentile(0.5), p95: percentile(0.95) };
}
function group(turns: HistoryTurn[], settings: Settings): HistoryGroup {
  const usage: TokenUsage = {};
  for (const turn of turns) addUsage(usage, turn.usage);
  const complete = turns.filter(t => t.status === "completed" && !t.partial);
  return {
    model: settings.model,
    effort: settings.effort,
    serviceTier: settings.serviceTier,
    turns: turns.length,
    completed: turns.filter(t => t.status === "completed").length,
    usageTurns: turns.filter(t => hasUsage(t.usage)).length,
    requests: turns.reduce((sum, t) => sum + t.requests, 0),
    usage,
    cacheRatio: usage.inputTokens && usage.cachedInputTokens !== undefined ? usage.cachedInputTokens / usage.inputTokens : null,
    durationMs: distribution(complete.flatMap(t => t.durationMs === null ? [] : [t.durationMs])),
    modelTtftMs: distribution(complete.flatMap(t => t.modelTtftMs === null ? [] : [t.modelTtftMs])),
    estimatedMessageTps: distribution(turns.flatMap(t => t.messages.flatMap(m => m.estimatedTps === null ? [] : [m.estimatedTps]))),
  };
}
function coverage(): HistoryCoverage {
  return { filesRead: 0, filesSkippedByTime: 0, unreadableFiles: 0, malformedLines: 0, incompleteLines: 0, oversizedLines: 0, duplicateRecords: 0, legacyCounterResets: 0, skippedUsageEvents: 0, untimedMessages: 0, missingUsageTurns: 0 };
}
export function parseHistoryConfig(value: unknown): HistoryConfig {
  if (!isRecord(value)) throw new Error("请选择分析日期范围。");
  const from = timestamp(value.from);
  const to = timestamp(value.to);
  if (from === null || to === null || from >= to) throw new Error("开始时间必须早于结束时间。");
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}
interface TurnData {
  result: HistoryTurn;
  requestUsage: TokenUsage;
  legacyUsage: TokenUsage;
  requestCount: number;
  legacyCount: number;
  settings: Map<keyof Settings, Set<string>>;
  messages: Map<string, { metric: HistoryMessageMetric; modern: boolean }>;
}
interface FileContext {
  sessionId: string;
  turnId: string;
  explicitTurns: boolean;
  settings: Settings;
  contexts: Map<string, Settings>;
  starts: Map<string, number>;
  previousUsage?: TokenUsage;
}

/** Holds only numeric measurements and metadata. Text is tokenized and discarded. */
class HistoryCollector {
  readonly coverage = coverage();
  private turns = new Map<string, TurnData>();
  private responses = new Set<string>();
  private legacyEvents = new Set<string>();
  private tokenizers = new Map<string, ReturnType<typeof createTokenizerWithInfo>>();
  private from: number;
  private to: number;
  constructor(private range: HistoryConfig) {
    this.from = Date.parse(range.from);
    this.to = Date.parse(range.to);
  }

  fileContext(): FileContext {
    // No file paths are exposed when a legacy file lacks a session ID.
    return { sessionId: randomUUID(), turnId: "", explicitTurns: false, settings: unknownSettings(), contexts: new Map(), starts: new Map() };
  }

  private turn(ctx: FileContext, turnId: string, sessionId = ctx.sessionId): TurnData {
    let data = this.turns.get(turnId);
    if (!data) {
      const started = ctx.starts.get(turnId);
      data = {
        result: {
          sessionId,
          turnId,
          ...unknownSettings(),
          startedAt: started === undefined ? null : new Date(started).toISOString(),
          completedAt: null,
          status: "unfinished",
          partial: started !== undefined && started < this.from,
          durationMs: null,
          modelTtftMs: null,
          requests: 0,
          usage: {},
          usageSource: "unavailable",
          messages: [],
        },
        requestUsage: {},
        legacyUsage: {},
        requestCount: 0,
        legacyCount: 0,
        settings: new Map(),
        messages: new Map(),
      };
      this.turns.set(turnId, data);
    }
    return data;
  }

  private noteSettings(data: TurnData, settings: Settings) {
    for (const key of ["model", "effort", "serviceTier"] as const) {
      const values = data.settings.get(key) ?? new Set<string>();
      values.add(settings[key]);
      data.settings.set(key, values);
      data.result[key] = values.size === 1 ? settings[key] : "mixed";
    }
  }

  private message(data: TurnData, item: Record<string, unknown>, payload: Record<string, unknown>, settings: Settings, modern: boolean, at: number) {
    const content = item.content;
    const text = typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.flatMap(c => isRecord(c) && typeof c.text === "string" ? [c.text] : []).join("")
        : typeof item.text === "string" ? item.text : "";
    if (!text) return;
    const id = typeof item.id === "string" ? item.id : `${at}:${createHash("sha256").update(text).digest("hex")}`;
    const previous = data.messages.get(id);
    if (previous && (previous.modern || !modern)) {
      this.coverage.duplicateRecords++;
      return;
    }
    if (text.length > 1000000) {
      this.coverage.oversizedLines++;
      return;
    }
    let tokenizer = this.tokenizers.get(settings.model);
    if (!tokenizer) {
      if (this.tokenizers.size >= 8) {
        const first = this.tokenizers.keys().next().value!;
        this.tokenizers.get(first)!.encoding.free();
        this.tokenizers.delete(first);
      }
      tokenizer = createTokenizerWithInfo(settings.model);
      this.tokenizers.set(settings.model, tokenizer);
    }
    const start = modern ? nonnegative(payload.started_at_ms) : null;
    const end = modern ? nonnegative(payload.completed_at_ms) : null;
    const durationMs = start !== null && end !== null && start > 0 && end > start ? end - start : null;
    const estimatedTokens = tokenizer.encoding.encode(text, [], []).length;
    data.messages.set(id, {
      modern,
      metric: { phase: label(item.phase), estimatedTokens, durationMs, estimatedTps: durationMs === null ? null : estimatedTokens / durationMs * 1000, encoding: tokenizer.info.encoding, encodingSource: tokenizer.info.source },
    });
    this.noteSettings(data, settings);
  }

  accept(value: unknown, ctx: FileContext) {
    if (!isRecord(value) || !isRecord(value.payload)) return;
    const p = value.payload;
    const at = timestamp(value.timestamp);
    if (value.type === "session_meta") {
      if (typeof p.id === "string") ctx.sessionId = p.id;
      return;
    }
    if (value.type === "turn_context") {
      if (typeof p.turn_id === "string") {
        ctx.turnId = p.turn_id;
        ctx.explicitTurns = true;
      }
      ctx.settings = { ...ctx.settings, model: label(p.model), effort: label(p.effort) };
      if (typeof p.service_tier === "string") ctx.settings.serviceTier = p.service_tier;
      ctx.contexts.set(ctx.turnId, { ...ctx.settings });
      return;
    }
    if (p.type === "thread_settings_applied" && isRecord(p.thread_settings)) {
      const s = p.thread_settings;
      ctx.settings = { model: label(s.model), effort: label(s.reasoning_effort), serviceTier: label(s.service_tier) };
      // Applied settings describe subsequent events, including changes within a turn.
      if (ctx.turnId) ctx.contexts.set(ctx.turnId, { ...ctx.settings });
      return;
    }
    if (p.type === "task_started") {
      ctx.explicitTurns = true;
      if (typeof p.turn_id === "string") ctx.turnId = p.turn_id;
      else ctx.turnId = `${ctx.sessionId}:${at ?? "unknown"}`;
      const start = epochSeconds(p.started_at) ?? at;
      if (start !== null) ctx.starts.set(ctx.turnId, start);
    }
    // Legacy files can predate task_started/turn IDs. Use the user message boundary.
    if (value.type === "response_item" && p.type === "message" && p.role === "user" && !ctx.explicitTurns) {
      ctx.turnId = `${ctx.sessionId}:${at ?? "unknown"}`;
      if (at !== null) ctx.starts.set(ctx.turnId, at);
    }
    const inRange = at !== null && at >= this.from && at < this.to;
    const turnId = typeof p.turn_id === "string" ? p.turn_id : ctx.turnId;
    const settings = ctx.contexts.get(turnId) ?? ctx.settings;
    if (p.type === "token_count" && isRecord(p.info)) {
      const total = readUsage(p.info.total_token_usage);
      const last = readUsage(p.info.last_token_usage);
      const previous = ctx.previousUsage;
      let delta: TokenUsage = {};
      let reset = false;
      if (hasUsage(total)) {
        reset = !!previous && usageKeys.some(k => total[k] !== undefined && previous[k] !== undefined && total[k]! < previous[k]!);
        for (const key of usageKeys) {
          if (total[key] !== undefined) delta[key] = reset ? last[key] : total[key]! - (previous?.[key] ?? 0);
        }
        ctx.previousUsage = total;
        if (previous && !reset && usageKeys.every(k => (delta[k] ?? 0) === 0)) return;
      }
      else {
        delta = last;
      }
      if (!inRange) return;
      if (!turnId || !hasUsage(delta)) {
        this.coverage.skippedUsageEvents++;
        return;
      }
      const key = JSON.stringify([ctx.sessionId, at, total, last]);
      if (this.legacyEvents.has(key)) {
        this.coverage.duplicateRecords++;
        return;
      }
      this.legacyEvents.add(key);
      if (reset) this.coverage.legacyCounterResets++;
      const data = this.turn(ctx, turnId);
      addUsage(data.legacyUsage, delta);
      data.legacyCount++;
      this.noteSettings(data, settings);
      return;
    }
    if (!inRange || !turnId) return;
    if (value.type === "token_usage_record") {
      const used = readUsage(p.usage);
      if (typeof p.response_id !== "string" || !hasUsage(used)) {
        this.coverage.skippedUsageEvents++;
        return;
      }
      if (this.responses.has(p.response_id)) {
        this.coverage.duplicateRecords++;
        return;
      }
      this.responses.add(p.response_id);
      const data = this.turn(ctx, turnId, typeof p.thread_id === "string" ? p.thread_id : ctx.sessionId);
      addUsage(data.requestUsage, used);
      data.requestCount++;
      this.noteSettings(data, settings);
    }
    else if (p.type === "task_started") {
      this.turn(ctx, turnId);
    }
    else if (p.type === "task_complete" || p.type === "turn_aborted") {
      const data = this.turn(ctx, turnId);
      if (data.result.status !== "unfinished") {
        this.coverage.duplicateRecords++;
        return;
      }
      data.result.status = p.type === "task_complete" ? "completed" : "interrupted";
      data.result.completedAt = new Date(at!).toISOString();
      data.result.durationMs = nonnegative(p.duration_ms);
      data.result.modelTtftMs = nonnegative(p.time_to_first_token_ms);
      const start = epochSeconds(p.started_at) ?? ctx.starts.get(turnId);
      if (start !== undefined && start !== null) data.result.startedAt = new Date(start).toISOString();
      data.result.partial = start != null ? start < this.from : data.result.durationMs !== null && at! - data.result.durationMs < this.from;
      if (!data.settings.size) this.noteSettings(data, settings);
    }
    else if (p.type === "item_completed" && isRecord(p.item) && p.item.type === "AgentMessage") {
      this.message(this.turn(ctx, turnId, typeof p.thread_id === "string" ? p.thread_id : ctx.sessionId), p.item, p, settings, true, at!);
    }
    else if (value.type === "response_item" && p.type === "message" && p.role === "assistant") {
      this.message(this.turn(ctx, turnId), p, p, settings, false, at!);
    }
  }

  report(): HistoryReport {
    const turns = [...this.turns.values()].map((data) => {
      const modern = data.requestCount > 0;
      return { ...data.result, usage: modern ? data.requestUsage : data.legacyUsage, requests: modern ? data.requestCount : data.legacyCount, usageSource: modern ? "request" as const : data.legacyCount ? "legacy" as const : "unavailable" as const, messages: [...data.messages.values()].map(m => m.metric) };
    }).sort((a, b) => (b.completedAt ?? b.startedAt ?? "").localeCompare(a.completedAt ?? a.startedAt ?? ""));
    const groups = new Map<string, HistoryTurn[]>();
    for (const turn of turns) {
      const key = JSON.stringify([turn.model, turn.effort, turn.serviceTier]);
      const bucket = groups.get(key) ?? [];
      bucket.push(turn);
      groups.set(key, bucket);
    }
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      range: this.range,
      coverage: { ...this.coverage, missingUsageTurns: turns.filter(t => !hasUsage(t.usage)).length, untimedMessages: turns.flatMap(t => t.messages).filter(m => m.durationMs === null).length },
      summary: group(turns, { model: "all", effort: "all", serviceTier: "all" }),
      groups: [...groups.values()].map(turns => group(turns, turns[0])).sort((a, b) => b.turns - a.turns),
      turns,
    };
  }

  close() {
    for (const tokenizer of this.tokenizers.values()) tokenizer.encoding.free();
    this.tokenizers.clear();
  }
}

/** No database, credential reads or Codex process: only local JSONL files. */
export class HistoryAnalyzer {
  private current: HistoryState = { id: "", phase: "idle", progress: { filesTotal: 0, filesRead: 0, bytesTotal: 0, bytesRead: 0 }, report: null };
  private running?: Promise<void>;
  private abort?: AbortController;
  constructor(private home = process.env.CODEX_HOME || path.join(homedir(), ".codex")) {}

  state(): HistoryState { return structuredClone(this.current); }

  start(input: unknown): HistoryState {
    if (this.running) throw new Error("历史分析正在进行，请先取消或等待完成。");
    const range = parseHistoryConfig(input);
    this.abort = new AbortController();
    this.current = { id: randomUUID(), phase: "scanning", progress: { filesTotal: 0, filesRead: 0, bytesTotal: 0, bytesRead: 0 }, report: null };
    this.running = this.scan(range, this.abort.signal).finally(() => {
      this.running = undefined;
      this.abort = undefined;
    });
    return this.state();
  }

  cancel() { this.abort?.abort(); }
  async settled(): Promise<HistoryState> {
    await this.running;
    return this.state();
  }

  private async scan(range: HistoryConfig, signal: AbortSignal) {
    const collector = new HistoryCollector(range);
    const files: { file: string; size: number }[] = [];
    const progress = this.current.progress;
    const discover = async (directory: string) => {
      signal.throwIfAborted();
      let entries;
      try {
        entries = await readdir(directory, { withFileTypes: true });
      }
      catch (error) {
        if (!isRecord(error) || error.code !== "ENOENT") collector.coverage.unreadableFiles++;
        return;
      }
      for (const entry of entries) {
        signal.throwIfAborted();
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          await discover(file);
        }
        else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
          try {
            const info = await stat(file);
            // A long-lived session can be stored under an old creation date.
            // mtime narrows candidates; event timestamps decide actual inclusion.
            if (info.mtimeMs < Date.parse(range.from)) {
              collector.coverage.filesSkippedByTime++;
            }
            else {
              files.push({ file, size: info.size });
              progress.filesTotal++;
              progress.bytesTotal += info.size;
            }
          }
          catch { collector.coverage.unreadableFiles++; }
        }
      }
    };
    try {
      await discover(path.join(this.home, "sessions"));
      await discover(path.join(this.home, "archived_sessions"));
      for (const { file, size } of files) {
        signal.throwIfAborted();
        if (!size) {
          progress.filesRead++;
          collector.coverage.filesRead++;
          continue;
        }
        const ctx = collector.fileContext();
        // Capture only bytes present at discovery, never chase a running writer.
        const input = createReadStream(file, { end: size - 1, highWaterMark: 64 * 1024, signal });
        let pending = Buffer.alloc(0);
        let dropping = false;
        let lastYield = performance.now();
        try {
          for await (const data of input) {
            signal.throwIfAborted();
            const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
            progress.bytesRead += chunk.length;
            pending = Buffer.concat([pending, chunk]);
            while (true) {
              const newline = pending.indexOf(10);
              if (newline === -1) break;
              const line = pending.subarray(0, newline);
              pending = pending.subarray(newline + 1);
              if (dropping) {
                dropping = false;
              }
              else if (line.length > MAX_LINE_BYTES) {
                collector.coverage.oversizedLines++;
              }
              else if (line.length) {
                let record: unknown;
                try {
                  record = JSON.parse(line.toString("utf8"));
                }
                catch {
                  collector.coverage.malformedLines++;
                  continue;
                }
                collector.accept(record, ctx);
              }
              if (performance.now() - lastYield > 20) {
                await yieldIO();
                signal.throwIfAborted();
                lastYield = performance.now();
              }
            }
            if (pending.length > MAX_LINE_BYTES) {
              pending = Buffer.alloc(0);
              if (!dropping) collector.coverage.oversizedLines++;
              dropping = true;
            }
          }
          if (pending.length && !dropping) {
            // A valid final JSON line need not end in newline; incomplete JSON is
            // reported as a snapshot tail, not as a failed session.
            try {
              collector.accept(JSON.parse(pending.toString("utf8")), ctx);
            }
            catch { collector.coverage.incompleteLines++; }
          }
          collector.coverage.filesRead++;
        }
        catch (error) {
          if (signal.aborted) throw error;
          collector.coverage.unreadableFiles++;
        }
        finally { input.destroy(); }
        progress.filesRead++;
        await yieldIO();
      }
      this.current.phase = "completed";
    }
    catch {
      this.current.phase = signal.aborted ? "cancelled" : "failed";
      if (!signal.aborted) this.current.error = "历史扫描未完成，请确认本机 Codex 会话目录可读后重试。";
    }
    finally {
      this.current.report = collector.report();
      collector.close();
    }
  }
}
