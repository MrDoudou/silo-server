import { formatLanguage } from "@/lib/languageDisplay";
import type { OverlayDef } from "../types";

import { tr } from "@/i18n/translate";

function formatRuntime(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export const METADATA_OVERLAYS: readonly OverlayDef[] = [
  {
    id: "year",
    category: "metadata",
    get label() {
      return tr("lib.overlays.registry.metadata.year");
    },
    get description() {
      return tr("lib.overlays.registry.metadata.release_year");
    },
    defaultPosition: "bottom-left",
    defaultEnabled: false,
    iconCapable: false,
    getValue: (d) => (d.year && d.year > 0 ? String(d.year) : null),
  },
  {
    id: "runtime",
    category: "metadata",
    get label() {
      return tr("lib.overlays.registry.metadata.runtime");
    },
    get description() {
      return tr("lib.overlays.registry.metadata.item_runtime_in_hours_and_minutes");
    },
    defaultPosition: "bottom-left",
    defaultEnabled: false,
    iconId: "clock",
    iconCapable: true,
    getValue: (d) => formatRuntime(d.runtime),
  },
  {
    id: "original_language",
    category: "metadata",
    get label() {
      return tr("lib.overlays.registry.metadata.language");
    },
    get description() {
      return tr("lib.overlays.registry.metadata.original_language_of_the_content");
    },
    defaultPosition: "bottom-left",
    defaultEnabled: false,
    iconId: "globe",
    iconCapable: true,
    getValue: (d) => (d.original_language ? formatLanguage(d.original_language) : null),
  },
  {
    id: "studio",
    category: "metadata",
    get label() {
      return tr("lib.overlays.registry.metadata.studio");
    },
    get description() {
      return tr("lib.overlays.registry.metadata.primary_production_studio_movies");
    },
    defaultPosition: "bottom-right",
    defaultEnabled: false,
    iconId: "building",
    iconCapable: true,
    getValue: (d) => d.studio ?? null,
  },
  {
    id: "network",
    category: "metadata",
    get label() {
      return tr("lib.overlays.registry.metadata.network");
    },
    get description() {
      return tr("lib.overlays.registry.metadata.primary_network_series");
    },
    defaultPosition: "bottom-right",
    defaultEnabled: false,
    iconId: "tv",
    iconCapable: true,
    getValue: (d) => d.network ?? null,
  },
];
