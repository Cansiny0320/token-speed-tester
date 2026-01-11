import type { Config } from "../src/config.js";
import type { CalculatedMetrics, StatsResult } from "../src/metrics.js";
import { describe, expect, it } from "vitest";
import { generateCSVExport, generateJSONExport } from "../src/export.js";

describe("export", () => {
  const mockConfig: Config = {
    provider: "anthropic",
    apiKey: "sk-test",
    model: "claude-opus-4-5-20251101",
    maxTokens: 1024,
    runCount: 3,
    prompt: "Test prompt",
    lang: "en",
    outputFormat: "json",
    outputPath: "report.json",
  };

  const mockResults: CalculatedMetrics[] = [
    {
      ttft: 100.5,
      totalTime: 2000,
      totalTokens: 100,
      averageSpeed: 50,
      peakSpeed: 75,
      peakTps: 60,
      tps: [10, 20, 30, 40],
    },
    {
      ttft: 150.25,
      totalTime: 2500,
      totalTokens: 125,
      averageSpeed: 50,
      peakSpeed: 80,
      peakTps: 70,
      tps: [15, 25, 35, 45],
    },
    {
      ttft: 120,
      totalTime: 2200,
      totalTokens: 110,
      averageSpeed: 50,
      peakSpeed: 70,
      peakTps: 65,
      tps: [12, 22, 32, 42],
    },
  ];

  const mockStats: StatsResult = {
    mean: {
      ttft: 123.58,
      totalTime: 2233.33,
      totalTokens: 111.67,
      averageSpeed: 50,
      peakSpeed: 75,
      peakTps: 65,
      tps: [12.33, 22.33, 32.33, 42.33],
    },
    min: {
      ttft: 100.5,
      totalTime: 2000,
      totalTokens: 100,
      averageSpeed: 50,
      peakSpeed: 70,
      peakTps: 60,
      tps: [],
    },
    max: {
      ttft: 150.25,
      totalTime: 2500,
      totalTokens: 125,
      averageSpeed: 50,
      peakSpeed: 80,
      peakTps: 70,
      tps: [],
    },
    stdDev: {
      ttft: 20.79,
      totalTime: 208.17,
      totalTokens: 10.41,
      averageSpeed: 0,
      peakSpeed: 4.08,
      peakTps: 4.08,
      tps: [],
    },
    percentiles: {
      ttft: { p50: 120, p95: 147, p99: 149 },
      totalTime: { p50: 2200, p95: 2450, p99: 2490 },
      totalTokens: { p50: 110, p95: 123, p99: 124.8 },
      averageSpeed: { p50: 50, p95: 50, p99: 50 },
      peakSpeed: { p50: 75, p95: 79, p99: 80 },
      peakTps: { p50: 65, p95: 69, p99: 70 },
    },
    sampleSize: 3,
  };

  describe("generateJSONExport", () => {
    it("should generate valid JSON", () => {
      const result = generateJSONExport(mockConfig, mockResults, mockStats);
      const parsed = JSON.parse(result);

      expect(parsed).toHaveProperty("timestamp");
      expect(parsed).toHaveProperty("config");
      expect(parsed).toHaveProperty("runs");
      expect(parsed).toHaveProperty("stats");
    });

    it("should include config in JSON", () => {
      const result = generateJSONExport(mockConfig, mockResults, mockStats);
      const parsed = JSON.parse(result);

      expect(parsed.config.provider).toBe("anthropic");
      expect(parsed.config.model).toBe("claude-opus-4-5-20251101");
      expect(parsed.config.maxTokens).toBe(1024);
      expect(parsed.config.runCount).toBe(3);
      expect(parsed.config.prompt).toBe("Test prompt");
    });

    it("should include individual runs", () => {
      const result = generateJSONExport(mockConfig, mockResults, mockStats);
      const parsed = JSON.parse(result);

      expect(parsed.runs).toHaveLength(3);
      expect(parsed.runs[0].ttft).toBe(100.5);
      expect(parsed.runs[1].totalTokens).toBe(125);
    });

    it("should include stats with percentiles", () => {
      const result = generateJSONExport(mockConfig, mockResults, mockStats);
      const parsed = JSON.parse(result);

      expect(parsed.stats).toHaveProperty("mean");
      expect(parsed.stats).toHaveProperty("min");
      expect(parsed.stats).toHaveProperty("max");
      expect(parsed.stats).toHaveProperty("p50");
      expect(parsed.stats).toHaveProperty("p95");
      expect(parsed.stats).toHaveProperty("p99");

      expect(parsed.stats.mean.ttft).toBe(123.58);
      expect(parsed.stats.p50.ttft).toBe(120);
      expect(parsed.stats.p95.ttft).toBe(147);
      expect(parsed.stats.p99.ttft).toBe(149);
    });
  });

  describe("generateCSVExport", () => {
    it("should generate valid CSV", () => {
      const result = generateCSVExport(mockConfig, mockResults, mockStats);

      expect(result).toContain("# Token Speed Test Results");
      expect(result).toContain("# Timestamp:");
      expect(result).toContain("# Provider: anthropic");
      expect(result).toContain("# Model: claude-opus-4-5-20251101");
    });

    it("should include statistics section", () => {
      const result = generateCSVExport(mockConfig, mockResults, mockStats);

      expect(result).toContain("# Statistics");
      expect(result).toContain("Metric,Mean,P50,P95,P99,Min,Max");
      expect(result).toContain("TTFT (ms)");
      expect(result).toContain("123.58"); // mean TTFT
      expect(result).toContain("120.00"); // P50 TTFT
    });

    it("should include individual runs section", () => {
      const result = generateCSVExport(mockConfig, mockResults, mockStats);

      expect(result).toContain("# Individual Runs");
      expect(result).toContain("Run,TTFT (ms),Total Time (ms),Total Tokens");
      expect(result).toContain("1,100.50,2000.00,100");
      expect(result).toContain("2,150.25,2500.00,125");
    });

    it("should use proper CSV formatting", () => {
      const result = generateCSVExport(mockConfig, mockResults, mockStats);

      // Check for proper comma separation
      expect(result).toMatch(/,100\.50,/);
      expect(result).toMatch(/,150\.25,/);

      // Check for newlines
      const lines = result.split("\n");
      expect(lines.length).toBeGreaterThan(10);
    });
  });
});
