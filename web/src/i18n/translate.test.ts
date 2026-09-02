import { beforeEach, describe, expect, it } from "vitest";

import { ApiClientError } from "@/api/client";
import { changeLanguage } from "@/i18n";
import { tr } from "@/i18n/translate";

describe("translation facade", () => {
  beforeEach(async () => {
    await changeLanguage("fr");
  });

  it("translates every local message through one short function", () => {
    expect(tr("common.language.label")).toBe("Langue");
    expect(tr("api.responses.connection_successful")).toBe("Connexion réussie.");
  });

  it("exposes structured error and remote-message resolution", () => {
    const error = new ApiClientError(429, "quota_exceeded", "Request quota exceeded", {
      error: "quota_exceeded",
      message: "Request quota exceeded",
      params: { limit: 5, window_days: 30 },
      translation_key: "errors.api.quota_exceeded",
    });

    expect(tr.error("errors.common.request_failed", error)).toBe(
      "Vous avez atteint la limite de 5 demandes sur une période de 30 jours.",
    );
    expect(
      tr.remote({
        message: "Connection successful.",
        translation_key: "api.responses.connection_successful",
      }),
    ).toBe("Connexion réussie.");
  });
});
