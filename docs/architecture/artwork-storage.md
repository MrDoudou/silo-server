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

## Store identity, topology, and health

The effective backend is `local` or `s3`. `auto` selects only before the first successful materialization. That write records `artwork.store_pin`. Every store carries a fixed-path, constant format marker and a separate random store-copy UUID marker. The fixed marker proves that the location is an artwork store; the random marker binds the database pin to one physical copy. Every later startup must resolve the same backend and reachable, present copy generation. Such a mismatch is fatal because it is a configuration error that would split one catalog across divergent stores.

Runtime health is `healthy`, `degraded`, `unavailable`, `empty_rebuilding`, or `wrong_mount`. Event-path failures feed debounced probes; healthy probes run every 30 seconds and outages back off from 5 seconds to 5 minutes after two matching verdicts. An unreachable or unwritable store starts degraded instead of crash-looping. Destructive GC pauses while unavailable or on a wrong mount, and transport errors never become deletion evidence. An owned local root that vanishes is recreated with a new generation and bulk recovery. A shared root with missing sentinels is `wrong_mount`; Silo refuses writes before it can create or contaminate the uncovered mountpoint. Reachable S3 is called empty only after marker and logical-object checks prove authoritative emptiness.

Local mode covers one API node or multiple nodes with an identically mounted shared POSIX root. S3 is the shared object-store topology. Logical trees can be copied byte-for-byte between physical roots and backends. Switching the configured backend is permitted only after the destination has been copied and verified; deleting the source store is a separate operator action.

## URL capabilities and resilient delivery

The default URL is target-bound rather than key-bound. Its canonical signed payload includes the stable sweep-surface name and primary keys, image slot, expected revision when known, variant, route version, and quantized expiry. The handler reloads the target, tries its current stored revision, classifies an authoritative miss separately from a transport outage, and durably queues one repair signal. It may serve a validated provider/plugin source or confined sidecar for at most two seconds, coalescing equal source work through singleflight and retaining at most 256 entries or 64 MiB in a disposable memory cache. Otherwise it serves a compiled no-store image placeholder. Protected sources remain selected and create a persistent data-loss alert.

`artwork.delivery_policy=direct` retains backend/provider direct delivery. For local storage, `artwork.url_auth=signed` uses expiring raw portable paths beneath `/api/v1/artwork/` (the constant `artwork/v1/objects/` prefix is omitted); `public` permits the same paths as permanent immutable URLs. The first path segment is always a fixed image-type token; legacy keys are not exposed by this route, and a future format may reserve a leading `v2` segment without colliding with an image type. Direct-library sidecars are never public or direct. Route signing contexts are distinct so one capability cannot authorize another. Signatures are runtime data and are never stored in the catalog or portable tree. Catalog direct-library references are unsigned opaque identity documents; the public URL carrying one is signed when minted and every request revalidates the current catalog source and library-root confinement.

## Lifecycle, purge, and seeds

`artwork_revision_gc_candidates` is both lifecycle registry and byte inventory. Catalog displacement queues exact revision objects after a grace period. Garbage collection locks a row and rechecks every reference surface immediately before deleting. Inventory refresh never disarms pending garbage collection. It may register newly discovered inventory rows and park imported seeds once a visible catalog reference proves them live.

Authoritative delivery misses add missing and repair state to the same inventory. Accounting reports missing and repair-pending bytes and missing, repairing, and protected-loss revision counts alongside live store health. An authoritatively empty store walks recoverable catalog selections into the ordinary durable image-cache queue in recency order. Request misses use the same unique target key and become due immediately. Successful reconstruction publishes through the normal track-then-conditional-update path; the old revision is displaced into reference-aware GC only after that commit.

Safe purge first plans exclusive, shared, reconstructible, and protected revisions from a consistent snapshot. It transitions only exclusive in-scope catalog references to verified provider/plugin sources or confined direct-library sidecars in small idempotent transactions. Object deletion cannot begin until those catalog commits complete. Shared revisions and uploads or other sources without verified fallbacks remain stored.

A portable import walks the existing store through the same inventory machinery. Only complete, digest-valid manifests are registered. Otherwise-unreferenced revisions enter source class `seed` until `artwork.seed_adoption_grace` expires; a catalog reference converts a seed to an ordinary revision. On installations whose user artwork references are outside PostgreSQL, avatar and collection-artwork seeds are retained unarmed and reported as unverifiable rather than reclaimed. Unused expired seeds enter the normal reference-aware reclamation flow.
