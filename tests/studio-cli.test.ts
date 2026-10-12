import { describe, expect, it } from "vitest";
import { parseConfig, validateConfig } from "../src/config.js";

describe("Codex CLI configuration", () => {
  it("uses local login without an API key and validates timing settings", () => {
    const config = parseConfig({ provider: "codex", apiKey: "", codexPath: "/tmp/codex", effort: "low", timeoutMs: 60000 });

    expect(config.model).toBe("auto");

    expect(config.codexPath).toBe("/tmp/codex");

    expect(validateConfig(config).valid).toBe(true);

    expect(() => parseConfig({ provider: "codex", apiKey: "", timeoutMs: Number.NaN })).toThrow("timeout");

    expect(() => parseConfig({ provider: "codex", apiKey: "", effort: "invalid" })).toThrow("effort");
  });

  it("continues to require API credentials for API providers", () => {
    expect(() => parseConfig({ provider: "openai", apiKey: "" })).toThrow("API Key");

    expect(() => parseConfig({ provider: "anthropic", apiKey: "" })).toThrow("API Key");
  });
});
