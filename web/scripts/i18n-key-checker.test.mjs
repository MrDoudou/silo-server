import { describe, expect, it } from "vitest";

import {
  analyzeTranslationKeys,
  collectHardcodedUI,
  collectTranslationUsage,
  matchesDynamicPattern,
  parseJsonCatalog,
} from "./i18n-key-checker.mjs";

function catalog(source, filePath = "en.json") {
  return parseJsonCatalog(filePath, source);
}

describe("i18n key checker", () => {
  it("reads a nested JSON catalog with source locations", () => {
    const entries = catalog(`{
      "common": { "actions": { "save": "Save" } },
      "pages": { "settings": { "title": "Settings" } }
    }`);

    expect([...entries.keys()]).toEqual(["common.actions.save", "pages.settings.title"]);
    expect(entries.get("common.actions.save")).toMatchObject({ value: "Save", line: 2 });
  });

  it("finds semantic keys in every supported frontend API", () => {
    const usage = collectTranslationUsage(
      "web/src/Panel.tsx",
      `
        const { t } = useTranslation();
        tr(open ? "common.actions.close" : "common.actions.open");
        tr.error("errors.profile.save_failed", error);
        toast.success("feedback.profile.saved", { description: "feedback.profile.ready" });
        t("pages.profile.title");
        const view = <Trans i18nKey="pages.profile.authorized" />;
      `,
    );

    expect(usage.references.map(({ key }) => key).sort()).toEqual([
      "common.actions.close",
      "common.actions.open",
      "errors.profile.save_failed",
      "feedback.profile.ready",
      "feedback.profile.saved",
      "pages.profile.authorized",
      "pages.profile.title",
    ]);
    expect(usage.dynamicCalls).toEqual([]);
  });

  it("requires documentation for runtime-selected keys", () => {
    const usage = collectTranslationUsage(
      "web/src/Menu.tsx",
      `const label = tr(LABEL_KEYS[current]);`,
    );

    expect(usage.dynamicCalls).toMatchObject([
      { filePath: "web/src/Menu.tsx", expression: "LABEL_KEYS[current]" },
    ]);
  });

  it("finds untranslated JSX and descriptor text without flagging technical attributes", () => {
    const problems = collectHardcodedUI(
      "Panel.tsx",
      `
        const option = { label: "Visible option", value: "technical" };
        const view = <div className={active ? "selected" : "idle"}>Visible text</div>;
      `,
    );

    expect(problems.map(({ value }) => value).sort()).toEqual(["Visible option", "Visible text"]);
  });

  it("accepts semantic keys in localized toast options", () => {
    const problems = collectHardcodedUI(
      "Panel.tsx",
      `toast.success("feedback.profile.saved", {
        description: "feedback.profile.ready",
        action: { label: "common.actions.undo", onClick: undo },
      });`,
    );

    expect(problems).toEqual([]);
  });

  it("rejects translations around technical JSX attributes", () => {
    const problems = collectHardcodedUI(
      "Panel.tsx",
      `const view = <button className={tr(active ? "common.on" : "common.off")} />;`,
    );

    expect(problems).toMatchObject([
      {
        value: "translation in technical attribute className",
        recommendation: "remove tr() from the technical value",
      },
    ]);
  });

  it("reports missing, unused, unknown, and broken placeholder keys", () => {
    const analysis = analyzeTranslationKeys({
      englishCatalog: catalog(`{
        "common": { "used": "Hello {{name}}", "unused": "Unused" }
      }`),
      translatedCatalogs: new Map([
        [
          "fr",
          catalog(
            `{
              "common": { "used": "Bonjour", "legacy": "Ancien" }
            }`,
            "fr.json",
          ),
        ],
      ]),
      references: [
        { key: "common.used", filePath: "View.tsx", line: 4, column: 7 },
        { key: "common.missing", filePath: "View.tsx", line: 5, column: 7 },
      ],
      dynamicKeys: [],
    });

    expect(analysis.missingKeys.map(({ key }) => key)).toEqual(["common.missing"]);
    expect(analysis.unusedKeys.map(({ key }) => key)).toEqual(["common.unused"]);
    expect(analysis.unknownKeys.map(({ key }) => key)).toEqual(["common.legacy"]);
    expect(analysis.placeholderMismatches).toMatchObject([
      { key: "common.used", expected: ["name"], actual: [] },
    ]);
  });

  it("accepts scoped dynamic patterns and rejects stale ones", () => {
    const analysis = analyzeTranslationKeys({
      englishCatalog: catalog(`{
        "menu": { "hidden": "Hidden" }
      }`),
      translatedCatalogs: new Map(),
      references: [],
      dynamicCalls: [
        { filePath: "web/src/Menu.tsx", line: 4, column: 7, expression: "LABELS[value]" },
      ],
      dynamicKeys: [
        {
          pattern: "menu.*",
          source: "web/src/Menu.tsx",
          reason: "Selected through a finite label map.",
        },
        { pattern: "removed.*", reason: "This exception should become stale." },
      ],
    });

    expect(analysis.unusedKeys).toEqual([]);
    expect(analysis.invalidDynamicCalls).toEqual([]);
    expect(analysis.invalidDynamicKeys).toMatchObject([
      { rule: { pattern: "removed.*" }, reason: "pattern no longer matches an English key" },
    ]);
    expect(matchesDynamicPattern("errors.api.quota_exceeded", "errors.api.*")).toBe(true);
  });

  it("enforces dot-separated snake_case keys", () => {
    const analysis = analyzeTranslationKeys({
      englishCatalog: catalog(`{ "pages": { "badKey": "Bad" } }`),
      translatedCatalogs: new Map(),
      references: [],
      dynamicKeys: [],
    });

    expect(analysis.invalidKeyNames).toMatchObject([{ key: "pages.badKey" }]);
  });
});
