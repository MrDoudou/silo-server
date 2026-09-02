# Web translations

English is Silo's source language. The core uses one nested JSON catalog per
language:

- `locales/en.json` is complete and authoritative;
- `locales/fr.json` may be partial and falls back to English;
- future languages add one `locales/<language>.json` file with the same key
  hierarchy.

Keys use dot hierarchy and `snake_case` segments, for example
`pages.profiles.delete_confirmation`. Every visible translation call requires a
semantic key as its first argument; English sentences are values, never keys.

## Usage

```ts
import { tr } from "@/i18n/translate";
import { toast } from "@/i18n/toast";

tr("pages.profiles.delete_confirmation", { name: profile.name });
tr.error("errors.profiles.delete_failed", error, { name: profile.name });
tr.remote(response);

toast.success("feedback.profiles.saved", { values: { name: profile.name } });
toast.info("feedback.scan.started");
toast.warning("feedback.storage.almost_full");
toast.loading("feedback.library.refreshing");
toast.error("errors.profiles.save_failed", { error });
```

Toast `description` and action-label strings are semantic keys. Use
`resolvedDescription` for a value already resolved by `tr.remote(...)` or for
user-provided content; this prevents the wrapper from interpreting that value
as another key.

Use `tr.remote(...)` only when an API response already owns a structured
`translation_key`. Host-owned plugin presentation text uses
`tr.plugin(pluginId, key, englishFallback, values?)`.

Remote messages resolve from the selected language to English, then the
server's English `message`, then the semantic key or machine code. Missing
locale entries never hide UI.

## Integrity commands

Run after adding, moving, or deleting text:

```sh
pnpm run i18n:sync
pnpm run i18n:check
```

- `i18n:sync` sorts JSON catalogs, verifies static Go messages, and regenerates
  the Go API key bridge.
- `i18n:sync:check` verifies generated state without modifying files.
- `i18n:check` detects missing and unused English keys, unknown locale keys,
  placeholder drift, invalid names, hard-coded visible text, and undocumented
  dynamic calls.
- `i18n:check:staged` performs the same analysis against the Git index for the
  pre-commit hook.
- `i18n:prune` removes keys unused by the source tree from all locale files.

Static analysis cannot see keys selected through a finite map. Add an exact key
or trailing wildcard to `web/i18n-key-exceptions.json`, with the owning source
and a precise reason:

```json
{
  "pattern": "components.connection_status.*",
  "source": "web/src/components/ConnectionStatus.tsx",
  "reason": "Connection states select their label key from a finite map."
}
```

Stale exceptions fail the checker, so this mechanism cannot silently retain
obsolete keys. CI runs both generated-state and key-integrity checks.

## Debugging

- `?lang=fr` previews French without changing the stored preference.
- `?lang=keys` renders semantic keys.
- `?i18n_debug=1` logs coverage, missing keys, and rejected plugin catalogs.

`web/index.html` marks the document and React root with `translate="no"` and
`notranslate`. Automatic translation extensions mutate React-owned text nodes
and can crash SPA navigation; keep the guard and add languages through the
native catalogs.

The full architecture and API contract live in
`docs/architecture/localization.md` and
`docs/architecture/api-error-localization.md`.
