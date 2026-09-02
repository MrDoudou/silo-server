import type { GuidedFormState } from "@/components/collections/CollectionGuidedRulesEditor";
import { formatLanguage } from "@/lib/languageDisplay";

import { tr } from "@/i18n/translate";

export interface ActiveFilterBadge {
  key: string;
  label: string;
  clearPatch: Partial<GuidedFormState>;
}

/**
 * Compute displayable badge descriptors for all active "secondary" filters.
 * Skips mediaScope, sortField, sortOrder (shown inline in the bar).
 */
export function getActiveFilterBadges(
  state: GuidedFormState,
  options: { isAudiobookLibrary?: boolean } = {},
): ActiveFilterBadge[] {
  const badges: ActiveFilterBadge[] = [];

  // Genres — one badge per selected genre
  for (const genre of state.genres) {
    badges.push({
      key: `genre:${genre}`,
      get label() {
        return tr("components.catalog.catalog_filter_badges.genre_value1", { value1: genre });
      },
      clearPatch: { genres: state.genres.filter((g) => g !== genre) },
    });
  }

  // Year range — combine into a single badge
  if (state.yearFrom && state.yearTo) {
    badges.push({
      key: "year",
      get label() {
        return tr("components.catalog.catalog_filter_badges.year_value1_value2", {
          value1: state.yearFrom,
          value2: state.yearTo,
        });
      },
      clearPatch: { yearFrom: "", yearTo: "" },
    });
  } else if (state.yearFrom) {
    badges.push({
      key: "year",
      get label() {
        return tr("components.catalog.catalog_filter_badges.year_value1", {
          value1: state.yearFrom,
        });
      },
      clearPatch: { yearFrom: "" },
    });
  } else if (state.yearTo) {
    badges.push({
      key: "year",
      get label() {
        return tr("components.catalog.catalog_filter_badges.year_value1_0451aa6a", {
          value1: state.yearTo,
        });
      },
      clearPatch: { yearTo: "" },
    });
  }

  // Minimum IMDb rating
  if (state.minRating) {
    badges.push({
      key: "minRating",
      get label() {
        return tr("components.catalog.catalog_filter_badges.imdb_value1", {
          value1: state.minRating,
        });
      },
      clearPatch: { minRating: "" },
    });
  }

  // Content rating
  if (state.contentRating) {
    badges.push({
      key: "contentRating",
      get label() {
        return tr("components.catalog.catalog_filter_badges.rated_value1", {
          value1: state.contentRating,
        });
      },
      clearPatch: { contentRating: "" },
    });
  }

  for (const lang of state.originalLanguages) {
    badges.push({
      key: `originalLanguage:${lang}`,
      get label() {
        return tr("components.catalog.catalog_filter_badges.language_value1", {
          value1: formatLanguage(lang),
        });
      },
      clearPatch: {
        originalLanguages: state.originalLanguages.filter((l) => l !== lang),
      },
    });
  }

  if (state.actor) {
    badges.push({
      key: "actor",
      get label() {
        return tr("components.catalog.catalog_filter_badges.actor_value1", { value1: state.actor });
      },
      clearPatch: { actor: "" },
    });
  }

  if (state.director) {
    badges.push({
      key: "director",
      get label() {
        return tr("components.catalog.catalog_filter_badges.director_value1", {
          value1: state.director,
        });
      },
      clearPatch: { director: "" },
    });
  }

  if (state.writer) {
    badges.push({
      key: "writer",
      get label() {
        return tr("components.catalog.catalog_filter_badges.writer_value1", {
          value1: state.writer,
        });
      },
      clearPatch: { writer: "" },
    });
  }

  if (state.producer) {
    badges.push({
      key: "producer",
      get label() {
        return tr("components.catalog.catalog_filter_badges.producer_value1", {
          value1: state.producer,
        });
      },
      clearPatch: { producer: "" },
    });
  }

  if (state.author) {
    badges.push({
      key: "author",
      get label() {
        return tr("components.catalog.catalog_filter_badges.author_value1", {
          value1: state.author,
        });
      },
      clearPatch: { author: "" },
    });
  }

  if (state.narrator && state.mediaScope === "audiobook") {
    badges.push({
      key: "narrator",
      get label() {
        return tr("components.catalog.catalog_filter_badges.narrator_value1", {
          value1: state.narrator,
        });
      },
      clearPatch: { narrator: "" },
    });
  }

  if (state.series) {
    badges.push({
      key: "series",
      get label() {
        return tr("components.catalog.catalog_filter_badges.series_value1", {
          value1: state.series,
        });
      },
      clearPatch: { series: "" },
    });
  }

  // Studio
  if (state.studio) {
    badges.push({
      key: "studio",
      get label() {
        return tr("components.catalog.catalog_filter_badges.studio_value1", {
          value1: state.studio,
        });
      },
      clearPatch: { studio: "" },
    });
  }

  // Network
  if (state.network) {
    badges.push({
      key: "network",
      get label() {
        return tr("components.catalog.catalog_filter_badges.network_value1", {
          value1: state.network,
        });
      },
      clearPatch: { network: "" },
    });
  }

  // Country
  if (state.country) {
    badges.push({
      key: "country",
      get label() {
        return tr("components.catalog.catalog_filter_badges.country_value1", {
          value1: state.country,
        });
      },
      clearPatch: { country: "" },
    });
  }

  // Status
  if (state.status) {
    badges.push({
      key: "status",
      get label() {
        return tr("components.catalog.catalog_filter_badges.match_value1", {
          value1: state.status,
        });
      },
      clearPatch: { status: "" },
    });
  }

  if (state.watchStatus) {
    const statusVerb = options.isAudiobookLibrary
      ? "Listening"
      : state.mediaScope === "ebook"
        ? "Read"
        : "Watch";
    const statusLabel = options.isAudiobookLibrary
      ? state.watchStatus === "watched"
        ? "listened"
        : state.watchStatus === "unwatched"
          ? "unlistened"
          : state.watchStatus.replace("_", " ")
      : state.watchStatus.replace("_", " ");
    badges.push({
      key: "watchStatus",
      label: `${statusVerb}: ${statusLabel}`,
      clearPatch: { watchStatus: "" },
    });
  }

  // Added in the last
  if (state.addedInLast) {
    badges.push({
      key: "addedInLast",
      get label() {
        return tr("components.catalog.catalog_filter_badges.added_in_last_value1", {
          value1: state.addedInLast,
        });
      },
      clearPatch: { addedInLast: "" },
    });
  }

  // Released in the last
  if (state.releasedInLast) {
    badges.push({
      key: "releasedInLast",
      get label() {
        return tr("components.catalog.catalog_filter_badges.released_in_last_value1", {
          value1: state.releasedInLast,
        });
      },
      clearPatch: { releasedInLast: "" },
    });
  }

  if (state.fourK) {
    badges.push({
      key: "fourK",
      label: tr("components.catalog.catalog_filter_badges.value_4_k"),
      clearPatch: { fourK: false },
    });
  }

  if (state.hdr) {
    badges.push({
      key: "hdr",
      label: tr("components.catalog.catalog_filter_badges.hdr"),
      clearPatch: { hdr: false },
    });
  }

  if (state.dolbyVision) {
    badges.push({
      key: "dolbyVision",
      label: tr("components.catalog.catalog_filter_badges.dovi"),
      clearPatch: { dolbyVision: false },
    });
  }

  return badges;
}

/** Count how many secondary filters are active (for the badge count on the Filters button). */
export function countActiveFilters(state: GuidedFormState): number {
  return getActiveFilterBadges(state).length;
}
