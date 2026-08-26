# Artwork API

Native clients should treat artwork URLs returned by catalog responses as opaque capabilities. Do not construct a storage key, bucket URL, or direct-library identity.

## Capability

`GET /api/v1/artwork/capability` is authenticated like the surrounding native API and reports:

- the effective `storage_backend` and portable `storage_format`;
- whether storage is portable;
- `delivery_modes` (`api` or `direct`);
- selected provider-art materialization and local-source policies;
- storage-management support for accounting, safe purge, and direct-library fallback;
- portability support for copied trees, source-adoption indexes, and verified seed import;
- the variant names supported for each image type.

Clients should capability-detect these fields rather than infer behavior from a URL shape.

## Signed delivery

`GET|HEAD /api/v1/artwork/{opaque-key}` serves an immutable stored object when the URL signature and expiry are valid. The opaque path component is base64url data supplied by Silo. The response supports `ETag`, `If-None-Match`, `Range`, and private caching bounded by the signed expiry. An invalid signature, malformed identity, unknown object, or store read failure is a non-enumerable `404`; an expired valid URL returns `401` so the client can refresh its catalog response.

After safe purge transitions an accessible sidecar out of canonical storage, catalog responses may instead contain a signed direct-library artwork URL. It has the same opaque-client contract and conditional/range support. Silo revalidates the current catalog reference, owning library root, confinement, file type, and size on every cache miss. Clients must never persist or interpret its embedded identity.
