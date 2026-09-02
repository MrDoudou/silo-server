import { tr } from "@/i18n/translate";
export interface RecFieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "password" | "toggle" | "duration";
  hint?: string;
  defaultValue?: string;
}

export interface RecSectionDef {
  title: string;
  fields: RecFieldDef[];
}

export interface RecommendationEmbeddingLockViewModel {
  model: string;
  sourceDimensions: number;
  storageDimensions: number;
  note: string;
}

const RECOMMENDATIONS_GENERAL_SECTION: RecSectionDef = {
  get title() {
    return tr("pages.admin_settings.recommendations_settings.general");
  },
  fields: [
    {
      key: "recommendations.enabled",
      get label() {
        return tr("pages.admin_settings.recommendations_settings.enable_recommendations");
      },
      type: "toggle",
    },
  ],
};

const RECOMMENDATIONS_EMBEDDING_SECTION: RecSectionDef = {
  get title() {
    return tr("pages.admin_settings.recommendations_settings.embedding_configuration");
  },
  fields: [
    {
      key: "recommendations.embedding_base_url",
      get label() {
        return tr("pages.admin_settings.recommendations_settings.base_url");
      },
      type: "text",
      get hint() {
        return tr("pages.admin_settings.recommendations_settings.e_g_http_ollama_11434");
      },
    },
    {
      key: "recommendations.embedding_model",
      get label() {
        return tr("pages.admin_settings.recommendations_settings.model");
      },
      type: "text",
      get hint() {
        return tr("pages.admin_settings.recommendations_settings.e_g_text_embedding_3_large");
      },
    },
    {
      key: "recommendations.embedding_auth_token",
      get label() {
        return tr("pages.admin_settings.recommendations_settings.auth_token");
      },
      type: "password",
      get hint() {
        return tr("pages.admin_settings.recommendations_settings.optional_bearer_token");
      },
    },
  ],
};

const RECOMMENDATIONS_SCHEDULE_SECTION: RecSectionDef = {
  get title() {
    return tr("pages.admin_settings.recommendations_settings.schedule");
  },
  fields: [
    {
      key: "recommendations.embeddings_cron",
      get label() {
        return tr("pages.admin_settings.recommendations_settings.embeddings_cron");
      },
      type: "text",
      get hint() {
        return tr("pages.admin_settings.recommendations_settings.cron_expression");
      },
      defaultValue: "0 3 * * *",
    },
    {
      key: "recommendations.taste_profiles_cron",
      get label() {
        return tr("pages.admin_settings.recommendations_settings.taste_profiles_cron");
      },
      type: "text",
      get hint() {
        return tr("pages.admin_settings.recommendations_settings.cron_expression");
      },
      defaultValue: "0 4 * * *",
    },
    {
      key: "recommendations.cowatch_cron",
      get label() {
        return tr("pages.admin_settings.recommendations_settings.co_watch_cron");
      },
      type: "text",
      get hint() {
        return tr("pages.admin_settings.recommendations_settings.cron_expression");
      },
      defaultValue: "30 4 * * *",
    },
    {
      key: "recommendations.recommendations_cron",
      get label() {
        return tr("pages.admin_settings.recommendations_settings.recommendations_cron");
      },
      type: "text",
      get hint() {
        return tr("pages.admin_settings.recommendations_settings.cron_expression");
      },
      defaultValue: "0 5 * * *",
    },
  ],
};

const RECOMMENDATIONS_ADVANCED_SECTION: RecSectionDef = {
  get title() {
    return tr("pages.admin_settings.recommendations_settings.advanced");
  },
  fields: [
    {
      key: "recommendations.taste_decay_half_life_days",
      get label() {
        return tr("pages.admin_settings.recommendations_settings.time_decay_half_life_days");
      },
      type: "number",
      get hint() {
        return tr("pages.admin_settings.recommendations_settings.how_fast_old_signals_lose_weight");
      },
      defaultValue: "180",
    },
    {
      key: "recommendations.diversity_lambda",
      get label() {
        return tr("pages.admin_settings.recommendations_settings.diversity_lambda");
      },
      type: "text",
      get hint() {
        return tr(
          "pages.admin_settings.recommendations_settings.value_0_max_diversity_1_max_relevance",
        );
      },
      defaultValue: "0.7",
    },
  ],
};

const RECOMMENDATIONS_SECTIONS: RecSectionDef[] = [
  RECOMMENDATIONS_GENERAL_SECTION,
  RECOMMENDATIONS_EMBEDDING_SECTION,
  RECOMMENDATIONS_SCHEDULE_SECTION,
  RECOMMENDATIONS_ADVANCED_SECTION,
];

const EMBEDDING_LOCK_NOTE =
  "Changing this config requires a manual reset, which is not currently supported in-product.";

export function buildRecommendationSections(): RecSectionDef[] {
  return RECOMMENDATIONS_SECTIONS;
}

export function getAllRecommendationFields(): RecFieldDef[] {
  return RECOMMENDATIONS_SECTIONS.flatMap((section) => section.fields);
}

export function parseRecommendationEmbeddingLock(
  raw: string | undefined | null,
): RecommendationEmbeddingLockViewModel | null {
  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const model = typeof record.model === "string" ? record.model.trim() : "";
  const sourceDimensions =
    typeof record.source_dimensions === "number" ? record.source_dimensions : null;
  const storageDimensions =
    typeof record.storage_dimensions === "number" ? record.storage_dimensions : null;

  if (!model || sourceDimensions === null) {
    return null;
  }

  return {
    model,
    sourceDimensions,
    storageDimensions: storageDimensions ?? 3072,
    note: EMBEDDING_LOCK_NOTE,
  };
}
