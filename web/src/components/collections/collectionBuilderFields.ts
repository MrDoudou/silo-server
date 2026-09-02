import type { QuerySort } from "@/api/types";
import { getQuerySortOptions, type QuerySortRelevanceScope } from "@/lib/querySortOptions";

import { tr } from "@/i18n/translate";

export interface CollectionOperatorOption {
  value: string;
  label: string;
}

export interface CollectionFieldOption {
  value: string;
  label: string;
  operators: CollectionOperatorOption[];
  inputType: "text" | "number" | "select" | "boolean" | "person_search";
  valueType?: "string" | "number" | "boolean";
  supportsRange?: boolean;
  selectOptions?: string[];
  personalized?: boolean;
}

export const COLLECTION_FIELD_OPTIONS: CollectionFieldOption[] = [
  {
    value: "genre",
    get label() {
      return tr("components.collections.collection_builder_fields.genre");
    },
    operators: [
      {
        value: "is",
        get label() {
          return tr("components.collections.collection_builder_fields.is");
        },
      },
      {
        value: "is_not",
        get label() {
          return tr("components.collections.collection_builder_fields.is_not");
        },
      },
      {
        value: "contains",
        get label() {
          return tr("components.collections.collection_builder_fields.contains");
        },
      },
    ],
    inputType: "text",
    valueType: "string",
  },
  {
    value: "year",
    get label() {
      return tr("components.collections.collection_builder_fields.year");
    },
    operators: [
      {
        value: "is",
        get label() {
          return tr("components.collections.collection_builder_fields.equals");
        },
      },
      { value: "gte", label: ">=" },
      { value: "lte", label: "<=" },
      { value: "gt", label: ">" },
      { value: "lt", label: "<" },
      {
        value: "between",
        get label() {
          return tr("components.collections.collection_builder_fields.between");
        },
      },
    ],
    inputType: "number",
    valueType: "number",
    supportsRange: true,
  },
  {
    value: "rating_imdb",
    get label() {
      return tr("components.collections.collection_builder_fields.imdb_rating");
    },
    operators: [
      { value: "gte", label: ">=" },
      { value: "lte", label: "<=" },
      { value: "gt", label: ">" },
      { value: "lt", label: "<" },
      {
        value: "between",
        get label() {
          return tr("components.collections.collection_builder_fields.between");
        },
      },
    ],
    inputType: "number",
    valueType: "number",
    supportsRange: true,
  },
  {
    value: "type",
    get label() {
      return tr("components.collections.collection_builder_fields.type");
    },
    operators: [
      {
        value: "is",
        get label() {
          return tr("components.collections.collection_builder_fields.is");
        },
      },
      {
        value: "is_not",
        get label() {
          return tr("components.collections.collection_builder_fields.is_not");
        },
      },
    ],
    inputType: "select",
    valueType: "string",
    selectOptions: ["movie", "series"],
  },
  {
    value: "content_rating",
    get label() {
      return tr("components.collections.collection_builder_fields.content_rating");
    },
    operators: [
      {
        value: "is",
        get label() {
          return tr("components.collections.collection_builder_fields.is");
        },
      },
      {
        value: "is_not",
        get label() {
          return tr("components.collections.collection_builder_fields.is_not");
        },
      },
    ],
    inputType: "text",
    valueType: "string",
  },
  {
    value: "studio",
    get label() {
      return tr("components.collections.collection_builder_fields.studio");
    },
    operators: [
      {
        value: "is",
        get label() {
          return tr("components.collections.collection_builder_fields.is");
        },
      },
      {
        value: "is_not",
        get label() {
          return tr("components.collections.collection_builder_fields.is_not");
        },
      },
    ],
    inputType: "text",
    valueType: "string",
  },
  {
    value: "actor",
    get label() {
      return tr("components.collections.collection_builder_fields.actor");
    },
    operators: [
      {
        value: "is",
        get label() {
          return tr("components.collections.collection_builder_fields.is");
        },
      },
      {
        value: "is_not",
        get label() {
          return tr("components.collections.collection_builder_fields.is_not");
        },
      },
    ],
    inputType: "person_search",
    valueType: "string",
  },
  {
    value: "director",
    get label() {
      return tr("components.collections.collection_builder_fields.director");
    },
    operators: [
      {
        value: "is",
        get label() {
          return tr("components.collections.collection_builder_fields.is");
        },
      },
      {
        value: "is_not",
        get label() {
          return tr("components.collections.collection_builder_fields.is_not");
        },
      },
    ],
    inputType: "person_search",
    valueType: "string",
  },
  {
    value: "writer",
    get label() {
      return tr("components.collections.collection_builder_fields.writer");
    },
    operators: [
      {
        value: "is",
        get label() {
          return tr("components.collections.collection_builder_fields.is");
        },
      },
      {
        value: "is_not",
        get label() {
          return tr("components.collections.collection_builder_fields.is_not");
        },
      },
    ],
    inputType: "person_search",
    valueType: "string",
  },
  {
    value: "producer",
    get label() {
      return tr("components.collections.collection_builder_fields.producer");
    },
    operators: [
      {
        value: "is",
        get label() {
          return tr("components.collections.collection_builder_fields.is");
        },
      },
      {
        value: "is_not",
        get label() {
          return tr("components.collections.collection_builder_fields.is_not");
        },
      },
    ],
    inputType: "person_search",
    valueType: "string",
  },
  {
    value: "network",
    get label() {
      return tr("components.collections.collection_builder_fields.network");
    },
    operators: [
      {
        value: "is",
        get label() {
          return tr("components.collections.collection_builder_fields.is");
        },
      },
      {
        value: "is_not",
        get label() {
          return tr("components.collections.collection_builder_fields.is_not");
        },
      },
    ],
    inputType: "text",
    valueType: "string",
  },
  {
    value: "country",
    get label() {
      return tr("components.collections.collection_builder_fields.country");
    },
    operators: [
      {
        value: "is",
        get label() {
          return tr("components.collections.collection_builder_fields.is");
        },
      },
      {
        value: "is_not",
        get label() {
          return tr("components.collections.collection_builder_fields.is_not");
        },
      },
    ],
    inputType: "text",
    valueType: "string",
  },
  {
    value: "status",
    get label() {
      return tr("components.collections.collection_builder_fields.status");
    },
    operators: [
      {
        value: "is",
        get label() {
          return tr("components.collections.collection_builder_fields.is");
        },
      },
      {
        value: "is_not",
        get label() {
          return tr("components.collections.collection_builder_fields.is_not");
        },
      },
    ],
    inputType: "select",
    valueType: "string",
    selectOptions: ["pending", "matched", "unmatched"],
  },
  {
    value: "added_at",
    get label() {
      return tr("components.collections.collection_builder_fields.added");
    },
    operators: [
      {
        value: "gt",
        get label() {
          return tr("components.collections.collection_builder_fields.after");
        },
      },
      {
        value: "lt",
        get label() {
          return tr("components.collections.collection_builder_fields.before");
        },
      },
      {
        value: "between",
        get label() {
          return tr("components.collections.collection_builder_fields.between");
        },
      },
      {
        value: "in_last",
        get label() {
          return tr("components.collections.collection_builder_fields.in_the_last");
        },
      },
    ],
    inputType: "text",
    valueType: "string",
    supportsRange: true,
  },
  {
    value: "release_date",
    get label() {
      return tr("components.collections.collection_builder_fields.release_date");
    },
    operators: [
      {
        value: "gt",
        get label() {
          return tr("components.collections.collection_builder_fields.after");
        },
      },
      {
        value: "lt",
        get label() {
          return tr("components.collections.collection_builder_fields.before");
        },
      },
      {
        value: "between",
        get label() {
          return tr("components.collections.collection_builder_fields.between");
        },
      },
      {
        value: "in_last",
        get label() {
          return tr("components.collections.collection_builder_fields.in_the_last");
        },
      },
    ],
    inputType: "text",
    valueType: "string",
    supportsRange: true,
  },
  {
    value: "watched",
    get label() {
      return tr("components.collections.collection_builder_fields.watched");
    },
    operators: [
      {
        value: "is",
        get label() {
          return tr("components.collections.collection_builder_fields.is");
        },
      },
    ],
    inputType: "boolean",
    valueType: "boolean",
    personalized: true,
  },
  {
    value: "favorited",
    get label() {
      return tr("components.collections.collection_builder_fields.favorited");
    },
    operators: [
      {
        value: "is",
        get label() {
          return tr("components.collections.collection_builder_fields.is");
        },
      },
    ],
    inputType: "boolean",
    valueType: "boolean",
    personalized: true,
  },
  {
    value: "in_watchlist",
    get label() {
      return tr("components.collections.collection_builder_fields.in_watchlist");
    },
    operators: [
      {
        value: "is",
        get label() {
          return tr("components.collections.collection_builder_fields.is");
        },
      },
    ],
    inputType: "boolean",
    valueType: "boolean",
    personalized: true,
  },
  {
    value: "in_progress",
    get label() {
      return tr("components.collections.collection_builder_fields.in_progress");
    },
    operators: [
      {
        value: "is",
        get label() {
          return tr("components.collections.collection_builder_fields.is");
        },
      },
    ],
    inputType: "boolean",
    valueType: "boolean",
    personalized: true,
  },
  {
    value: "resolution",
    get label() {
      return tr("components.collections.collection_builder_fields.resolution");
    },
    operators: [
      {
        value: "is",
        get label() {
          return tr("components.collections.collection_builder_fields.is");
        },
      },
      {
        value: "is_not",
        get label() {
          return tr("components.collections.collection_builder_fields.is_not");
        },
      },
    ],
    inputType: "select",
    valueType: "string",
    selectOptions: ["480p", "720p", "1080p", "2160p", "4320p"],
  },
  {
    value: "hdr",
    get label() {
      return tr("components.collections.collection_builder_fields.hdr");
    },
    operators: [
      {
        value: "is",
        get label() {
          return tr("components.collections.collection_builder_fields.is");
        },
      },
    ],
    inputType: "boolean",
    valueType: "boolean",
  },
  {
    value: "dolby_vision",
    get label() {
      return tr("components.collections.collection_builder_fields.dolby_vision");
    },
    operators: [
      {
        value: "is",
        get label() {
          return tr("components.collections.collection_builder_fields.is");
        },
      },
    ],
    inputType: "boolean",
    valueType: "boolean",
  },
  {
    value: "bitrate",
    get label() {
      return tr("components.collections.collection_builder_fields.bitrate");
    },
    operators: [
      { value: "gte", label: ">=" },
      { value: "lte", label: "<=" },
      { value: "gt", label: ">" },
      { value: "lt", label: "<" },
      {
        value: "between",
        get label() {
          return tr("components.collections.collection_builder_fields.between");
        },
      },
    ],
    inputType: "number",
    valueType: "number",
    supportsRange: true,
  },
];

export function getCollectionSortOptions(
  includePersonalized = false,
  relevanceScope?: QuerySortRelevanceScope,
): Array<{ value: QuerySort["field"]; label: string }> {
  return getQuerySortOptions({ includePersonalized, relevanceScope }).map((option) => ({
    value: option.value,
    label: option.label,
  }));
}

export const COLLECTION_SORT_OPTIONS: Array<{ value: QuerySort["field"]; label: string }> =
  getCollectionSortOptions(false);

export function getCollectionFieldOption(field: string): CollectionFieldOption | undefined {
  const normalizedField = field === "rating" ? "rating_imdb" : field;
  return COLLECTION_FIELD_OPTIONS.find((option) => option.value === normalizedField);
}
