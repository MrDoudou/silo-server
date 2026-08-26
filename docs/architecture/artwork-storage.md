# Artwork storage contracts

Artwork is addressed by logical keys. A key is a slash-separated, scheme-free relative path; it never contains a bucket, endpoint, configured key prefix, filesystem root, server identity, credential, or signing secret. Storage adapters apply their physical root privately. Legacy keys remain readable, while new materializations use `artwork/v1`.

## Portable revisions

Portable objects live at:

```text
artwork/v1/objects/{image-type}/{revision[0:2]}/{revision}/manifest.json
artwork/v1/objects/{image-type}/{revision[0:2]}/{revision}/{variant}.{ext}
```

`revision` is the lowercase SHA-256 of the frozen recipe version, normalized image and media types, and every variant name, byte length, and encoded byte sequence in lexical order. Any output-affecting recipe change requires a new recipe version. Stored objects are immutable: an existing key is accepted only when its bytes match.

`manifest.json` is written last. Its canonical JSON contains only the format and recipe versions, image type, media type, revision, and each variant's name, relative filename, exact size, and SHA-256 digest. A directory without a manifest is incomplete. Import and adoption re-derive the revision and validate every listed object before publishing it.

## Source adoption

An optional, non-authoritative hint lives at:

```text
artwork/v1/index/{fingerprint[0:2]}/{fingerprint}/{image-type}/{recipe-version}.json
```

The fingerprint is domain-separated by source class. Plugin/provider artwork uses the stable plugin-scheme reference before URL resolution. Sidecar, embedded, and uploaded artwork use a digest of the source bytes. Deterministic generated artwork uses the generator version plus its ordered stable input-object revisions; if either is unavailable, it has no adoption entry. Resolved HTTP URLs and credential-bearing locations are never persisted as identities. The canonical index document contains only its fingerprint, image type, recipe version, target revision, and target-manifest digest.

Materialization validates the hint, manifest, and all object digests, registers the revision through the ordinary lifecycle tracker, and only then lets the catalog owner publish the existing original key. Invalid hints fall through to normal fetch and encoding.

## Store identity and topology

The effective backend is `local` or `s3`. `auto` selects only before the first successful materialization. That write records `artwork.store_pin`; local stores also carry a generated marker. Every later startup must resolve the same backend and local marker generation. A mismatch is fatal because silently falling back would split one catalog across divergent stores.

Local mode covers one API node or multiple nodes with an identically mounted shared POSIX root. S3 is the shared object-store topology. Logical trees can be copied byte-for-byte between physical roots and backends. Switching the configured backend is permitted only after the destination has been copied and verified; deleting the source store is a separate operator action.

## URL capabilities

Stored-object and direct-library URLs are short-lived capabilities. The signed input includes a context string, the opaque identity, and quantized expiry. Contexts are distinct so one route's signature cannot authorize another. Signatures are runtime data and are never stored in the catalog or portable tree. Catalog direct-library references are unsigned opaque identity documents; the public URL carrying one is signed when minted and every request revalidates the current catalog source and library-root confinement.

## Lifecycle, purge, and seeds

`artwork_revision_gc_candidates` is both lifecycle registry and byte inventory. Catalog displacement queues exact revision objects after a grace period. Garbage collection locks a row and rechecks every reference surface immediately before deleting. Inventory refresh never disarms pending garbage collection. It may register newly discovered inventory rows and park imported seeds once a visible catalog reference proves them live.

Safe purge first plans exclusive, shared, reconstructible, and protected revisions from a consistent snapshot. It transitions only exclusive in-scope catalog references to verified provider/plugin sources or confined direct-library sidecars in small idempotent transactions. Object deletion cannot begin until those catalog commits complete. Shared revisions and uploads or other sources without verified fallbacks remain stored.

A portable import walks the existing store through the same inventory machinery. Only complete, digest-valid manifests are registered. Otherwise-unreferenced revisions enter source class `seed` until `artwork.seed_adoption_grace` expires; a catalog reference converts a seed to an ordinary revision. On installations whose user artwork references are outside PostgreSQL, avatar and collection-artwork seeds are retained unarmed and reported as unverifiable rather than reclaimed. Unused expired seeds enter the normal reference-aware reclamation flow.
