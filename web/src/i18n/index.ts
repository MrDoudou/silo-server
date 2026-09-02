import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import { getTranslationCoverage } from "@/i18n/debug";
import {
  baseLanguage,
  detectPreferredLanguage,
  normalizeSupportedLanguage,
  readStoredLanguage,
  storeLanguage,
  supportedLanguages,
  type SupportedLanguage,
} from "@/i18n/preferences";
import { defaultNamespace, englishCatalog, frenchCatalog, resources } from "@/i18n/resources";

function browserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

function queryLanguage(): SupportedLanguage | "cimode" | null {
  if (typeof window === "undefined") return null;

  const requested = new URLSearchParams(window.location.search).get("lang");
  if (requested === "keys") return "cimode";
  return normalizeSupportedLanguage(requested);
}

function initialLanguage(): SupportedLanguage | "cimode" {
  return (
    queryLanguage() ??
    detectPreferredLanguage({
      storedLanguage: typeof window === "undefined" ? null : readStoredLanguage(),
      browserLanguages: browserLanguages(),
    })
  );
}

function applyDocumentLanguage(language: string): void {
  if (typeof document === "undefined") return;

  const resolved = normalizeSupportedLanguage(language) ?? baseLanguage;
  document.documentElement.lang = resolved;
  document.documentElement.dir = i18next.dir(resolved);
}

function isCoverageDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("i18n_debug") === "1";
}

function reportCoverage(): void {
  if (!isCoverageDebugEnabled()) return;

  const coverage = getTranslationCoverage(englishCatalog, frenchCatalog);
  console.info("[i18n] fr", coverage);
}

const missingKeys = new Set<string>();

void i18next.use(initReactI18next).init({
  resources,
  lng: initialLanguage(),
  fallbackLng: baseLanguage,
  supportedLngs: [...supportedLanguages, "cimode"],
  load: "languageOnly",
  defaultNS: defaultNamespace,
  returnNull: false,
  returnEmptyString: false,
  appendNamespaceToCIMode: false,
  initAsync: false,
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
  saveMissing: true,
  saveMissingTo: "fallback",
  missingKeyHandler: (_languages, namespace, key) => {
    const missingKey = `${namespace}:${key}`;
    if (missingKeys.has(missingKey)) return;

    missingKeys.add(missingKey);
    console.warn(`[i18n] Missing English key "${missingKey}"; rendering the key.`);
  },
  parseMissingKeyHandler: (key) => key,
});

applyDocumentLanguage(i18next.resolvedLanguage ?? i18next.language);
reportCoverage();

i18next.on("languageChanged", applyDocumentLanguage);

export async function changeLanguage(language: string): Promise<void> {
  const supported = normalizeSupportedLanguage(language);
  if (!supported) return;

  storeLanguage(supported);
  await i18next.changeLanguage(supported);
}

export function currentLanguage(): SupportedLanguage {
  return normalizeSupportedLanguage(i18next.resolvedLanguage ?? i18next.language) ?? baseLanguage;
}

export { i18next };
