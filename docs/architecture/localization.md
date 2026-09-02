# Localization architecture

English is Silo's source language. Every user-visible string has a stable
semantic key in `web/src/i18n/locales/en.json`; each additional language uses
one file with the same nested shape, for example
`web/src/i18n/locales/fr.json`.

Silo deliberately keeps one file per language. Contributors can search one
catalog, fallback and coverage operate on one resource tree, and adding a new
language only requires one new JSON file. Splitting a language into feature
files would add imports, namespace decisions, and cross-file moves without
improving the runtime contract at the current project size.

## Catalog structure

Keys use dots for hierarchy and `snake_case` within each segment:

```json
{
  "common": {
    "actions": {
      "save": "Save"
    }
  },
  "pages": {
    "profiles": {
      "delete_confirmation": "Delete profile \"{{name}}\"?"
    }
  },
  "feedback": {
    "profiles": {
      "saved": "Profile saved"
    }
  },
  "errors": {
    "auth": {
      "login_failed": "Unable to sign in"
    }
  },
  "api": {
    "responses": {
      "connection_successful": "Connection successful."
    }
  }
}
```

Use the main areas consistently:

- `common.*` for reusable actions, labels, states, and accessibility text;
- `components.*`, `pages.*`, `hooks.*`, `lib.*`, and `player.*` for text owned
  by a specific frontend area;
- `feedback.*` for success, warning, informational, and loading notifications;
- `errors.*` for local and remotely reported failures;
- `api.*` for successful or informational API responses.

The first argument of a translation call is mandatory and must normally be a
static semantic key. Never use the English sentence as a key. Prefer
`pages.profiles.delete_confirmation` over `deleteProfileConfirmation`, because
the dot path makes ownership searchable while `snake_case` stays readable in
JSON, TypeScript, and Go.

Every lookup resolves in this order:

1. selected-language value;
2. English value from `en.json`;
3. server-provided English message for a remote response;
4. semantic key or machine error code.

An incomplete locale therefore never removes a control or renders an empty
string.

## Frontend API

Import the short `tr` facade from `@/i18n/translate`:

```ts
import { tr } from "@/i18n/translate";

tr("pages.profiles.delete_confirmation", { name: profile.name });
tr.error("errors.profiles.delete_failed", error, { name: profile.name });
tr.remote(response);
```

`tr(key, values?)` renders ordinary text. `tr.error(key, error, values?)`
requires a local fallback key but preserves structured API data when the error
is an `ApiClientError`. `tr.remote(response)` is reserved for already-structured
API results whose `translation_key` is selected by the server.

Import `toast` from `@/i18n/toast`, never directly from `sonner`. Every level
requires a semantic key as its first argument:

```ts
toast.success("feedback.profiles.saved", { values: { name: profile.name } });
toast.info("feedback.scan.started");
toast.warning("feedback.storage.almost_full");
toast.loading("feedback.library.refreshing");
toast.error("errors.profiles.save_failed", { error, values: { name: profile.name } });
```

String descriptions and action labels in toast options are also treated as
semantic keys. Use `resolvedDescription` only for text that has already passed
through `tr.remote(...)` or for user-provided content. Pass error objects intact
instead of reducing them to `error.message`.

React components that call `tr(...)` use `useUILanguage()` once so a live
language change causes a render. Module-level descriptors expose translated
fields through getters instead of freezing text during module initialization.

## API contract

Errors, successes, warnings, and informational responses use the same additive
translation fields:

```json
{
  "error": "quota_exceeded",
  "translation_key": "errors.requests.quota_exceeded",
  "message": "Request quota exceeded",
  "params": {
    "limit": 5,
    "window_days": 30
  }
}
```

- `error` is the stable machine code used by application logic;
- `translation_key` is the stable presentation contract;
- `message` is the English compatibility and diagnostic fallback;
- `params` contains scalar interpolation values;
- `plugin_id`, when present, selects an isolated external-project catalog.

The server never localizes HTTP responses or logs. The web client selects the
language. Existing static Go responses are connected to catalog keys by the
generated `internal/api/handlers/api_translation_keys_generated.go` bridge;
new handlers should still return a specific machine code, stable key, English
message, and parameters rather than concatenate translated text.

See `docs/architecture/api-error-localization.md` for the detailed resolver and
backend workflow.

## External project contract

No external plugin project is modified by this implementation. Silo only
provides the host-side extension points they can adopt later.

An installed project may package:

- required fallback catalog `locales/en.json`;
- optional `locales/<language>.json` catalogs for supported languages.

The manifest must include these files in its packaged assets and expose them
through its authorized static asset route. Silo loads English plus the selected
language, validates both, and registers them only under
`plugin-<plugin_id>`. An external project cannot replace core translations.

Recommended plugin catalog shape:

```json
{
  "errors": {
    "connection_refused": "Could not connect to the service."
  },
  "responses": {
    "connection_successful": "Connection successful."
  },
  "config": {
    "server": {
      "title": "Server",
      "fields": {
        "url": {
          "label": "Server URL",
          "placeholder": "https://example.test"
        }
      }
    }
  }
}
```

Host code resolves optional plugin presentation text with
`tr.plugin(pluginId, key, englishFallback, values?)`. Structured plugin
responses provide `plugin_id`, a plugin-relative `translation_key`, `message`,
`params`, and an optional machine `error`. If the plugin catalog or key is
missing, Silo keeps the supplied English fallback.

Catalogs reject arrays, unsafe prototype keys, more than 5,000 entries, and
nesting deeper than 12 objects. A rejected or unreachable plugin catalog is
reported only in i18n debug mode and never prevents the host UI from loading.
Plugin-owned full-page applications receive Silo's selected language in their
`lang` query parameter and own rendering inside their page.

## Maintenance gates

After adding, moving, or removing text, run from `web`:

```sh
pnpm run i18n:sync
pnpm run i18n:check
```

`i18n:sync` canonicalizes the JSON catalogs, verifies static Go messages, and
regenerates the backend key bridge. `i18n:check` fails on missing or unused
English keys, translations unknown to English, placeholder drift, invalid key
names, hard-coded visible frontend text, undocumented dynamic calls, or stale
exceptions. `i18n:prune` removes keys unused by the current source tree from
every locale.

Static analysis cannot follow every key selected through a finite map or an
extension value. Declare only those cases in `web/i18n-key-exceptions.json`:

```json
{
  "pattern": "components.connection_status.*",
  "source": "web/src/components/ConnectionStatus.tsx",
  "reason": "Connection states select their label key from a finite map."
}
```

Patterns use an exact key or a trailing wildcard. The source and reason are
mandatory, and an exception that no longer matches an English key fails. This
makes hidden uses explicit without turning the skip list into permanent
garbage collection debt.

CI runs `i18n:sync:check` and `i18n:check`. The repository pre-commit hook runs
the staged checker when relevant frontend or Go API files change, so unrelated
unstaged files cannot hide a missing key.

## Debugging

- `?lang=fr` previews French without changing the stored preference.
- `?lang=keys` renders semantic keys directly in the UI.
- `?i18n_debug=1` reports locale coverage, missing keys, and rejected plugin
  catalogs in the browser console.

Missing English keys warn once and render the key. The document and React root
also keep `translate="no"` and `notranslate`: browser translation extensions
mutate React-owned DOM nodes and can make SPA route changes crash. Native
catalogs are the supported translation mechanism.
