import { HardDrive } from "lucide-react";

import type { HostDiskStats } from "@/api/types";
import { Skeleton } from "@/components/ui/skeleton";
import { useSystemResources } from "@/hooks/queries/admin/system";
import { usePageActivity } from "@/hooks/usePageActivity";
import { describeDiskUsage } from "./storageMetrics";

/** Each sampled Silo filesystem rendered as its own compact card. */
export function StorageVolumesWidget() {
  const pageActivity = usePageActivity();
  const resourcesQuery = useSystemResources(pageActivity.canPollDashboard);
  const disks = resourcesQuery.data?.system?.disks ?? [];

  if (resourcesQuery.isLoading || (!resourcesQuery.data && !resourcesQuery.error)) {
    return (
      <div className="grid h-full gap-3 sm:grid-cols-2">
        <Skeleton className="min-h-24 rounded-2xl" />
        <Skeleton className="min-h-24 rounded-2xl" />
      </div>
    );
  }
  if (resourcesQuery.isError || disks.length === 0) {
    return (
      <div className="surface-panel text-muted-foreground flex h-full min-h-24 items-center justify-center rounded-2xl p-4 text-center text-sm">
        No Silo storage volume was reported.
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 gap-3 overflow-y-auto sm:grid-cols-2">
      {disks.map((disk, index) => (
        <StorageVolumeCard key={`${disk.path ?? disk.role ?? "volume"}-${index}`} disk={disk} />
      ))}
    </div>
  );
}

function StorageVolumeCard({ disk }: { disk: HostDiskStats }) {
  const usage = describeDiskUsage(disk);
  const label = disk.path?.trim() || disk.role?.trim() || "Storage volume";
  const tooltip = [
    disk.scratch ? "Transcode working volume" : "Library volume",
    label,
    disk.stale ? "The current probe is stale; these are the last successful values." : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return (
    <div
      className="surface-panel flex min-h-24 flex-col justify-center overflow-hidden rounded-2xl p-4"
      title={tooltip}
    >
      <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
        <div className="text-muted-foreground truncate text-[11px] leading-none font-medium">
          {label}
        </div>
        <HardDrive className="text-muted-foreground h-4 w-4 shrink-0" />
      </div>
      <div className="mb-0.5 text-[28px] leading-none font-extrabold tracking-tight tabular-nums">
        {usage ? `${usage.percent}%` : "—"}
      </div>
      <div className="text-muted-foreground truncate text-[11px] tabular-nums">
        {usage
          ? `${usage.used} / ${usage.total}${disk.stale ? " · stale" : ""}`
          : disk.unavailable
            ? "unavailable"
            : "capacity not reported"}
      </div>
    </div>
  );
}
