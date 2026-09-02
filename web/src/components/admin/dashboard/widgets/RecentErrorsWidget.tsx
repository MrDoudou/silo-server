import { Link } from "react-router";
import { AlertTriangle, Info, XCircle } from "lucide-react";

import type { OperationalLogEntry } from "@/api/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOperationalLogs } from "@/hooks/queries/admin/logs";
import { formatRelativeTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { SectionError, UserSkeletonRows } from "../feedback";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

const ROW_LIMIT = 8;
/** One request for both levels — `level` takes a comma-separated list. */
const LEVELS = "error,warn";

/**
 * The newest error and warning lines from the operational log.
 *
 * Warnings sit beside errors on purpose: the log line that explains an error
 * is usually a warning logged moments earlier, and splitting them across two
 * widgets would hide that pairing.
 */
export function RecentErrorsWidget() {
  useUILanguage();
  const logsQuery = useOperationalLogs({ level: LEVELS, limit: ROW_LIMIT });
  const entries = logsQuery.data?.entries ?? [];

  return (
    <Card className="h-full">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-bold">
          {tr("components.admin.dashboard.widgets.recent_errors_widget.recent_errors")}
        </CardTitle>
        <Link
          to="/admin/logs"
          className="text-muted-foreground hover:text-primary text-[11px] transition-colors"
        >
          {tr("components.admin.dashboard.widgets.recent_errors_widget.all_logs")}
        </Link>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto">
        {logsQuery.isLoading ? (
          <UserSkeletonRows />
        ) : logsQuery.error ? (
          <SectionError
            message={tr(
              "components.admin.dashboard.widgets.recent_errors_widget.failed_to_load_recent_errors",
            )}
          />
        ) : entries.length === 0 ? (
          <div className="text-muted-foreground py-4 text-center text-sm">
            {tr(
              "components.admin.dashboard.widgets.recent_errors_widget.no_errors_or_warnings_logged",
            )}
          </div>
        ) : (
          <div className="space-y-0">
            {entries.slice(0, ROW_LIMIT).map((entry) => (
              <LogRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LogRow({ entry }: { entry: OperationalLogEntry }) {
  useUILanguage();
  const tone = levelTone(entry.level);
  const Icon = tone.icon;
  return (
    <div className="border-border/30 flex items-start gap-2.5 border-b py-2">
      {/* Icon + word: the level has to survive being read by someone who
          cannot tell the tints apart, and by a screenshot in grayscale. */}
      <span
        className={cn(
          "mt-0.5 flex flex-shrink-0 items-center gap-1 text-[10px] font-bold uppercase",
          tone.className,
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {tone.label}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs" title={entry.message}>
          {entry.message}
        </div>
        <div className="text-muted-foreground mt-0.5 text-[10px]">
          {entry.component || tr("components.admin.dashboard.widgets.recent_errors_widget.server")}
          {" · "}
          {formatRelativeTime(entry.timestamp, { rounding: "floor", justNowLabel: "Just now" }) ??
            entry.timestamp}
        </div>
      </div>
    </div>
  );
}

function levelTone(level: string) {
  switch (level.toLowerCase()) {
    case "error":
    case "fatal":
      return {
        label: tr("components.admin.dashboard.widgets.recent_errors_widget.error"),
        icon: XCircle,
        className: "text-destructive",
      };
    case "warn":
    case "warning":
      return {
        label: tr("components.admin.dashboard.widgets.recent_errors_widget.warn"),
        icon: AlertTriangle,
        className: "text-amber-500",
      };
    default:
      return {
        get label() {
          return level || tr("components.admin.dashboard.widgets.recent_errors_widget.log");
        },
        icon: Info,
        className: "text-muted-foreground",
      };
  }
}
