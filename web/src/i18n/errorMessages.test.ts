import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ApiClientError } from "@/api/client";
import type { ApiError } from "@/api/types";
import { changeLanguage, i18next } from "@/i18n";
import { tr } from "@/i18n/translate";

function apiError(details: ApiError): ApiClientError {
  return new ApiClientError(400, details.error, details.message, details);
}

describe("error message translation", () => {
  beforeEach(async () => {
    await changeLanguage("fr");
  });

  afterEach(() => {
    i18next.removeResourceBundle("en", "plugin-silo.sonarr");
    i18next.removeResourceBundle("fr", "plugin-silo.sonarr");
  });

  it("translates a known API error with its parameters", () => {
    const error = apiError({
      error: "quota_exceeded",
      message: "Request quota exceeded",
      params: { limit: 5, window_days: 30 },
      translation_key: "errors.api.quota_exceeded",
    });

    expect(tr.error("errors.common.request_failed", error)).toBe(
      "Vous avez atteint la limite de 5 demandes sur une période de 30 jours.",
    );
  });

  it("translates a legacy API error from its stable code", () => {
    const error = apiError({
      error: "quota_exceeded",
      message: "",
      params: { limit: 5, window_days: 30 },
    });

    expect(tr.error("errors.common.request_failed", error)).toBe(
      "Vous avez atteint la limite de 5 demandes sur une période de 30 jours.",
    );
  });

  it("keeps the server's English message for an unknown API error", () => {
    const error = apiError({
      error: "future_server_error",
      message: "A newer server returned this message",
      translation_key: "errors.api.future_server_error",
    });

    expect(tr.error("errors.common.request_failed", error)).toBe(
      "A newer server returned this message",
    );
  });

  it("uses the code when an unknown API error has no message", () => {
    const error = apiError({ error: "future_server_error", message: "" });
    expect(tr.error("errors.common.request_failed", error)).toBe("future_server_error");
  });

  it("uses a translated contextual fallback for non-API failures", () => {
    expect(tr.error("errors.auth.login_failed", new TypeError("Failed to fetch"))).toBe(
      "La connexion a échoué.",
    );
  });

  it("uses the mandatory key without an error object", () => {
    expect(tr.error("api.responses.connection_successful", null)).toBe("Connexion réussie.");
  });

  it("supports isolated plugin catalogs without allowing them into core namespaces", () => {
    i18next.addResourceBundle("en", "plugin-silo.sonarr", {
      errors: { connection_refused: "Could not connect to Sonarr." },
    });
    i18next.addResourceBundle("fr", "plugin-silo.sonarr", {
      errors: { connection_refused: "Connexion à Sonarr impossible." },
    });
    const error = apiError({
      error: "connection_refused",
      message: "Could not connect to Sonarr",
      plugin_id: "silo.sonarr",
      translation_key: "errors.connection_refused",
    });

    expect(tr.error("errors.common.request_failed", error)).toBe("Connexion à Sonarr impossible.");
  });

  it("preserves a plugin message when no plugin catalog exists", () => {
    const error = apiError({
      error: "plugin_error",
      message: "Legacy plugin validation failed",
      plugin_id: "silo.legacy",
      translation_key: "errors.plugin_error",
    });

    expect(tr.error("errors.common.request_failed", error)).toBe("Legacy plugin validation failed");
  });

  it("translates structured non-error API messages", () => {
    expect(
      tr.remote({
        message: "Connection successful.",
        translation_key: "api.responses.connection_successful",
      }),
    ).toBe("Connexion réussie.");
  });

  it("prefers a plugin message catalog for structured plugin responses", () => {
    i18next.addResourceBundle("fr", "plugin-silo.sonarr", {
      messages: { connection_successful: "Connexion Sonarr réussie." },
    });

    expect(
      tr.remote({
        message: "Connection successful.",
        plugin_id: "silo.sonarr",
        translation_key: "messages.connection_successful",
      }),
    ).toBe("Connexion Sonarr réussie.");
  });
});
