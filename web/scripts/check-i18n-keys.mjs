#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { collectGoSourceMessages } from "./go-source-message-extractor.mjs";
import {
  analyzeTranslationKeys,
  collectHardcodedUI,
  collectTranslationUsage,
  parseJsonCatalog,
} from "./i18n-key-checker.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const webRoot = path.resolve(path.dirname(scriptPath), "..");
const repositoryRoot = path.resolve(webRoot, "..");
const exceptionsPath = "web/i18n-key-exceptions.json";
const catalogPattern = /^web\/src\/i18n\/locales\/([a-z][a-z0-9-]*)\.json$/;

function git(args, { allowNoMatches = false } = {}) {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 30 * 1024 * 1024,
  });
  if (result.status === 0) return result.stdout;
  if (allowNoMatches && result.status === 1) return "";
  throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
}

function splitNullDelimited(value) {
  return value.split("\0").filter(Boolean);
}

function isScannedSource(filePath) {
  if (!/^web\/src\/.*\.(ts|tsx)$/.test(filePath)) return false;
  if (filePath.includes("/i18n/")) return false;
  if (/\.(test|spec)\.(ts|tsx)$/.test(filePath)) return false;
  if (/\.fixtures\.(ts|tsx)$/.test(filePath)) return false;
  return !filePath.endsWith(".d.ts") && !filePath.endsWith("/test-setup.ts");
}

function isBackendMessageSource(filePath) {
  if (!/^internal\/(api|plugins)\/.*\.go$/.test(filePath)) return false;
  if (filePath.endsWith("_test.go")) return false;
  return !filePath.endsWith("api_translation_keys_generated.go");
}

function isTranslationRelevant(filePath) {
  return (
    isScannedSource(filePath) ||
    isBackendMessageSource(filePath) ||
    catalogPattern.test(filePath) ||
    filePath.startsWith("web/scripts/") ||
    filePath === exceptionsPath
  );
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(absolutePath)));
    else if (entry.isFile()) files.push(absolutePath);
  }
  return files;
}

async function worktreeSnapshot() {
  const files = [
    ...(await listFiles(path.join(webRoot, "src"))),
    ...(await listFiles(path.join(repositoryRoot, "internal", "api"))),
    ...(await listFiles(path.join(repositoryRoot, "internal", "plugins"))),
  ];
  const snapshot = new Map();

  for (const absolutePath of files) {
    const relativePath = path.relative(repositoryRoot, absolutePath).split(path.sep).join("/");
    if (
      !isScannedSource(relativePath) &&
      !isBackendMessageSource(relativePath) &&
      !catalogPattern.test(relativePath)
    ) {
      continue;
    }
    snapshot.set(relativePath, await readFile(absolutePath, "utf8"));
  }
  snapshot.set(exceptionsPath, await readFile(path.join(repositoryRoot, exceptionsPath), "utf8"));
  return snapshot;
}

async function stagedSnapshot() {
  const indexedFiles = splitNullDelimited(
    git([
      "ls-files",
      "--cached",
      "-z",
      "--",
      "web/src",
      "internal/api",
      "internal/plugins",
      exceptionsPath,
    ]),
  ).filter(
    (filePath) =>
      isScannedSource(filePath) ||
      isBackendMessageSource(filePath) ||
      catalogPattern.test(filePath) ||
      filePath === exceptionsPath,
  );
  const stagedFiles = new Set(
    splitNullDelimited(git(["diff", "--cached", "--name-only", "--diff-filter=ACMRD", "-z"])),
  );
  const unstagedFiles = new Set(
    splitNullDelimited(git(["diff", "--name-only", "--diff-filter=ACMRD", "-z"])),
  );
  const snapshot = new Map();

  for (const filePath of indexedFiles) {
    const source =
      stagedFiles.has(filePath) || unstagedFiles.has(filePath)
        ? git(["show", `:${filePath}`])
        : await readFile(path.join(repositoryRoot, filePath), "utf8");
    snapshot.set(filePath, source);
  }
  return snapshot;
}

function loadCatalogs(snapshot) {
  const catalogs = new Map();
  for (const [filePath, source] of snapshot) {
    const match = catalogPattern.exec(filePath);
    if (match) catalogs.set(match[1], parseJsonCatalog(filePath, source));
  }
  const englishCatalog = catalogs.get("en");
  if (!englishCatalog) throw new Error("missing web/src/i18n/locales/en.json");
  catalogs.delete("en");
  return { englishCatalog, translatedCatalogs: catalogs };
}

function loadDynamicKeys(snapshot) {
  const source = snapshot.get(exceptionsPath);
  if (!source) throw new Error(`missing ${exceptionsPath}`);
  const config = JSON.parse(source);
  if (!config || !Array.isArray(config.dynamicKeys)) {
    throw new Error(`${exceptionsPath}: dynamicKeys must be an array`);
  }
  return config.dynamicKeys;
}

function apiKeysByMessage(englishCatalog) {
  const keys = new Map();
  for (const [key, entry] of englishCatalog) {
    if (key.startsWith("api.") && !keys.has(entry.value)) keys.set(entry.value, key);
  }
  return keys;
}

function collectReferences(snapshot, englishCatalog) {
  const references = [];
  const dynamicCalls = [];
  const keysByMessage = apiKeysByMessage(englishCatalog);
  const apiErrorCodes = new Map();
  for (const key of englishCatalog.keys()) {
    if (key.startsWith("errors.api.")) apiErrorCodes.set(key.slice("errors.api.".length), key);
  }

  for (const [filePath, source] of snapshot) {
    if (isScannedSource(filePath)) {
      const usage = collectTranslationUsage(filePath, source);
      references.push(...usage.references);
      dynamicCalls.push(...usage.dynamicCalls);
      continue;
    }
    if (!isBackendMessageSource(filePath)) continue;

    for (const message of collectGoSourceMessages(filePath, source)) {
      const key = keysByMessage.get(message.value);
      if (key) references.push({ key, ...message });
    }
    for (const match of source.matchAll(/"([A-Za-z0-9_.-]+)"/g)) {
      const key = apiErrorCodes.get(match[1]);
      if (key) references.push({ key, filePath, line: 1, column: match.index + 1 });
    }
    for (const match of source.matchAll(/"((?:api|errors)\.[a-z0-9_.]+)"/g)) {
      if (englishCatalog.has(match[1])) {
        references.push({ key: match[1], filePath, line: 1, column: match.index + 1 });
      }
    }
  }

  return { references, dynamicCalls };
}

function collectHardcodedUIProblems(snapshot) {
  const problems = [];
  for (const [filePath, source] of snapshot) {
    if (isScannedSource(filePath)) problems.push(...collectHardcodedUI(filePath, source));
  }
  return problems;
}

function deleteCatalogKey(catalog, key) {
  const segments = key.split(".");
  const parents = [];
  let current = catalog;
  for (const segment of segments.slice(0, -1)) {
    if (!current?.[segment] || typeof current[segment] !== "object") return;
    parents.push([current, segment]);
    current = current[segment];
  }
  delete current[segments.at(-1)];
  for (const [parent, segment] of parents.reverse()) {
    if (Object.keys(parent[segment]).length === 0) delete parent[segment];
  }
}

async function pruneUnusedKeys(unusedKeys) {
  const keys = unusedKeys.map(({ key }) => key);
  const localeDirectory = path.join(webRoot, "src", "i18n", "locales");
  const localeFiles = (await readdir(localeDirectory)).filter((name) => name.endsWith(".json"));

  for (const name of localeFiles) {
    const filePath = path.join(localeDirectory, name);
    const catalog = JSON.parse(await readFile(filePath, "utf8"));
    for (const key of keys) deleteCatalogKey(catalog, key);
    await writeFile(filePath, `${JSON.stringify(catalog, null, 2)}\n`);
  }
  console.log(`Removed ${keys.length} unused keys from ${localeFiles.length} locale files.`);
}

function annotationEscape(value) {
  return String(value).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

function reportLocation(problem, message) {
  const location = `${problem.filePath}:${problem.line}:${problem.column ?? 1}`;
  console.error(`  ${location}  ${message}`);
  if (process.env.CI) {
    console.error(
      `::error file=${annotationEscape(problem.filePath)},line=${problem.line},col=${problem.column ?? 1}::${annotationEscape(message)}`,
    );
  }
}

function printProblems(analysis) {
  let problemCount = 0;
  const groups = [
    ["Missing English keys referenced by code:", analysis.missingKeys, (item) => item.key],
    [
      "Unused English keys:",
      analysis.unusedKeys,
      (item) => `${item.key} — remove it or document its dynamic use`,
    ],
    [
      "Translated keys missing from English:",
      analysis.unknownKeys,
      (item) => `${item.language}/${item.key}`,
    ],
    [
      "Invalid semantic key names:",
      analysis.invalidKeyNames,
      (item) => `${item.key} — use dot-separated snake_case segments`,
    ],
    [
      "Undocumented dynamic translation calls:",
      analysis.invalidDynamicCalls,
      (item) => `${item.expression} — add a scoped dynamicKeys exception`,
    ],
  ];

  for (const [title, problems, message] of groups) {
    if (!problems.length) continue;
    console.error(`\n${title}`);
    for (const problem of problems) {
      reportLocation(problem, message(problem));
      problemCount += 1;
    }
  }

  if (analysis.placeholderMismatches.length) {
    console.error("\nInterpolation placeholder mismatches:");
    for (const problem of analysis.placeholderMismatches) {
      reportLocation(
        problem,
        `${problem.language}/${problem.key} expected [${problem.expected.join(", ")}] but found [${problem.actual.join(", ")}]`,
      );
      problemCount += 1;
    }
  }
  if (analysis.invalidDynamicKeys.length) {
    console.error("\nInvalid dynamic-key exceptions:");
    for (const problem of analysis.invalidDynamicKeys) {
      console.error(`  ${problem.rule?.pattern ?? "<invalid>"} — ${problem.reason}`);
      problemCount += 1;
    }
  }
  if (analysis.hardcodedUI.length) {
    console.error("\nHard-coded user-visible UI text:");
    for (const problem of analysis.hardcodedUI) {
      reportLocation(
        problem,
        `${JSON.stringify(problem.value)} — ${problem.recommendation ?? 'replace it with tr("semantic.key")'}`,
      );
      problemCount += 1;
    }
  }
  return problemCount;
}

async function main() {
  const staged = process.argv.includes("--staged");
  const prune = process.argv.includes("--prune");
  if (staged) {
    const changedFiles = splitNullDelimited(
      git(["diff", "--cached", "--name-only", "--diff-filter=ACMRD", "-z"]),
    );
    if (!changedFiles.some(isTranslationRelevant)) {
      console.log("i18n key check skipped: no staged translation-relevant files");
      return;
    }
  }

  const snapshot = staged ? await stagedSnapshot() : await worktreeSnapshot();
  const { englishCatalog, translatedCatalogs } = loadCatalogs(snapshot);
  const usage = collectReferences(snapshot, englishCatalog);
  const analysis = analyzeTranslationKeys({
    englishCatalog,
    translatedCatalogs,
    references: usage.references,
    dynamicCalls: usage.dynamicCalls,
    dynamicKeys: loadDynamicKeys(snapshot),
  });
  analysis.hardcodedUI = collectHardcodedUIProblems(snapshot);

  if (prune) {
    await pruneUnusedKeys(analysis.unusedKeys);
    return;
  }

  const problemCount = printProblems(analysis);
  if (problemCount) {
    console.error(
      `\ni18n key check failed with ${problemCount} problem${problemCount === 1 ? "" : "s"}.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `i18n keys are consistent: ${analysis.englishKeyCount} English keys, ${analysis.referenceCount} referenced.`,
  );
}

main().catch((error) => {
  console.error(`i18n key check failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
