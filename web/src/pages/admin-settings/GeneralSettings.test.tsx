import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import GeneralSettings from "./GeneralSettings";

const useSettingsFormMock = vi.fn();

vi.mock("@/hooks/useSettingsForm", () => ({
  useSettingsForm: (...args: unknown[]) => useSettingsFormMock(...args),
}));

function makeForm(values: Record<string, string> = {}) {
  return {
    isLoading: false,
    getValue: (key: string) => values[key] ?? "",
    setValue: vi.fn(),
    dirtyCount: 0,
    save: vi.fn(),
    discard: vi.fn(),
    isSaving: false,
    restartRequired: false,
    sensitiveManagedByEnv: [] as string[],
  };
}

describe("GeneralSettings", () => {
  it("keeps token lifetimes under Advanced and describes the seeded 1h access default", () => {
    useSettingsFormMock.mockReturnValue(
      makeForm({
        "server.log_level": "info",
        "auth.access_token_expiry": "1h",
        "auth.refresh_token_expiry": "30d",
      }),
    );

    const markup = renderToStaticMarkup(<GeneralSettings />);
    const container = document.createElement("div");
    container.innerHTML = markup;

    expect(markup).toContain("Log Level");
    expect(markup).toContain("Access tokens last 1 hour");
    expect(markup).toContain("Default 1h.");
    expect(markup).not.toContain("Default 8h.");

    const access = Array.from(container.querySelectorAll("label")).find(
      (label) => label.textContent === "Access Token Expiry",
    );
    expect(access?.closest("details")).not.toBeNull();
    expect(access?.closest("details")?.hasAttribute("open")).toBe(false);
  });
});
