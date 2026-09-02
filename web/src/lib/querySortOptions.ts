import { tr } from "@/i18n/translate";
export type QuerySortOrder = "asc" | "desc";
export type QuerySortRelevanceScope =
  | "movie"
  | "series"
  | "episode"
  | "audiobook"
  | "ebook"
  | "manga"
  | "all";
export type QuerySortField =
  | "title"
  | "added_at"
  | "release_date"
  | "last_air_date"
  | "latest_episode_added"
  | "year"
  | "content_rating"
  | "runtime"
  | "rating_imdb"
  | "rating_tmdb"
  | "rating_rt_critic"
  | "rating_rt_audience"
  | "resolution"
  | "bitrate"
  | "progress"
  | "date_viewed"
  | "plays"
  | "author"
  | "narrator"
  | "series";

type ApplicableMediaScope = Exclude<QuerySortRelevanceScope, "all">;

export interface QuerySortOption {
  value: QuerySortField;
  label: string;
  defaultOrder: QuerySortOrder;
  personalized: boolean;
  applicableMediaScopes: ApplicableMediaScope[];
  /**
   * When set, the wizard's scope selector switches to this scope
   * if the user picks this sort in a different scope. Used for sorts
   * whose semantics imply a particular media type (e.g. Latest Episode
   * Air Date is most meaningful when results are episodes).
   */
  preferredMediaScope?: ApplicableMediaScope;
}

export interface QuerySortOptionsConfig {
  includePersonalized?: boolean;
  relevanceScope?: QuerySortRelevanceScope;
}

type QuerySortOptionsInput = boolean | QuerySortOptionsConfig;

interface QuerySortLike {
  field?: string | null;
  order?: string | null;
}

// ALL_VIDEO_SCOPES is the universe of video-side scopes — used as the
// baseline for the "all" relevance scope (mixed libraries / episode
// browse mode) so that sorts limited to series+episode are still
// filtered out as not universally applicable. Book scopes are explicit
// opt-in: a sort field must list "audiobook" or "ebook" in its
// applicableMediaScopes to be eligible for book-only libraries.
const ALL_VIDEO_SCOPES: ApplicableMediaScope[] = ["movie", "series", "episode"];
const ALL_MEDIA_SCOPES: ApplicableMediaScope[] = [...ALL_VIDEO_SCOPES, "audiobook", "ebook"];
// Manga series rows are file-less containers: technical sorts (Duration,
// Bitrate) are meaningless there, so manga is opt-in per sort field instead
// of being part of ALL_MEDIA_SCOPES.

export const QUERY_SORT_OPTIONS: QuerySortOption[] = [
  {
    value: "title",
    get label() {
      return tr("lib.query_sort_options.title");
    },
    defaultOrder: "asc",
    personalized: false,
    applicableMediaScopes: [...ALL_MEDIA_SCOPES, "manga"],
  },
  {
    value: "added_at",
    get label() {
      return tr("lib.query_sort_options.date_added");
    },
    defaultOrder: "desc",
    personalized: false,
    applicableMediaScopes: [...ALL_MEDIA_SCOPES, "manga"],
  },
  {
    value: "release_date",
    get label() {
      return tr("lib.query_sort_options.release_date");
    },
    defaultOrder: "desc",
    personalized: false,
    applicableMediaScopes: [...ALL_MEDIA_SCOPES, "manga"],
  },
  {
    value: "last_air_date",
    get label() {
      return tr("lib.query_sort_options.latest_episode_air_date");
    },
    defaultOrder: "desc",
    personalized: false,
    applicableMediaScopes: ["series", "episode"],
    preferredMediaScope: "episode",
  },
  {
    value: "latest_episode_added",
    get label() {
      return tr("lib.query_sort_options.latest_episode_added");
    },
    defaultOrder: "desc",
    personalized: false,
    applicableMediaScopes: ["series"],
  },
  {
    value: "year",
    get label() {
      return tr("lib.query_sort_options.year");
    },
    defaultOrder: "desc",
    personalized: false,
    applicableMediaScopes: [...ALL_MEDIA_SCOPES, "manga"],
  },
  {
    value: "content_rating",
    get label() {
      return tr("lib.query_sort_options.content_rating");
    },
    defaultOrder: "asc",
    personalized: false,
    applicableMediaScopes: ALL_VIDEO_SCOPES,
  },
  {
    value: "runtime",
    get label() {
      return tr("lib.query_sort_options.duration");
    },
    defaultOrder: "desc",
    personalized: false,
    applicableMediaScopes: ALL_MEDIA_SCOPES,
  },
  {
    value: "rating_imdb",
    get label() {
      return tr("lib.query_sort_options.imdb_rating");
    },
    defaultOrder: "desc",
    personalized: false,
    applicableMediaScopes: ALL_VIDEO_SCOPES,
  },
  {
    value: "rating_tmdb",
    get label() {
      return tr("lib.query_sort_options.tmdb_rating");
    },
    defaultOrder: "desc",
    personalized: false,
    applicableMediaScopes: ALL_VIDEO_SCOPES,
  },
  {
    value: "rating_rt_critic",
    get label() {
      return tr("lib.query_sort_options.rt_critic_rating");
    },
    defaultOrder: "desc",
    personalized: false,
    applicableMediaScopes: ALL_VIDEO_SCOPES,
  },
  {
    value: "rating_rt_audience",
    get label() {
      return tr("lib.query_sort_options.rt_audience_rating");
    },
    defaultOrder: "desc",
    personalized: false,
    applicableMediaScopes: ALL_VIDEO_SCOPES,
  },
  {
    value: "resolution",
    get label() {
      return tr("lib.query_sort_options.resolution");
    },
    defaultOrder: "desc",
    personalized: false,
    applicableMediaScopes: ALL_VIDEO_SCOPES,
  },
  {
    value: "bitrate",
    get label() {
      return tr("lib.query_sort_options.bitrate");
    },
    defaultOrder: "desc",
    personalized: false,
    applicableMediaScopes: ALL_MEDIA_SCOPES,
  },
  {
    value: "progress",
    get label() {
      return tr("lib.query_sort_options.progress");
    },
    defaultOrder: "desc",
    personalized: true,
    applicableMediaScopes: [...ALL_MEDIA_SCOPES, "manga"],
  },
  {
    value: "date_viewed",
    get label() {
      return tr("lib.query_sort_options.date_viewed");
    },
    defaultOrder: "desc",
    personalized: true,
    applicableMediaScopes: [...ALL_MEDIA_SCOPES, "manga"],
  },
  {
    value: "plays",
    get label() {
      return tr("lib.query_sort_options.plays");
    },
    defaultOrder: "desc",
    personalized: true,
    applicableMediaScopes: [...ALL_MEDIA_SCOPES, "manga"],
  },
  // Book-native sorts. Author is shared by audiobooks and ebooks; narrator
  // remains audiobook-only. Series is shared by the audiobook_series and
  // ebook_series joins on the backend.
  {
    value: "author",
    get label() {
      return tr("lib.query_sort_options.author");
    },
    defaultOrder: "asc",
    personalized: false,
    applicableMediaScopes: ["audiobook", "ebook", "manga"],
  },
  {
    value: "narrator",
    get label() {
      return tr("lib.query_sort_options.narrator");
    },
    defaultOrder: "asc",
    personalized: false,
    applicableMediaScopes: ["audiobook"],
  },
  {
    value: "series",
    get label() {
      return tr("lib.query_sort_options.series");
    },
    defaultOrder: "asc",
    personalized: false,
    applicableMediaScopes: ["audiobook", "ebook"],
  },
];

const QUERY_SORT_OPTION_MAP = new Map(QUERY_SORT_OPTIONS.map((option) => [option.value, option]));

const EBOOK_SORT_LABELS: Partial<Record<QuerySortField, string>> = {
  date_viewed: "lib.query_sort_options.date_read",
  plays: "lib.query_sort_options.reads",
};

function normalizeQuerySortOptionsConfig(
  input: QuerySortOptionsInput = false,
): QuerySortOptionsConfig {
  if (typeof input === "boolean") {
    return { includePersonalized: input };
  }
  return input;
}

function optionMatchesRelevanceScope(
  option: QuerySortOption,
  relevanceScope?: QuerySortRelevanceScope,
): boolean {
  if (!relevanceScope) {
    return true;
  }
  // "all" — applies to mixed libraries and the episode browse mode.
  // Match the historical baseline (universal across all video scopes)
  // so series-only sorts still get normalized away. Book scopes are
  // intentionally not part of this baseline; see ALL_VIDEO_SCOPES.
  if (relevanceScope === "all") {
    return ALL_VIDEO_SCOPES.every((scope) => option.applicableMediaScopes.includes(scope));
  }
  return option.applicableMediaScopes.includes(relevanceScope);
}

export function getQuerySortOptions(input: QuerySortOptionsInput = false): QuerySortOption[] {
  const { includePersonalized = false, relevanceScope } = normalizeQuerySortOptionsConfig(input);

  return QUERY_SORT_OPTIONS.filter(
    (option) =>
      (includePersonalized || !option.personalized) &&
      optionMatchesRelevanceScope(option, relevanceScope),
  ).map((option) => {
    const ebookLabel =
      relevanceScope === "ebook" || relevanceScope === "manga"
        ? EBOOK_SORT_LABELS[option.value]
        : undefined;
    return ebookLabel ? { ...option, label: tr(ebookLabel) } : option;
  });
}

export function normalizeQuerySortForScope(
  sort?: QuerySortLike | null,
  input: QuerySortOptionsInput = false,
): { field: QuerySortField; order: QuerySortOrder } {
  const sortOptions = getQuerySortOptions(input);
  const normalizedField = normalizeQuerySortField(sort?.field);

  if (normalizedField && normalizedField !== "relevance") {
    const matchingOption = sortOptions.find((option) => option.value === normalizedField);
    if (matchingOption) {
      return {
        field: matchingOption.value,
        order:
          sort?.order === "asc" || sort?.order === "desc"
            ? sort.order
            : matchingOption.defaultOrder,
      };
    }
  }

  const fallbackOption = sortOptions[0] ?? QUERY_SORT_OPTION_MAP.get("added_at");
  if (!fallbackOption) {
    return { field: "added_at", order: "desc" };
  }

  return {
    field: fallbackOption.value,
    order: fallbackOption.defaultOrder,
  };
}

export function normalizeQuerySortField(
  field?: string | null,
): QuerySortField | "relevance" | undefined {
  const normalized = field?.trim().toLowerCase();

  switch (normalized) {
    case undefined:
      return undefined;
    case "":
      return undefined;
    case "sort_title":
      return "title";
    case "recently_added":
      return "added_at";
    case "rating":
      return "rating_imdb";
    case "relevance":
      return "relevance";
    default:
      return QUERY_SORT_OPTION_MAP.has(normalized as QuerySortField)
        ? (normalized as QuerySortField)
        : undefined;
  }
}

export function getDefaultQuerySortOrder(field?: string | null): QuerySortOrder {
  const normalized = normalizeQuerySortField(field);
  if (!normalized || normalized === "relevance") {
    return "desc";
  }
  return QUERY_SORT_OPTION_MAP.get(normalized)?.defaultOrder ?? "desc";
}

export function isPersonalizedQuerySortField(field?: string | null): boolean {
  const normalized = normalizeQuerySortField(field);
  return normalized != null && normalized !== "relevance"
    ? (QUERY_SORT_OPTION_MAP.get(normalized)?.personalized ?? false)
    : false;
}
