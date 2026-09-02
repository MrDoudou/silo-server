import { useEffect, useMemo, useState } from "react";

import { api } from "@/api/client";
import type { PluginAsset } from "@/api/types";
import { i18next } from "@/i18n";
import { baseLanguage, normalizeSupportedLanguage } from "@/i18n/preferences";
import { pluginTranslationNamespace } from "@/i18n/pluginTranslations";

type PluginCatalogNode = string | PluginCatalog;

export interface PluginCatalog {
  [key: string]: PluginCatalogNode;
}

export interface PluginCatalogTarget {
  id: number;
  plugin_id: string;
  version: string;
  assets: PluginAsset[];
}

export interface PluginCatalogIssue {
  installationID: number;
  language: string;
  message: string;
}

export interface PluginCatalogSyncResult {
  loaded: number;
  issues: PluginCatalogIssue[];
}

export const EMPTY_PLUGIN_CATALOG_TARGETS: readonly PluginCatalogTarget[] = [];

const forbiddenCatalogKeys = new Set(["__proto__", "constructor", "prototype"]);
const maximumCatalogDepth = 12;
const maximumCatalogEntries = 5_000;

function validateCatalogNode(
  value: unknown,
  path: string,
  depth: number,
  entryCount: { value: number },
): PluginCatalog {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  if (depth > maximumCatalogDepth) {
    throw new Error(`${path} exceeds the maximum nesting depth`);
  }

  const catalog: PluginCatalog = {};
  for (const [key, child] of Object.entries(value)) {
    if (!key.trim() || forbiddenCatalogKeys.has(key)) {
      throw new Error(`${path} contains an unsafe key`);
    }
    entryCount.value += 1;
    if (entryCount.value > maximumCatalogEntries) {
      throw new Error(`catalog exceeds ${maximumCatalogEntries} entries`);
    }

    const childPath = `${path}.${key}`;
    if (typeof child === "string") {
      catalog[key] = child;
      continue;
    }
    catalog[key] = validateCatalogNode(child, childPath, depth + 1, entryCount);
  }
  return catalog;
}

export function validatePluginCatalog(value: unknown): PluginCatalog {
  return validateCatalogNode(value, "catalog", 0, { value: 0 });
}

function localeAsset(target: PluginCatalogTarget, language: string): PluginAsset | undefined {
  const expectedPath = `locales/${language}.json`;
  return target.assets.find(
    (asset) =>
      asset.path === expectedPath &&
      (!asset.content_type || asset.content_type.toLowerCase().includes("json")),
  );
}

function assetAPIPath(installationID: number, assetPath: string): string {
  const encodedPath = assetPath.split("/").map(encodeURIComponent).join("/");
  return `/plugin-assets/${installationID}/${encodedPath}`;
}

function debugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("i18n_debug") === "1";
}

async function loadCatalog(
  target: PluginCatalogTarget,
  language: string,
): Promise<PluginCatalogIssue | null> {
  const asset = localeAsset(target, language);
  if (!asset) return null;

  try {
    const payload = await api<unknown>(assetAPIPath(target.id, asset.path));
    const catalog = validatePluginCatalog(payload);
    i18next.addResourceBundle(
      language,
      pluginTranslationNamespace(target.plugin_id),
      catalog,
      true,
      true,
    );
    return null;
  } catch (error) {
    const issue = {
      installationID: target.id,
      language,
      message: error instanceof Error ? error.message : "Unable to load plugin catalog",
    };
    if (debugEnabled()) console.warn("[i18n] Plugin catalog rejected", issue);
    return issue;
  }
}

export async function synchronizePluginCatalogs(
  targets: readonly PluginCatalogTarget[],
  requestedLanguage = i18next.resolvedLanguage ?? i18next.language,
): Promise<PluginCatalogSyncResult> {
  const selectedLanguage = normalizeSupportedLanguage(requestedLanguage) ?? baseLanguage;
  const languages =
    selectedLanguage === baseLanguage ? [baseLanguage] : [baseLanguage, selectedLanguage];
  const issues: PluginCatalogIssue[] = [];
  let loaded = 0;

  for (const target of targets) {
    for (const language of languages) {
      if (!localeAsset(target, language)) continue;
      const issue = await loadCatalog(target, language);
      if (issue) issues.push(issue);
      else loaded += 1;
    }
  }

  return { loaded, issues };
}

export function usePluginCatalogs(targets: readonly PluginCatalogTarget[]): void {
  const stableTargets = useMemo(() => targets, [targets]);
  const [, setRevision] = useState(0);

  useEffect(() => {
    let active = true;

    const synchronize = async () => {
      const result = await synchronizePluginCatalogs(stableTargets);
      if (active && result.loaded > 0) setRevision((revision) => revision + 1);
    };
    const handleLanguageChange = () => void synchronize();

    void synchronize();
    i18next.on("languageChanged", handleLanguageChange);
    return () => {
      active = false;
      i18next.off("languageChanged", handleLanguageChange);
    };
  }, [stableTargets]);
}
