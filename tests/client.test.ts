import { describe, it, expect, vi } from "vitest";
import {
  anthropicStreamTest,
  openaiStreamTest,
  streamTest,
  runMultipleTests,
} from "../src/client.js";
import type { Config } from "../src/config.js";

vi.mock("../src/tokenizer.js", () => ({
  createTokenizer: vi.fn(() => ({
    encode: (text: string) => Array.from({ length: text.length }),
    free: vi.fn(),
  })),
}));

// Mock Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { type: "content_block_start", index: 0 };
          yield {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: "Hello" },
          };
          yield {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: " world" },
          };
          yield { type: "content_block_stop" };
          yield { type: "message_stop" };
        },
      }),
    },
  })),
}));

// Mock OpenAI SDK
vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          [Symbol.asyncIterator]: async function* () {
            yield { choices: [{ delta: { content: "Hi" } }] };
            yield { choices: [{ delta: { content: " there" } }] };
            yield { choices: [{}] };
          },
        }),
      },
    },
  })),
}));

const mockConfig: Config = {
  provider: "anthropic",
  apiKey: "test-key",
  model: "test-model",
  maxTokens: 100,
  runCount: 1,
  prompt: "Test",
  lang: "zh",
  baseURL: "https://api.test.com",
};

describe("client", () => {
  describe("anthropicStreamTest", () => {
    it("should handle Anthropic stream response", async () => {
      const result = await anthropicStreamTest(mockConfig);

      expect(result.ttft).toBeGreaterThanOrEqual(0);
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.totalTime).toBeGreaterThanOrEqual(0);
      expect(result.tokens).toHaveLength(result.totalTokens);
    });

    it("should handle Anthropic stream with empty response", async () => {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      vi.mocked(Anthropic).mockImplementationOnce(
        () =>
          ({
            messages: {
              create: vi.fn().mockResolvedValue({
                [Symbol.asyncIterator]: async function* () {
                  yield { type: "message_stop" };
                },
              }),
            },
          }) as never
      );

      const result = await anthropicStreamTest(mockConfig);

      expect(result.totalTokens).toBe(0);
      expect(result.tokens).toHaveLength(0);
    });

    it("should handle Anthropic API errors", async () => {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      vi.mocked(Anthropic).mockImplementationOnce(
        () =>
          ({
            messages: {
              create: vi.fn().mockRejectedValue(new Error("API Error")),
            },
          }) as never
      );

      await expect(anthropicStreamTest(mockConfig)).rejects.toThrow(
        "Anthropic API error: API Error"
      );
    });
  });

  describe("openaiStreamTest", () => {
    it("should handle OpenAI stream response", async () => {
      const config: Config = { ...mockConfig, provider: "openai" };
      const result = await openaiStreamTest(config);

      expect(result.ttft).toBeGreaterThanOrEqual(0);
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.totalTime).toBeGreaterThanOrEqual(0);
      expect(result.tokens).toHaveLength(result.totalTokens);
    });

    it("should handle OpenAI stream with empty response", async () => {
      const OpenAI = (await import("openai")).default;
      vi.mocked(OpenAI).mockImplementationOnce(
        () =>
          ({
            chat: {
              completions: {
                create: vi.fn().mockResolvedValue({
                  [Symbol.asyncIterator]: async function* () {
                    yield { choices: [{}] };
                  },
                }),
              },
            },
          }) as never
      );

      const config: Config = { ...mockConfig, provider: "openai" };
      const result = await openaiStreamTest(config);

      expect(result.totalTokens).toBe(0);
    });

    it("should handle OpenAI API errors", async () => {
      const OpenAI = (await import("openai")).default;
      vi.mocked(OpenAI).mockImplementationOnce(
        () =>
          ({
            chat: {
              completions: {
                create: vi.fn().mockRejectedValue(new Error("API Error")),
              },
            },
          }) as never
      );

      const config: Config = { ...mockConfig, provider: "openai" };
      await expect(openaiStreamTest(config)).rejects.toThrow("OpenAI API error: API Error");
    });
  });

  describe("streamTest", () => {
    it("should call anthropicStreamTest for anthropic provider", async () => {
      const result = await streamTest(mockConfig);
      expect(result).toBeDefined();
      expect(result.totalTokens).toBeGreaterThan(0);
    });

    it("should call openaiStreamTest for openai provider", async () => {
      const config: Config = { ...mockConfig, provider: "openai" };
      const result = await streamTest(config);
      expect(result).toBeDefined();
      expect(result.totalTokens).toBeGreaterThan(0);
    });
  });

  describe("runMultipleTests", () => {
    it("should run the specified number of tests", async () => {
      const config: Config = { ...mockConfig, runCount: 3 };
      const results = await runMultipleTests(config);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.ttft).toBeGreaterThanOrEqual(0);
        expect(result.totalTime).toBeGreaterThanOrEqual(0);
      });
    });

    it("should run single test when runCount is 1", async () => {
      const config: Config = { ...mockConfig, runCount: 1 };
      const results = await runMultipleTests(config);

      expect(results).toHaveLength(1);
    });
  });
});
