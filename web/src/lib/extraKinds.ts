import { tr } from "@/i18n/translate";

/**
 * Shared kind vocabulary for remote provider videos (ItemVideo) and local
 * extras files (ItemExtra). Keep in sync with the server's kind list.
 */
export const EXTRA_KINDS = [
  "trailer",
  "teaser",
  "featurette",
  "clip",
  "behind_the_scenes",
  "bloopers",
  "deleted_scene",
  "other",
] as const;

export type ExtraKind = (typeof EXTRA_KINDS)[number];

/** Singular label, used for individual video/extra cards. */
const EXTRA_KIND_LABELS: Record<string, string> = {
  trailer: "lib.extra_kinds.trailer",
  teaser: "lib.extra_kinds.teaser",
  featurette: "lib.extra_kinds.featurette",
  clip: "lib.extra_kinds.clip",
  behind_the_scenes: "lib.extra_kinds.behind_the_scenes",
  bloopers: "lib.extra_kinds.bloopers",
  deleted_scene: "lib.extra_kinds.deleted_scene",
  other: "lib.extra_kinds.extra",
};

/** Plural group label, used for section headings when grouping by kind. */
const EXTRA_KIND_GROUP_LABELS: Record<string, string> = {
  trailer: "lib.extra_kinds.trailers",
  teaser: "lib.extra_kinds.teasers",
  featurette: "lib.extra_kinds.featurettes",
  clip: "lib.extra_kinds.clips",
  behind_the_scenes: "lib.extra_kinds.behind_the_scenes",
  bloopers: "lib.extra_kinds.bloopers",
  deleted_scene: "lib.extra_kinds.deleted_scenes",
  other: "lib.extra_kinds.other",
};

/**
 * Kinds providers can return, offered in the library allow-list picker.
 * "deleted_scene" is local-only — providers never emit it — so it is omitted.
 */
export const PROVIDER_TRAILER_KINDS: ExtraKind[] = EXTRA_KINDS.filter(
  (kind) => kind !== "deleted_scene",
);

export function extraKindLabel(kind: string): string {
  return tr(EXTRA_KIND_LABELS[kind] ?? "lib.extra_kinds.extra");
}

export function extraKindGroupLabel(kind: string): string {
  return tr(EXTRA_KIND_GROUP_LABELS[kind] ?? "lib.extra_kinds.other");
}
