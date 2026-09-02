import { useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminDownloadsStats } from "@/hooks/queries/admin/dashboardInsights";
import { formatFileSize } from "@/lib/mediaFormat";
import { BarList, BarListSkeleton } from "../charts";
import type { BarListItem } from "../charts";
import { SectionError } from "../feedback";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

const ROW_LIMIT = 8;

/**
 * Who keeps media downloaded for offline use, and how much.
 *
 * Headline numbers and the per-account list count active managed device
 * entries — media a device holds (or is fetching) offline — while one-shot web
 * downloads only show in the 24h line. Bytes are the completed entries' file
 * sizes: what sits on devices as far as the server can know without devices
 * reporting back. All zeros is a real state, not a failure, so it renders as
 * "No offline downloads".
 */
export function DownloadsWidget() {
  useUILanguage();
  const query = useAdminDownloadsStats();
  const stats = query.data;
  const items = useMemo<BarListItem[]>(
    () =>
      (stats?.top_users ?? []).slice(0, ROW_LIMIT).map((user) => ({
        id: String(user.user_id),
        get label() {
          return (
            user.username ||
            tr("components.admin.dashboard.widgets.downloads_widget.user_user_id", {
              userId: user.user_id,
            })
          );
        },
        value: user.downloads,
        secondary: formatFileSize(user.total_bytes, { fallback: "" }),
      })),
    [stats],
  );

  const hasDownloads =
    (stats?.active_downloads ?? 0) > 0 || (stats?.downloads_started_24h ?? 0) > 0;

  return (
    <Card className="h-full">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-sm font-bold">
          {tr("components.admin.dashboard.widgets.downloads_widget.offline_downloads")}
        </CardTitle>
        {stats && hasDownloads ? (
          <span className="text-muted-foreground text-[11px] whitespace-nowrap tabular-nums">
            {stats.downloads_started_24h.toLocaleString()}{" "}
            {tr("components.admin.dashboard.widgets.downloads_widget.started")}{" "}
            {stats.downloads_completed_24h.toLocaleString()}{" "}
            {tr("components.admin.dashboard.widgets.downloads_widget.finished_24h")}
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {query.isLoading ? (
          <BarListSkeleton />
        ) : query.error ? (
          <SectionError
            message={tr(
              "components.admin.dashboard.widgets.downloads_widget.failed_to_load_download_activity",
            )}
          />
        ) : !stats || !hasDownloads ? (
          <div className="text-muted-foreground py-4 text-center text-sm">
            {tr("components.admin.dashboard.widgets.downloads_widget.no_offline_downloads")}
          </div>
        ) : (
          <>
            <dl className="grid shrink-0 grid-cols-3 gap-2">
              <DownloadsStat
                label={tr("components.admin.dashboard.widgets.downloads_widget.users")}
                value={stats.users_with_downloads.toLocaleString()}
              />
              <DownloadsStat
                label={tr("components.admin.dashboard.widgets.downloads_widget.items")}
                value={stats.active_downloads.toLocaleString()}
              />
              <DownloadsStat
                label={tr("components.admin.dashboard.widgets.downloads_widget.on_devices")}
                value={formatFileSize(stats.total_bytes, { fallback: "0 B" })}
              />
            </dl>
            <BarList
              items={items}
              formatValue={(count) => `${count.toLocaleString()} ${count === 1 ? "item" : "items"}`}
              emptyLabel="No offline downloads"
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DownloadsStat({ label, value }: { label: string; value: string }) {
  useUILanguage();
  return (
    <div className="surface-panel-subtle rounded-lg px-2.5 py-2">
      <dt className="text-muted-foreground text-[11px] leading-none font-medium">{label}</dt>
      <dd className="mt-1 text-lg leading-none font-extrabold tracking-tight tabular-nums">
        {value}
      </dd>
    </div>
  );
}
