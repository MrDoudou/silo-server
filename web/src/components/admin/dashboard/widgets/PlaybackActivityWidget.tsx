import { useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTime } from "@/lib/datetime";
import { useAdminPlaybackActivity } from "@/hooks/queries/admin/dashboardInsights";
import { ChartEmptyState, ChartSkeleton, StackedColumnChart } from "../charts";
import { SectionError } from "../feedback";
import { formatDayLabel, rangeHours, rangePhrase, rangeTitle } from "../range";
import { useWidgetRange } from "../widgetChrome";
import { WidgetRangePicker } from "../WidgetRangePicker";
import {
  buildPlaybackActivityColumns,
  DEFAULT_PLAYBACK_BUCKET_SECONDS,
  PLAYBACK_SERIES_LABELS,
} from "./playbackActivitySeries";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

/** Playback starts per bucket over the chosen window, stacked by play method. */
export function PlaybackActivityWidget() {
  useUILanguage();
  const { range } = useWidgetRange();
  const hours = rangeHours(range);
  const query = useAdminPlaybackActivity(hours);
  const bucketSeconds = query.data?.bucket_seconds || DEFAULT_PLAYBACK_BUCKET_SECONDS;
  // The grid anchors on the server's window end when the response carries it:
  // the buckets were cut on the database clock, and a browser clock a minute
  // behind it around a boundary would discard the newest bucket.
  const serverNow = query.data?.to ? Date.parse(query.data.to) : Number.NaN;
  const columns = useMemo(
    () =>
      buildPlaybackActivityColumns(query.data?.buckets, {
        hours,
        bucketSeconds,
        ...(Number.isFinite(serverNow) ? { now: serverNow } : {}),
      }),
    [query.data, hours, bucketSeconds, serverNow],
  );
  const total = columns.reduce(
    (sum, column) => sum + column.segments.reduce((columnSum, value) => columnSum + value, 0),
    0,
  );
  // Hourly buckets are read as clock times; daily ones as dates, since every
  // column of a month would otherwise be labelled midnight.
  const isDaily = bucketSeconds >= 86_400;

  return (
    <Card className="h-full">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-sm font-bold">
          {rangeTitle("components.admin.dashboard.registry.playback_activity", range)}
        </CardTitle>
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-muted-foreground text-[11px] tabular-nums">
            {total.toLocaleString()}{" "}
            {total === 1
              ? tr("components.admin.dashboard.widgets.playback_activity_widget.session")
              : tr("components.admin.dashboard.widgets.playback_activity_widget.sessions")}
          </span>
          <WidgetRangePicker />
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        {query.isLoading ? (
          <ChartSkeleton fill />
        ) : query.error ? (
          <SectionError
            message={tr(
              "components.admin.dashboard.widgets.playback_activity_widget.failed_to_load_playback_activity",
            )}
          />
        ) : total === 0 ? (
          <ChartEmptyState
            fill
            message={tr(
              "components.admin.dashboard.widgets.playback_activity_widget.no_playback_in_value1",
              { value1: rangePhrase(range) },
            )}
            detail={tr(
              "components.admin.dashboard.widgets.playback_activity_widget.sessions_appear_here_as_soon_as_someone_starts_watching",
            )}
          />
        ) : (
          <StackedColumnChart
            fill
            buckets={columns}
            seriesLabels={PLAYBACK_SERIES_LABELS.map((label) => tr(label))}
            ariaLabel={tr(
              "components.admin.dashboard.widgets.playback_activity_widget.playback_sessions_per_value1_over_value2_by_play_method",
              {
                value1: isDaily ? "day" : "hour",
                value2: rangePhrase(range),
              },
            )}
            formatBucket={(t) =>
              isDaily ? formatDayLabel(t) : formatTime(t, { hour: "numeric", minute: undefined })
            }
            totalLabel="Sessions"
          />
        )}
      </CardContent>
    </Card>
  );
}
