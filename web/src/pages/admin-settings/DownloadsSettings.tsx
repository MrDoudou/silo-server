import { useMemo } from "react";

import { AdvancedSection } from "@/components/settings/AdvancedSection";
import { LimitField } from "@/components/settings/LimitField";
import { PathSettingField } from "@/components/settings/PathSettingField";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { SettingsSubheading } from "@/components/settings/SettingsSubheading";
import { Skeleton } from "@/components/ui/skeleton";
import { useRestartKeys } from "@/hooks/useRestartKeys";
import { useSettingsForm } from "@/hooks/useSettingsForm";

import { FieldGroup } from "./FieldGroup";
import { SaveBar } from "./SaveBar";
import { SettingField } from "./SettingField";
import { effectiveDownloadArtifactDir } from "./settingsPathDefaults";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

// Decimal GB, matching how drives and object stores are sold and reported.
const BYTES_PER_GB = 1_000_000_000;

// Shown without a disclosure: whether offline downloads exist at all, and the
// one cap a household admin actually reaches for.
const ESSENTIAL_KEYS = ["download.enabled", "download.user_bandwidth_mbps"];

// Enforced per user: QuantityLimiter counts concurrency and period usage
// against a user ID (internal/downloads/limiter.go), and the bandwidth cap
// shapes each user's transfer. They are listed first, under their own
// heading, so they do not read as server-wide budgets.
const PER_USER_ADVANCED_KEYS = [
  "download.max_concurrent_per_user",
  "download.max_per_period",
  "download.period_duration",
];

// Enforced across the whole server.
const GLOBAL_ADVANCED_KEYS = [
  "download.server_bandwidth_mbps",
  "download.transcode_enabled",
  "download.local_transcode_fallback",
  "download.artifact_dir",
  "download.max_concurrent_prepares",
  "download.artifact_max_bytes",
];

const ADVANCED_KEYS = [...PER_USER_ADVANCED_KEYS, ...GLOBAL_ADVANCED_KEYS];

const KEYS = [...ESSENTIAL_KEYS, ...ADVANCED_KEYS];

export default function DownloadsSettings() {
  useUILanguage();
  const form = useSettingsForm({ keys: useMemo(() => KEYS, []) });
  const restartKeys = useRestartKeys();

  const anyDirty = (keys: string[]) => keys.some((key) => form.isDirty(key));
  const allRestart = (keys: string[]) => keys.every((key) => restartKeys.has(key));

  // Where a blank prepared-file directory actually resolves to. The transcode
  // directory it derives from belongs to the Playback page, which is its own
  // form instance, so this is the saved value: `getValue` falls through to the
  // full effective settings for keys this page does not stage.
  const derivedArtifactDir = effectiveDownloadArtifactDir(
    "",
    form.getValue("playback.transcode_dir"),
  );

  if (form.isLoading)
    return (
      <div
        className="space-y-6"
        role="status"
        aria-label={tr("pages.admin_settings.downloads_settings.loading_settings")}
      >
        <Skeleton className="h-8 w-40" />
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <span className="sr-only">
          {tr("pages.admin_settings.downloads_settings.loading_settings")}
        </span>
      </div>
    );

  return (
    <div className="flex h-full flex-col">
      <SettingsPageHeader
        title={tr("pages.admin_settings.downloads_settings.downloads")}
        className="mb-8"
      />

      <div className="flex-1 space-y-5">
        <FieldGroup
          label={tr("pages.admin_settings.downloads_settings.downloads")}
          restartAll={allRestart(KEYS)}
          dirty={anyDirty(KEYS)}
        >
          <SettingField
            label={tr("pages.admin_settings.downloads_settings.allow_downloads")}
            type="toggle"
            value={form.getValue("download.enabled")}
            onChange={(v) => form.setValue("download.enabled", v)}
            restartRequired={restartKeys.has("download.enabled")}
          />
          <LimitField
            label={tr("pages.admin_settings.downloads_settings.per_user_bandwidth")}
            unit="Mbps"
            value={form.getValue("download.user_bandwidth_mbps")}
            onChange={(v) => form.setValue("download.user_bandwidth_mbps", v)}
            restartRequired={restartKeys.has("download.user_bandwidth_mbps")}
          />

          <AdvancedSection
            id="downloads"
            count={ADVANCED_KEYS.length}
            forceOpen={anyDirty(ADVANCED_KEYS)}
          >
            <SettingsSubheading>
              {tr("pages.admin_settings.downloads_settings.per_user")}
            </SettingsSubheading>
            <LimitField
              label={tr("pages.admin_settings.downloads_settings.downloads_at_once_per_user")}
              hint={tr(
                "pages.admin_settings.downloads_settings.counted_per_user_alongside_the_per_user_bandwidth_cap_above",
              )}
              value={form.getValue("download.max_concurrent_per_user")}
              onChange={(v) => form.setValue("download.max_concurrent_per_user", v)}
              restartRequired={restartKeys.has("download.max_concurrent_per_user")}
            />
            <LimitField
              label={tr("pages.admin_settings.downloads_settings.downloads_per_period")}
              hint={tr(
                "pages.admin_settings.downloads_settings.how_many_each_user_may_start_in_the_period_below",
              )}
              value={form.getValue("download.max_per_period")}
              onChange={(v) => form.setValue("download.max_per_period", v)}
              restartRequired={restartKeys.has("download.max_per_period")}
            />
            <SettingField
              label={tr("pages.admin_settings.downloads_settings.period_length")}
              type="duration"
              description={tr(
                "pages.admin_settings.downloads_settings.rolling_window_each_user_s_count_is_measured_over_e",
              )}
              value={form.getValue("download.period_duration")}
              onChange={(v) => form.setValue("download.period_duration", v)}
              restartRequired={restartKeys.has("download.period_duration")}
            />

            <SettingsSubheading>
              {tr("pages.admin_settings.downloads_settings.whole_server")}
            </SettingsSubheading>
            <LimitField
              label={tr("pages.admin_settings.downloads_settings.server_bandwidth")}
              unit="Mbps"
              hint={tr(
                "pages.admin_settings.downloads_settings.all_downloads_on_this_server_combined",
              )}
              value={form.getValue("download.server_bandwidth_mbps")}
              onChange={(v) => form.setValue("download.server_bandwidth_mbps", v)}
              restartRequired={restartKeys.has("download.server_bandwidth_mbps")}
            />
            <SettingField
              label={tr("pages.admin_settings.downloads_settings.prepare_device_friendly_copies")}
              type="toggle"
              description={tr(
                "pages.admin_settings.downloads_settings.converts_a_file_the_device_cannot_play_before_download",
              )}
              value={form.getValue("download.transcode_enabled")}
              onChange={(v) => form.setValue("download.transcode_enabled", v)}
              restartRequired={restartKeys.has("download.transcode_enabled")}
            />
            <SettingField
              label={tr(
                "pages.admin_settings.downloads_settings.prepare_locally_when_workers_are_unavailable",
              )}
              type="toggle"
              description={tr(
                "pages.admin_settings.downloads_settings.this_is_separate_from_live_playback_routing",
              )}
              value={form.getValue("download.local_transcode_fallback") || "true"}
              onChange={(v) => form.setValue("download.local_transcode_fallback", v)}
              restartRequired={restartKeys.has("download.local_transcode_fallback")}
            />
            <PathSettingField
              label={tr("pages.admin_settings.downloads_settings.prepared_file_directory")}
              defaultValue={derivedArtifactDir}
              description={tr(
                "pages.admin_settings.downloads_settings.leave_blank_for_a_silo_download_artifacts_folder_beside_the",
              )}
              value={form.getValue("download.artifact_dir")}
              onChange={(v) => form.setValue("download.artifact_dir", v)}
              restartRequired={restartKeys.has("download.artifact_dir")}
            />
            {/* Not a LimitField: the server reads 0 as "use the built-in
                worker count" (2), not as unlimited. */}
            <SettingField
              label={tr("pages.admin_settings.downloads_settings.files_prepared_at_once")}
              type="number"
              description={tr(
                "pages.admin_settings.downloads_settings.value_0_uses_the_built_in_default_of_2",
              )}
              value={form.getValue("download.max_concurrent_prepares")}
              onChange={(v) => form.setValue("download.max_concurrent_prepares", v)}
              restartRequired={restartKeys.has("download.max_concurrent_prepares")}
            />
            {/* Stored as raw bytes (download.artifact_max_bytes); typed in GB
                because nobody sizes a disk budget in bytes. Unlimited stays
                the default and still writes the 0 sentinel. */}
            <LimitField
              label={tr("pages.admin_settings.downloads_settings.prepared_file_storage_budget")}
              unit="GB"
              scale={BYTES_PER_GB}
              hint={tr(
                "pages.admin_settings.downloads_settings.least_recently_used_files_are_deleted_first",
              )}
              value={form.getValue("download.artifact_max_bytes")}
              onChange={(v) => form.setValue("download.artifact_max_bytes", v)}
              restartRequired={restartKeys.has("download.artifact_max_bytes")}
            />
          </AdvancedSection>
        </FieldGroup>
      </div>

      <SaveBar
        dirtyCount={form.dirtyCount}
        onSave={form.save}
        onDiscard={form.discard}
        isSaving={form.isSaving}
      />
    </div>
  );
}
