import type { HostDiskStats } from "@/api/types";

const BYTES_PER_GIBIBYTE = 1024 ** 3;

export interface DiskUsage {
  used: string;
  total: string;
  percent: number;
}

/** Capacity and usage labels for one measured filesystem. */
export function describeDiskUsage(disk: HostDiskStats): DiskUsage | null {
  const usedGB = disk.used_gb;
  const totalGB = disk.total_gb;
  if (
    disk.unavailable ||
    usedGB === undefined ||
    totalGB === undefined ||
    !Number.isFinite(usedGB) ||
    !Number.isFinite(totalGB) ||
    totalGB <= 0
  ) {
    return null;
  }

  return {
    used: formatStorageSize(usedGB * BYTES_PER_GIBIBYTE),
    total: formatStorageSize(totalGB * BYTES_PER_GIBIBYTE),
    percent: Math.min(100, Math.max(0, Math.round((usedGB / totalGB) * 100))),
  };
}

/** Library bytes indexed by Silo compared with the largest library volume. */
export function describeLibraryStorage(
  usedBytes: number | undefined,
  disks: readonly HostDiskStats[],
): { percent: string; detail: string } {
  const used =
    Number.isFinite(usedBytes) && usedBytes !== undefined ? Math.max(0, usedBytes) : null;
  const capacity = primaryLibraryCapacityBytes(disks);
  if (used === null) {
    return { percent: "—", detail: "size unavailable" };
  }
  if (capacity === null) {
    return { percent: "—", detail: `${formatStorageSize(used)} indexed` };
  }

  const rawPercent = Math.min(100, (used / capacity) * 100);
  const percent = rawPercent > 0 && rawPercent < 1 ? "<1%" : `${Math.round(rawPercent)}%`;
  return {
    percent,
    detail: `${formatStorageSize(used)} / ${formatStorageSize(capacity)}`,
  };
}

/**
 * Capacity of the primary library pool.
 *
 * The sampler already deduplicates filesystems that publish an identity. Some
 * FUSE mounts cannot, so taking the largest library entry avoids multiplying a
 * shared pool once for every library rooted inside it.
 */
export function primaryLibraryCapacityBytes(disks: readonly HostDiskStats[]): number | null {
  const measured = disks.filter((disk) => describeDiskUsage(disk) !== null);
  const libraryDisks = measured.filter((disk) => !disk.scratch);
  const candidates = libraryDisks.length > 0 ? libraryDisks : measured;
  if (candidates.length === 0) {
    return null;
  }
  return Math.max(...candidates.map((disk) => disk.total_gb ?? 0)) * BYTES_PER_GIBIBYTE;
}

export function formatStorageSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const maximumFractionDigits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toLocaleString(undefined, { maximumFractionDigits })} ${units[unitIndex]}`;
}
