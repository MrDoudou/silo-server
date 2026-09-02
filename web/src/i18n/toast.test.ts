import { beforeEach, describe, expect, it, vi } from "vitest";

import { changeLanguage } from "@/i18n";

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  warning: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    custom: vi.fn(),
    dismiss: vi.fn(),
    error: mocks.error,
    getHistory: vi.fn(),
    getToasts: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    message: vi.fn(),
    promise: vi.fn(),
    success: vi.fn(),
    warning: mocks.warning,
  }),
}));

import { toast } from "@/i18n/toast";

describe("localized toast", () => {
  beforeEach(async () => {
    mocks.error.mockReset();
    mocks.warning.mockReset();
    await changeLanguage("fr");
  });

  it("resolves the mandatory key for an error", () => {
    toast.error("errors.auth.login_failed", { error: new TypeError("Failed to fetch") });
    expect(mocks.error).toHaveBeenCalledWith("La connexion a échoué.");
  });

  it("supports a semantic key without an error object", () => {
    toast.error("errors.auth.passwords_do_not_match");
    expect(mocks.error).toHaveBeenCalledWith("Les mots de passe ne correspondent pas.");
  });

  it("preserves an already-resolved dynamic description", () => {
    toast.warning("api.responses.connection_successful", {
      resolvedDescription: "Server-provided detail",
    });

    expect(mocks.warning).toHaveBeenCalledWith("Connexion réussie.", {
      description: "Server-provided detail",
    });
  });
});
