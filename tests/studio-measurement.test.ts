import { describe, expect, it } from "vitest";
import { Measurement } from "../src/studio/measurement.js";
import { parseBenchmarkConfig, publicConfig } from "../src/studio/types.js";

describe("studio measurement", () => {
  it("maps whole-text tokens independently of stream splitting", () => {
    const whole = new Measurement("gpt-4");

    whole.add("hello", 100);

    const split = new Measurement("gpt-4");

    split.add("hel", 50);

    split.add("lo", 100);

    expect(whole.finish(200).estimatedTokens).toBe(1);

    const result = split.finish(200);

    expect(result.estimatedTokens).toBe(1);

    expect(result.ttftMs).toBe(50);

    expect(result.tps).toEqual([1]);
  });

  it("keeps reported usage separate from the visible-text estimate", () => {
    const meter = new Measurement("gpt-4");

    meter.add("hello", 100);

    const result = meter.finish(1000, { inputTokens: 10, cachedInputTokens: 2, outputTokens: 21, reasoningTokens: 20 });

    expect(result.estimatedTokens).toBe(1);

    expect(result.outputTokens).toBe(1);

    expect(result.tokenSource).toBe("provider");

    expect(result.usage?.reasoningTokens).toBe(20);

    expect(result.averageTps).toBe(1);

    expect(result.generationTps).toBeNull();
  });

  it("does not invent first-token timing or generation speed for empty output", () => {
    const meter = new Measurement("unknown-model");

    const result = meter.finish(500);

    expect(result.ttftMs).toBeNull();

    expect(result.generationTps).toBeNull();

    expect(result.outputTokens).toBe(0);
  });

  it("preserves tokens at an exact-second boundary", () => {
    const meter = new Measurement("gpt-4");

    meter.add("hello", 1000);

    expect(meter.finish(1100).tps).toEqual([0, 1]);
  });

  it("treats model output containing tokenizer special strings as ordinary text", () => {
    const meter = new Measurement("gpt-4");

    meter.add("<|endoftext|>", 100);

    expect(meter.finish(200).estimatedTokens).toBeGreaterThan(1);
  });
});

describe("studio configuration boundary", () => {
  const input = { provider: "codex", model: "auto", prompt: "hello", runs: 1, effort: "low", maxTokens: 256, timeoutMs: 10000 };

  it("does not require an API key for the subscription provider", () => {
    expect(parseBenchmarkConfig(input).provider).toBe("codex");
  });

  it("rejects unsupported operations and non-finite or excessive limits", () => {
    for (const extra of [{ runs: 0 }, { runs: 1.5 }, { runs: 31 }, { timeoutMs: Infinity }, { provider: "shell" }, { prompt: "" }, { effort: "magic" }]) {
      expect(() => parseBenchmarkConfig({ ...input, ...extra })).toThrow();
    }
  });

  it("requires API keys for API providers and only accepts HTTP endpoint URLs", () => {
    expect(() => parseBenchmarkConfig({ ...input, provider: "openai" })).toThrow(/API Key/);

    expect(() => parseBenchmarkConfig({ ...input, provider: "openai", apiKey: "key", baseURL: "file:///tmp/key" })).toThrow();
  });

  it("never stores the API key or URL credentials in reports", () => {
    const config = parseBenchmarkConfig({ ...input, provider: "openai", apiKey: "sensitive", baseURL: "https://example.com/v1" });

    expect(JSON.stringify(publicConfig(config))).not.toContain("sensitive");

    expect(() => parseBenchmarkConfig({ ...config, baseURL: "https://user:secret@example.com/v1" })).toThrow();
  });
});
