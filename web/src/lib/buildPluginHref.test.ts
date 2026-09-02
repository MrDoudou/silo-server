import { afterEach, describe, expect, it } from "vitest";

import { changeLanguage } from "@/i18n";
import { buildPluginHref } from "@/lib/buildPluginHref";

describe("buildPluginHref", () => {
  afterEach(async () => {
    delete document.documentElement.dataset.theme;
    await changeLanguage("en");
    window.localStorage.clear();
  });

  it("passes the selected Silo language and theme to plugin applications", async () => {
    await changeLanguage("fr");
    document.documentElement.dataset.theme = "dark";

    expect(buildPluginHref("/api/v1/plugins/7/")).toBe("/api/v1/plugins/7/?theme=dark&lang=fr");
  });

  it("preserves an existing plugin query string", () => {
    expect(buildPluginHref("/api/v1/plugins/7/?view=settings")).toBe(
      "/api/v1/plugins/7/?view=settings&lang=en",
    );
  });
});
