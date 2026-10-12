import type { Config } from "../src/config.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { anthropicStreamTest, openaiStreamTest, runMultipleTests, streamTest } from "../src/client.js";

const mocks = vi.hoisted(() => ({
  clock: 0,
  openaiCreate: vi.fn(),
  anthropicCreate: vi.fn(),
  free: vi.fn(),
}));

vi.mock("node:perf_hooks", () => ({ performance: { now: () => mocks.clock } }));
vi.mock("../src/tokenizer.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/tokenizer.js")>();
  return {
    createTokenizer: (model: string) => {
      mocks.clock += 1000;
      const encoding = actual.createTokenizer(model);
      return {
        encode: (text: string, allowed: string[], disallowed: string[]) => {
          mocks.clock += 1000;
          return encoding.encode(text, allowed, disallowed);
        },
        decode_single_token_bytes: (token: number) => encoding.decode_single_token_bytes(token),
        free: () => {
          mocks.clock += 1000;
          mocks.free();
          encoding.free();
        },
      };
    },
  };
});
vi.mock("openai", () => ({ default: vi.fn((options: { baseURL?: string }) => ({ baseURL: options.baseURL ?? "https://api.openai.com/v1", chat: { completions: { create: mocks.openaiCreate } } })) }));
vi.mock("@anthropic-ai/sdk", () => ({ default: vi.fn(() => ({ messages: { create: mocks.anthropicCreate } })) }));

const config: Config = {
  provider: "openai",
  apiKey: "test-key",
  model: "gpt-4",
  maxTokens: 100,
  runCount: 1,
  prompt: "Test",
  lang: "en",
  outputFormat: "terminal",
  outputPath: "report",
};

function events(values: unknown[]) {
  return (async function* () {
    for (const value of values) {
      mocks.clock += 10;
      yield value;
    }
  })();
}

function openaiChunks(parts: string[], completionTokens?: number, reasoningTokens = 0) {
  return events([
    ...parts.map(content => ({ choices: [{ delta: { content } }] })),
    ...(completionTokens === undefined
      ? []
      : [{ choices: [], usage: {
          completion_tokens: completionTokens,
          completion_tokens_details: { reasoning_tokens: reasoningTokens },
        } }]),
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.clock = 0;
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(console, "log").mockImplementation(() => {});
  mocks.openaiCreate.mockImplementation(() => openaiChunks(["hello"]));
  mocks.anthropicCreate.mockImplementation(() => events([
    { type: "content_block_delta", delta: { type: "text_delta", text: "hello" } },
    { type: "message_delta", usage: { output_tokens: 7 } },
  ]));
});
afterEach(() => vi.restoreAllMocks());

describe("stream measurement", () => {
  it("counts complete text independently of stream chunk boundaries", async () => {
    for (const parts of [["hello"], ["hel", "lo"], ["h", "e", "l", "l", "o"]]) {
      mocks.openaiCreate.mockReturnValueOnce(openaiChunks(parts));
      const result = await openaiStreamTest(config);
      expect(result.totalTokens).toBe(1);
      expect(result.tokens).toEqual([parts.length * 10]);
      expect(result.ttft).toBe(10);
    }
  });

  it("maps Unicode tokens to the chunk containing their final bytes", async () => {
    mocks.openaiCreate.mockReturnValueOnce(openaiChunks(["你", "好"]));
    const result = await openaiStreamTest(config);
    expect(result.totalTokens).toBe(2);
    expect(result.tokens).toEqual([10, 20]);
  });

  it("treats tokenizer special strings as ordinary output", async () => {
    mocks.openaiCreate.mockReturnValueOnce(openaiChunks(["<|endoftext|>"]));
    const result = await openaiStreamTest(config);
    expect(result.totalTokens).toBeGreaterThan(1);
  });

  it("uses usage for totals while retaining visible-text timing estimates", async () => {
    mocks.openaiCreate.mockReturnValueOnce(openaiChunks(["hello"], 7, 2));
    const result = await openaiStreamTest(config);
    expect(result.totalTokens).toBe(5);
    expect(result.tokens).toEqual([10]);
    expect(mocks.openaiCreate.mock.calls[0][0].stream_options).toEqual({ include_usage: true });
  });

  it("does not require stream_options on custom compatible endpoints", async () => {
    await openaiStreamTest({ ...config, baseURL: "https://compatible.example/v1" });
    expect(mocks.openaiCreate.mock.calls[0][0]).not.toHaveProperty("stream_options");
  });

  it("uses Anthropic output usage", async () => {
    const result = await anthropicStreamTest({ ...config, provider: "anthropic" });
    expect(result.totalTokens).toBe(7);
    expect(result.tokens).toEqual([10]);
  });

  it("excludes initialization from TTFT and post-stream tokenization from totalTime", async () => {
    vi.mocked(process.stdout.write).mockImplementation(() => {
      mocks.clock += 100;
      return true;
    });
    const result = await openaiStreamTest(config);
    expect(result.ttft).toBe(10);
    expect(result.tokens).toEqual([10]);
    expect(result.totalTime).toBe(110);
    expect(mocks.free).toHaveBeenCalledOnce();
  });

  it("handles empty streams and zero usage", async () => {
    mocks.openaiCreate.mockReturnValueOnce(openaiChunks([], 0));
    const result = await openaiStreamTest(config);
    expect(result.totalTokens).toBe(0);
    expect(result.tokens).toEqual([]);
    expect(result.ttft).toBe(0);
  });

  it.each(["openai", "anthropic"] as const)("releases the tokenizer on %s failure", async (provider) => {
    const create = provider === "openai" ? mocks.openaiCreate : mocks.anthropicCreate;
    create.mockRejectedValueOnce(new Error("test failure"));
    await expect(streamTest({ ...config, provider })).rejects.toThrow("API error: test failure");
    expect(mocks.free).toHaveBeenCalledOnce();
  });

  it("runs the configured number of requests", async () => {
    expect(await runMultipleTests({ ...config, runCount: 3 })).toHaveLength(3);
    expect(mocks.openaiCreate).toHaveBeenCalledTimes(3);
  });
});

describe("OpenAI token limit compatibility", () => {
  it.each(["gpt-5.2", "gpt-5-mini", "o1", "o3-mini", "o4-mini-2025-04-16"])("uses max_completion_tokens for %s", async (model) => {
    await openaiStreamTest({ ...config, model });
    const request = mocks.openaiCreate.mock.calls[0][0];
    expect(request.max_completion_tokens).toBe(100);
    expect(request).not.toHaveProperty("max_tokens");
  });

  it.each(["gpt-4", "gpt-4o", "custom-model"])("retains max_tokens for %s", async (model) => {
    await openaiStreamTest({ ...config, model });
    const request = mocks.openaiCreate.mock.calls[0][0];
    expect(request.max_tokens).toBe(100);
    expect(request).not.toHaveProperty("max_completion_tokens");
  });
});
