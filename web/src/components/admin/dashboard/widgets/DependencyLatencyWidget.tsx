import { useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminTimeseries } from "@/hooks/queries/admin/dashboardInsights";
import { formatLatency } from "../format";
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

/** Successful PostgreSQL, Redis, and stream-node round trips sampled once per minute. */
export function DependencyLatencyWidget() {
  const { range } = useWidgetRange();
  const query = useAdminTimeseries(rangeHours(range));
  const postgres = useMemo(
    () => buildTimeseriesPoints(query.data, (point) => point.postgres_latency_ms),
    [query.data],
  );
  const redis = useMemo(
    () => buildTimeseriesPoints(query.data, (point) => point.redis_latency_ms),
    [query.data],
  );
  const nodes = useMemo(
    () => buildTimeseriesPoints(query.data, (point) => point.node_latency_ms),
    [query.data],
  );
  const hasRedis = redis.some((point) => point.value !== null);
  const hasNodes = nodes.some((point) => point.value !== null);
  const peak = [...postgres, ...redis, ...nodes].reduce(
    (highest, point) => Math.max(highest, point.value ?? 0),
    0,
  );

  return (
    <Card className="h-full">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-sm font-bold">{rangeTitle("Service latency", range)}</CardTitle>
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-muted-foreground text-[11px] tabular-nums">
            Peak {formatLatency(peak)}
          </span>
          <WidgetRangePicker />
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        <TimeseriesChartBody
          query={query}
          points={postgres}
          seriesLabel="PostgreSQL"
          overlays={[
            ...(hasRedis ? [{ label: "Redis", points: redis, seriesIndex: 1 }] : []),
            ...(hasNodes ? [{ label: "Nodes", points: nodes, seriesIndex: 2 }] : []),
          ]}
          ariaLabel={`PostgreSQL, Redis, and stream-node latency over ${rangePhrase(range)}`}
          errorMessage="Failed to load service latency."
          emptyMessage="No latency samples yet"
          formatValue={formatLatency}
          formatTick={(value) => `${Math.round(value)} ms`}
          formatTimestamp={(t) => formatRangeTimestamp(range, t, { withTime: true })}
          edgeLabels={rangeEdgeLabels(range)}
          fill
        />
      </CardContent>
    </Card>
  );
}
