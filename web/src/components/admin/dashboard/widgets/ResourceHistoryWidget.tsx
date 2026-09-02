import { useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminTimeseries } from "@/hooks/queries/admin/dashboardInsights";
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

/** API-process CPU, memory, and GPU pressure sampled once per minute. */
export function ResourceHistoryWidget() {
  const { range } = useWidgetRange();
  const query = useAdminTimeseries(rangeHours(range));
  const cpu = useMemo(
    () => buildTimeseriesPoints(query.data, (point) => point.cpu_pct),
    [query.data],
  );
  const memory = useMemo(
    () => buildTimeseriesPoints(query.data, (point) => point.memory_pct),
    [query.data],
  );
  const gpu = useMemo(
    () => buildTimeseriesPoints(query.data, (point) => point.gpu_pct),
    [query.data],
  );
  const hasGPU = gpu.some((point) => point.value !== null);
  const peakCPU = cpu.reduce((peak, point) => Math.max(peak, point.value ?? 0), 0);

  return (
    <Card className="h-full">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-sm font-bold">{rangeTitle("Resource usage", range)}</CardTitle>
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-muted-foreground text-[11px] tabular-nums">
            Peak CPU {formatPercent(peakCPU)}
          </span>
          <WidgetRangePicker />
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        <TimeseriesChartBody
          query={query}
          points={cpu}
          seriesLabel="CPU"
          overlays={[
            { label: "RAM", points: memory, seriesIndex: 1 },
            ...(hasGPU ? [{ label: "GPU", points: gpu, seriesIndex: 2 }] : []),
          ]}
          ariaLabel={`CPU, memory, and GPU usage over ${rangePhrase(range)}`}
          errorMessage="Failed to load resource history."
          emptyMessage="No resource samples yet"
          formatValue={formatPercent}
          formatTick={(value) => `${Math.round(value)}%`}
          formatTimestamp={(t) => formatRangeTimestamp(range, t, { withTime: true })}
          edgeLabels={rangeEdgeLabels(range)}
          fill
        />
      </CardContent>
    </Card>
  );
}

function formatPercent(value: number) {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}
