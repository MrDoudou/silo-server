# API message localization

Silo APIs return stable machine data and English fallbacks. The client owns
presentation and localization, so backend logs, HTTP behavior, and non-web
clients do not depend on a requested display language.

## Response envelope

Native `/api/v1` endpoints use this additive contract for errors, successes,
warnings, and informational messages:

```json
{
  "error": "quota_exceeded",
  "translation_key": "errors.requests.quota_exceeded",
  "message": "Request quota exceeded",
  "params": {
    "limit": 5,
    "window_days": 30
  },
  "plugin_id": "silo.example"
}
```

- `error` is an optional stable machine code. Client behavior branches on it,
  never on translated text.
- `translation_key` is the stable presentation key. Core responses use a full
  key from `web/src/i18n/locales/en.json`; plugin responses use a key relative
  to their isolated catalog.
- `message` is the concise English fallback for compatibility, diagnostics,
  and clients that do not localize.
- `params` contains optional interpolation values. Values are JSON strings,
  numbers, booleans, or null; nested objects and arrays are not part of the
  client contract.
- `plugin_id` identifies the isolated plugin namespace when the key belongs to
  an external project.

Keep useful structured fields already exposed by an endpoint. For example, a
quota response can expose `used`, `limit`, and `window_days` in addition to the
translation fields. Backend logs and raw internal errors are never localized.

## Web resolution

`web/src/i18n/errorMessages.ts` is the single remote-message resolver. It uses:

1. selected-language plugin value when `plugin_id` is present;
2. selected-language core value;
3. English catalog value through i18next fallback;
4. server-provided English `message`;
5. `translation_key` or the stable `error` code.

The resolver also recognizes legacy English server messages while older
servers migrate to `translation_key`. This compatibility lookup is generated
from the English catalog and is not a contract for new code.

Use the short facade for inline errors:

```ts
setResult({
  success: false,
  message: tr.error("errors.setup.connection_check_failed", error),
});
```

Use the localized toast facade for notifications:

```ts
toast.error("errors.profiles.save_failed", { error });
toast.success("feedback.profiles.saved");
```

The semantic key is always the first argument. It provides the local fallback
for network errors, browser failures, malformed responses, and other values
that are not a structured `ApiClientError`. Pass the error object intact so the
resolver retains its code, key, parameters, plugin ID, and English message.

Do not translate inside `web/src/api/client.ts`. `ApiClientError` normalizes and
preserves transport data; UI code decides when and where to render it.

## Adding a core response

1. Choose a specific, stable machine `error` code when application logic needs
   one.
2. Add a semantic English key to `web/src/i18n/locales/en.json` using dot
   hierarchy and `snake_case` segments.
3. Keep a concise English server `message` and put dynamic values in `params`.
4. Return `translation_key` explicitly for new structured responses. Existing
   `writeError` calls are covered by the generated compatibility bridge.
5. Run `pnpm run i18n:sync` from `web` to validate Go messages and regenerate
   `internal/api/handlers/api_translation_keys_generated.go`.
6. Add available locale values. Missing translations intentionally fall back
   to English.
7. Test the machine code, parameters, fallback, and rendered message
   independently.

`writeError` handles ordinary errors, `writeErrorWithParams` adds interpolation
values, and `writePluginError` associates an isolated plugin ID. Do not build a
translation key from arbitrary `err.Error()` text.

## External plugins

No external plugin repository is changed. The base host supports the future
contract:

- plugin assets may include `locales/en.json` and optional language catalogs;
- plugin responses may include `plugin_id`, plugin-relative
  `translation_key`, `message`, `params`, and `error`;
- plugin manifest strings remain English fallbacks;
- full-page plugin applications receive the selected `lang` query parameter
  and localize their own DOM.

The resolver registers each project only under `plugin-<plugin_id>` and never
allows it to replace a core catalog. If a plugin catalog, language, or key is
missing, the English response or manifest string remains visible.

Catalog layout, validation limits, and asset requirements are documented in
`docs/architecture/localization.md`.

## Debugging

- `?lang=keys` renders the core semantic key used by the UI.
- `?i18n_debug=1` reports coverage, missing translations, and rejected plugin
  catalogs.
- Unknown remote keys keep their English message and remain inspectable through
  `ApiClientError.code`, `translationKey`, `params`, and `pluginId`.
