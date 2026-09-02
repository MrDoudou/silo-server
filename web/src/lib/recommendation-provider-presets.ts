import { tr } from "@/i18n/translate";
export interface RecommendationProviderPreset {
  id: string;
  label: string;
  tag?: string;
  description: string;
  baseUrl: string;
  model: string;
  needsToken: boolean;
}

export const RECOMMENDATION_PROVIDER_PRESETS: RecommendationProviderPreset[] = [
  {
    id: "gemini",
    get label() {
      return tr("lib.recommendation_provider_presets.gemini");
    },
    tag: "Recommended",
    get description() {
      return tr("lib.recommendation_provider_presets.most_accurate_requires_a_google_ai_api_key");
    },
    baseUrl: "https://generativelanguage.googleapis.com",
    model: "gemini-embedding-001",
    needsToken: true,
  },
  {
    id: "ollama",
    get label() {
      return tr("lib.recommendation_provider_presets.ollama");
    },
    tag: "Local",
    get description() {
      return tr("lib.recommendation_provider_presets.free_self_hosted_needs_ollama_running");
    },
    baseUrl: "http://ollama:11434",
    model: "qwen3-embedding:latest",
    needsToken: false,
  },
  {
    id: "openai",
    get label() {
      return tr("lib.recommendation_provider_presets.open_ai");
    },
    get description() {
      return tr("lib.recommendation_provider_presets.high_quality_requires_an_open_ai_api_key");
    },
    baseUrl: "https://api.openai.com",
    model: "text-embedding-3-large",
    needsToken: true,
  },
];

export const RECOMMENDATION_CUSTOM_PROVIDER_PRESET: RecommendationProviderPreset = {
  id: "custom",
  get label() {
    return tr("lib.recommendation_provider_presets.custom");
  },
  get description() {
    return tr("lib.recommendation_provider_presets.any_open_ai_compatible_endpoint");
  },
  baseUrl: "",
  model: "",
  needsToken: false,
};

export const RECOMMENDATION_PROVIDER_OPTIONS: RecommendationProviderPreset[] = [
  ...RECOMMENDATION_PROVIDER_PRESETS,
  RECOMMENDATION_CUSTOM_PROVIDER_PRESET,
];

export function matchRecommendationProviderPreset(
  baseUrl: string | null | undefined,
  model: string | null | undefined,
): RecommendationProviderPreset | null {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const normalizedModel = model?.trim() ?? "";

  if (!normalizedBaseUrl || !normalizedModel) {
    return null;
  }

  return (
    RECOMMENDATION_PROVIDER_PRESETS.find(
      (preset) =>
        normalizeBaseUrl(preset.baseUrl) === normalizedBaseUrl && preset.model === normalizedModel,
    ) ?? null
  );
}

function normalizeBaseUrl(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\/+$/, "").toLowerCase();
}
