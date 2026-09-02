import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { changeLanguage } from "@/i18n";

import { ConnectionCheckAction } from "./ConnectionCheckAction";

describe("ConnectionCheckAction", () => {
  it("announces connection results", () => {
    const markup = renderToStaticMarkup(
      <ConnectionCheckAction
        onClick={vi.fn()}
        result={{ success: true, message: "Connection successful." }}
      />,
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
  });

  it("translates structured connection errors", async () => {
    await changeLanguage("fr");
    const markup = renderToStaticMarkup(
      <ConnectionCheckAction
        onClick={vi.fn()}
        result={{
          success: false,
          error: "invalid_credentials",
          message: "Invalid username or password",
        }}
      />,
    );

    expect(markup).toContain("Le nom d’utilisateur ou le mot de passe est invalide.");
  });
});
