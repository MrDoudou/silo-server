import { describe, expect, it } from "vitest";

import {
  describeDiskUsage,
  describeLibraryStorage,
  formatStorageSize,
  primaryLibraryCapacityBytes,
} from "./storageMetrics";

describe("storage metrics", () => {
  it("formats large capacities with compact units", () => {
    expect(formatStorageSize(900 * 1024 ** 3)).toBe("900 GB");
    expect(formatStorageSize(14 * 1024 ** 4)).toBe("14 TB");
  });

  it("describes one filesystem using its real fill percentage", () => {
    expect(describeDiskUsage({ used_gb: 900, total_gb: 14 * 1024 })).toEqual({
      used: "900 GB",
      total: "14 TB",
      percent: 6,
    });
  });

  it("uses the largest library volume without counting scratch", () => {
    const disks = [
      { scratch: true, used_gb: 5, total_gb: 20 },
      { role: "library-1", used_gb: 900, total_gb: 14 * 1024 },
      { role: "library-2", used_gb: 900, total_gb: 14 * 1024 },
    ];

    expect(primaryLibraryCapacityBytes(disks)).toBe(14 * 1024 ** 4);
  });

  it("compares indexed Silo files with the library capacity", () => {
    expect(
      describeLibraryStorage(900 * 1024 ** 3, [
        { scratch: true, used_gb: 5, total_gb: 20 },
        { role: "library-1", used_gb: 900, total_gb: 14 * 1024 },
      ]),
    ).toEqual({ percent: "6%", detail: "900 GB / 14 TB" });
  });
});
