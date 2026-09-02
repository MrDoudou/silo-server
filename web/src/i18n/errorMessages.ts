import type { ApiError } from "@/api/types";
import { i18next } from "@/i18n";
import { baseLanguage } from "@/i18n/preferences";
import { pluginTranslationNamespace } from "@/i18n/pluginTranslations";
import { englishCatalog } from "@/i18n/resources";

export type TranslationValues = Record<string, unknown>;

interface LocalizableApiError {
  code: string;
  message: string;
  params: NonNullable<ApiError["params"]>;
  pluginId?: string;
  translationKey?: string;
}

interface CatalogNode {
  [key: string]: string | CatalogNode;
}

function collectEnglishApiMessages(catalog: CatalogNode, prefix = ""): Map<string, string> {
  const messages = new Map<string, string>();

  for (const [name, value] of Object.entries(catalog)) {
    const key = prefix ? `${prefix}.${name}` : name;
    if (typeof value === "string") {
      if (key.startsWith("api.")) messages.set(value, key);
      continue;
    }

    for (const [message, nestedKey] of collectEnglishApiMessages(value, key)) {
      if (!messages.has(message)) messages.set(message, nestedKey);
    }
  }

  return messages;
}

const apiKeyByEnglishMessage = collectEnglishApiMessages(englishCatalog);

function translateCore(key: string, values: TranslationValues): string | null {
  if (!i18next.exists(key, { lng: baseLanguage })) return null;
  return i18next.t(key as never, values);
}

function translatePlugin(
  pluginId: string | undefined,
  key: string | undefined,
  values: TranslationValues,
): string | null {
  if (!pluginId || !key) return null;

  const namespace = pluginTranslationNamespace(pluginId);
  const hasCatalog = [i18next.resolvedLanguage, baseLanguage].some(
    (language) => language && i18next.hasResourceBundle(language, namespace),
  );
  if (!hasCatalog || !i18next.exists(key as never, { ns: namespace as never })) return null;

  return i18next.t(key as never, { ns: namespace as never, ...values });
}

function isLocalizableApiError(error: unknown): error is Error & LocalizableApiError {
  if (!(error instanceof Error) || error.name !== "ApiClientError") return false;

  const candidate = error as Partial<LocalizableApiError> & { status?: unknown };
  return (
    typeof candidate.status === "number" &&
    typeof candidate.code === "string" &&
    Boolean(candidate.params) &&
    typeof candidate.params === "object" &&
    !Array.isArray(candidate.params)
  );
}

function remoteTranslation(details: RemoteMessage): string | null {
  const values = details.params ?? {};
  const pluginMessage = translatePlugin(details.plugin_id, details.translation_key, values);
  if (pluginMessage) return pluginMessage;

  if (details.translation_key) {
    const coreMessage = translateCore(details.translation_key, values);
    if (coreMessage) return coreMessage;
  }

  if (details.error) {
    const compatibleError = translateCore(`errors.api.${details.error}`, values);
    if (compatibleError) return compatibleError;
  }

  const sourceMessage = details.message?.trim();
  if (sourceMessage) {
    const compatibilityKey = apiKeyByEnglishMessage.get(sourceMessage);
    if (compatibilityKey) return translateCore(compatibilityKey, values);
    return sourceMessage;
  }

  return details.translation_key ?? details.error ?? null;
}

export function getErrorMessage(
  localKey: string,
  error: unknown,
  values: TranslationValues = {},
): string {
  if (isLocalizableApiError(error)) {
    const remoteMessage = remoteTranslation({
      error: error.code,
      message: error.message,
      params: error.params,
      plugin_id: error.pluginId,
      translation_key: error.translationKey,
    });
    if (remoteMessage) return remoteMessage;
  }

  return i18next.t(localKey as never, values);
}

export function getRemoteErrorMessage(details: ApiError, localKey?: string): string {
  return (
    remoteTranslation(details) ??
    (localKey ? i18next.t(localKey as never, details.params ?? {}) : details.error)
  );
}

export interface RemoteMessage {
  error?: string;
  message?: string;
  params?: ApiError["params"];
  plugin_id?: string;
  translation_key?: string;
}

export function getRemoteMessage(details: RemoteMessage): string {
  return remoteTranslation(details) ?? "";
}
