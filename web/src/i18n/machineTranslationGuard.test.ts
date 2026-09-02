import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("machine translation guard", () => {
  it("keeps automatic translators outside the React-owned DOM", () => {
    const indexHtml = readFileSync(path.resolve(process.cwd(), "index.html"), "utf8");
    const htmlTag = indexHtml.match(/<html\b[^>]*>/)?.[0];
    const rootTag = indexHtml.match(/<div\s+id="root"[^>]*>/)?.[0];

    expect(htmlTag).toContain('translate="no"');
    expect(htmlTag).toContain('class="notranslate"');
    expect(indexHtml).toContain('<meta name="google" content="notranslate" />');
    expect(rootTag).toContain('translate="no"');
    expect(rootTag).toContain('class="notranslate"');
  });
});
