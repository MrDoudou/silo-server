import { createInstance } from "i18next";
import { afterEach, describe, expect, it, vi } from "vitest";

import { changeLanguage, i18next } from "@/i18n";
import { baseLanguage } from "@/i18n/preferences";

describe("i18n runtime", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await changeLanguage("en");
    window.localStorage.clear();
  });

  it("renders French when the catalog contains the key", async () => {
    await changeLanguage("fr");

    expect(i18next.t("common.language.label")).toBe("Langue");
    expect(document.documentElement.lang).toBe("fr");
  });

  it("renders the key when English does not contain it", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(i18next.t("missing.runtime.key" as never)).toBe("missing.runtime.key");
  });

  it("shows semantic keys in key-debug mode", async () => {
    await i18next.changeLanguage("cimode");

    expect(i18next.t("common.language.label")).toBe("common.language.label");
  });

  it("falls back from an incomplete locale to English", async () => {
    const instance = createInstance();
    await instance.init({
      resources: {
        en: { translation: { common: { language: { french: "English fallback" } } } },
        fr: { translation: {} },
      },
      lng: "fr",
      fallbackLng: baseLanguage,
      returnEmptyString: false,
    });

    expect(instance.t("common.language.french")).toBe("English fallback");
  });

  it("ignores unsupported language changes", async () => {
    await changeLanguage("fr");
    await changeLanguage("de");

    expect(i18next.resolvedLanguage).toBe("fr");
  });
});
