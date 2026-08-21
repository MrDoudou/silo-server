import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import DownloadSettings from "./DownloadSettings";

const useSettingsFormMock = vi.fn();

vi.mock("@/hooks/useSettingsForm", () => ({
  useSettingsForm: (...args: unknown[]) => useSettingsFormMock(...args),
}));

function makeForm(enabled: string) {
  return {
    isLoading: false,
    getValue: (key: string) => (key === "download.enabled" ? enabled : ""),
    setValue: vi.fn(),
    dirtyCount: 0,
    save: vi.fn(),
    discard: vi.fn(),
    isSaving: false,
    restartRequired: false,
  };
}

describe("DownloadSettings", () => {
  it("hides bandwidth and quota fields until downloads are enabled", () => {
    useSettingsFormMock.mockReturnValue(makeForm("false"));

    const markup = renderToStaticMarkup(<DownloadSettings />);

    expect(markup).toContain("Downloads Enabled");
    expect(markup).not.toContain("Server Bandwidth");
    expect(markup).not.toContain("Artifact Directory");
  });

  it("keeps period quotas and artifact storage under Advanced once downloads are on", () => {
    useSettingsFormMock.mockReturnValue(makeForm("true"));

    const markup = renderToStaticMarkup(<DownloadSettings />);
    const container = document.createElement("div");
    container.innerHTML = markup;

    expect(markup).toContain("Server Bandwidth (Mbps)");
    const period = Array.from(container.querySelectorAll("label")).find(
      (label) => label.textContent === "Period Duration",
    );
    expect(period?.closest("details")).not.toBeNull();
    expect(period?.closest("details")?.hasAttribute("open")).toBe(false);
  });
});
