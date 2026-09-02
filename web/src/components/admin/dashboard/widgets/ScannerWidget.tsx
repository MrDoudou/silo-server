import { useMemo } from "react";
import { Link } from "react-router";
import { CheckCircle2, CircleSlash, ScanLine } from "lucide-react";

import type { ScanRun } from "@/api/types";
import { useEventChannel } from "@/components/realtimeEventsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminLibraries } from "@/hooks/queries/admin/libraries";
import { useActiveScans } from "@/hooks/queries/admin/scans";
import { useAutoscanStatus } from "@/hooks/queries/useAutoscan";
import { formatRelativeTime } from "@/lib/date";
import { compareActiveScans } from "@/lib/scanRuns";
import { cn } from "@/lib/utils";
import { SectionError } from "../feedback";
import { formatDashboardLibraryScanProgress } from "../format";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

const VISIBLE_LIBRARIES = 4;

interface LibraryScanGroup {
  libraryID: number;
  primary: ScanRun;
  count: number;
}

/**
 * Groups the live scans by library and picks the one worth showing.
 *
 * Grouping is what makes the "+N more" the progress formatter appends true:
 * it counts other scans on the *same* library, which is what a reader assumes
 * when the row is titled with a library name.
 */
function groupActiveScansByLibrary(scans: ScanRun[]): LibraryScanGroup[] {
  const grouped = new Map<number, ScanRun[]>();
  for (const scan of scans) {
    if (scan.status !== "accepted" && scan.status !== "running") {
      continue;
    }
    const existing = grouped.get(scan.library_id);
    if (existing) {
      existing.push(scan);
      continue;
    }
    grouped.set(scan.library_id, [scan]);
  }

  const groups: LibraryScanGroup[] = [];
  for (const [libraryID, libraryScans] of grouped) {
    libraryScans.sort(compareActiveScans);
    const primary = libraryScans[0];
    if (!primary) {
      continue;
    }
    groups.push({ libraryID, primary, count: libraryScans.length });
  }
  return groups;
}

/**
 * Live scanner state.
 *
 * Active scans arrive only over the `scans` WebSocket channel — there is no
 * REST equivalent — so this subscribes to the channel and reads the cache
 * RealtimeEventsProvider hydrates. Queue depth and autoscan health come from
 * the autoscan status endpoint, which is the authority on work this process
 * has accepted but not started.
 */
export function ScannerWidget() {
  useUILanguage();
  useEventChannel("scans");
  const { data: activeScans = [] } = useActiveScans();
  const statusQuery = useAutoscanStatus();
  const librariesQuery = useAdminLibraries();
  const status = statusQuery.data;

  const libraryNames = useMemo(() => {
    const names = new Map<number, string>();
    for (const library of librariesQuery.data ?? []) {
      names.set(library.id, library.name);
    }
    return names;
  }, [librariesQuery.data]);

  const groups = useMemo(() => groupActiveScansByLibrary(activeScans), [activeScans]);
  const hiddenGroups = Math.max(0, groups.length - VISIBLE_LIBRARIES);
  const runningPolls = status?.running_polls?.length ?? 0;

  return (
    <Card className="h-full">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-bold">
          {tr("components.admin.dashboard.widgets.scanner_widget.scanner")}
        </CardTitle>
        <Link
          to="/admin/autoscan"
          className="text-muted-foreground hover:text-primary text-[11px] transition-colors"
        >
          {tr("components.admin.dashboard.widgets.scanner_widget.activity")}
        </Link>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {statusQuery.isLoading && groups.length === 0 ? (
          <Skeleton className="h-[92px] rounded-md" />
        ) : statusQuery.error && groups.length === 0 ? (
          <SectionError
            message={tr(
              "components.admin.dashboard.widgets.scanner_widget.failed_to_load_scanner_status",
            )}
          />
        ) : (
          <>
            {/* The queue counters lead: they are the widget's stable summary,
                while the per-library list below grows and shrinks with the
                scans that happen to be running. */}
            <div className="text-muted-foreground grid grid-cols-3 gap-2 text-[11px]">
              <QueueCount
                label={tr("components.admin.dashboard.widgets.scanner_widget.running")}
                value={status?.running_scans}
              />
              <QueueCount
                label={tr("components.admin.dashboard.widgets.scanner_widget.queued")}
                value={status?.accepted_scans}
              />
              <QueueCount
                label={tr("components.admin.dashboard.widgets.scanner_widget.polling")}
                value={runningPolls}
              />
            </div>

            <div className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-[11px]">
              <AutoscanState enabled={status?.enabled} />
              {status?.enabled ? (
                <>
                  <span className="text-border/70">·</span>
                  <span>
                    {tr("components.admin.dashboard.widgets.scanner_widget.last_event")}{" "}
                    {formatRelativeTime(status.latest_event_at, { rounding: "floor" }) ??
                      tr("components.admin.dashboard.widgets.scanner_widget.never")}
                  </span>
                </>
              ) : null}
            </div>

            <div className="border-border/60 border-t pt-3">
              {groups.length === 0 ? (
                <div className="text-muted-foreground flex items-center gap-2 py-1 text-sm">
                  <ScanLine className="h-4 w-4" aria-hidden="true" />
                  {tr("components.admin.dashboard.widgets.scanner_widget.no_scans_running")}
                </div>
              ) : (
                <div className="space-y-2">
                  {groups.slice(0, VISIBLE_LIBRARIES).map((group) => (
                    <div
                      key={group.libraryID}
                      className="bg-surface border-border rounded-md border p-2.5"
                    >
                      <div className="truncate text-[13px] font-semibold">
                        {libraryNames.get(group.libraryID) ??
                          tr(
                            "components.admin.dashboard.widgets.scanner_widget.library_library_id",
                            { libraryID: group.libraryID },
                          )}
                      </div>
                      <div className="text-muted-foreground mt-0.5 truncate text-[11px] tabular-nums">
                        {formatDashboardLibraryScanProgress(group.primary, group.count)}
                      </div>
                    </div>
                  ))}
                  {hiddenGroups > 0 ? (
                    <div className="text-muted-foreground text-[11px]">
                      + {hiddenGroups}{" "}
                      {tr("components.admin.dashboard.widgets.scanner_widget.more")}{" "}
                      {hiddenGroups === 1
                        ? tr("components.admin.dashboard.widgets.scanner_widget.library")
                        : tr("components.admin.dashboard.widgets.scanner_widget.libraries")}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function QueueCount({ label, value }: { label: string; value: number | undefined }) {
  useUILanguage();
  return (
    <div>
      <div className="text-foreground text-[18px] leading-none font-extrabold tabular-nums">
        {value === undefined ? "—" : value.toLocaleString()}
      </div>
      <div className="mt-1 font-medium">{label}</div>
    </div>
  );
}

function AutoscanState({ enabled }: { enabled: boolean | undefined }) {
  useUILanguage();
  if (enabled === undefined) {
    return (
      <span>{tr("components.admin.dashboard.widgets.scanner_widget.autoscan_status_unknown")}</span>
    );
  }
  const Icon = enabled ? CheckCircle2 : CircleSlash;
  return (
    <span className="flex items-center gap-1">
      <Icon className={cn("h-3.5 w-3.5", enabled && "text-emerald-500")} aria-hidden="true" />
      {tr("components.admin.dashboard.widgets.scanner_widget.autoscan")}{" "}
      {enabled
        ? tr("components.admin.dashboard.widgets.scanner_widget.enabled")
        : tr("components.admin.dashboard.widgets.scanner_widget.disabled")}
    </span>
  );
}
