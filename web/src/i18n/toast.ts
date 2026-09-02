import type { ReactNode } from "react";
import { toast as sonnerToast, type Action, type ExternalToast } from "sonner";

import { tr, type TranslationValues } from "@/i18n/translate";

type ToastTitle = Parameters<typeof sonnerToast>[0];

export interface LocalizedToastOptions extends ExternalToast {
  resolvedDescription?: ExternalToast["description"];
  values?: TranslationValues;
}

export interface LocalizedErrorToastOptions extends LocalizedToastOptions {
  error?: unknown;
}

function localizeNode(value: ReactNode): ReactNode {
  return typeof value === "string" ? tr(value) : value;
}

function localizeAction(action: Action | ReactNode | undefined): Action | ReactNode | undefined {
  if (!action || typeof action !== "object" || !("label" in action)) return localizeNode(action);
  return { ...action, label: localizeNode(action.label) };
}

function localizeOptions(options?: ExternalToast): ExternalToast | undefined {
  if (!options) return undefined;
  const description = options.description;

  return {
    ...options,
    ...(Object.prototype.hasOwnProperty.call(options, "action")
      ? { action: localizeAction(options.action) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(options, "cancel")
      ? { cancel: localizeAction(options.cancel) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(options, "description")
      ? {
          description:
            typeof description === "function"
              ? () => localizeNode(description())
              : localizeNode(description),
        }
      : {}),
  };
}

function translatedOptions(options?: LocalizedToastOptions): ExternalToast | undefined {
  if (!options) return undefined;
  const { resolvedDescription, values: _values, ...toastOptions } = options;
  const localizedOptions = localizeOptions(toastOptions);

  if (resolvedDescription !== undefined) {
    return { ...localizedOptions, description: resolvedDescription };
  }
  return Object.keys(toastOptions).length ? localizedOptions : undefined;
}

function show(key: string, options?: LocalizedToastOptions): string | number {
  const localizedOptions = translatedOptions(options);
  const title: ToastTitle = tr(key, options?.values);
  return localizedOptions ? sonnerToast(title, localizedOptions) : sonnerToast(title);
}

function showTyped(
  method: "info" | "loading" | "message" | "success" | "warning",
  key: string,
  options?: LocalizedToastOptions,
): string | number {
  const localizedOptions = translatedOptions(options);
  const title: ToastTitle = tr(key, options?.values);
  return localizedOptions
    ? sonnerToast[method](title, localizedOptions)
    : sonnerToast[method](title);
}

function showError(key: string, options?: LocalizedErrorToastOptions): string | number {
  const { error, ...toastOptions } = options ?? {};
  const values = toastOptions.values;
  const title = error === undefined ? tr(key, values) : tr.error(key, error, values);
  const localizedOptions = translatedOptions(toastOptions);
  return localizedOptions ? sonnerToast.error(title, localizedOptions) : sonnerToast.error(title);
}

export const toast = Object.assign(show, {
  custom: sonnerToast.custom,
  dismiss: sonnerToast.dismiss,
  error: showError,
  getHistory: sonnerToast.getHistory,
  getToasts: sonnerToast.getToasts,
  info: (key: string, options?: LocalizedToastOptions) => showTyped("info", key, options),
  loading: (key: string, options?: LocalizedToastOptions) => showTyped("loading", key, options),
  message: (key: string, options?: LocalizedToastOptions) => showTyped("message", key, options),
  promise: sonnerToast.promise,
  success: (key: string, options?: LocalizedToastOptions) => showTyped("success", key, options),
  warning: (key: string, options?: LocalizedToastOptions) => showTyped("warning", key, options),
});
