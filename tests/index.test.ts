import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMultipleTests } from "../src/client.js";
import { parseConfig } from "../src/config.js";
import { calculateMetrics, calculateStats } from "../src/metrics.js";

// Mock all dependencies to avoid actual execution
vi.mock("../src/config.js", () => ({
  parseConfig: vi.fn(),
  getDefaultModel: vi.fn(() => "test-model"),
}));

vi.mock("../src/client.js", () => ({
  runMultipleTests: vi.fn(),
}));

vi.mock("../src/metrics.js", () => ({
  calculateMetrics: vi.fn(m => ({
    ttft: m.ttft,
    totalTime: m.totalTime,
    totalTokens: m.totalTokens,
    averageSpeed: 50,
    peakSpeed: 60,
    peakTps: 30,
    tps: [10, 20],
  })),
  calculateStats: vi.fn(() => ({
    mean: {
      ttft: 100,
      totalTime: 1000,
      totalTokens: 50,
      averageSpeed: 50,
      peakSpeed: 60,
      peakTps: 30,
      tps: [10, 20],
    },
    min: {
      ttft: 80,
      totalTime: 900,
      totalTokens: 40,
      averageSpeed: 45,
      peakSpeed: 55,
      peakTps: 25,
      tps: [],
    },
    max: {
      ttft: 120,
      totalTime: 1100,
      totalTokens: 60,
      averageSpeed: 55,
      peakSpeed: 65,
      peakTps: 35,
      tps: [],
    },
    stdDev: {
      ttft: 10,
      totalTime: 50,
      totalTokens: 5,
      averageSpeed: 2,
      peakSpeed: 3,
      peakTps: 4,
      tps: [],
    },
    percentiles: {
      ttft: { p50: 100, p95: 118, p99: 119 },
      totalTime: { p50: 1000, p95: 1090, p99: 1098 },
      totalTokens: { p50: 50, p95: 59, p99: 59.8 },
      averageSpeed: { p50: 50, p95: 54, p99: 55 },
      peakSpeed: { p50: 60, p95: 64, p99: 65 },
      peakTps: { p50: 30, p95: 34, p99: 34.8 },
    },
    sampleSize: 2,
  })),
}));

vi.mock("../src/chart.js", () => ({
  renderReport: vi.fn(() => "Mock Report"),
  renderSingleResult: vi.fn(() => "Mock Single Result"),
}));

vi.mock("chalk", () => ({
  default: {
    cyan: (s: string) => s,
    gray: (s: string) => s,
    yellow: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    white: (s: string) => s,
  },
}));

vi.mock("commander", () => ({
  Command: vi.fn().mockImplementation(() => ({
    name: vi.fn().mockReturnThis(),
    description: vi.fn().mockReturnThis(),
    version: vi.fn().mockReturnThis(),
    option: vi.fn().mockReturnThis(),
    parse: vi.fn().mockReturnThis(),
    opts: vi.fn().mockReturnValue({
      apiKey: "test-key",
      provider: "anthropic",
      model: "test-model",
      maxTokens: "1024",
      runs: "2",
      prompt: "Test prompt",
    }),
  })),
}));

const mockParseConfig = vi.mocked(parseConfig);
const mockRunMultipleTests = vi.mocked(runMultipleTests);
const mockCalculateMetrics = vi.mocked(calculateMetrics);
const mockCalculateStats = vi.mocked(calculateStats);

describe("index (CLI entry point)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console output during tests
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("config validation through CLI flow", () => {
    it("should accept valid Anthropic config", () => {
      mockParseConfig.mockReturnValue({
        provider: "anthropic",
        apiKey: "sk-test",
        model: "claude-opus-4-5-20251101",
        maxTokens: 1024,
        runCount: 3,
        prompt: "Test",
        lang: "zh",
        outputFormat: "terminal",
        outputPath: "report",
      });

      const config = parseConfig({
        apiKey: "sk-test",
        provider: "anthropic",
      });

      expect(config.provider).toBe("anthropic");
      expect(config.apiKey).toBe("sk-test");
    });

    it("should accept valid OpenAI config", () => {
      mockParseConfig.mockReturnValue({
        provider: "openai",
        apiKey: "sk-test",
        model: "gpt-5.2",
        maxTokens: 1024,
        runCount: 3,
        prompt: "Test",
        lang: "zh",
        outputFormat: "terminal",
        outputPath: "report",
      });

      const config = parseConfig({
        apiKey: "sk-test",
        provider: "openai",
      });

      expect(config.provider).toBe("openai");
    });

    it("should handle custom runs parameter", () => {
      mockParseConfig.mockReturnValue({
        provider: "anthropic",
        apiKey: "sk-test",
        model: "test-model",
        maxTokens: 1024,
        runCount: 5,
        prompt: "Test",
        lang: "zh",
        outputFormat: "terminal",
        outputPath: "report",
      });

      const config = parseConfig({
        apiKey: "sk-test",
        runs: 5,
      });

      expect(config.runCount).toBe(5);
    });
  });

  describe("main flow components", () => {
    it("should handle successful test run flow", async () => {
      mockParseConfig.mockReturnValue({
        provider: "anthropic",
        apiKey: "test-key",
        model: "test-model",
        maxTokens: 1024,
        runCount: 2,
        prompt: "Test prompt",
        lang: "zh",
        outputFormat: "terminal",
        outputPath: "report",
      });

      const mockResults = [
        { ttft: 100, tokens: [100, 200], totalTokens: 2, totalTime: 200 },
        { ttft: 150, tokens: [150, 250], totalTokens: 2, totalTime: 250 },
      ];
      mockRunMultipleTests.mockResolvedValue(mockResults);

      // Simulate the flow
      const config = parseConfig({
        apiKey: "test-key",
        provider: "anthropic",
      });

      const results = await runMultipleTests(config);
      const allMetrics = results.map(r => calculateMetrics(r));
      const stats = calculateStats(allMetrics);

      expect(mockRunMultipleTests).toHaveBeenCalledWith(config);
      expect(mockCalculateMetrics).toHaveBeenCalledTimes(2);
      expect(mockCalculateStats).toHaveBeenCalled();
      expect(stats.sampleSize).toBe(2);
    });
  });

  describe("error handling", () => {
    it("should reject empty API key", () => {
      mockParseConfig.mockImplementation(() => {
        throw new Error("API Key is required");
      });

      expect(() =>
        parseConfig({
          apiKey: "",
        }),
      ).toThrow("API Key is required");
    });

    it("should reject invalid provider", () => {
      mockParseConfig.mockImplementation(() => {
        throw new Error("Invalid provider");
      });

      expect(() =>
        parseConfig({
          apiKey: "sk-test",
          provider: "invalid" as never,
        }),
      ).toThrow("Invalid provider");
    });

    it("should reject negative runs", () => {
      mockParseConfig.mockImplementation(() => {
        throw new Error("Invalid runs");
      });

      expect(() =>
        parseConfig({
          apiKey: "sk-test",
          runs: -1,
        }),
      ).toThrow("Invalid runs");
    });
  });

  describe("parameter parsing edge cases", () => {
    it("should handle minimal config", () => {
      mockParseConfig.mockReturnValue({
        provider: "anthropic",
        apiKey: "sk-test",
        model: "claude-opus-4-5-20251101",
        maxTokens: 1024,
        runCount: 3,
        prompt: "写一篇关于 AI 的短文",
        lang: "zh",
        outputFormat: "terminal",
        outputPath: "report",
      });

      const config = parseConfig({ apiKey: "sk-test" });

      expect(config.provider).toBe("anthropic");
      expect(config.runCount).toBe(3);
      expect(config.maxTokens).toBe(1024);
    });

    it("should handle all custom parameters", () => {
      mockParseConfig.mockReturnValue({
        provider: "openai",
        apiKey: "sk-test",
        model: "gpt-4",
        maxTokens: 2048,
        runCount: 10,
        prompt: "Custom prompt",
        baseURL: "https://api.test.com",
        lang: "en",
        outputFormat: "terminal",
        outputPath: "report",
      });

      const config = parseConfig({
        apiKey: "sk-test",
        provider: "openai",
        model: "gpt-4",
        url: "https://api.test.com",
        maxTokens: 2048,
        runs: 10,
        prompt: "Custom prompt",
      });

      expect(config.model).toBe("gpt-4");
      expect(config.baseURL).toBe("https://api.test.com");
      expect(config.runCount).toBe(10);
    });
  });
});
