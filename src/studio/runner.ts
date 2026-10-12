import type { CodexThread } from "./codex.js";
import type { BenchmarkConfig, BenchmarkRun, BenchmarkSnapshot, StudioInfo, TokenUsage } from "./types.js";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { streamTest } from "../client.js";
import { CodexSession, inspectCodex } from "./codex.js";
import { Measurement } from "./measurement.js";
import { emptyMeasurement, parseBenchmarkConfig, publicConfig } from "./types.js";

export class BenchmarkRunner {
  private snapshot: BenchmarkSnapshot = { id: "", version: 0, phase: "idle", startedAt: null, config: null, runs: [] };
  private abort?: AbortController;
  private running?: Promise<void>;
  private activeStart?: number;
  codexPath?: string;
  state(): BenchmarkSnapshot {
    const result = structuredClone(this.snapshot);
    const last = result.runs.at(-1);
    if (last?.status === "running" && this.activeStart !== undefined) last.elapsedMs = performance.now() - this.activeStart;
    return result;
  }

  async info(): Promise<StudioInfo> {
    return { version: "1.0.0", platform: `${process.platform}-${process.arch}`, codex: await inspectCodex(this.codexPath) };
  }

  start(input: unknown): BenchmarkSnapshot {
    if (this.running) throw new Error("已有测速正在进行，请先取消或等待完成。");
    const config = parseBenchmarkConfig(input);
    this.abort = new AbortController();
    this.snapshot = {
      id: randomUUID(),
      version: this.snapshot.version + 1,
      phase: "preparing",
      startedAt: new Date().toISOString(),
      config: publicConfig(config),
      runs: [],
    };
    this.running = this.execute(config, this.abort.signal).finally(() => {
      this.running = undefined;
      this.activeStart = undefined;
      this.abort = undefined;
    });
    return this.state();
  }

  cancel(): void {
    this.abort?.abort(new Error("已取消测速。"));
  }

  async settled(): Promise<BenchmarkSnapshot> {
    await this.running;
    return this.state();
  }

  private async execute(config: BenchmarkConfig, signal: AbortSignal): Promise<void> {
    for (let index = 1; index <= config.runs; index++) {
      if (signal.aborted) {
        this.snapshot.phase = "cancelled";
        break;
      }
      const run: BenchmarkRun = { index, status: "preparing", initMs: 0, runtimeVersion: "Token Speed Studio 1.0.0", ...emptyMeasurement() };
      this.snapshot.runs.push(run);
      this.snapshot.phase = "preparing";
      const initStart = performance.now();
      const round = new AbortController();
      const cancel = () => round.abort(signal.reason);
      signal.addEventListener("abort", cancel, { once: true });
      const timeout = setTimeout(() => round.abort(new Error(`该轮超过 ${config.timeoutMs / 1000} 秒，已停止。`)), config.timeoutMs);
      let meter: Measurement | undefined;
      let session: CodexSession | undefined;
      let usage: TokenUsage | undefined;
      let elapsedMs = 0;
      let lastPreview = 0;
      const stopSession = () => {
        void session?.close();
      };
      round.signal.addEventListener("abort", stopSession, { once: true });
      try {
        let thread: CodexThread | undefined;
        if (config.provider === "codex") {
          session = await CodexSession.open(this.codexPath, round.signal);
          thread = await session.prepare(config);
          run.runtimeVersion += ` / ${session.version ?? "Codex version unavailable"}`;
          run.model = thread.model;
          run.serviceTier = thread.serviceTier;
        }
        meter = new Measurement(thread?.model ?? config.model);
        round.signal.throwIfAborted();
        run.initMs = performance.now() - initStart;
        run.status = "running";
        this.snapshot.phase = "running";
        this.activeStart = performance.now();
        const onText = (text: string, at: number, streamed = true) => {
          meter?.add(text, at, streamed);
          if (at - lastPreview >= 200 || lastPreview === 0) {
            Object.assign(run, meter?.preview(at));
            lastPreview = at;
            this.snapshot.version++;
          }
        };
        if (session && thread) {
          const result = await session.run(thread, config, onText, round.signal);
          elapsedMs = result.elapsedMs;
          usage = result.usage;
          run.model = result.model;
        }
        else {
          const result = await streamTest({
            provider: config.provider === "anthropic" ? "anthropic" : "openai",
            apiKey: config.apiKey ?? "",
            baseURL: config.baseURL,
            model: config.model,
            maxTokens: config.maxTokens,
            prompt: config.prompt,
            runCount: 1,
            lang: "zh",
            outputFormat: "json",
            outputPath: "",
          }, {
            quiet: true,
            signal: round.signal,
            maxRetries: 0,
            timeoutMs: config.timeoutMs,
            onText,
            onUsage: (value) => {
              usage = { ...usage, ...value };
            },
          });
          elapsedMs = result.totalTime;
          run.model = config.model;
        }
        round.signal.throwIfAborted();
        Object.assign(run, meter.finish(elapsedMs, usage));
        meter = undefined;
        run.status = "completed";
        this.snapshot.phase = "completed";
      }
      catch (error) {
        const reason: unknown = round.signal.aborted ? round.signal.reason : error;
        run.error = (reason instanceof Error ? reason.message : "测速失败。").slice(0, 1000);
        if (config.apiKey) run.error = run.error.split(config.apiKey).join("[redacted]");
        if (meter) {
          Object.assign(run, meter.finish(this.activeStart === undefined ? 0 : performance.now() - this.activeStart, usage));
          meter = undefined;
        }
        run.initMs ||= performance.now() - initStart;
        run.status = signal.aborted ? "cancelled" : "failed";
        this.snapshot.phase = run.status;
      }
      finally {
        clearTimeout(timeout);
        signal.removeEventListener("abort", cancel);
        round.signal.removeEventListener("abort", stopSession);
        this.activeStart = undefined;
        await session?.close();
        this.snapshot.version++;
      }
      if (run.status !== "completed") break;
    }
  }
}
