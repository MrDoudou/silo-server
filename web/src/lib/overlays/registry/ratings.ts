import type { OverlayDef } from "../types";

import { tr } from "@/i18n/translate";

function formatRating(
  value: number | null | undefined,
  max: number,
  suffix?: string,
): string | null {
  if (value == null) return null;
  if (max === 100) return `${value}%${suffix ? ` ${suffix}` : ""}`;
  return `${value.toFixed(1)}${suffix ? ` ${suffix}` : ""}`;
}

export const RATINGS_OVERLAYS: readonly OverlayDef[] = [
  {
    id: "rating_imdb",
    category: "ratings",
    get label() {
      return tr("lib.overlays.registry.ratings.imdb_rating");
    },
    get description() {
      return tr("lib.overlays.registry.ratings.imdb_score_out_of_10");
    },
    defaultPosition: "top-right",
    defaultEnabled: false,
    iconId: "star",
    defaultAccent: "#f5c518",
    iconCapable: true,
    getValue: (d) => formatRating(d.rating_imdb, 10),
  },
  {
    id: "rating_tmdb",
    category: "ratings",
    get label() {
      return tr("lib.overlays.registry.ratings.tmdb_rating");
    },
    get description() {
      return tr("lib.overlays.registry.ratings.tmdb_score_out_of_10");
    },
    defaultPosition: "top-right",
    defaultEnabled: false,
    iconId: "star",
    defaultAccent: "#01b4e4",
    iconCapable: true,
    getValue: (d) => formatRating(d.rating_tmdb, 10),
  },
  {
    id: "rating_rt",
    category: "ratings",
    get label() {
      return tr("lib.overlays.registry.ratings.rt_critics");
    },
    get description() {
      return tr("lib.overlays.registry.ratings.rotten_tomatoes_critic_score");
    },
    defaultPosition: "top-right",
    defaultEnabled: false,
    iconId: "tomato",
    defaultAccent: "#fa320a",
    iconCapable: true,
    getValue: (d) => formatRating(d.rating_rt_critic, 100),
  },
  {
    id: "rating_rt_audience",
    category: "ratings",
    get label() {
      return tr("lib.overlays.registry.ratings.rt_audience");
    },
    get description() {
      return tr("lib.overlays.registry.ratings.rotten_tomatoes_audience_score");
    },
    defaultPosition: "top-right",
    defaultEnabled: false,
    iconId: "tomato",
    defaultAccent: "#fa6400",
    iconCapable: true,
    getValue: (d) => formatRating(d.rating_rt_audience, 100),
  },
  {
    id: "content_rating",
    category: "ratings",
    get label() {
      return tr("lib.overlays.registry.ratings.age_rating");
    },
    get description() {
      return tr("lib.overlays.registry.ratings.content_rating_pg_13_tv_ma_r_etc");
    },
    defaultPosition: "bottom-right",
    defaultEnabled: false,
    iconId: "shield",
    iconCapable: true,
    getValue: (d) => d.content_rating ?? null,
  },
];
