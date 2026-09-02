import type { TranslationCatalog } from "@/i18n/catalogTypes";

export interface TranslationCoverage {
  missingKeys: string[];
  unknownKeys: string[];
}

export function listTranslationKeys(catalog: TranslationCatalog, prefix = ""): string[] {
  return Object.entries(catalog).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : listTranslationKeys(value, path);
  });
}

export function getTranslationCoverage(
  englishCatalog: TranslationCatalog,
  translatedCatalog: TranslationCatalog,
): TranslationCoverage {
  const englishKeys = new Set(listTranslationKeys(englishCatalog));
  const translatedKeys = new Set(listTranslationKeys(translatedCatalog));

  return {
    missingKeys: [...englishKeys].filter((key) => !translatedKeys.has(key)).sort(),
    unknownKeys: [...translatedKeys].filter((key) => !englishKeys.has(key)).sort(),
  };
}
