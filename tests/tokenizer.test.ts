import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTokenizer } from "../src/tokenizer.js";

const mockEncoding = { encode: vi.fn(), free: vi.fn() };
const mockFallbackEncoding = { encode: vi.fn(), free: vi.fn() };

vi.mock("tiktoken", () => ({
  encoding_for_model: vi.fn(() => mockEncoding),
  get_encoding: vi.fn(() => mockFallbackEncoding),
}));

describe("tokenizer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should use model-specific encoding when available", () => {
    const tokenizer = createTokenizer("gpt-5.2");

    expect(tokenizer).toBe(mockEncoding);
  });

  it("should use fallback encoding when model is empty", async () => {
    const { encoding_for_model, get_encoding } = await import("tiktoken");

    const tokenizer = createTokenizer("   ");

    expect(encoding_for_model).not.toHaveBeenCalled();
    expect(get_encoding).toHaveBeenCalledWith("cl100k_base");
    expect(tokenizer).toBe(mockFallbackEncoding);
  });

  it("should fall back to default encoding when model is unknown", async () => {
    const { encoding_for_model, get_encoding } = await import("tiktoken");

    vi.mocked(encoding_for_model).mockImplementationOnce(() => {
      throw new Error("Unknown model");
    });

    const tokenizer = createTokenizer("unknown-model");

    expect(get_encoding).toHaveBeenCalledWith("cl100k_base");
    expect(tokenizer).toBe(mockFallbackEncoding);
  });
});
