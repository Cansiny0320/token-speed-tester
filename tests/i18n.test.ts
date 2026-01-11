import { describe, expect, it } from "vitest";
import { DEFAULT_LANG, getMessages, isSupportedLang, resolveLang } from "../src/i18n.js";

describe("i18n", () => {
  it("resolves default lang when none provided", () => {
    expect(resolveLang()).toBe(DEFAULT_LANG);
  });

  it("normalizes and validates supported langs", () => {
    expect(resolveLang("EN")).toBe("en");
    expect(resolveLang("zh")).toBe("zh");
    expect(isSupportedLang("en")).toBe(true);
    expect(isSupportedLang("zh")).toBe(true);
    expect(isSupportedLang("es")).toBe(false);
  });

  it("throws on unsupported lang", () => {
    expect(() => resolveLang("jp")).toThrow("Invalid lang: jp. Must be 'zh' or 'en'.");
  });

  it("returns message bundles with functional labels", () => {
    const zh = getMessages("zh");
    const en = getMessages("en");

    expect(zh.defaultPrompt).toContain("AI");
    expect(en.defaultPrompt).toBe("Write a short essay about AI");
    expect(zh.runLabel(1)).toContain("1");
    expect(en.runLabel(2)).toContain("2");
    expect(zh.runProgressLabel(1, 3)).toContain("1/3");
    expect(en.runProgressLabel(2, 4)).toContain("2/4");
    expect(zh.statsSummaryTitle(3)).toContain("N=3");
    expect(en.statsSummaryTitle(2)).toContain("N=2");
  });
});
