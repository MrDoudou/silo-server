import englishCatalog from "@/i18n/locales/en.json";
import frenchCatalog from "@/i18n/locales/fr.json";

export const defaultNamespace = "translation";

export const englishResources = {
  translation: englishCatalog,
} as const;

export const resources = {
  en: englishResources,
  fr: {
    translation: frenchCatalog,
  },
} as const;

export { englishCatalog, frenchCatalog };
