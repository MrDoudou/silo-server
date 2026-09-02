import { beforeEach, describe, expect, it } from "vitest";

import { changeLanguage } from "@/i18n";

import { tr } from "@/i18n/translate";

describe("semantic UI translations", () => {
  beforeEach(async () => {
    await changeLanguage("en");
  });

  it("preserves significant surrounding whitespace while interpolating", () => {
    expect(tr("pages.admin_user_detail.scope_detail", { scopeDetail: "profile 1" })).toBe(
      " · profile 1",
    );
  });
});
