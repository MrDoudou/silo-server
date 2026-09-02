import { i18next } from "@/i18n";
import { baseLanguage } from "@/i18n/preferences";

export type PluginTranslationValues = Record<string, unknown>;

export function pluginTranslationNamespace(pluginID: string): string {
  return `plugin-${pluginID}`;
}

export function getPluginText(
  pluginID: string,
  key: string,
  englishFallback: string,
  values: PluginTranslationValues = {},
): string {
  const namespace = pluginTranslationNamespace(pluginID);
  const hasCatalog = [i18next.resolvedLanguage, baseLanguage].some(
    (language) => language && i18next.hasResourceBundle(language, namespace),
  );
  if (!hasCatalog || !i18next.exists(key, { ns: namespace as never })) {
    return englishFallback;
  }

  return i18next.t(key as never, {
    ns: namespace as never,
    ...values,
  });
}
