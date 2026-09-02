import { describe, expect, it } from "vitest";

import { getTranslationCoverage, listTranslationKeys } from "@/i18n/debug";

describe("translation diagnostics", () => {
  it("lists nested keys in a stable format", () => {
    expect(listTranslationKeys({ action: { save: "Save" }, title: "Settings" })).toEqual([
      "action.save",
      "title",
    ]);
  });

  it("reports missing and unknown translation keys", () => {
    expect(
      getTranslationCoverage(
        { action: { cancel: "Cancel", save: "Save" } },
        { action: { save: "Enregistrer" }, legacy: "Ancien" },
      ),
    ).toEqual({
      missingKeys: ["action.cancel"],
      unknownKeys: ["legacy"],
    });
  });
});
