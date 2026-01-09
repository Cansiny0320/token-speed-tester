import { describe, it, expect, afterEach } from "vitest";
import { writeFile, unlink } from "node:fs/promises";
import { generateHTMLReport } from "../src/html-report.js";
import type { Config } from "../src/config.js";
import type { StatsResult, CalculatedMetrics } from "../src/metrics.js";
import { getMessages } from "../src/i18n.js";

describe("html-report", () => {
  const mockConfig: Config = {
    provider: "anthropic",
    baseURL: "https://api.anthropic.com",
    model: "claude-3-5-sonnet-20241022",
    apiKey: "sk-test",
    runCount: 3,
    maxTokens: 1024,
    prompt: "Test prompt",
    lang: "zh",
  };

  const mockSingleResults: CalculatedMetrics[] = [
    {
      ttft: 120.5,
      totalTime: 2500.75,
      totalTokens: 125,
      averageSpeed: 50.03,
      peakSpeed: 75.8,
      peakTps: 60.25,
      tps: [10, 20, 30, 40, 50],
    },
    {
      ttft: 100.2,
      totalTime: 2300.5,
      totalTokens: 115,
      averageSpeed: 50.01,
      peakSpeed: 70.5,
      peakTps: 55.3,
      tps: [15, 25, 35, 45, 55],
    },
    {
      ttft: 130.8,
      totalTime: 2700.25,
      totalTokens: 135,
      averageSpeed: 49.98,
      peakSpeed: 80.2,
      peakTps: 65.1,
      tps: [12, 22, 32, 42, 52],
    },
  ];

  const mockStats: StatsResult = {
    mean: {
      ttft: 117.17,
      totalTime: 2500.5,
      totalTokens: 125,
      averageSpeed: 50.01,
      peakSpeed: 75.5,
      peakTps: 60.22,
      tps: [12.33, 22.33, 32.33, 42.33, 52.33],
    },
    min: {
      ttft: 100.2,
      totalTime: 2300.5,
      totalTokens: 115,
      averageSpeed: 49.98,
      peakSpeed: 70.5,
      peakTps: 55.3,
      tps: [],
    },
    max: {
      ttft: 130.8,
      totalTime: 2700.25,
      totalTokens: 135,
      averageSpeed: 50.03,
      peakSpeed: 80.2,
      peakTps: 65.1,
      tps: [],
    },
    stdDev: {
      ttft: 12.56,
      totalTime: 175.32,
      totalTokens: 8.5,
      averageSpeed: 0.02,
      peakSpeed: 4.23,
      peakTps: 4.37,
      tps: [],
    },
    percentiles: {
      ttft: { p50: 120, p95: 129, p99: 130 },
      averageSpeed: { p50: 50, p95: 50, p99: 50 },
      peakSpeed: { p50: 75, p95: 79, p99: 80 },
      peakTps: { p50: 60, p95: 64, p99: 65 },
    },
    sampleSize: 3,
  };

  describe("generateHTMLReport", () => {
    it("should generate HTML with Chinese content", () => {
      const messages = getMessages("zh");
      const result = generateHTMLReport({
        config: mockConfig,
        singleResults: mockSingleResults,
        stats: mockStats,
        lang: "zh",
        messages,
      });

      expect(result).toContain("<!DOCTYPE html>");
      expect(result).toContain('lang="zh"');
      expect(result).toContain("Token 速度测试报告");
      expect(result).toContain("统计汇总");
      expect(result).toContain("配置");
      expect(result).toContain("图表");
    });

    it("should generate HTML with English content", () => {
      const messages = getMessages("en");
      const enConfig = { ...mockConfig, lang: "en" as const };
      const result = generateHTMLReport({
        config: enConfig,
        singleResults: mockSingleResults,
        stats: mockStats,
        lang: "en",
        messages,
      });

      expect(result).toContain("<!DOCTYPE html>");
      expect(result).toContain('lang="en"');
      expect(result).toContain("Token Speed Test Report");
      expect(result).toContain("Summary");
      expect(result).toContain("Configuration");
      expect(result).toContain("Chart Analysis");
    });

    it("should include SVG speed chart", () => {
      const messages = getMessages("zh");
      const result = generateHTMLReport({
        config: mockConfig,
        singleResults: mockSingleResults,
        stats: mockStats,
        lang: "zh",
        messages,
      });

      expect(result).toContain("<svg");
      expect(result).toContain('id="speedChart"');
      expect(result).toContain("<polyline");
      expect(result).toContain("<circle");
    });

    it("should include SVG TPS histogram", () => {
      const messages = getMessages("zh");
      const result = generateHTMLReport({
        config: mockConfig,
        singleResults: mockSingleResults,
        stats: mockStats,
        lang: "zh",
        messages,
      });

      expect(result).toContain("<svg");
      expect(result).toContain('id="tpsChart"');
      expect(result).toContain("<rect");
    });

    it("should include config grid with test parameters", () => {
      const messages = getMessages("zh");
      const result = generateHTMLReport({
        config: mockConfig,
        singleResults: mockSingleResults,
        stats: mockStats,
        lang: "zh",
        messages,
      });

      expect(result).toContain("ANTHROPIC");
      expect(result).toContain("claude-3-5-sonnet-20241022");
      expect(result).toContain("1024");
      expect(result).toContain("3");
      expect(result).toContain("Test prompt");
    });

    it("should include summary cards with metrics", () => {
      const messages = getMessages("zh");
      const result = generateHTMLReport({
        config: mockConfig,
        singleResults: mockSingleResults,
        stats: mockStats,
        lang: "zh",
        messages,
      });

      expect(result).toContain("117"); // TTFT mean
      expect(result).toContain("50.01"); // Average speed mean
      expect(result).toContain("75.5"); // Peak speed mean
      expect(result).toContain("125"); // Total tokens
    });

    it("should include stats table", () => {
      const messages = getMessages("zh");
      const result = generateHTMLReport({
        config: mockConfig,
        singleResults: mockSingleResults,
        stats: mockStats,
        lang: "zh",
        messages,
      });

      expect(result).toContain("<table");
      expect(result).toContain("TTFT");
      expect(result).toContain("均值");
      expect(result).toContain("P50");
      expect(result).toContain("P95");
      expect(result).toContain("P99");
      expect(result).toContain("最小值");
      expect(result).toContain("最大值");
    });

    it("should include details table with single results", () => {
      const messages = getMessages("zh");
      const result = generateHTMLReport({
        config: mockConfig,
        singleResults: mockSingleResults,
        stats: mockStats,
        lang: "zh",
        messages,
      });

      expect(result).toContain('<span class="run-badge">1</span>');
      expect(result).toContain('<span class="run-badge">2</span>');
      expect(result).toContain('<span class="run-badge">3</span>');
      expect(result).toContain("121ms"); // First TTFT (rounded)
      expect(result).toContain("125"); // First total tokens
    });

    it("should include CSS styles", () => {
      const messages = getMessages("zh");
      const result = generateHTMLReport({
        config: mockConfig,
        singleResults: mockSingleResults,
        stats: mockStats,
        lang: "zh",
        messages,
      });

      expect(result).toContain("<style>");
      expect(result).toContain("--bg:");
      expect(result).toContain("--accent:");
      expect(result).toContain("font-family:");
    });

    it("should handle empty TPS data", () => {
      const messages = getMessages("zh");
      const emptyResults: CalculatedMetrics[] = [
        {
          ttft: 100,
          totalTime: 1000,
          totalTokens: 50,
          averageSpeed: 50,
          peakSpeed: 60,
          peakTps: 55,
          tps: [],
        },
      ];
      const emptyStats: StatsResult = {
        ...mockStats,
        mean: { ...mockStats.mean, tps: [] },
      };

      const result = generateHTMLReport({
        config: mockConfig,
        singleResults: emptyResults,
        stats: emptyStats,
        lang: "zh",
        messages,
      });

      expect(result).toContain("没有可用于图表的数据");
    });

    it("should escape HTML in prompt", () => {
      const messages = getMessages("zh");
      const dangerousConfig: Config = {
        ...mockConfig,
        prompt: '<script>alert("xss")</script>',
      };

      const result = generateHTMLReport({
        config: dangerousConfig,
        singleResults: mockSingleResults,
        stats: mockStats,
        lang: "zh",
        messages,
      });

      expect(result).not.toContain('<script>alert("xss")</script>');
      expect(result).toContain("&lt;script&gt;");
    });

    it("should use chart colors for multiple runs", () => {
      const messages = getMessages("zh");
      const result = generateHTMLReport({
        config: mockConfig,
        singleResults: mockSingleResults,
        stats: mockStats,
        lang: "zh",
        messages,
      });

      // Should include different colors for different runs
      expect(result).toContain("#00f5ff"); // cyan
      expect(result).toContain("#ff00aa"); // magenta
      expect(result).toContain("#ffcc00"); // yellow
    });

    it("should include legend items", () => {
      const messages = getMessages("zh");
      const result = generateHTMLReport({
        config: mockConfig,
        singleResults: mockSingleResults,
        stats: mockStats,
        lang: "zh",
        messages,
      });

      expect(result).toContain("chart-legend");
      expect(result).toContain("legend-item");
    });

    it("should include test time", () => {
      const messages = getMessages("zh");
      const result = generateHTMLReport({
        config: mockConfig,
        singleResults: mockSingleResults,
        stats: mockStats,
        lang: "zh",
        messages,
      });

      expect(result).toContain(messages.htmlTestTime);
    });

    it("should format times correctly", () => {
      const messages = getMessages("zh");
      const result = generateHTMLReport({
        config: mockConfig,
        singleResults: mockSingleResults,
        stats: mockStats,
        lang: "zh",
        messages,
      });

      // Times < 1000ms should be in ms (rounded)
      expect(result).toContain("121ms"); // TTFT (rounded)
      // Times >= 1000ms should be in seconds
      expect(result).toContain("2.50s"); // Total time
    });

    it("should handle single result", () => {
      const messages = getMessages("zh");
      const singleResult: CalculatedMetrics[] = [
        {
          ttft: 100,
          totalTime: 1000,
          totalTokens: 50,
          averageSpeed: 50,
          peakSpeed: 60,
          peakTps: 55,
          tps: [10, 20, 30],
        },
      ];
      const singleStats: StatsResult = {
        mean: {
          ttft: 100,
          totalTime: 1000,
          totalTokens: 50,
          averageSpeed: 50,
          peakSpeed: 60,
          peakTps: 55,
          tps: [10, 20, 30],
        },
        min: {
          ttft: 100,
          totalTime: 1000,
          totalTokens: 50,
          averageSpeed: 50,
          peakSpeed: 60,
          peakTps: 55,
          tps: [],
        },
        max: {
          ttft: 100,
          totalTime: 1000,
          totalTokens: 50,
          averageSpeed: 50,
          peakSpeed: 60,
          peakTps: 55,
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
        percentiles: {
          ttft: { p50: 100, p95: 100, p99: 100 },
          averageSpeed: { p50: 50, p95: 50, p99: 50 },
          peakSpeed: { p50: 60, p95: 60, p99: 60 },
          peakTps: { p50: 55, p95: 55, p99: 55 },
        },
        sampleSize: 1,
      };

      const result = generateHTMLReport({
        config: mockConfig,
        singleResults: singleResult,
        stats: singleStats,
        lang: "zh",
        messages,
      });

      expect(result).toContain("<!DOCTYPE html>");
      expect(result).toContain("100ms");
      expect(result).toContain("50"); // Average speed
    });

    it("should include responsive design media queries", () => {
      const messages = getMessages("zh");
      const result = generateHTMLReport({
        config: mockConfig,
        singleResults: mockSingleResults,
        stats: mockStats,
        lang: "zh",
        messages,
      });

      expect(result).toContain("@media");
      expect(result).toContain("max-width: 1024px");
      expect(result).toContain("max-width: 640px");
    });

    it("should include theme toggle button and styles", () => {
      const messages = getMessages("zh");
      const result = generateHTMLReport({
        config: mockConfig,
        singleResults: mockSingleResults,
        stats: mockStats,
        lang: "zh",
        messages,
      });

      // Should include theme toggle button
      expect(result).toContain("theme-toggle");
      expect(result).toContain('id="themeToggle"');
      expect(result).toContain('aria-label="Toggle theme"');

      // Should include sun and moon icons
      expect(result).toContain("moon-icon");
      expect(result).toContain("sun-icon");

      // Should include light theme CSS variables
      expect(result).toContain('[data-theme="light"]');
      expect(result).toContain("--scan-line-opacity");
      expect(result).toContain("--grid-line-opacity");

      // Should include theme toggle script
      expect(result).toContain("localStorage.getItem('theme')");
      expect(result).toContain("prefers-color-scheme");
    });
  });

  describe("i18n message functions", () => {
    it("should call htmlGenerated message function", () => {
      const messages = getMessages("zh");
      expect(messages.htmlGenerated("report.html")).toBe("✓ HTML 报告已生成: report.html");
    });

    it("should call htmlOpenError message function", () => {
      const messages = getMessages("zh");
      expect(messages.htmlOpenError("report.html")).toBe(
        "无法自动打开报告，请手动打开: report.html"
      );
    });

    it("should support English htmlGenerated message", () => {
      const messages = getMessages("en");
      expect(messages.htmlGenerated("report.html")).toBe("✓ HTML report generated: report.html");
    });

    it("should support English htmlOpenError message", () => {
      const messages = getMessages("en");
      expect(messages.htmlOpenError("report.html")).toBe(
        "Could not auto-open report, please open manually: report.html"
      );
    });

    it("should call runLabel message function", () => {
      const messages = getMessages("zh");
      expect(messages.runLabel(1)).toBe("[运行 1]");
      expect(messages.runLabel(5)).toBe("[运行 5]");
    });

    it("should call runProgressLabel message function", () => {
      const messages = getMessages("zh");
      expect(messages.runProgressLabel(2, 5)).toBe("[运行 2/5]");
    });

    it("should support English runLabel", () => {
      const messages = getMessages("en");
      expect(messages.runLabel(1)).toBe("[Run 1]");
    });

    it("should support English runProgressLabel", () => {
      const messages = getMessages("en");
      expect(messages.runProgressLabel(2, 5)).toBe("[Run 2/5]");
    });

    it("should call statsSummaryTitle message function", () => {
      const messages = getMessages("zh");
      expect(messages.statsSummaryTitle(3)).toBe("统计汇总 (N=3)");
    });
  });

  describe("HTML output integration", () => {
    const testFilePath = "/tmp/test-report.html";

    afterEach(async () => {
      try {
        await unlink(testFilePath);
      } catch {
        // Ignore if file doesn't exist
      }
    });

    it("should write valid HTML to file", async () => {
      const messages = getMessages("zh");
      const html = generateHTMLReport({
        config: mockConfig,
        singleResults: mockSingleResults,
        stats: mockStats,
        lang: "zh",
        messages,
      });

      await writeFile(testFilePath, html, "utf-8");

      // Verify file was written
      const fs = await import("node:fs");
      const content = fs.readFileSync(testFilePath, "utf-8");
      expect(content).toContain("<!DOCTYPE html>");
      expect(content).toContain("</html>");
    });
  });
});
