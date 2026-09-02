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

/** Aggregate API-process receive and send throughput sampled once per minute. */
export function NetworkHistoryWidget() {
  const { range } = useWidgetRange();
  const query = useAdminTimeseries(rangeHours(range));
  const receive = useMemo(
    () => buildTimeseriesPoints(query.data, (point) => bitsToMegabits(point.net_rx_bps)),
    [query.data],
  );
  const send = useMemo(
    () => buildTimeseriesPoints(query.data, (point) => bitsToMegabits(point.net_tx_bps)),
    [query.data],
  );
  const peak = [...receive, ...send].reduce(
    (highest, point) => Math.max(highest, point.value ?? 0),
    0,
  );

  return (
    <Card className="h-full">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-sm font-bold">{rangeTitle("Network traffic", range)}</CardTitle>
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-muted-foreground text-[11px] tabular-nums">
            Peak {formatMbps(peak)}
          </span>
          <WidgetRangePicker />
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        <TimeseriesChartBody
          query={query}
          points={receive}
          seriesLabel="Receive"
          overlays={[{ label: "Send", points: send, seriesIndex: 1 }]}
          ariaLabel={`Network receive and send throughput over ${rangePhrase(range)}`}
          errorMessage="Failed to load network history."
          emptyMessage="No network samples yet"
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

function bitsToMegabits(bitsPerSecond: number | undefined) {
  return bitsPerSecond === undefined ? undefined : bitsPerSecond / 1_000_000;
}
