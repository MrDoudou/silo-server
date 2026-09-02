import { tr } from "@/i18n/translate";
export const THEME_IDS = [
  "midnight-cinema",
  "cinema-light",
  "cobalt-studio",
  "oxblood-noir",
  "evergreen-studio",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  fontFamily: string;
  /** Whether the theme paints a light or a dark surface. Drives theme-aware
   * assets (logos) and third-party widget themes (toasts). */
  appearance: "light" | "dark";
  /** Accent/primary color shown in the theme picker preview */
  previewAccent: string;
  /** Background color shown in the theme picker preview */
  previewBg: string;
  /** Short description of the theme's aesthetic */
  description?: string;
  /** Whether this theme should appear in the curated picker */
  curated?: boolean;
}

export const THEMES: Record<ThemeId, ThemeDefinition> = {
  "midnight-cinema": {
    id: "midnight-cinema",
    get label() {
      return tr("lib.themes.cinema_dark");
    },
    fontFamily: "Outfit",
    appearance: "dark",
    previewAccent: "#e8e8ec",
    previewBg: "#141417",
    get description() {
      return tr("lib.themes.monochromatic_cinema_content_is_the_color");
    },
    curated: true,
  },
  "cinema-light": {
    id: "cinema-light",
    get label() {
      return tr("lib.themes.cinema_light");
    },
    fontFamily: "Outfit",
    appearance: "light",
    previewAccent: "#1a1a1e",
    previewBg: "#f4f4f6",
    get description() {
      return tr("lib.themes.light_monochromatic_cinema_content_is_the_color");
    },
    curated: true,
  },
  "cobalt-studio": {
    id: "cobalt-studio",
    get label() {
      return tr("lib.themes.cobalt");
    },
    fontFamily: "Outfit",
    appearance: "dark",
    previewAccent: "#78aefc",
    previewBg: "#101722",
    get description() {
      return tr("lib.themes.cool_blue_graphite_with_crisp_contrast");
    },
    curated: true,
  },
  "oxblood-noir": {
    id: "oxblood-noir",
    get label() {
      return tr("lib.themes.oxblood");
    },
    fontFamily: "Outfit",
    appearance: "dark",
    previewAccent: "#d16a78",
    previewBg: "#171113",
    get description() {
      return tr("lib.themes.deep_red_black_with_restrained_luxury_warmth");
    },
    curated: true,
  },
  "evergreen-studio": {
    id: "evergreen-studio",
    get label() {
      return tr("lib.themes.evergreen");
    },
    fontFamily: "Outfit",
    appearance: "dark",
    previewAccent: "#5bc39d",
    previewBg: "#101715",
    get description() {
      return tr("lib.themes.refined_evergreen_accents_on_dense_graphite");
    },
    curated: true,
  },
};

export const DEFAULT_THEME: ThemeId = "midnight-cinema";

export const CURATED_THEME_IDS = THEME_IDS.filter((id) => THEMES[id].curated);
