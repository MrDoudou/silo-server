# Artwork API

Native clients should treat artwork URLs returned by catalog responses as opaque capabilities. Do not construct a storage key, bucket URL, or direct-library identity.

## Capability

`GET /api/v1/artwork/capability` is authenticated like the surrounding native API and reports:

- the effective `storage_backend` and portable `storage_format`;
- whether storage is portable;
- `delivery_modes` (`api` or `direct`), the effective `delivery_policy`, live
  `store_health`, and whether `automatic_recovery` is active;
- selected provider-art materialization and local-source policies;
- storage-management support for accounting, safe purge, and direct-library fallback;
- portability support for copied trees, source-adoption indexes, and verified seed import;
- the variant names supported for each image type.

Clients should capability-detect these fields rather than infer behavior from a URL shape.
The companion `GET /api/v1/images/capability` endpoint maps the client-facing
`image_size=small|medium|large|original` values onto these same live variants.

## Resilient delivery

`GET|HEAD /api/v1/artwork/{signed-capability}/{variant}` is the default URL for
local, S3, and not-yet-materialized artwork. The opaque capability binds a
stable catalog target (surface name and primary keys), image slot, expected
logical revision when known, route version, requested variant, and quantized
expiry. The handler reloads the target on every request, so a still-valid URL
follows a newer conditional catalog publication instead of selecting displaced
bytes.

Delivery tries the current stored revision first. An authoritative object miss
is durably deduplicated into the repair queue; transport errors mark the backend
unavailable and never prove deletion. While repair runs, Silo may serve a
validated provider/plugin source or a confined sidecar from a bounded
process-local emergency cache. Those bytes use a source-derived `ETag` and a
short private lifetime. If no verified source can be served within the bounded
request budget, Silo returns a compiled image placeholder with `200` and
`Cache-Control: no-store`. It never returns an HTML or JSON error body to a
valid image capability.

Stored responses support `ETag`, `If-None-Match`, `Range`, and private caching
bounded by the signed expiry. An invalid or malformed capability is a
non-enumerable `404`; an expired valid capability returns `401` so the client
can refresh its catalog response.

The requested `image_size` is mapped to the capability's variant when the URL
is minted. Portable revisions created before the current ladder may lack the
new `w780` poster/still or `w1280` logo object. The delivery handler reads that
revision's manifest and serves its nearest smaller listed rung instead. This is
compatibility selection, not object loss: it does not mark inventory missing,
enqueue repair, or return a placeholder. Legacy revisions without manifests use
bounded object-existence checks for the same walk-down behavior.

## Direct policy

`artwork.delivery_policy=direct` opts out of automatic request-time recovery.
S3 uses its configured presigned, public, or tokenized object URLs and remote
sources retain passthrough behavior. Local storage uses raw portable-key URLs at
`/api/v1/artwork/{image-type}/{shard}/{revision}/{variant.ext}`; the constant
`artwork/v1/objects/` storage prefix is omitted. With
`artwork.url_auth=signed`, the raw key has a quantized expiry and signature. With `public`, the URL is permanent,
unsigned, and served with `public, max-age=31536000, immutable`. Any percent
escape in this route is rejected before decoding; the logical-key grammar is
the path gate. Unsigned requests return `404` unless public mode is active,
while previously minted signed URLs remain valid across mode changes.
The direct URL is minted for the `image_size` variant selected by the portable
manifest (or by the bounded legacy walk-down), so it never points at a
newly-added rung an older revision does not contain.

After safe purge transitions an accessible sidecar out of canonical storage, catalog responses may instead contain a signed direct-library artwork URL. It has the same opaque-client contract and conditional/range support. Silo revalidates the current catalog reference, owning library root, confinement, file type, and size on every cache miss. Clients must never persist or interpret its embedded identity.
