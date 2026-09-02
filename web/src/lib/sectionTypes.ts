import { tr } from "@/i18n/translate";
export const SECTION_TYPES = [
  {
    value: "recently_added",
    get label() {
      return tr("lib.section_types.recently_added");
    },
  },
  {
    value: "recently_released",
    get label() {
      return tr("lib.section_types.recently_released");
    },
  },
  {
    value: "genre",
    get label() {
      return tr("lib.section_types.genre");
    },
  },
  {
    value: "custom_filter",
    get label() {
      return tr("lib.section_types.custom_filter");
    },
  },
  {
    value: "random",
    get label() {
      return tr("lib.section_types.random");
    },
  },
  {
    value: "continue_watching",
    get label() {
      return tr("lib.section_types.continue_watching");
    },
  },
  {
    value: "recommended_for_you",
    get label() {
      return tr("lib.section_types.recommended_for_you");
    },
  },
  {
    value: "because_you_watched",
    get label() {
      return tr("lib.section_types.because_you_watched");
    },
  },
  {
    value: "similar_users_liked",
    get label() {
      return tr("lib.section_types.profiles_like_you_enjoyed");
    },
  },
  {
    value: "taste_match",
    get label() {
      return tr("lib.section_types.top_picks_today");
    },
  },
  {
    value: "next_up",
    get label() {
      return tr("lib.section_types.on_deck");
    },
  },
  {
    value: "next_in_series",
    get label() {
      return tr("lib.section_types.next_in_series");
    },
  },
  {
    value: "watchlist",
    get label() {
      return tr("lib.section_types.watchlist");
    },
  },
  {
    value: "favorites",
    get label() {
      return tr("lib.section_types.favorites");
    },
  },
  {
    value: "collection",
    get label() {
      return tr("lib.section_types.collection");
    },
  },
];

export const FILTER_SECTION_TYPES = new Set(["genre", "custom_filter"]);

export function sectionTypeLabel(type: string): string {
  return SECTION_TYPES.find((t) => t.value === type)?.label ?? type;
}
