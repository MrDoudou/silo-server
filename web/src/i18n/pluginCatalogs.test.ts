import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/api/client";
import { changeLanguage, i18next } from "@/i18n";
import {
  synchronizePluginCatalogs,
  validatePluginCatalog,
  type PluginCatalogTarget,
} from "@/i18n/pluginCatalogs";
import { pluginTranslationNamespace } from "@/i18n/pluginTranslations";
import { tr } from "@/i18n/translate";

vi.mock("@/api/client", () => ({ api: vi.fn() }));

const target: PluginCatalogTarget = {
  id: 42,
  plugin_id: "silo.example",
  version: "1.0.0",
  assets: [
    { path: "locales/en.json", content_type: "application/json" },
    { path: "locales/fr.json", content_type: "application/json" },
  ],
};

describe("plugin translation catalogs", () => {
  beforeEach(async () => {
    vi.mocked(api).mockReset();
    await changeLanguage("fr");
  });

  afterEach(() => {
    const namespace = pluginTranslationNamespace(target.plugin_id);
    i18next.removeResourceBundle("en", namespace);
    i18next.removeResourceBundle("fr", namespace);
  });

  it("loads English and the selected language into an isolated namespace", async () => {
    vi.mocked(api).mockImplementation(async (path) =>
      path.endsWith("/fr.json")
        ? { messages: { connection_successful: "Connexion au projet réussie." } }
        : { messages: { connection_successful: "Project connection successful." } },
    );

    const result = await synchronizePluginCatalogs([target], "fr");

    expect(result).toEqual({ loaded: 2, issues: [] });
    expect(api).toHaveBeenCalledWith("/plugin-assets/42/locales/en.json");
    expect(api).toHaveBeenCalledWith("/plugin-assets/42/locales/fr.json");
    expect(
      tr.plugin(target.plugin_id, "messages.connection_successful", "Connection successful."),
    ).toBe("Connexion au projet réussie.");
  });

  it("keeps the English fallback when no catalog contains the requested key", async () => {
    vi.mocked(api).mockResolvedValue({ messages: {} });
    await synchronizePluginCatalogs([target], "fr");

    expect(tr.plugin(target.plugin_id, "messages.future", "Future message")).toBe("Future message");
  });

  it("rejects arrays and prototype-polluting keys", () => {
    expect(() => validatePluginCatalog({ messages: [] })).toThrow(
      "catalog.messages must be an object",
    );
    expect(() => validatePluginCatalog(JSON.parse('{"__proto__":{"value":"unsafe"}}'))).toThrow(
      "unsafe key",
    );
  });

  it("reports an invalid remote catalog without breaking the host", async () => {
    vi.mocked(api).mockResolvedValue({ messages: ["invalid"] });

    const result = await synchronizePluginCatalogs([target], "fr");

    expect(result.loaded).toBe(0);
    expect(result.issues).toHaveLength(2);
  });
});
