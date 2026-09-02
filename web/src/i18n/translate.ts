import { i18next } from "@/i18n";
import { getErrorMessage, getRemoteMessage } from "@/i18n/errorMessages";
import { getPluginText } from "@/i18n/pluginTranslations";

export type TranslationValues = Record<string, unknown>;

export function translate(key: string, values: TranslationValues = {}): string {
  return i18next.t(key as never, values);
}

export interface Translator {
  (key: string, values?: TranslationValues): string;
  error: typeof getErrorMessage;
  plugin: typeof getPluginText;
  remote: typeof getRemoteMessage;
}

export const tr: Translator = Object.assign(translate, {
  error: getErrorMessage,
  plugin: getPluginText,
  remote: getRemoteMessage,
});
