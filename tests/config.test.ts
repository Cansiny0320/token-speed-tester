import type { Config, OutputFormat, Provider } from "../src/config.js";
import { describe, expect, it } from "vitest";
import { getDefaultModel, parseConfig, validateConfig } from "../src/config.js";

describe("config", () => {
  const VALID_API_KEY = "sk-test-api-key-12345";

  describe("parseConfig", () => {
    it("should parse valid OpenAI config with minimal args", () => {
      const result = parseConfig({
        apiKey: VALID_API_KEY,
      });

      expect(result.provider).toBe("openai");
      expect(result.apiKey).toBe(VALID_API_KEY);
      expect(result.model).toBe("gpt-5.2");
      expect(result.maxTokens).toBe(1024);
      expect(result.runCount).toBe(3);
      expect(result.prompt).toBe("写一篇关于 AI 的短文");
      expect(result.lang).toBe("zh");
      expect(result.baseURL).toBeUndefined();
    });

    it("should parse valid OpenAI config", () => {
      const result = parseConfig({
        apiKey: VALID_API_KEY,
        provider: "openai",
      });

      expect(result.provider).toBe("openai");
      expect(result.apiKey).toBe(VALID_API_KEY);
      expect(result.model).toBe("gpt-5.2");
    });

    it("should use custom model when provided", () => {
      const result = parseConfig({
        apiKey: VALID_API_KEY,
        provider: "anthropic",
        model: "claude-3-opus-20240229",
      });

      expect(result.model).toBe("claude-3-opus-20240229");
    });

    it("should use custom maxTokens when provided", () => {
      const result = parseConfig({
        apiKey: VALID_API_KEY,
        maxTokens: 2048,
      });

      expect(result.maxTokens).toBe(2048);
    });

    it("should use custom runs when provided", () => {
      const result = parseConfig({
        apiKey: VALID_API_KEY,
        runs: 5,
      });

      expect(result.runCount).toBe(5);
    });

    it("should use custom prompt when provided", () => {
      const customPrompt = "Explain quantum computing";
      const result = parseConfig({
        apiKey: VALID_API_KEY,
        prompt: customPrompt,
      });

      expect(result.prompt).toBe(customPrompt);
    });

    it("should use English defaults when lang is en", () => {
      const result = parseConfig({
        apiKey: VALID_API_KEY,
        lang: "en",
      });

      expect(result.lang).toBe("en");
      expect(result.prompt).toBe("Write a short essay about AI");
    });

    it("should use custom baseURL when provided", () => {
      const customURL = "https://api.example.com/v1";
      const result = parseConfig({
        apiKey: VALID_API_KEY,
        url: customURL,
      });

      expect(result.baseURL).toBe(customURL);
    });

    it("should trim whitespace from apiKey", () => {
      const result = parseConfig({
        apiKey: "  " + VALID_API_KEY + "  ",
      });

      expect(result.apiKey).toBe(VALID_API_KEY);
    });

    it("should trim whitespace from prompt", () => {
      const result = parseConfig({
        apiKey: VALID_API_KEY,
        prompt: "  test prompt  ",
      });

      expect(result.prompt).toBe("test prompt");
    });

    it("should trim whitespace from baseURL", () => {
      const customURL = "  https://api.example.com/v1  ";
      const result = parseConfig({
        apiKey: VALID_API_KEY,
        url: customURL,
      });

      expect(result.baseURL).toBe("https://api.example.com/v1");
    });

    it("should throw error for empty apiKey", () => {
      expect(() =>
        parseConfig({
          apiKey: "",
        }),
      ).toThrow("API Key is required");
    });

    it("should throw error for whitespace-only apiKey", () => {
      expect(() =>
        parseConfig({
          apiKey: "   ",
        }),
      ).toThrow("API Key is required");
    });

    it("should throw error for invalid provider", () => {
      expect(() =>
        parseConfig({
          apiKey: VALID_API_KEY,
          provider: "invalid" as Provider,
        }),
      ).toThrow("Invalid provider: invalid. Must be 'anthropic' or 'openai'.");
    });

    it("should throw error for invalid lang", () => {
      expect(() =>
        parseConfig({
          apiKey: VALID_API_KEY,
          lang: "jp",
        }),
      ).toThrow("Invalid lang: jp. Must be 'zh' or 'en'.");
    });

    it("should throw error for negative maxTokens", () => {
      expect(() =>
        parseConfig({
          apiKey: VALID_API_KEY,
          maxTokens: -100,
        }),
      ).toThrow("Invalid max-tokens: -100. Must be a positive integer.");
    });

    it("should throw error for zero maxTokens", () => {
      expect(() =>
        parseConfig({
          apiKey: VALID_API_KEY,
          maxTokens: 0,
        }),
      ).toThrow("Invalid max-tokens: 0. Must be a positive integer.");
    });

    it("should throw error for non-integer maxTokens", () => {
      expect(() =>
        parseConfig({
          apiKey: VALID_API_KEY,
          maxTokens: 1.5,
        }),
      ).toThrow("Invalid max-tokens: 1.5. Must be a positive integer.");
    });

    it("should throw error for NaN maxTokens", () => {
      expect(() =>
        parseConfig({
          apiKey: VALID_API_KEY,
          maxTokens: Number.NaN,
        }),
      ).toThrow("Invalid max-tokens: NaN. Must be a positive integer.");
    });

    it("should throw error for negative runs", () => {
      expect(() =>
        parseConfig({
          apiKey: VALID_API_KEY,
          runs: -1,
        }),
      ).toThrow("Invalid runs: -1. Must be a positive integer.");
    });

    it("should throw error for zero runs", () => {
      expect(() =>
        parseConfig({
          apiKey: VALID_API_KEY,
          runs: 0,
        }),
      ).toThrow("Invalid runs: 0. Must be a positive integer.");
    });

    it("should throw error for non-integer runs", () => {
      expect(() =>
        parseConfig({
          apiKey: VALID_API_KEY,
          runs: 2.5,
        }),
      ).toThrow("Invalid runs: 2.5. Must be a positive integer.");
    });

    it("should throw error for NaN runs", () => {
      expect(() =>
        parseConfig({
          apiKey: VALID_API_KEY,
          runs: Number.NaN,
        }),
      ).toThrow("Invalid runs: NaN. Must be a positive integer.");
    });

    it("should parse complete config with all options", () => {
      const result = parseConfig({
        apiKey: VALID_API_KEY,
        provider: "openai",
        url: "https://api.openai.com/v1",
        model: "gpt-4",
        maxTokens: 4096,
        runs: 10,
        prompt: "Write a story",
        lang: "en",
      });

      expect(result).toEqual({
        provider: "openai",
        apiKey: VALID_API_KEY,
        baseURL: "https://api.openai.com/v1",
        model: "gpt-4",
        maxTokens: 4096,
        runCount: 10,
        prompt: "Write a story",
        lang: "en",
        outputFormat: "html",
        outputPath: "report.html",
      });
    });

    it("should reject string maxTokens values when cast unsafely", () => {
      expect(() =>
        parseConfig({
          apiKey: VALID_API_KEY,
          maxTokens: "2048" as unknown as number,
        }),
      ).toThrow("Invalid max-tokens: 2048. Must be a positive integer.");
    });

    it("should reject string runs values when cast unsafely", () => {
      expect(() =>
        parseConfig({
          apiKey: VALID_API_KEY,
          runs: "5" as unknown as number,
        }),
      ).toThrow("Invalid runs: 5. Must be a positive integer.");
    });
  });

  describe("getDefaultModel", () => {
    it("should return default Anthropic model", () => {
      expect(getDefaultModel("anthropic")).toBe("claude-opus-4-5-20251101");
    });

    it("should return default OpenAI model", () => {
      expect(getDefaultModel("openai")).toBe("gpt-5.2");
    });
  });

  describe("validateConfig", () => {
    const validConfig: Config = {
      provider: "anthropic",
      apiKey: VALID_API_KEY,
      model: "claude-opus-4-5-20251101",
      maxTokens: 1024,
      runCount: 3,
      prompt: "Test prompt",
      lang: "zh",
      outputFormat: "terminal",
      outputPath: "report",
    };

    it("should validate a correct config", () => {
      const result = validateConfig(validConfig);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject config with empty apiKey", () => {
      const result = validateConfig({
        ...validConfig,
        apiKey: "",
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("API Key is required");
    });

    it("should reject config with invalid provider", () => {
      const result = validateConfig({
        ...validConfig,
        provider: "invalid" as Provider,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid provider");
    });

    it("should reject config with negative maxTokens", () => {
      const result = validateConfig({
        ...validConfig,
        maxTokens: -1,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("maxTokens must be a positive integer");
    });

    it("should reject config with zero maxTokens", () => {
      const result = validateConfig({
        ...validConfig,
        maxTokens: 0,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("maxTokens must be a positive integer");
    });

    it("should reject config with non-integer maxTokens", () => {
      const result = validateConfig({
        ...validConfig,
        maxTokens: 1.1,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("maxTokens must be a positive integer");
    });

    it("should reject config with NaN maxTokens", () => {
      const result = validateConfig({
        ...validConfig,
        maxTokens: Number.NaN,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("maxTokens must be a positive integer");
    });

    it("should reject config with negative runCount", () => {
      const result = validateConfig({
        ...validConfig,
        runCount: -1,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("runCount must be a positive integer");
    });

    it("should reject config with zero runCount", () => {
      const result = validateConfig({
        ...validConfig,
        runCount: 0,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("runCount must be a positive integer");
    });

    it("should reject config with non-integer runCount", () => {
      const result = validateConfig({
        ...validConfig,
        runCount: 2.2,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("runCount must be a positive integer");
    });

    it("should reject config with NaN runCount", () => {
      const result = validateConfig({
        ...validConfig,
        runCount: Number.NaN,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("runCount must be a positive integer");
    });

    it("should reject config with empty prompt", () => {
      const result = validateConfig({
        ...validConfig,
        prompt: "",
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("prompt cannot be empty");
    });

    it("should reject config with whitespace-only prompt", () => {
      const result = validateConfig({
        ...validConfig,
        prompt: "   ",
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("prompt cannot be empty");
    });

    it("should reject config with invalid outputFormat", () => {
      const result = validateConfig({
        ...validConfig,
        outputFormat: "xml" as OutputFormat,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid outputFormat");
    });

    it("should reject config with empty outputPath", () => {
      const result = validateConfig({
        ...validConfig,
        outputPath: " ",
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe("outputPath cannot be empty");
    });

    it("should accept config with custom baseURL", () => {
      const result = validateConfig({
        ...validConfig,
        baseURL: "https://api.example.com",
      });
      expect(result.valid).toBe(true);
    });

    it("should accept config with undefined baseURL", () => {
      const configWithoutURL: Config = {
        provider: "anthropic",
        apiKey: VALID_API_KEY,
        model: "claude-opus-4-5-20251101",
        maxTokens: 1024,
        runCount: 3,
        prompt: "Test",
        lang: "zh",
        outputFormat: "terminal",
        outputPath: "report",
      };
      const result = validateConfig(configWithoutURL);
      expect(result.valid).toBe(true);
    });

    it("should accept OpenAI config", () => {
      const openaiConfig: Config = {
        provider: "openai",
        apiKey: VALID_API_KEY,
        model: "gpt-5.2",
        maxTokens: 1024,
        runCount: 3,
        prompt: "Test",
        lang: "zh",
        outputFormat: "terminal",
        outputPath: "report",
      };
      const result = validateConfig(openaiConfig);
      expect(result.valid).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should handle very large maxTokens", () => {
      const result = parseConfig({
        apiKey: VALID_API_KEY,
        maxTokens: 1000000,
      });
      expect(result.maxTokens).toBe(1000000);
    });

    it("should handle very large runs", () => {
      const result = parseConfig({
        apiKey: VALID_API_KEY,
        runs: 1000,
      });
      expect(result.runCount).toBe(1000);
    });

    it("should handle very long prompt", () => {
      const longPrompt = "a".repeat(10000);
      const result = parseConfig({
        apiKey: VALID_API_KEY,
        prompt: longPrompt,
      });
      expect(result.prompt).toBe(longPrompt);
    });

    it("should handle special characters in prompt", () => {
      const specialPrompt = "测试 🧪 中文 & English! @#$%";
      const result = parseConfig({
        apiKey: VALID_API_KEY,
        prompt: specialPrompt,
      });
      expect(result.prompt).toBe(specialPrompt);
    });

    it("should handle multiline prompt", () => {
      const multilinePrompt = "Line 1\nLine 2\nLine 3";
      const result = parseConfig({
        apiKey: VALID_API_KEY,
        prompt: multilinePrompt,
      });
      expect(result.prompt).toBe(multilinePrompt);
    });
  });
});
