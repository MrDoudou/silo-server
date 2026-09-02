import type { OverlayPreset, PresetId } from "./types";

import { tr } from "@/i18n/translate";

// Presets are pure data — no runtime branching, no per-render computation.
// badgeStyle() is called with the resolved accent color and returns the
// inline style applied to the badge container. CardOverlays overrides the
// fixed Tailwind geometry with card-relative values; those classes remain as
// the settings-picker rendering and as a fallback without container units.

export const OVERLAY_PRESETS: Record<PresetId, OverlayPreset> = {
  minimal: {
    id: "minimal",
    get label() {
      return tr("lib.overlays.presets.minimal");
    },
    get description() {
      return tr("lib.overlays.presets.near_invisible_tiny_text_no_background");
    },
    badgeClass:
      "rounded-sm px-1 py-0 text-[9px] font-semibold tracking-widest uppercase leading-none",
    badgeStyle: (accent) => ({
      background: "transparent",
      color: accent ?? "rgba(255,255,255,0.85)",
      textShadow: "0 1px 2px rgba(0,0,0,0.85)",
    }),
    fontSize: 9,
    paddingInline: 4,
    paddingBlock: 0,
    borderRadius: 8,
    borderRadiusVariable: "--radius-sm",
    textShadow: { x: 0, y: 1, blur: 2, color: "rgba(0,0,0,0.85)" },
    iconSize: 10,
    iconGap: 4,
    preferIcon: false,
    gapClass: "gap-0.5",
    stackGap: 2,
    accentStrategy: "text",
  },
  classic: {
    id: "classic",
    get label() {
      return tr("lib.overlays.presets.classic");
    },
    get description() {
      return tr("lib.overlays.presets.semi_transparent_dark_pill_with_a_white_border_the_default");
    },
    badgeClass:
      "rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase leading-none",
    badgeStyle: (accent) => ({
      background: accent ? `color-mix(in srgb, ${accent} 28%, rgba(0,0,0,0.6))` : "rgba(0,0,0,0.6)",
      color: "white",
    }),
    fontSize: 10,
    paddingInline: 8,
    paddingBlock: 2,
    borderRadius: "full",
    borderWidth: 1,
    iconSize: 11,
    iconGap: 4,
    preferIcon: false,
    gapClass: "gap-1",
    stackGap: 4,
    accentStrategy: "bg",
  },
  vibrant: {
    id: "vibrant",
    get label() {
      return tr("lib.overlays.presets.vibrant");
    },
    get description() {
      return tr("lib.overlays.presets.opaque_accent_colored_badges_high_contrast");
    },
    badgeClass:
      "rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase leading-none shadow-sm",
    badgeStyle: (accent) => ({
      background: accent ?? "rgba(220,220,220,0.95)",
      color: accent ? "white" : "black",
    }),
    fontSize: 10,
    paddingInline: 8,
    paddingBlock: 2,
    borderRadius: 10,
    borderRadiusVariable: "--radius-md",
    boxShadow: { x: 0, y: 1, blur: 2, spread: 0, color: "rgb(0 0 0 / 0.25)" },
    iconSize: 12,
    iconGap: 4,
    preferIcon: true,
    gapClass: "gap-1",
    stackGap: 4,
    accentStrategy: "bg",
  },
  pill: {
    id: "pill",
    get label() {
      return tr("lib.overlays.presets.pill");
    },
    get description() {
      return tr("lib.overlays.presets.larger_pill_with_more_padding_works_well_with_icons");
    },
    badgeClass:
      "rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase leading-none",
    badgeStyle: (accent) => ({
      background: accent
        ? `color-mix(in srgb, ${accent} 20%, rgba(20,20,30,0.7))`
        : "rgba(20,20,30,0.7)",
      color: "white",
    }),
    fontSize: 10,
    paddingInline: 10,
    paddingBlock: 4,
    borderRadius: "full",
    borderWidth: 1,
    iconSize: 12,
    iconGap: 4,
    preferIcon: true,
    gapClass: "gap-1",
    stackGap: 4,
    accentStrategy: "bg",
  },
  square: {
    id: "square",
    get label() {
      return tr("lib.overlays.presets.square");
    },
    get description() {
      return tr("lib.overlays.presets.blocky_high_density_plex_inspired");
    },
    badgeClass:
      "rounded-sm px-1.5 py-0.5 text-[9px] font-bold tracking-widest uppercase leading-none",
    badgeStyle: (accent) => ({
      background: "rgba(0,0,0,0.8)",
      color: accent ?? "white",
      borderLeftColor: accent,
      borderLeftStyle: accent ? "solid" : undefined,
      borderLeftWidth: accent ? "2px" : undefined,
    }),
    fontSize: 9,
    paddingInline: 6,
    paddingBlock: 2,
    borderRadius: 8,
    borderRadiusVariable: "--radius-sm",
    borderLeftWidth: 2,
    iconSize: 10,
    iconGap: 4,
    preferIcon: false,
    gapClass: "gap-0.5",
    stackGap: 2,
    accentStrategy: "border",
  },
};

export const PRESET_IDS = [
  "minimal",
  "classic",
  "vibrant",
  "pill",
  "square",
] as const satisfies readonly PresetId[];

export function getPreset(id: PresetId): OverlayPreset {
  return OVERLAY_PRESETS[id] ?? OVERLAY_PRESETS.classic;
}

// Curated accent color palette shown in the settings UI for per-overlay color
// overrides. Values cover most reasonable contrast scenarios over a dark badge
// background.
export const ACCENT_PALETTE: { label: string; value: string }[] = [
  {
    get label() {
      return tr("lib.overlays.presets.gold");
    },
    value: "#f5c518",
  }, // IMDb yellow
  {
    get label() {
      return tr("lib.overlays.presets.tomato");
    },
    value: "#fa320a",
  }, // RT critic red
  {
    get label() {
      return tr("lib.overlays.presets.orange");
    },
    value: "#f97316",
  },
  {
    get label() {
      return tr("lib.overlays.presets.amber");
    },
    value: "#f59e0b",
  },
  {
    get label() {
      return tr("lib.overlays.presets.emerald");
    },
    value: "#10b981",
  },
  {
    get label() {
      return tr("lib.overlays.presets.cyan");
    },
    value: "#06b6d4",
  },
  {
    get label() {
      return tr("lib.overlays.presets.blue");
    },
    value: "#3b82f6",
  },
  {
    get label() {
      return tr("lib.overlays.presets.indigo");
    },
    value: "#6366f1",
  },
  {
    get label() {
      return tr("lib.overlays.presets.violet");
    },
    value: "#8b5cf6",
  },
  {
    get label() {
      return tr("lib.overlays.presets.pink");
    },
    value: "#ec4899",
  },
  {
    get label() {
      return tr("lib.overlays.presets.slate");
    },
    value: "#64748b",
  },
  {
    get label() {
      return tr("lib.overlays.presets.white");
    },
    value: "#ffffff",
  },
];
