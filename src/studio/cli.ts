import type { StreamOptions } from "../client.js";
import type { Config } from "../config.js";
import type { StreamMetrics } from "../metrics.js";
import { CodexSession } from "./codex.js";
import { Measurement } from "./measurement.js";
import { parseBenchmarkConfig } from "./types.js";

export async function codexStreamTest(config: Config, options: StreamOptions = {}): Promise<StreamMetrics> {
  const input = parseBenchmarkConfig({ ...config, runs: 1, timeoutMs: options.timeoutMs ?? config.timeoutMs ?? 120000 });
  const abort = new AbortController();
  const cancel = () => abort.abort(new Error("Codex test cancelled."));
  const timeout = setTimeout(() => abort.abort(new Error("Codex test timed out.")), input.timeoutMs);
  let session: CodexSession | undefined;
  let meter: Measurement | undefined;
  const stop = () => {
    void session?.close();
  };
  options.signal?.addEventListener("abort", cancel, { once: true });
  abort.signal.addEventListener("abort", stop, { once: true });
  process.once("SIGINT", cancel);
  try {
    if (options.signal?.aborted) cancel();
    session = await CodexSession.open(config.codexPath, abort.signal);
    const thread = await session.prepare(input);
    meter = new Measurement(thread.model);
    if (!options.quiet) console.log(`Codex model: ${thread.model}; effort: ${input.effort} (local token timing estimates)`);
    const result = await session.run(thread, input, (text, elapsedMs) => {
      meter!.add(text, elapsedMs);
      options.onText?.(text, elapsedMs);
      if (!options.quiet) process.stdout.write(text);
    }, abort.signal);
    const measurement = meter.finish(result.elapsedMs, result.usage);
    const tokens = meter.tokenTimes;
    meter = undefined;
    if (result.usage) options.onUsage?.(result.usage);
    if (!options.quiet) process.stdout.write("\n");
    // The existing CLI report uses the resolved model, not the literal "auto".
    config.model = result.model;
    return { ttft: measurement.ttftMs ?? 0, tokens, totalTokens: measurement.outputTokens, totalTime: result.elapsedMs };
  }
  catch (error) {
    if (abort.signal.aborted) throw abort.signal.reason;
    throw error;
  }
  finally {
    meter?.finish(0);
    clearTimeout(timeout);
    process.removeListener("SIGINT", cancel);
    options.signal?.removeEventListener("abort", cancel);
    abort.signal.removeEventListener("abort", stop);
    await session?.close();
  }
}
