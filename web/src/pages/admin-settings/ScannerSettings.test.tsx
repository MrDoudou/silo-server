import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ScannerSettings from "./ScannerSettings";

const useSettingsFormMock = vi.fn();

vi.mock("@/hooks/useSettingsForm", () => ({
  useSettingsForm: (...args: unknown[]) => useSettingsFormMock(...args),
}));

function mockForm(values: Record<string, string>) {
  const setValue = vi.fn();
  useSettingsFormMock.mockReturnValue({
    isLoading: false,
    getValue: (key: string) => values[key] ?? "",
    setValue,
    dirtyCount: 0,
    save: vi.fn(),
    discard: vi.fn(),
    isSaving: false,
    restartRequired: false,
  });
  return setValue;
}

describe("ScannerSettings artwork materialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefers the canonical materialization mode over the legacy setting", () => {
    mockForm({
      "artwork.remote_materialization": "passthrough",
      "metadata.cache_images": "true",
    });

    render(<ScannerSettings />);

    expect(useSettingsFormMock.mock.calls[0]?.[0]?.keys).toContain(
      "artwork.remote_materialization",
    );
    expect(screen.getByRole("switch", { name: "Cache Images to S3" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("writes canonical and legacy values together", async () => {
    const setValue = mockForm({ "artwork.remote_materialization": "selected" });

    render(<ScannerSettings />);
    await userEvent.click(screen.getByRole("switch", { name: "Cache Images to S3" }));

    expect(setValue).toHaveBeenNthCalledWith(1, "artwork.remote_materialization", "passthrough");
    expect(setValue).toHaveBeenNthCalledWith(2, "metadata.cache_images", "false");
  });
});
