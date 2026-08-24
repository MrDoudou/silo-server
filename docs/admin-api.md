# Admin API

Server-administration endpoints under `/api/v1/admin`. Every route here requires
an authenticated account with the server-wide `admin` role — the same
authorization as `/api/v1/admin/sessions` — and none of them are part of the
client-facing contract that third-party apps build against.

This document is new and covers only the routes listed below. The rest of the
admin surface predates it and is currently documented by the code and by the
design documents under `docs/design/`.

## `GET /api/v1/admin/stream-telemetry/parity`

Returns the merged stream-telemetry view beside the two legacy live-session
projections an admin reads today, plus the diff between them.

It is a diagnostic: it compares and does not cut over. No existing admin read has
been repointed onto telemetry, and nothing here blocks, throttles or ends a
session. Design: [`docs/design/2026-08-17-stream-telemetry.md`](design/2026-08-17-stream-telemetry.md).

The view is served from a bounded-staleness cache with single-flight refresh, so
several admins polling this route pay at most one rebuild per TTL.

Stream telemetry runs by default, so this route reports on an unconfigured
server. An `enabled: false` body means this process was switched off with
`SILO_STREAM_TELEMETRY_ENABLED=false`, or that a bad core setting disabled it —
the startup log names the variable in that case.

### Response

Always `200 OK`. "Nothing to compare" is expressed in the body rather than as an
error status, because an empty report with a success status would read as
agreement.

| Field | Type | Meaning |
|---|---|---|
| `enabled` | bool | Stream telemetry is running in this process. |
| `reason` | string | Present when there is nothing to compare (telemetry disabled, or no view built yet). |
| `view` | object | State of the merged view the comparison was built from. |
| `sources` | array | One report per legacy projection. Empty when `enabled` is false. |

`view`:

| Field | Type | Meaning |
|---|---|---|
| `available` | bool | A merged view exists. |
| `built_at` | RFC3339 string | When it was built. Omitted if never. |
| `age_ms`, `stale` | int, bool | Age of the cached view, and whether it exceeded the TTL. |
| `build_took_ms` | int | Cost of the last rebuild. |
| `refreshes`, `failures`, `last_error` | int, int, string | Cache counters since process start. |
| `complete` | bool | No publisher was stale, degraded or truncated. |
| `incomplete_reasons` | string[] | Why `complete` is false — e.g. `missing_publisher`, `publisher_truncated`, `decode_errors`, `truncated`. |
| `missing_publishers` | string[] | Publisher ids with no usable contribution: stale/unusable roster entries and declared reporting companions that are absent. Each id appears at most once. |
| `clock_skew_suspected` | bool | A publisher stamped a time in the future. A clock running *behind* is indistinguishable from a stalled publisher in one sample; compare `publishers` sequence across two reads to tell them apart. |
| `publishers` | string[] | `<publisher-id>=<state>`, where state is `fresh`, `degraded`, `stale` or `departed`. |
| `session_count`, `transfer_count` | int | Sizes of the merged view. |

Each entry in `sources`:

| Field | Type | Meaning |
|---|---|---|
| `source` | string | `playback_sessions_sync` or `node_sessions`. |
| `available` | bool | The projection could be read. |
| `error` | string | Why it could not. |
| `notes` | string[] | Caveats that apply to this comparison. |
| `report` | object | The diff, when available. |

`report`:

| Field | Type | Meaning |
|---|---|---|
| `telemetry_count`, `legacy_count`, `in_both` | int | Session counts on each side and their intersection. |
| `agrees` | bool | Same session set, and no field both sides express disagrees. Read `fields_absent` before treating this as clearance to cut over. |
| `telemetry_only`, `legacy_only` | string[] | Session ids present on one side only, capped. |
| `telemetry_only_truncated`, `legacy_only_truncated` | int | How many ids the cap dropped. |
| `mismatches` | object[] | Per-session field disagreements, capped. |
| `mismatches_truncated` | int | How many the cap dropped. |
| `fields_absent` | object | Per field, sessions both sides know where one side carries no value. A gap in a projection, not a disagreement. |

A single report samples three independently updated stores, so one-sided
differences are normal and are not on their own evidence of a defect. Repeated
agreement over time is what the legacy-retirement project is gated on.
## `GET /api/v1/admin/sessions/live`

The live session list. Where `GET /admin/sessions` answers "who told us they are
watching?", this answers "who is actually receiving video?".

Additive: `/admin/sessions` is unchanged and keeps its bare-array shape for the
clients already reading it. Feature-detect this one with
`stream_telemetry_live_sessions` on `GET /admin/sessions/capabilities`.

### One view, not two stores

**The merged telemetry view is the source.** Every process publishes into it:
the five measuring route families, and — since the reporting publisher landed —
each API process's playback session manager. So the view already holds every
session anybody knows about, whether or not bytes were measured for it.

This handler walks that view and looks up the display fields Postgres owns
(title, poster, season/episode, position, codecs), which telemetry is not
canonical for and never will be. It is deliberately not the reverse. Reading the
legacy projection and filtering it against telemetry means reconciling two sets
at read time, and that is what produced the ghosts, the route-family coverage
gaps and the paused-session special cases that an earlier revision of this
endpoint had to compensate for.

A session in the view with no Postgres row still appears, carrying the identity
the view knows. That case is delivery nobody has claimed, which is exactly what
should not be dropped.

### Query parameters

| Parameter | Default | Meaning |
|---|---|---|
| `include_idle` | `false` | Keep rows reported as playing that delivered nothing. `no_delivery_count` reports how many there are either way. |

### Reading the envelope

- `telemetry_enabled` false is the ONLY fallback path: telemetry is switched off,
  so the list is the legacy projection and no row carries a `telemetry` block.
- `view_available` false means the view has not been built yet. An empty list
  with this false means "not known yet", never "nothing is streaming".
- `view_complete` false means publishers are missing, so sessions they serve may
  be absent or under-counted; `incomplete_reasons` says which. **While the view is
  incomplete nothing is classified `no_delivery` and nothing is hidden** — the
  publisher holding a session's bytes may be exactly the one that is missing, so
  the classification stops being evidence of anything.
  `missing_reported_publisher` is the reason to expect during a rolling deploy.
- `no_delivery_count` is how many rows were held back, whether or not shown.

### The per-row `telemetry` block

`evidence` is the first field to read, and it is the whole diagnosis:

| `evidence` | Meaning |
|---|---|
| `reported` | A client claims to be watching. Nothing was measured leaving. |
| `measured` | Bytes went out. No session manager claims them. |
| `both` | An ordinary, corroborated viewer. |

`no_delivery` marks the anomalous half of `reported`: a session reported as
**playing**, older than a short grace window, with no measured bytes — the #666 shape, where a dead session keeps
posting progress while nothing leaves the building. A session reported as
**paused** is never flagged, because a paused client stops pulling bytes and
silence is the expected shape (issue #243). Nor is one that has only just
started: a session exists from the moment `/playback/start` returns, before
anything has asked it for a byte, so for the first seconds of every ordinary play
it wears the same shape as a ghost. Both facts are read off one row now rather
than reconciled between stores.

The rest:

- `viewer_bytes` is delivery at the outermost edge. `relay_bytes` is internal
  proxy→node traffic and is never cap-relevant.
- `bytes_degraded` marks a total known to be short because a publisher dropped
  records. Render it as a floor.
- `delivery_rate_kbps` is measured between two consecutive view builds, so it is
  **absent until a session has been seen twice**. Absent means "not yet known"
  and must not render as zero, which reads as a stalled stream.
- `viewer_ips` is every address that pulled bytes. More than one is not
  automatically abuse — carrier NAT and network handoff both produce it.
- `identity_conflict` marks publishers disagreeing about who is watching. It is
  surfaced rather than resolved: that disagreement is an abuse signal.
- `publishers` names everyone who contributed; `viewer_edge_publishers` is
  strictly who served bytes, which is what answers "from which node?".

## The reporting publisher

Each API process publishes its session manager into telemetry as an ordinary
publisher, under its measuring publisher id plus `#reported`.

It reports **claims, never measurements**. `ReportedSession` carries no byte
count and no viewer address by construction: those belong exclusively to the
outermost viewer edge (§2.5), and a session manager only knows what a client told
it. Its snapshots carry no routes either, so it never registers as a viewer edge
in the merge and can never be named as the node a viewer is served from.

One publisher per process. Nothing is elected: a process reports the sessions it
owns. A session that moves between processes is briefly reported by both, and the
merge takes the newest report. Each API process therefore contributes **two**
roster entries, which is why `SILO_STREAM_TELEMETRY_MAX_PUBLISHERS` defaults to
512 rather than 256.

Without Redis both publishers share an in-process `LocalHub` rather than separate
`LocalStore`s — a `LocalStore` holds exactly one snapshot, so two of them would
leave the reported sessions somewhere nothing reads.

**Provenance is positional, not self-asserted.** The merge strips claims a
publisher is not entitled to make before acting on them: a snapshot published
under the `#reported` id loses any routes, bytes and viewer IPs it carries, and a
publisher whose only routes are relays loses any `Reported` state it claims. The
well-formed publishers here never do either — this makes a buggy or compromised
one unable to.

**A declared reporter that is not contributing makes the view incomplete.** A
measuring publisher names its companion in its snapshot, so the merge can tell "no
sessions to report" from "the reporter has not been seen". Without it, an
un-upgraded process during a rolling deploy would publish measuring state only and
the view would call itself complete while every paused and pre-delivery session
that process owns was missing from it.

Two further merge rules follow from this and are worth not relitigating:

- **Identity comes from the viewer edge when there is one.** Only an edge sees who
  actually pulled the bytes, and letting a reporting publisher into the identity
  conflict sets would manufacture disagreements between what a client claimed and
  what was measured.
- **With no edge at all, a reporting publisher may supply identity; a relay still
  may not.** A transcode node publishes a correlation key and nothing else — it
  cannot know who is watching and would otherwise record the proxy in front of it
  as the viewer.
