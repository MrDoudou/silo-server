import { describe, expect, it } from "vitest";

import { detectPreferredLanguage, normalizeSupportedLanguage } from "@/i18n/preferences";

describe("language preferences", () => {
  it("normalizes regional language tags", () => {
    expect(normalizeSupportedLanguage("fr-FR")).toBe("fr");
    expect(normalizeSupportedLanguage("EN_us")).toBe("en");
  });

  it("prefers the stored language over the browser", () => {
    expect(
      detectPreferredLanguage({
        storedLanguage: "en",
        browserLanguages: ["fr-FR"],
      }),
    ).toBe("en");
  });

  it("uses the first supported browser language", () => {
    expect(
      detectPreferredLanguage({
        storedLanguage: "es",
        browserLanguages: ["de-DE", "fr-CA", "en-US"],
      }),
    ).toBe("fr");
  });

  it("falls back to English", () => {
    expect(detectPreferredLanguage({ browserLanguages: ["de-DE"] })).toBe("en");
  });
});
