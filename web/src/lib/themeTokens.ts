import { tr } from "@/i18n/translate"; /** All CSS custom property tokens that a theme can override. */

export type ThemeToken =
  | "background"
  | "foreground"
  | "card"
  | "card-foreground"
  | "popover"
  | "popover-foreground"
  | "surface"
  | "surface-hover"
  | "surface-raised"
  | "primary"
  | "primary-foreground"
  | "secondary"
  | "secondary-foreground"
  | "muted"
  | "muted-foreground"
  | "accent"
  | "accent-foreground"
  | "destructive"
  | "destructive-foreground"
  | "border"
  | "input"
  | "ring"
  | "sidebar"
  | "sidebar-foreground"
  | "sidebar-primary"
  | "sidebar-primary-foreground"
  | "sidebar-accent"
  | "sidebar-accent-foreground"
  | "sidebar-border"
  | "sidebar-section-divider"
  | "sidebar-ring"
  | "ambient"
  | "radius"
  | "font-body";

export type TokenGroup =
  | "Surfaces"
  | "Interactive"
  | "Sidebar"
  | "Borders & Focus"
  | "Shape & Font";

export type TokenInputType = "color" | "radius" | "font";

export interface TokenMeta {
  token: ThemeToken;
  label: string;
  group: TokenGroup;
  inputType: TokenInputType;
}

export const THEME_TOKENS: TokenMeta[] = [
  // Surfaces
  {
    token: "background",
    get label() {
      return tr("lib.theme_tokens.background");
    },
    group: "Surfaces",
    inputType: "color",
  },
  {
    token: "foreground",
    get label() {
      return tr("lib.theme_tokens.foreground");
    },
    group: "Surfaces",
    inputType: "color",
  },
  {
    token: "card",
    get label() {
      return tr("lib.theme_tokens.card");
    },
    group: "Surfaces",
    inputType: "color",
  },
  {
    token: "card-foreground",
    get label() {
      return tr("lib.theme_tokens.card_text");
    },
    group: "Surfaces",
    inputType: "color",
  },
  {
    token: "popover",
    get label() {
      return tr("lib.theme_tokens.popover");
    },
    group: "Surfaces",
    inputType: "color",
  },
  {
    token: "popover-foreground",
    get label() {
      return tr("lib.theme_tokens.popover_text");
    },
    group: "Surfaces",
    inputType: "color",
  },
  {
    token: "surface",
    get label() {
      return tr("lib.theme_tokens.surface");
    },
    group: "Surfaces",
    inputType: "color",
  },
  {
    token: "surface-hover",
    get label() {
      return tr("lib.theme_tokens.surface_hover");
    },
    group: "Surfaces",
    inputType: "color",
  },
  {
    token: "surface-raised",
    get label() {
      return tr("lib.theme_tokens.surface_raised");
    },
    group: "Surfaces",
    inputType: "color",
  },

  // Interactive
  {
    token: "primary",
    get label() {
      return tr("lib.theme_tokens.primary");
    },
    group: "Interactive",
    inputType: "color",
  },
  {
    token: "primary-foreground",
    get label() {
      return tr("lib.theme_tokens.primary_text");
    },
    group: "Interactive",
    inputType: "color",
  },
  {
    token: "secondary",
    get label() {
      return tr("lib.theme_tokens.secondary");
    },
    group: "Interactive",
    inputType: "color",
  },
  {
    token: "secondary-foreground",
    get label() {
      return tr("lib.theme_tokens.secondary_text");
    },
    group: "Interactive",
    inputType: "color",
  },
  {
    token: "muted",
    get label() {
      return tr("lib.theme_tokens.muted");
    },
    group: "Interactive",
    inputType: "color",
  },
  {
    token: "muted-foreground",
    get label() {
      return tr("lib.theme_tokens.muted_text");
    },
    group: "Interactive",
    inputType: "color",
  },
  {
    token: "accent",
    get label() {
      return tr("lib.theme_tokens.accent");
    },
    group: "Interactive",
    inputType: "color",
  },
  {
    token: "accent-foreground",
    get label() {
      return tr("lib.theme_tokens.accent_text");
    },
    group: "Interactive",
    inputType: "color",
  },
  {
    token: "destructive",
    get label() {
      return tr("lib.theme_tokens.destructive");
    },
    group: "Interactive",
    inputType: "color",
  },
  {
    token: "destructive-foreground",
    get label() {
      return tr("lib.theme_tokens.destructive_text");
    },
    group: "Interactive",
    inputType: "color",
  },
  {
    token: "ambient",
    get label() {
      return tr("lib.theme_tokens.ambient_glow");
    },
    group: "Interactive",
    inputType: "color",
  },

  // Sidebar
  {
    token: "sidebar",
    get label() {
      return tr("lib.theme_tokens.sidebar");
    },
    group: "Sidebar",
    inputType: "color",
  },
  {
    token: "sidebar-foreground",
    get label() {
      return tr("lib.theme_tokens.sidebar_text");
    },
    group: "Sidebar",
    inputType: "color",
  },
  {
    token: "sidebar-primary",
    get label() {
      return tr("lib.theme_tokens.sidebar_primary");
    },
    group: "Sidebar",
    inputType: "color",
  },
  {
    token: "sidebar-primary-foreground",
    get label() {
      return tr("lib.theme_tokens.sidebar_primary_text");
    },
    group: "Sidebar",
    inputType: "color",
  },
  {
    token: "sidebar-accent",
    get label() {
      return tr("lib.theme_tokens.sidebar_accent");
    },
    group: "Sidebar",
    inputType: "color",
  },
  {
    token: "sidebar-accent-foreground",
    get label() {
      return tr("lib.theme_tokens.sidebar_accent_text");
    },
    group: "Sidebar",
    inputType: "color",
  },
  {
    token: "sidebar-border",
    get label() {
      return tr("lib.theme_tokens.sidebar_border");
    },
    group: "Sidebar",
    inputType: "color",
  },
  {
    token: "sidebar-section-divider",
    get label() {
      return tr("lib.theme_tokens.sidebar_section_divider");
    },
    group: "Sidebar",
    inputType: "color",
  },
  {
    token: "sidebar-ring",
    get label() {
      return tr("lib.theme_tokens.sidebar_ring");
    },
    group: "Sidebar",
    inputType: "color",
  },

  // Borders & Focus
  {
    token: "border",
    get label() {
      return tr("lib.theme_tokens.border");
    },
    group: "Borders & Focus",
    inputType: "color",
  },
  {
    token: "input",
    get label() {
      return tr("lib.theme_tokens.input_border");
    },
    group: "Borders & Focus",
    inputType: "color",
  },
  {
    token: "ring",
    get label() {
      return tr("lib.theme_tokens.focus_ring");
    },
    group: "Borders & Focus",
    inputType: "color",
  },

  // Shape & Font
  {
    token: "radius",
    get label() {
      return tr("lib.theme_tokens.border_radius");
    },
    group: "Shape & Font",
    inputType: "radius",
  },
  {
    token: "font-body",
    get label() {
      return tr("lib.theme_tokens.font_family");
    },
    group: "Shape & Font",
    inputType: "font",
  },
];

/** Tokens grouped by category for the editor UI. */
export const TOKEN_GROUPS: Record<TokenGroup, TokenMeta[]> = THEME_TOKENS.reduce(
  (acc, meta) => {
    (acc[meta.group] ??= []).push(meta);
    return acc;
  },
  {} as Record<TokenGroup, TokenMeta[]>,
);

/** Token group display order. */
export const TOKEN_GROUP_ORDER: TokenGroup[] = [
  "Surfaces",
  "Interactive",
  "Sidebar",
  "Borders & Focus",
  "Shape & Font",
];

/** Available font families from the loaded Google Fonts. */
export const AVAILABLE_FONTS = ["Outfit", "Sora", "Urbanist", "Manrope"];

/** Read the current computed value of a CSS custom property from the DOM. */
export function getComputedToken(token: ThemeToken): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim();
}
