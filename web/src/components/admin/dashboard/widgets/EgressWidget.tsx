import { useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminTimeseries } from "@/hooks/queries/admin/dashboardInsights";
import { formatMbps, formatMbpsValue } from "../format";
import {
  formatRangeTimestamp,
  rangeEdgeLabels,
  rangeHours,
  rangePhrase,
  rangeTitle,
} from "../range";
import { useWidgetRange } from "../widgetChrome";
import { WidgetRangePicker } from "../WidgetRangePicker";
import { TimeseriesChartBody } from "./timeseriesChart";
import { buildTimeseriesPoints } from "./timeseriesSeries";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

/**
 * Egress the deployment served over the chosen window, in Mbps.
 *
 * The sampler mixes two sources into one number: the rolling average each
 * stream node reports, and the exact bytes each API process served itself. A
 * node-less single-server install charts the second alone. Wide windows are
 * bucketed server-side to the peak minute in each bucket, so "Peak" means the
 * same thing at every range.
 *
 * The main line is always the total. When the window contains measured
 * download traffic, the download subset is drawn as a second line under it —
 * never as a derived "playback" line: past the two-hour resolution the
 * server's total and download maxima are peak-preserved independently, so
 * they can come from different minutes and their difference is not any
 * minute's playback rate.
 */
export function EgressWidget() {
  useUILanguage();
  const { range } = useWidgetRange();
  const query = useAdminTimeseries(rangeHours(range));
  const hasDownloadTraffic = useMemo(
    () => (query.data?.points ?? []).some((point) => (point.download_egress_kbps ?? 0) > 0),
    [query.data],
  );
  const points = useMemo(
    () => buildTimeseriesPoints(query.data, (point) => point.egress_kbps / 1_000),
    [query.data],
  );
  const downloadPoints = useMemo(
    () =>
      hasDownloadTraffic
        ? buildTimeseriesPoints(query.data, (point) => (point.download_egress_kbps ?? 0) / 1_000)
        : [],
    [query.data, hasDownloadTraffic],
  );

  const peak = points.reduce((max, point) => Math.max(max, point.value ?? 0), 0);

  return (
    <Card className="h-full">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-sm font-bold">
          {rangeTitle("components.admin.dashboard.registry.egress", range)}
        </CardTitle>
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-muted-foreground text-[11px] tabular-nums">
            {tr("components.admin.dashboard.widgets.egress_widget.peak")} {formatMbps(peak)}
          </span>
          <WidgetRangePicker />
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        <TimeseriesChartBody
          query={query}
          points={points}
          seriesLabel={tr("components.admin.dashboard.widgets.egress_widget.egress")}
          overlays={
            hasDownloadTraffic
              ? [
                  {
                    label: tr("components.admin.dashboard.widgets.egress_widget.downloads"),
                    points: downloadPoints,
                    seriesIndex: 1,
                  },
                ]
              : undefined
          }
          ariaLabel={tr(
            "components.admin.dashboard.widgets.egress_widget.egress_over_value1_in_megabits_per_second",
            {
              value1: rangePhrase(range),
            },
          )}
          errorMessage={tr(
            "components.admin.dashboard.widgets.egress_widget.failed_to_load_egress_history",
          )}
          emptyMessage={tr(
            "components.admin.dashboard.widgets.egress_widget.no_egress_samples_yet",
          )}
          formatValue={formatMbps}
          formatTick={formatMbpsValue}
          formatTimestamp={(t) => formatRangeTimestamp(range, t, { withTime: true })}
          edgeLabels={rangeEdgeLabels(range)}
          fill
        />
      </CardContent>
    </Card>
  );
}
