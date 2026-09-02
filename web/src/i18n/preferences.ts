export const baseLanguage = "en";
export const supportedLanguages = [baseLanguage, "fr"] as const;
export const languageStorageKey = "silo.ui.language";

export type SupportedLanguage = (typeof supportedLanguages)[number];

interface LanguageDetectionSources {
  storedLanguage?: string | null;
  browserLanguages?: readonly string[];
}

export function normalizeSupportedLanguage(
  value: string | null | undefined,
): SupportedLanguage | null {
  const language = value?.trim().toLowerCase().split(/[-_]/, 1)[0];
  return supportedLanguages.find((supported) => supported === language) ?? null;
}

export function detectPreferredLanguage({
  storedLanguage,
  browserLanguages = [],
}: LanguageDetectionSources): SupportedLanguage {
  const stored = normalizeSupportedLanguage(storedLanguage);
  if (stored) return stored;

  for (const browserLanguage of browserLanguages) {
    const supported = normalizeSupportedLanguage(browserLanguage);
    if (supported) return supported;
  }

  return baseLanguage;
}

export function readStoredLanguage(): string | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(languageStorageKey);
  } catch {
    return null;
  }
}

export function storeLanguage(language: SupportedLanguage): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(languageStorageKey, language);
  } catch {
    // Private browsing can disable localStorage. The active session still changes language.
  }
}
