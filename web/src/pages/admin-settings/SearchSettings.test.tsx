import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import SearchSettings from "./SearchSettings";

const useSettingsFormMock = vi.fn();

vi.mock("@/hooks/useSettingsForm", () => ({
  useSettingsForm: (...args: unknown[]) => useSettingsFormMock(...args),
}));

vi.mock("@/hooks/queries/admin/settings", () => ({
  useCatalogSearchStatus: () => ({ data: undefined, isLoading: true }),
  useCheckAdminSettingsConnection: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

function makeForm(provider: string) {
  return {
    isLoading: false,
    getValue: (key: string) => (key === "catalog.search.provider" ? provider : ""),
    setValue: vi.fn(),
    dirtyCount: 0,
    save: vi.fn(),
    discard: vi.fn(),
    isSaving: false,
    restartRequired: false,
    sensitiveConfigured: [],
    buildConnectionCheckRequest: vi.fn(),
  };
}

describe("SearchSettings", () => {
  it("hides Meilisearch connection fields while Postgres is selected", () => {
    useSettingsFormMock.mockReturnValue(makeForm("postgres"));

    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <SearchSettings />
      </MemoryRouter>,
    );

    expect(markup).toContain("Preferred Provider");
    expect(markup).toContain("Built-in search. No extra service to run.");
    expect(markup).not.toContain("Index Prefix");
    expect(markup).not.toContain("Matching Strategy");
    expect(markup).not.toContain("Semantic Ratio");
  });

  it("shows Meilisearch connection fields and keeps index tuning under Advanced", () => {
    useSettingsFormMock.mockReturnValue(makeForm("meilisearch"));

    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <SearchSettings />
      </MemoryRouter>,
    );
    const container = document.createElement("div");
    container.innerHTML = markup;

    expect(markup).toContain("Semantic Search");
    const indexPrefix = Array.from(container.querySelectorAll("label")).find(
      (label) => label.textContent === "Index Prefix",
    );
    expect(indexPrefix?.closest("details")).not.toBeNull();
    expect(indexPrefix?.closest("details")?.hasAttribute("open")).toBe(false);
  });
});
