// Rolling-window labels for the subtitle-AI transcription quota periods.

import { tr } from "@/i18n/translate";

// One source of truth for every surface that names a period; keep in sync
// with QuotaPeriodWindow in internal/subtitles/ai/quota.go.
export const QUOTA_PERIODS = ["day", "week", "month"] as const;

export const QUOTA_PERIOD_WINDOW_LABELS: Record<string, string> = {
  get day() {
    return tr("lib.quota_periods.value_24_hours");
  },
  get week() {
    return tr("lib.quota_periods.value_7_days");
  },
  get month() {
    return tr("lib.quota_periods.value_30_days");
  },
};
