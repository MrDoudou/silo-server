import { OVERLAY_CATEGORIES, type OverlayCategory, type OverlayPosition } from "./types";

import { tr } from "@/i18n/translate";

// Shared UI metadata so user-facing and admin settings stay in sync. These
// labels are presentational only; the canonical enums live in types.ts.

export const POSITION_OPTIONS: { value: OverlayPosition; label: string }[] = [
  {
    value: "top-left",
    get label() {
      return tr("lib.overlays.ui_constants.top_left");
    },
  },
  {
    value: "top-right",
    get label() {
      return tr("lib.overlays.ui_constants.top_right");
    },
  },
  {
    value: "bottom-left",
    get label() {
      return tr("lib.overlays.ui_constants.bottom_left");
    },
  },
  {
    value: "bottom-right",
    get label() {
      return tr("lib.overlays.ui_constants.bottom_right");
    },
  },
];

interface CategoryMeta {
  category: OverlayCategory;
  title: string;
  description: string;
}

export const CATEGORY_META: Record<OverlayCategory, CategoryMeta> = {
  tech: {
    category: "tech",
    get title() {
      return tr("lib.overlays.ui_constants.media_info");
    },
    get description() {
      return tr("lib.overlays.ui_constants.technical_details_from_your_media_files");
    },
  },
  ratings: {
    category: "ratings",
    get title() {
      return tr("lib.overlays.ui_constants.ratings_certifications");
    },
    get description() {
      return tr("lib.overlays.ui_constants.scores_from_external_sources_and_content_ratings");
    },
  },
  metadata: {
    category: "metadata",
    get title() {
      return tr("lib.overlays.ui_constants.content_metadata");
    },
    get description() {
      return tr("lib.overlays.ui_constants.information_about_the_content_itself");
    },
  },
  ribbons: {
    category: "ribbons",
    get title() {
      return tr("lib.overlays.ui_constants.status_awards");
    },
    get description() {
      return tr(
        "lib.overlays.ui_constants.series_lifecycle_and_award_badges_some_require_upcoming_data_sources",
      );
    },
  },
};

// Iteration-friendly ordered list of category metadata.
export const CATEGORY_GROUPS: CategoryMeta[] = OVERLAY_CATEGORIES.map((c) => CATEGORY_META[c]);
