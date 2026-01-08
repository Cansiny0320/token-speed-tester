import { describe, it, expect } from "vitest";
import {
  renderSpeedChart,
  renderTPSHistogram,
  renderStatsTable,
  renderSingleResult,
  renderReport,
} from "../src/chart.js";
import type { StatsResult, CalculatedMetrics } from "../src/metrics.js";

describe("chart", () => {
  const mockStatsResult: StatsResult = {
    mean: {
      ttft: 150.5,
      totalTime: 2500.75,
      totalTokens: 125.33,
      averageSpeed: 50.14,
      peakSpeed: 75.8,
      peakTps: 60.25,
      tps: [10, 20, 15, 25, 30, 20, 10],
    },
    min: {
      ttft: 100,
      totalTime: 2000,
      totalTokens: 100,
      averageSpeed: 45,
      peakSpeed: 60,
      peakTps: 50,
      tps: [],
    },
    max: {
      ttft: 200,
      totalTime: 3000,
      totalTokens: 150,
      averageSpeed: 55,
      peakSpeed: 90,
      peakTps: 80,
      tps: [],
    },
    stdDev: {
      ttft: 28.87,
      totalTime: 288.68,
      totalTokens: 20.82,
      averageSpeed: 3.54,
      peakSpeed: 10.45,
      peakTps: 8.12,
      tps: [],
    },
    sampleSize: 3,
  };

  describe("renderSpeedChart", () => {
    it("should render chart with TPS data", () => {
      const tps = [10, 20, 30, 40, 50];
      const result = renderSpeedChart(tps);

      expect(result).toContain("Token 速度趋势图");
      expect(result).toContain("┌");
      expect(result).toContain("┐");
      expect(result).toContain("└");
      expect(result).toContain("─");
      expect(result).toContain("│");
    });

    it("should include axis labels", () => {
      const tps = [10, 20, 30];
      const result = renderSpeedChart(tps);

      expect(result).toContain("0s");
    });

    it("should handle empty TPS array", () => {
      const result = renderSpeedChart([]);

      expect(result).toContain("没有可用于图表的数据");
    });

    it("should respect custom maxSpeed parameter", () => {
      const tps = [10, 20, 30];
      const result1 = renderSpeedChart(tps, 100);
      const result2 = renderSpeedChart(tps, 50);

      // Both should render charts but with different scales
      expect(result1).toContain("Token 速度趋势图");
      expect(result2).toContain("Token 速度趋势图");
    });

    it("should handle single TPS value", () => {
      const tps = [42];
      const result = renderSpeedChart(tps);

      expect(result).toContain("Token 速度趋势图");
      expect(result).toContain("0s");
    });
  });

  describe("renderTPSHistogram", () => {
    it("should render histogram with TPS data", () => {
      const tps = [10, 20, 30, 40, 50, 15, 25, 35, 45, 55];
      const result = renderTPSHistogram(tps);

      expect(result).toContain("TPS 分布");
      expect(result).toContain("│");
    });

    it("should show bucket ranges", () => {
      const tps = [10, 20, 30, 40, 50];
      const result = renderTPSHistogram(tps);

      // Should contain decimal numbers for bucket ranges
      expect(result).toMatch(/\d+\.\d+-\d+\.\d+/);
    });

    it("should handle empty TPS array", () => {
      const result = renderTPSHistogram([]);

      expect(result).toContain("没有 TPS 数据可用");
    });

    it("should handle single TPS value", () => {
      const tps = [50];
      const result = renderTPSHistogram(tps);

      expect(result).toContain("TPS 分布");
    });

    it("should show count for each bucket", () => {
      const tps = [10, 10, 10, 20, 20, 30];
      const result = renderTPSHistogram(tps);

      // Should contain numbers representing counts
      expect(result).toMatch(/\s\d+$/);
    });
  });

  describe("renderStatsTable", () => {
    it("should render complete stats table", () => {
      const result = renderStatsTable(mockStatsResult);

      expect(result).toContain("统计汇总");
      expect(result).toContain("N=3");
      expect(result).toContain("TTFT");
      expect(result).toContain("总耗时");
      expect(result).toContain("总 Token 数");
      expect(result).toContain("平均速度");
      expect(result).toContain("峰值速度");
      expect(result).toContain("峰值 TPS");
    });

    it("should include mean, min, max, and stdDev columns", () => {
      const result = renderStatsTable(mockStatsResult);

      expect(result).toContain("均值");
      expect(result).toContain("最小值");
      expect(result).toContain("最大值");
      expect(result).toContain("标准差");
    });

    it("should format numeric values correctly", () => {
      const result = renderStatsTable(mockStatsResult);

      // Should contain formatted decimal numbers
      expect(result).toContain("150.50"); // TTFT mean
    });

    it("should use table borders", () => {
      const result = renderStatsTable(mockStatsResult);

      expect(result).toContain("┌");
      expect(result).toContain("┐");
      expect(result).toContain("└");
      expect(result).toContain("┘");
      expect(result).toContain("┤");
      expect(result).toContain("├");
    });

    it("should handle single sample", () => {
      const singleSample: StatsResult = {
        ...mockStatsResult,
        sampleSize: 1,
        min: { ...mockStatsResult.min, ttft: 150 },
        max: { ...mockStatsResult.max, ttft: 150 },
      };
      const result = renderStatsTable(singleSample);

      expect(result).toContain("N=1");
    });
  });

  describe("renderSingleResult", () => {
    it("should render single test result", () => {
      const metrics: CalculatedMetrics = {
        ttft: 120.5,
        totalTime: 2500.75,
        totalTokens: 125,
        averageSpeed: 50.03,
        peakSpeed: 75.8,
        peakTps: 60.25,
        tps: [10, 15, 20],
      };
      const result = renderSingleResult(metrics, 0);

      expect(result).toContain("[运行 1]");
      expect(result).toContain("120.50ms"); // TTFT
      expect(result).toContain("2500.75ms"); // 总耗时
      expect(result).toContain("125"); // 总 Token 数
      expect(result).toContain("50.03"); // 平均速度
      expect(result).toContain("75.8"); // 峰值速度
      expect(result).toContain("60.25"); // 峰值 TPS
    });

    it("should render English labels when lang is en", () => {
      const metrics: CalculatedMetrics = {
        ttft: 120.5,
        totalTime: 2500.75,
        totalTokens: 125,
        averageSpeed: 50.03,
        peakSpeed: 75.8,
        peakTps: 60.25,
        tps: [10, 15, 20],
      };
      const result = renderSingleResult(metrics, 0, "en");

      expect(result).toContain("[Run 1]");
      expect(result).toContain("Total Time");
      expect(result).toContain("Total Tokens");
      expect(result).toContain("Avg Speed");
    });

    it("should show correct run index", () => {
      const metrics: CalculatedMetrics = {
        ttft: 100,
        totalTime: 1000,
        totalTokens: 50,
        averageSpeed: 50,
        peakSpeed: 60,
        peakTps: 55,
        tps: [],
      };
      const result1 = renderSingleResult(metrics, 0);
      const result2 = renderSingleResult(metrics, 2);

      expect(result1).toContain("[运行 1]");
      expect(result2).toContain("[运行 3]");
    });

    it("should format integer values correctly", () => {
      const metrics: CalculatedMetrics = {
        ttft: 100,
        totalTime: 2000,
        totalTokens: 100,
        averageSpeed: 50,
        peakSpeed: 75,
        peakTps: 70,
        tps: [],
      };
      const result = renderSingleResult(metrics, 0);

      expect(result).toContain("100ms");
      expect(result).toContain("2000ms");
    });

    it("should format fractional values correctly", () => {
      const metrics: CalculatedMetrics = {
        ttft: 123.456,
        totalTime: 2345.678,
        totalTokens: 100,
        averageSpeed: 42.65,
        peakSpeed: 78.9,
        peakTps: 66.6,
        tps: [],
      };
      const result = renderSingleResult(metrics, 0);

      expect(result).toContain("123.46ms");
      expect(result).toContain("2345.68ms");
      expect(result).toContain("42.65");
      expect(result).toContain("78.9");
    });
  });

  describe("renderReport", () => {
    it("should render complete report with all sections", () => {
      const result = renderReport(mockStatsResult);

      expect(result).toContain("Token 速度测试报告");
      expect(result).toContain("统计汇总");
      expect(result).toContain("Token 速度趋势图");
      expect(result).toContain("TPS 分布");
    });

    it("should render English report when lang is en", () => {
      const result = renderReport(mockStatsResult, "en");

      expect(result).toContain("Token Speed Test Report");
      expect(result).toContain("Summary (N=3)");
      expect(result).toContain("Token Speed Trend");
      expect(result).toContain("TPS Distribution");
    });

    it("should include separator lines", () => {
      const result = renderReport(mockStatsResult);

      expect(result).toContain("═");
    });

    it("should skip chart when TPS is empty", () => {
      const emptyStats: StatsResult = {
        ...mockStatsResult,
        mean: { ...mockStatsResult.mean, tps: [] },
      };
      const result = renderReport(emptyStats);

      expect(result).toContain("Token 速度测试报告");
      expect(result).toContain("统计汇总");
      // Should not contain chart sections
      expect(result).not.toContain("Token 速度趋势图 (TPS)");
    });

    it("should handle stats with all TPS values zero", () => {
      const zeroStats: StatsResult = {
        ...mockStatsResult,
        mean: { ...mockStatsResult.mean, tps: [0, 0, 0] },
      };
      const result = renderReport(zeroStats);

      expect(result).toContain("Token 速度测试报告");
      expect(result).toContain("Token 速度趋势图");
    });

    it("should render TPS histogram when TPS data exists", () => {
      const result = renderReport(mockStatsResult);

      expect(result).toContain("TPS 分布");
    });
  });

  describe("generateXLabels edge cases", () => {
    it("should handle single data point", () => {
      const tps = [42];
      const result = renderSpeedChart(tps);
      expect(result).toContain("0s");
    });

    it("should handle many data points", () => {
      const tps = Array.from({ length: 100 }, () => Math.random() * 100);
      const result = renderSpeedChart(tps);
      expect(result).toContain("Token 速度趋势图");
    });
  });

  describe("renderStatsTable edge cases", () => {
    it("should handle zero values", () => {
      const zeroStats: StatsResult = {
        mean: {
          ttft: 0,
          totalTime: 0,
          totalTokens: 0,
          averageSpeed: 0,
          peakSpeed: 0,
          peakTps: 0,
          tps: [],
        },
        min: {
          ttft: 0,
          totalTime: 0,
          totalTokens: 0,
          averageSpeed: 0,
          peakSpeed: 0,
          peakTps: 0,
          tps: [],
        },
        max: {
          ttft: 0,
          totalTime: 0,
          totalTokens: 0,
          averageSpeed: 0,
          peakSpeed: 0,
          peakTps: 0,
          tps: [],
        },
        stdDev: {
          ttft: 0,
          totalTime: 0,
          totalTokens: 0,
          averageSpeed: 0,
          peakSpeed: 0,
          peakTps: 0,
          tps: [],
        },
        sampleSize: 1,
      };
      const result = renderStatsTable(zeroStats);
      expect(result).toContain("0.00");
    });

    it("should handle large values", () => {
      const largeStats: StatsResult = {
        mean: {
          ttft: 5000.5,
          totalTime: 50000,
          totalTokens: 10000,
          averageSpeed: 200,
          peakSpeed: 500,
          peakTps: 350,
          tps: [],
        },
        min: {
          ttft: 4000,
          totalTime: 40000,
          totalTokens: 8000,
          averageSpeed: 180,
          peakSpeed: 450,
          peakTps: 300,
          tps: [],
        },
        max: {
          ttft: 6000,
          totalTime: 60000,
          totalTokens: 12000,
          averageSpeed: 220,
          peakSpeed: 550,
          peakTps: 400,
          tps: [],
        },
        stdDev: {
          ttft: 577.35,
          totalTime: 5773.5,
          totalTokens: 1154.7,
          averageSpeed: 14.14,
          peakSpeed: 35.36,
          peakTps: 25.12,
          tps: [],
        },
        sampleSize: 3,
      };
      const result = renderStatsTable(largeStats);
      expect(result).toContain("5000.50");
      expect(result).toContain("50000.00");
      expect(result).toContain("10000.00");
    });
  });
});
