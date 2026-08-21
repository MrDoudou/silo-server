import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ScannerSettings from "./ScannerSettings";

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
  };
}

describe("ScannerSettings", () => {
  it("keeps worker counts under a closed Advanced section", () => {
    useSettingsFormMock.mockReturnValue(makeForm({ "metadata.cache_images": "false" }));

    const markup = renderToStaticMarkup(<ScannerSettings />);
    const container = document.createElement("div");
    container.innerHTML = markup;

    expect(container.querySelector("label")?.textContent).toContain("Cache Images to S3");
    const workers = Array.from(container.querySelectorAll("label")).find(
      (label) => label.textContent === "Scanner Workers",
    );
    expect(workers?.closest("details")).not.toBeNull();
    expect(workers?.closest("details")?.hasAttribute("open")).toBe(false);
  });
});
