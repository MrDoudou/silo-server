import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  Power,
  PowerOff,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { AdvancedSection } from "@/components/settings/AdvancedSection";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import {
  useInstallJellyfinCompatWeb,
  useJellyfinCompatStatus,
  useRemoveJellyfinCompatWeb,
  useUpdateJellyfinCompatSettings,
} from "@/hooks/queries/admin/settings";
import { hasPinnedJellyfinWebInstalled } from "@/lib/jellyfinCompat";
import { useRestartKeys } from "@/hooks/useRestartKeys";
import { useSettingsForm } from "@/hooks/useSettingsForm";

import { FieldGroup } from "./FieldGroup";
import { SaveBar } from "./SaveBar";
import { SettingField, SettingFieldStatus } from "./SettingField";
import { formatDateTime } from "@/lib/datetime";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

const JELLYFIN_ADVANCED_KEYS = [
  "jellyfin_compat.server_name",
  "jellyfin_compat.server_id",
  "jellyfin_compat.emulated_server_version",
  "jellyfin_compat.session_ttl",
  "jellyfin_compat.playback_session_ttl",
  "jellyfin_compat.web_version",
  "jellyfin_compat.web_install_dir",
];

const JELLYFIN_KEYS = [
  "jellyfin_compat.enabled",
  "jellyfin_compat.public_url",
  "jellyfin_compat.web_enabled",
  ...JELLYFIN_ADVANCED_KEYS,
];

const AUDIOBOOKSHELF_KEYS = ["audiobookshelf_compat.enabled"];

const KEYS = [...JELLYFIN_KEYS, ...AUDIOBOOKSHELF_KEYS];

// Installing or removing the Jellyfin Web files uses the saved values, so the
// buttons stay disabled while either of these is only staged in the form.
const WEB_INSTALL_KEYS = ["jellyfin_compat.web_version", "jellyfin_compat.web_install_dir"];

function statusLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// `web_state` is an internal enum; admins get plain wording instead.
const WEB_STATE_LABELS: Record<string, string> = {
  missing: "pages.admin_settings.compatibility_proxies_settings.not_installed",
  installed: "pages.admin_settings.compatibility_proxies_settings.installed",
  update_available: "pages.admin_settings.compatibility_proxies_settings.update_available",
  installing: "pages.admin_settings.compatibility_proxies_settings.installing",
  removing: "pages.admin_settings.compatibility_proxies_settings.removing",
  failed: "pages.admin_settings.compatibility_proxies_settings.install_failed",
};

function webStateLabel(value?: string): string {
  if (!value) return tr("pages.admin_settings.compatibility_proxies_settings.unknown");
  const knownLabel = WEB_STATE_LABELS[value];
  return knownLabel ? tr(knownLabel) : statusLabel(value);
}

function operationTitle(kind?: string): string {
  return kind === "remove"
    ? tr("pages.admin_settings.compatibility_proxies_settings.removing_jellyfin_web_ui")
    : tr("pages.admin_settings.compatibility_proxies_settings.installing_jellyfin_web_ui");
}

function formatTimestamp(value?: string): string {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return formatDateTime(parsed);
}

function formatOperationPhase(value?: string): string {
  if (!value) return "Working";
  return statusLabel(value);
}

function clampProgressPercent(value?: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function StatusLine({
  label,
  value,
  mono = false,
}: {
  label: string;
  value?: string | boolean;
  mono?: boolean;
}) {
  useUILanguage();
  return (
    <div className="flex min-h-9 items-center justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "max-w-[60%] truncate font-mono text-xs" : "text-right"}>
        {typeof value === "boolean"
          ? value
            ? tr("common.actions.yes")
            : tr("common.actions.no")
          : value || tr("pages.admin_settings.compatibility_proxies_settings.not_set")}
      </span>
    </div>
  );
}

export default function CompatibilityProxiesSettings() {
  useUILanguage();
  const form = useSettingsForm({ keys: useMemo(() => KEYS, []) });
  const restartKeys = useRestartKeys();
  const allRestart = (keys: string[]) => keys.every((key) => restartKeys.has(key));
  const statusQuery = useJellyfinCompatStatus();
  const installWeb = useInstallJellyfinCompatWeb();
  const removeWeb = useRemoveJellyfinCompatWeb();
  const updateCompatSettings = useUpdateJellyfinCompatSettings();
  const status = statusQuery.data;
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  if (form.isLoading || statusQuery.isLoading)
    return (
      <div
        className="space-y-6"
        role="status"
        aria-label={tr("pages.admin_settings.compatibility_proxies_settings.loading_settings")}
      >
        <Skeleton className="h-8 w-56" />
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <span className="sr-only">
          {tr("pages.admin_settings.compatibility_proxies_settings.loading_settings")}
        </span>
      </div>
    );

  const dirtyKeys: string[] = form.dirtyKeys ?? [];
  const isDirty = (key: string) => dirtyKeys.includes(key);
  const hasDirtyWebConfig = dirtyKeys.some((key) => WEB_INSTALL_KEYS.includes(key));
  const jellyfinAdvancedDirty = JELLYFIN_ADVANCED_KEYS.filter((key) => isDirty(key));
  const operationRunning =
    status?.operation?.state === "running" ||
    status?.web_state === "installing" ||
    status?.web_state === "removing";
  const missingPrerequisites = status?.prerequisites?.filter((item) => !item.available) ?? [];
  const jellyfinEnabledValue = form.getValue("jellyfin_compat.enabled");
  const jellyfinEnabledChecked =
    jellyfinEnabledValue === "" ? Boolean(status?.enabled) : jellyfinEnabledValue === "true";
  const jellyfinProxyRunning = Boolean(status?.enabled);
  const jellyfinWebServing = jellyfinProxyRunning && status?.web_enabled !== false;
  const installedWebAssetsPresent = Boolean(status?.installed_version);
  const pinnedJellyfinWebInstalled = hasPinnedJellyfinWebInstalled(status);

  const setJellyfinAPIEnabled = (value: string) => {
    form.setValue("jellyfin_compat.enabled", value);
    if (value === "false") {
      form.setValue("jellyfin_compat.web_enabled", "false");
    }
  };
  const installJellyfinWeb = () => {
    const version = form.getValue("jellyfin_compat.web_version").trim();
    installWeb.mutate(version ? { version } : {});
  };

  return (
    <div className="flex h-full flex-col">
      <SettingsPageHeader
        title={tr("pages.admin_settings.compatibility_proxies_settings.compatibility")}
        className="mb-8"
      />

      <div className="flex-1 space-y-5">
        <FieldGroup
          label={tr("pages.admin_settings.compatibility_proxies_settings.jellyfin")}
          restartAll={allRestart(JELLYFIN_KEYS)}
        >
          <SettingField
            label={tr(
              "pages.admin_settings.compatibility_proxies_settings.allow_jellyfin_apps_to_connect",
            )}
            type="toggle"
            value={jellyfinEnabledChecked ? "true" : "false"}
            onChange={setJellyfinAPIEnabled}
            disabled={form.isSaving}
            restartRequired={restartKeys.has("jellyfin_compat.enabled")}
          />

          <SettingField
            label={tr(
              "pages.admin_settings.compatibility_proxies_settings.address_jellyfin_apps_should_use",
            )}
            hint={tr("pages.admin_settings.compatibility_proxies_settings.https_media_example_com")}
            value={form.getValue("jellyfin_compat.public_url")}
            onChange={(v) => form.setValue("jellyfin_compat.public_url", v)}
            restartRequired={restartKeys.has("jellyfin_compat.public_url")}
          />

          {status?.last_error && (
            <div className="bg-destructive/10 text-destructive my-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{status.last_error}</span>
            </div>
          )}

          <div className="space-y-4 py-3.5">
            <div>
              <h4 className="text-sm font-medium">
                {tr("pages.admin_settings.compatibility_proxies_settings.jellyfin_web_player")}
              </h4>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                {tr(
                  "pages.admin_settings.compatibility_proxies_settings.jellyfin_mobile_and_tv_apps_expect_to_find_it_on",
                )}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                <SettingFieldStatus tone={installedWebAssetsPresent ? "ok" : "muted"}>
                  {installedWebAssetsPresent
                    ? tr(
                        "pages.admin_settings.compatibility_proxies_settings.version_installed_version_installed",
                        {
                          installed_version: status?.installed_version,
                        },
                      )
                    : webStateLabel(status?.web_state)}
                </SettingFieldStatus>
                {jellyfinProxyRunning && installedWebAssetsPresent ? (
                  <SettingFieldStatus tone={jellyfinWebServing ? "ok" : "muted"}>
                    {jellyfinWebServing
                      ? tr("pages.admin_settings.compatibility_proxies_settings.served_to_clients")
                      : tr(
                          "pages.admin_settings.compatibility_proxies_settings.not_served_to_clients",
                        )}
                  </SettingFieldStatus>
                ) : null}
                {status?.installer_ready === false ? (
                  <SettingFieldStatus tone="warn">
                    {tr(
                      "pages.admin_settings.compatibility_proxies_settings.downloader_is_missing_required_tools",
                    )}
                  </SettingFieldStatus>
                ) : null}
              </div>
            </div>

            {status?.operation?.state === "running" &&
              (() => {
                const progress = clampProgressPercent(status.operation.progress_percent);
                const phase = formatOperationPhase(status.operation.phase);
                const message =
                  status.operation.message ||
                  (status.operation.kind === "remove"
                    ? "Removing the downloaded Jellyfin web player"
                    : "Downloading the Jellyfin web player and building it");

                return (
                  <div className="border-border/70 bg-muted/30 flex items-start gap-3 rounded-lg border px-3 py-3 text-sm">
                    <Loader2 className="text-muted-foreground mt-0.5 h-4 w-4 flex-shrink-0 animate-spin" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{operationTitle(status.operation.kind)}</p>
                        {progress !== null && (
                          <span className="text-muted-foreground text-xs font-medium">
                            {progress}%
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        <p className="text-muted-foreground leading-relaxed">{message}</p>
                        <p className="text-muted-foreground text-xs">{phase}</p>
                      </div>
                      {progress !== null && (
                        <Progress
                          value={progress}
                          aria-label={tr(
                            "pages.admin_settings.compatibility_proxies_settings.jellyfin_web_install_progress",
                          )}
                        />
                      )}
                      <p className="text-muted-foreground text-xs">
                        {tr("pages.admin_settings.compatibility_proxies_settings.started")}{" "}
                        {formatTimestamp(status.operation.started_at)}
                      </p>
                    </div>
                  </div>
                );
              })()}

            <div className="flex flex-wrap items-center gap-2">
              {!pinnedJellyfinWebInstalled && (
                <Button
                  type="button"
                  size="sm"
                  onClick={installJellyfinWeb}
                  disabled={
                    hasDirtyWebConfig ||
                    installWeb.isPending ||
                    operationRunning ||
                    status?.installer_ready === false
                  }
                >
                  <Download className="mr-2 h-4 w-4" />
                  {status?.web_state === "update_available"
                    ? tr("pages.admin_settings.compatibility_proxies_settings.update_web_ui")
                    : operationRunning
                      ? tr("pages.admin_settings.compatibility_proxies_settings.web_ui_busy")
                      : tr("pages.admin_settings.compatibility_proxies_settings.install_web_ui")}
                </Button>
              )}
              {installedWebAssetsPresent && (
                <Button
                  type="button"
                  size="sm"
                  variant={jellyfinWebServing ? "outline" : "default"}
                  onClick={() => updateCompatSettings.mutate({ web_enabled: !jellyfinWebServing })}
                  disabled={
                    !jellyfinProxyRunning || updateCompatSettings.isPending || operationRunning
                  }
                >
                  {jellyfinWebServing ? (
                    <PowerOff className="mr-2 h-4 w-4" />
                  ) : (
                    <Power className="mr-2 h-4 w-4" />
                  )}
                  {jellyfinWebServing
                    ? tr("pages.admin_settings.compatibility_proxies_settings.disable_web_ui")
                    : tr("pages.admin_settings.compatibility_proxies_settings.enable_web_ui")}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => removeWeb.mutate()}
                disabled={
                  hasDirtyWebConfig ||
                  removeWeb.isPending ||
                  operationRunning ||
                  status?.web_state === "missing"
                }
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {tr("pages.admin_settings.compatibility_proxies_settings.remove_web_ui")}
              </Button>
              {hasDirtyWebConfig && (
                <span className="text-muted-foreground text-sm">
                  {tr(
                    "pages.admin_settings.compatibility_proxies_settings.save_your_changes_before_installing_or_removing_the_web_player",
                  )}
                </span>
              )}
              {missingPrerequisites.length > 0 && (
                <span className="text-muted-foreground text-sm">
                  {tr(
                    "pages.admin_settings.compatibility_proxies_settings.silo_cannot_download_it_until_these_commands_are_installed_on",
                  )}{" "}
                  {missingPrerequisites.map((item) => item.command).join(", ")}
                </span>
              )}
              {pinnedJellyfinWebInstalled && (
                <span className="text-muted-foreground inline-flex items-center gap-1 text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  {tr(
                    "pages.admin_settings.compatibility_proxies_settings.the_chosen_version_is_installed",
                  )}
                </span>
              )}
              {status?.license_present && status?.provenance_present ? (
                <span className="text-muted-foreground inline-flex items-center gap-1 text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  {tr(
                    "pages.admin_settings.compatibility_proxies_settings.license_and_download_record_present",
                  )}
                </span>
              ) : null}
            </div>

            <div>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                aria-expanded={showDiagnostics}
                onClick={() => setShowDiagnostics((current) => !current)}
              >
                {showDiagnostics
                  ? tr("pages.admin_settings.compatibility_proxies_settings.hide_download_details")
                  : tr("pages.admin_settings.compatibility_proxies_settings.show_download_details")}
              </Button>
              {showDiagnostics && (
                <div className="grid gap-x-8 pt-2 md:grid-cols-2">
                  <StatusLine
                    label={tr("pages.admin_settings.compatibility_proxies_settings.api_state")}
                    value={status ? statusLabel(status.api_state) : ""}
                  />
                  <StatusLine
                    label={tr("pages.admin_settings.compatibility_proxies_settings.listen_address")}
                    value={status?.listen}
                    mono
                  />
                  <StatusLine
                    label={tr(
                      "pages.admin_settings.compatibility_proxies_settings.public_url_in_use",
                    )}
                    value={status?.public_url}
                    mono
                  />
                  <StatusLine
                    label={tr(
                      "pages.admin_settings.compatibility_proxies_settings.jellyfin_version_reported",
                    )}
                    value={status?.emulated_server_version}
                  />
                  <StatusLine
                    label={tr("pages.admin_settings.compatibility_proxies_settings.version_chosen")}
                    value={status?.pinned_version}
                  />
                  <StatusLine
                    label={tr("pages.admin_settings.compatibility_proxies_settings.current_job")}
                    value={
                      status?.operation
                        ? `${statusLabel(status.operation.kind)} ${statusLabel(status.operation.state)}`
                        : "None"
                    }
                  />
                  <StatusLine
                    label={tr(
                      "pages.admin_settings.compatibility_proxies_settings.downloaded_from",
                    )}
                    value={status?.source_url}
                    mono
                  />
                  <StatusLine
                    label={tr("pages.admin_settings.compatibility_proxies_settings.source_commit")}
                    value={status?.commit_sha}
                    mono
                  />
                  <StatusLine
                    label={tr("pages.admin_settings.compatibility_proxies_settings.checksum")}
                    value={status?.checksum}
                    mono
                  />
                  <StatusLine
                    label={tr("pages.admin_settings.compatibility_proxies_settings.installed_at")}
                    value={status?.install_path}
                    mono
                  />
                  <StatusLine
                    label={tr(
                      "pages.admin_settings.compatibility_proxies_settings.license_file_present",
                    )}
                    value={status?.license_present}
                  />
                  <StatusLine
                    label={tr(
                      "pages.admin_settings.compatibility_proxies_settings.download_record_present",
                    )}
                    value={status?.provenance_present}
                  />
                </div>
              )}
            </div>
          </div>

          <AdvancedSection
            id="compatibility.jellyfin"
            count={JELLYFIN_ADVANCED_KEYS.length}
            forceOpen={jellyfinAdvancedDirty.length > 0}
          >
            <SettingField
              label={tr(
                "pages.admin_settings.compatibility_proxies_settings.name_shown_to_jellyfin_apps",
              )}
              description={tr(
                "pages.admin_settings.compatibility_proxies_settings.defaults_to_your_silo_server_name",
              )}
              value={form.getValue("jellyfin_compat.server_name")}
              onChange={(v) => form.setValue("jellyfin_compat.server_name", v)}
              restartRequired={restartKeys.has("jellyfin_compat.server_name")}
            />
            <SettingField
              label={tr("pages.admin_settings.compatibility_proxies_settings.server_id")}
              description={tr(
                "pages.admin_settings.compatibility_proxies_settings.changing_it_makes_saved_clients_treat_silo_as_a_new",
              )}
              value={form.getValue("jellyfin_compat.server_id")}
              onChange={(v) => form.setValue("jellyfin_compat.server_id", v)}
              restartRequired={restartKeys.has("jellyfin_compat.server_id")}
            />
            <SettingField
              label={tr(
                "pages.admin_settings.compatibility_proxies_settings.jellyfin_version_to_report",
              )}
              description={tr(
                "pages.admin_settings.compatibility_proxies_settings.leave_as_is_unless_an_app_refuses_to_connect",
              )}
              value={form.getValue("jellyfin_compat.emulated_server_version")}
              onChange={(v) => form.setValue("jellyfin_compat.emulated_server_version", v)}
              restartRequired={restartKeys.has("jellyfin_compat.emulated_server_version")}
            />
            <SettingField
              label={tr("pages.admin_settings.compatibility_proxies_settings.stay_signed_in_for")}
              type="duration"
              description={tr(
                "pages.admin_settings.compatibility_proxies_settings.for_example_24h",
              )}
              value={form.getValue("jellyfin_compat.session_ttl")}
              onChange={(v) => form.setValue("jellyfin_compat.session_ttl", v)}
              restartRequired={restartKeys.has("jellyfin_compat.session_ttl")}
            />
            <SettingField
              label={tr(
                "pages.admin_settings.compatibility_proxies_settings.forget_idle_playback_after",
              )}
              type="duration"
              description={tr("pages.admin_settings.compatibility_proxies_settings.for_example_6h")}
              value={form.getValue("jellyfin_compat.playback_session_ttl")}
              onChange={(v) => form.setValue("jellyfin_compat.playback_session_ttl", v)}
              restartRequired={restartKeys.has("jellyfin_compat.playback_session_ttl")}
            />
            <SettingField
              label={tr(
                "pages.admin_settings.compatibility_proxies_settings.web_player_version_to_install",
              )}
              description={tr(
                "pages.admin_settings.compatibility_proxies_settings.leave_blank_to_match_the_reported_jellyfin_version",
              )}
              value={form.getValue("jellyfin_compat.web_version")}
              onChange={(v) => form.setValue("jellyfin_compat.web_version", v)}
              restartRequired={restartKeys.has("jellyfin_compat.web_version")}
            />
            <SettingField
              label={tr(
                "pages.admin_settings.compatibility_proxies_settings.web_player_install_folder",
              )}
              description={tr(
                "pages.admin_settings.compatibility_proxies_settings.leave_blank_to_use_the_folder_silo_manages",
              )}
              value={form.getValue("jellyfin_compat.web_install_dir")}
              onChange={(v) => form.setValue("jellyfin_compat.web_install_dir", v)}
              restartRequired={restartKeys.has("jellyfin_compat.web_install_dir")}
            />
          </AdvancedSection>
        </FieldGroup>

        <FieldGroup
          label={tr("pages.admin_settings.compatibility_proxies_settings.audiobookshelf")}
          restartAll={allRestart(AUDIOBOOKSHELF_KEYS)}
        >
          <SettingField
            label={tr(
              "pages.admin_settings.compatibility_proxies_settings.allow_audiobookshelf_apps_to_connect",
            )}
            type="toggle"
            value={form.getValue("audiobookshelf_compat.enabled")}
            onChange={(v) => form.setValue("audiobookshelf_compat.enabled", v)}
            restartRequired={restartKeys.has("audiobookshelf_compat.enabled")}
          />
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
