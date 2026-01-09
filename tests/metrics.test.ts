import { describe, it, expect } from "vitest";
import {
  calculateTTFT,
  calculateAverageSpeed,
  calculatePeakSpeed,
  calculateTPS,
  calculateMetrics,
  calculateStats,
  formatSpeed,
  formatTime,
} from "../src/metrics.js";
import type { StreamMetrics } from "../src/metrics.js";

describe("metrics", () => {
  describe("calculateTTFT", () => {
    it("should return the TTFT value from metrics", () => {
      const metrics: StreamMetrics = {
        ttft: 150,
        tokens: [],
        totalTokens: 100,
        totalTime: 2000,
      };
      expect(calculateTTFT(metrics)).toBe(150);
    });

    it("should return zero for zero TTFT", () => {
      const metrics: StreamMetrics = {
        ttft: 0,
        tokens: [],
        totalTokens: 0,
        totalTime: 0,
      };
      expect(calculateTTFT(metrics)).toBe(0);
    });
  });

  describe("calculateAverageSpeed", () => {
    it("should calculate average speed in tokens per second", () => {
      const metrics: StreamMetrics = {
        ttft: 100,
        tokens: [],
        totalTokens: 100,
        totalTime: 2000, // 2 seconds
      };
      expect(calculateAverageSpeed(metrics)).toBe(50); // 100 tokens / 2 seconds
    });

    it("should return zero when total time is zero", () => {
      const metrics: StreamMetrics = {
        ttft: 0,
        tokens: [],
        totalTokens: 100,
        totalTime: 0,
      };
      expect(calculateAverageSpeed(metrics)).toBe(0);
    });

    it("should return zero when total time is negative", () => {
      const metrics: StreamMetrics = {
        ttft: 0,
        tokens: [],
        totalTokens: 100,
        totalTime: -100,
      };
      expect(calculateAverageSpeed(metrics)).toBe(0);
    });

    it("should calculate fractional speeds correctly", () => {
      const metrics: StreamMetrics = {
        ttft: 100,
        tokens: [],
        totalTokens: 15,
        totalTime: 300, // 0.3 seconds
      };
      expect(calculateAverageSpeed(metrics)).toBeCloseTo(50, 1);
    });
  });

  describe("calculatePeakSpeed", () => {
    it("should calculate peak speed with window size", () => {
      // 10 tokens over 100ms = 100 tokens/s
      const metrics: StreamMetrics = {
        ttft: 50,
        tokens: [50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160],
        totalTokens: 12,
        totalTime: 200,
      };
      // First 10 tokens: 140ms -> (9 / 0.140) * 1000 ≈ 64.29
      const result = calculatePeakSpeed(metrics, 10);
      expect(result).toBeGreaterThan(0);
    });

    it("should use all tokens when fewer than window size", () => {
      const metrics: StreamMetrics = {
        ttft: 50,
        tokens: [50, 100, 150],
        totalTokens: 3,
        totalTime: 200,
      };
      // 2 intervals / 100ms * 1000 = 20 tokens/s
      expect(calculatePeakSpeed(metrics, 10)).toBeCloseTo(20, 0);
    });

    it("should return zero for single token", () => {
      const metrics: StreamMetrics = {
        ttft: 50,
        tokens: [50],
        totalTokens: 1,
        totalTime: 50,
      };
      expect(calculatePeakSpeed(metrics, 10)).toBe(0);
    });

    it("should return zero for empty tokens", () => {
      const metrics: StreamMetrics = {
        ttft: 0,
        tokens: [],
        totalTokens: 0,
        totalTime: 0,
      };
      expect(calculatePeakSpeed(metrics, 10)).toBe(0);
    });

    it("should use default window size of 10", () => {
      const metrics: StreamMetrics = {
        ttft: 50,
        tokens: Array.from({ length: 20 }, (_, i) => 50 + i * 10),
        totalTokens: 20,
        totalTime: 250,
      };
      expect(calculatePeakSpeed(metrics)).toBeGreaterThan(0);
    });
  });

  describe("calculateTPS", () => {
    it("should calculate tokens per second for each second", () => {
      // Tokens at: 100ms, 500ms, 1200ms, 1500ms, 2500ms
      const metrics: StreamMetrics = {
        ttft: 100,
        tokens: [100, 500, 1200, 1500, 2500],
        totalTokens: 5,
        totalTime: 2500,
      };
      const tps = calculateTPS(metrics);
      // Second 0 (0-1000ms): 2 tokens (100ms, 500ms)
      // Second 1 (1000-2000ms): 2 tokens (1200ms, 1500ms)
      // Second 2 (2000-3000ms): 1 token (2500ms)
      expect(tps).toEqual([2, 2, 1]);
    });

    it("should return empty array for no tokens", () => {
      const metrics: StreamMetrics = {
        ttft: 0,
        tokens: [],
        totalTokens: 0,
        totalTime: 0,
      };
      expect(calculateTPS(metrics)).toEqual([]);
    });

    it("should handle tokens all in first second", () => {
      const metrics: StreamMetrics = {
        ttft: 50,
        tokens: [100, 200, 300, 400],
        totalTokens: 4,
        totalTime: 400,
      };
      expect(calculateTPS(metrics)).toEqual([4]);
    });

    it("should handle tokens spanning multiple seconds", () => {
      const metrics: StreamMetrics = {
        ttft: 0,
        tokens: [0, 500, 1000, 1500, 2000, 2500],
        totalTokens: 6,
        totalTime: 2500,
      };
      expect(calculateTPS(metrics)).toEqual([2, 2, 2]);
    });

    it("should handle zero total time with tokens", () => {
      const metrics: StreamMetrics = {
        ttft: 0,
        tokens: [0, 0, 0],
        totalTokens: 3,
        totalTime: 0,
      };
      expect(calculateTPS(metrics)).toEqual([3]);
    });
  });

  describe("calculateMetrics", () => {
    it("should calculate all metrics from StreamMetrics", () => {
      const streamMetrics: StreamMetrics = {
        ttft: 100,
        tokens: [100, 200, 300, 400, 500],
        totalTokens: 5,
        totalTime: 500,
      };
      const result = calculateMetrics(streamMetrics);

      expect(result.ttft).toBe(100);
      expect(result.totalTime).toBe(500);
      expect(result.totalTokens).toBe(5);
      expect(result.averageSpeed).toBe(10); // 5 / 0.5 = 10
      expect(result.peakSpeed).toBeGreaterThan(0);
      expect(result.peakTps).toBe(5);
      expect(result.tps).toEqual([5]);
    });

    it("should handle empty token array", () => {
      const streamMetrics: StreamMetrics = {
        ttft: 0,
        tokens: [],
        totalTokens: 0,
        totalTime: 0,
      };
      const result = calculateMetrics(streamMetrics);

      expect(result.ttft).toBe(0);
      expect(result.totalTime).toBe(0);
      expect(result.totalTokens).toBe(0);
      expect(result.averageSpeed).toBe(0);
      expect(result.peakSpeed).toBe(0);
      expect(result.peakTps).toBe(0);
      expect(result.tps).toEqual([]);
    });
  });

  describe("calculateStats", () => {
    it("should calculate statistics from multiple metrics", () => {
      const metrics = [
        {
          ttft: 100,
          totalTime: 1000,
          totalTokens: 50,
          averageSpeed: 50,
          peakSpeed: 60,
          peakTps: 20,
          tps: [10, 10, 10, 10, 10],
        },
        {
          ttft: 200,
          totalTime: 2000,
          totalTokens: 100,
          averageSpeed: 50,
          peakSpeed: 70,
          peakTps: 30,
          tps: [20, 20, 20, 20, 20, 20, 20, 20, 20, 20],
        },
        {
          ttft: 150,
          totalTime: 1500,
          totalTokens: 75,
          averageSpeed: 50,
          peakSpeed: 65,
          peakTps: 25,
          tps: [15, 15, 15, 15, 15, 15, 15],
        },
      ];

      const stats = calculateStats(metrics);

      expect(stats.sampleSize).toBe(3);

      // Mean TTFT: (100 + 200 + 150) / 3 = 150
      expect(stats.mean.ttft).toBeCloseTo(150, 0);

      // Min TTFT: 100
      expect(stats.min.ttft).toBe(100);

      // Max TTFT: 200
      expect(stats.max.ttft).toBe(200);

      // Standard deviation for TTFT
      expect(stats.stdDev.ttft).toBeGreaterThan(0);

      expect(stats.percentiles.totalTime.p50).toBe(1500);
      expect(stats.percentiles.totalTime.p95).toBeCloseTo(1950, 1);
      expect(stats.percentiles.totalTime.p99).toBeCloseTo(1990, 1);
      expect(stats.percentiles.totalTokens.p50).toBe(75);
      expect(stats.percentiles.totalTokens.p95).toBeCloseTo(97.5, 1);
      expect(stats.percentiles.totalTokens.p99).toBeCloseTo(99.5, 1);
    });

    it("should handle single metric", () => {
      const metrics = [
        {
          ttft: 100,
          totalTime: 1000,
          totalTokens: 50,
          averageSpeed: 50,
          peakSpeed: 60,
          peakTps: 20,
          tps: [10, 10, 10],
        },
      ];

      const stats = calculateStats(metrics);

      expect(stats.sampleSize).toBe(1);
      expect(stats.mean.ttft).toBe(100);
      expect(stats.min.ttft).toBe(100);
      expect(stats.max.ttft).toBe(100);
      expect(stats.stdDev.ttft).toBe(0);
    });

    it("should throw error for empty metrics array", () => {
      expect(() => calculateStats([])).toThrow("Cannot calculate stats from empty metrics array");
    });

    it("should calculate TPS mean correctly for varying lengths", () => {
      const metrics = [
        {
          ttft: 100,
          totalTime: 1000,
          totalTokens: 10,
          averageSpeed: 10,
          peakSpeed: 20,
          peakTps: 5,
          tps: [5, 5],
        },
        {
          ttft: 100,
          totalTime: 1000,
          totalTokens: 15,
          averageSpeed: 15,
          peakSpeed: 25,
          peakTps: 8,
          tps: [7, 7, 8],
        },
      ];

      const stats = calculateStats(metrics);

      // TPS mean: [(5+7)/2, (5+7)/2, (0+8)/2] = [6, 6, 4]
      expect(stats.mean.tps).toEqual([6, 6, 4]);
    });

    it("should calculate standard deviation correctly", () => {
      const metrics = [
        {
          ttft: 100,
          totalTime: 1000,
          totalTokens: 50,
          averageSpeed: 50,
          peakSpeed: 60,
          peakTps: 20,
          tps: [],
        },
        {
          ttft: 200,
          totalTime: 2000,
          totalTokens: 100,
          averageSpeed: 50,
          peakSpeed: 70,
          peakTps: 30,
          tps: [],
        },
        {
          ttft: 300,
          totalTime: 3000,
          totalTokens: 150,
          averageSpeed: 50,
          peakSpeed: 80,
          peakTps: 40,
          tps: [],
        },
      ];

      const stats = calculateStats(metrics);

      // For TTFT: mean = 200, variance = ((100-200)^2 + (200-200)^2 + (300-200)^2) / 3 = 20000/3
      // stdDev = sqrt(20000/3) ≈ 81.65
      expect(stats.stdDev.ttft).toBeCloseTo(81.65, 1);
    });
  });

  describe("formatSpeed", () => {
    it("should format speed with 2 decimal places", () => {
      expect(formatSpeed(50.456)).toBe("50.46");
      expect(formatSpeed(50.454)).toBe("50.45");
    });

    it("should format integer speed correctly", () => {
      expect(formatSpeed(50)).toBe("50.00");
    });

    it("should format small speeds", () => {
      expect(formatSpeed(0.123)).toBe("0.12");
    });
  });

  describe("formatTime", () => {
    it("should format milliseconds for times < 1s", () => {
      expect(formatTime(500)).toBe("500ms");
      expect(formatTime(999)).toBe("999ms");
    });

    it("should format seconds for times >= 1s", () => {
      expect(formatTime(1000)).toBe("1.00s");
      expect(formatTime(1500)).toBe("1.50s");
      expect(formatTime(2500)).toBe("2.50s");
    });

    it("should handle zero time", () => {
      expect(formatTime(0)).toBe("0ms");
    });

    it("should handle fractional milliseconds", () => {
      expect(formatTime(123.456)).toBe("123ms");
    });
  });
});
