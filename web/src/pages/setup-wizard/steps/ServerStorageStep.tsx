import { useState, useEffect, useMemo } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiClientError, api } from "@/api/client";
import type { ConnectionCheckResponse } from "@/api/types";
import { ConnectionCheckAction } from "@/components/admin/ConnectionCheckAction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, CheckCircle2, ChevronRight, Download } from "lucide-react";
import { toast } from "@/i18n/toast";
import {
  useCheckAdminSettingsConnection,
  useInstallJellyfinCompatWeb,
  useJellyfinCompatStatus,
} from "@/hooks/queries/admin/settings";
import { hasPinnedJellyfinWebInstalled } from "@/lib/jellyfinCompat";
import { useSettingsForm } from "@/hooks/useSettingsForm";

import { SettingField } from "@/pages/admin-settings/SettingField";
import { useWizardContext } from "../WizardContext";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

const SERVER_KEYS = [
  "redis.url",
  "playback.ffmpeg_path",
  "playback.transcode_dir",
  "playback.hw_accel",
  "playback.transcode_enabled",
  "jellyfin_compat.enabled",
  "jellyfin_compat.public_url",
  "jellyfin_compat.server_name",
  "jellyfin_compat.web_version",
  "jellyfin_compat.web_install_dir",
];

const PUBLIC_S3_KEYS = [
  "s3.public_endpoint",
  "s3.public_bucket",
  "s3.public_key_prefix",
  "s3.public_access_key",
  "s3.public_secret_key",
  "s3.public_url_auth",
  "s3.public_read_endpoint",
];

const PRIVATE_S3_KEYS = [
  "s3.private_endpoint",
  "s3.private_bucket",
  "s3.private_key_prefix",
  "s3.private_access_key",
  "s3.private_secret_key",
];

const META_KEYS = ["metadata.cache_images"];

const ALL_KEYS = [...SERVER_KEYS, ...PUBLIC_S3_KEYS, ...PRIVATE_S3_KEYS, ...META_KEYS];

async function fetchSettingValue(key: string): Promise<string | null> {
  try {
    const result = await api<{ key: string; value: string }>(
      `/admin/settings/${encodeURIComponent(key)}`,
    );
    return result?.value ?? null;
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) return null;
    throw err;
  }
}

function Section({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  useUILanguage();
  return (
    <div className="border-foreground/[0.07] bg-foreground/[0.03] space-y-4 rounded-xl border px-4 py-4">
      <div>
        <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.1em] uppercase">
          {label}
        </p>
        {description && <p className="text-muted-foreground/70 mt-0.5 text-xs">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function StorageBlock({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  useUILanguage();
  return (
    <div className="border-foreground/[0.07] bg-foreground/[0.03] rounded-xl border px-4 py-4">
      <button
        type="button"
        onClick={onToggle}
        className="text-muted-foreground hover:text-foreground flex w-full items-center gap-2 text-left transition-colors"
      >
        <ChevronRight
          className={
            "h-3.5 w-3.5 transition-transform duration-200 " + (expanded ? "rotate-90" : "")
          }
        />
        <span className="text-[11px] font-semibold tracking-[0.1em] uppercase">{title}</span>
      </button>

      {expanded && (
        <div className="mt-4 animate-[fade-in_0.15s_ease-out] space-y-4">{children}</div>
      )}
    </div>
  );
}

function KeyPrefixField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  useUILanguage();
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {tr("pages.setup_wizard.steps.server_storage_step.key_prefix")}
      </Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={tr("pages.setup_wizard.steps.server_storage_step.silo_dev")}
      />
      <p className="text-muted-foreground/70 text-xs">
        {tr(
          "pages.setup_wizard.steps.server_storage_step.optional_stores_all_silo_objects_under_this_folder_inside_the",
        )}
      </p>
    </div>
  );
}

function statusLabel(value?: string): string {
  if (!value) return "Unknown";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ServerStorageStep() {
  useUILanguage();
  const { markDone } = useWizardContext();
  const form = useSettingsForm({ keys: useMemo(() => ALL_KEYS, []) });
  const redisConnectionCheck = useCheckAdminSettingsConnection();
  const publicS3ConnectionCheck = useCheckAdminSettingsConnection();
  const privateS3ConnectionCheck = useCheckAdminSettingsConnection();
  const jellyfinStatusQuery = useJellyfinCompatStatus();
  const installJellyfinWeb = useInstallJellyfinCompatWeb();
  const [submitting, setSubmitting] = useState(false);
  const [jellyfinWebInstallRequested, setJellyfinWebInstallRequested] = useState(false);
  const [publicExpanded, setPublicExpanded] = useState(true);
  const [privateExpanded, setPrivateExpanded] = useState(false);
  const [redisHydrated, setRedisHydrated] = useState(false);
  const [redisConnectionResult, setRedisConnectionResult] =
    useState<ConnectionCheckResponse | null>(null);
  const [publicS3ConnectionResult, setPublicS3ConnectionResult] =
    useState<ConnectionCheckResponse | null>(null);
  const [privateS3ConnectionResult, setPrivateS3ConnectionResult] =
    useState<ConnectionCheckResponse | null>(null);
  const redisQuery = useQuery({
    queryKey: ["setup-wizard", "setting", "redis.url"],
    queryFn: () => fetchSettingValue("redis.url"),
  });

  useEffect(() => {
    if (redisHydrated || !redisQuery.data) return;
    setRedisHydrated(true);
    form.setValue("redis.url", redisQuery.data);
  }, [redisQuery.data, redisHydrated, form]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const shouldInstallJellyfinWeb = jellyfinWebInstallRequested && !pinnedJellyfinWebInstalled;
    if (form.dirtyCount === 0 && !shouldInstallJellyfinWeb) {
      markDone("server");
      return;
    }

    setSubmitting(true);
    try {
      if (form.dirtyCount > 0) {
        await form.save();
        toast.success("feedback.setup_wizard.steps.server_storage_step.server_settings_saved");
      }
      if (shouldInstallJellyfinWeb) {
        const version = form.getValue("jellyfin_compat.web_version").trim();
        await installJellyfinWeb.mutateAsync(version ? { version } : {});
      }
      markDone("server");
    } catch (err) {
      toast.error("errors.setup.server_settings_save_failed", { error: err });
    } finally {
      setSubmitting(false);
    }
  }

  function handleSkip() {
    markDone("server");
  }

  async function handleRedisCheck() {
    try {
      setRedisConnectionResult(
        await redisConnectionCheck.mutateAsync({
          kind: "redis",
          body: form.buildConnectionCheckRequest(["redis.url"]),
        }),
      );
    } catch (error) {
      setRedisConnectionResult({
        success: false,
        message: tr.error("errors.setup.connection_check_failed", error),
      });
    }
  }

  async function handlePublicS3Check() {
    try {
      setPublicS3ConnectionResult(
        await publicS3ConnectionCheck.mutateAsync({
          kind: "s3_public",
          body: form.buildConnectionCheckRequest(PUBLIC_S3_KEYS),
        }),
      );
    } catch (error) {
      setPublicS3ConnectionResult({
        success: false,
        message: tr.error("errors.setup.connection_check_failed", error),
      });
    }
  }

  async function handlePrivateS3Check() {
    try {
      setPrivateS3ConnectionResult(
        await privateS3ConnectionCheck.mutateAsync({
          kind: "s3_private",
          body: form.buildConnectionCheckRequest(PRIVATE_S3_KEYS),
        }),
      );
    } catch (error) {
      setPrivateS3ConnectionResult({
        success: false,
        message: tr.error("errors.setup.connection_check_failed", error),
      });
    }
  }

  if (form.isLoading || jellyfinStatusQuery.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const publicURLAuth = form.getValue("s3.public_url_auth") || "presigned";
  const jellyfinEnabledValue = form.getValue("jellyfin_compat.enabled");
  const jellyfinStatus = jellyfinStatusQuery.data;
  const jellyfinAPIEnabled =
    jellyfinEnabledValue === ""
      ? Boolean(jellyfinStatus?.enabled)
      : jellyfinEnabledValue === "true";
  const jellyfinOperationRunning =
    jellyfinStatus?.operation?.state === "running" ||
    jellyfinStatus?.web_state === "installing" ||
    jellyfinStatus?.web_state === "removing";
  const jellyfinMissingPrerequisites =
    jellyfinStatus?.prerequisites?.filter((item) => !item.available) ?? [];
  const jellyfinSettingsDirty = form.dirtyKeys.some((key) => key.startsWith("jellyfin_compat."));
  const pinnedJellyfinWebInstalled = hasPinnedJellyfinWebInstalled(jellyfinStatus);

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Section
        label={tr("pages.setup_wizard.steps.server_storage_step.redis")}
        description={tr(
          "pages.setup_wizard.steps.server_storage_step.required_for_multi_node_deployments",
        )}
      >
        <Input
          id="setup-redis-url"
          type="password"
          value={form.getValue("redis.url")}
          onChange={(e) => form.setValue("redis.url", e.target.value)}
          placeholder={tr("pages.setup_wizard.steps.server_storage_step.redis_localhost_6379")}
        />
        <ConnectionCheckAction
          onClick={handleRedisCheck}
          result={redisConnectionResult}
          isPending={redisConnectionCheck.isPending}
          disabled={submitting || form.isSaving}
        />
      </Section>

      <Section label={tr("pages.setup_wizard.steps.server_storage_step.playback")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="setup-ffmpeg-path" className="text-xs">
              {tr("pages.setup_wizard.steps.server_storage_step.ffmpeg_path")}
            </Label>
            <Input
              id="setup-ffmpeg-path"
              value={form.getValue("playback.ffmpeg_path")}
              onChange={(e) => form.setValue("playback.ffmpeg_path", e.target.value)}
              placeholder={tr(
                "pages.setup_wizard.steps.server_storage_step.usr_lib_jellyfin_ffmpeg_ffmpeg",
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="setup-transcode-dir" className="text-xs">
              {tr("pages.setup_wizard.steps.server_storage_step.transcode_directory")}
            </Label>
            <Input
              id="setup-transcode-dir"
              value={form.getValue("playback.transcode_dir")}
              onChange={(e) => form.setValue("playback.transcode_dir", e.target.value)}
              placeholder={tr("pages.setup_wizard.steps.server_storage_step.tmp_silo_transcode")}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="setup-hw-accel" className="text-xs">
              {tr("pages.setup_wizard.steps.server_storage_step.hardware_accel")}
            </Label>
            <Select
              value={form.getValue("playback.hw_accel") || "auto"}
              onValueChange={(v) => form.setValue("playback.hw_accel", v)}
            >
              <SelectTrigger id="setup-hw-accel" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  {tr("pages.setup_wizard.steps.server_storage_step.auto")}
                </SelectItem>
                <SelectItem value="vaapi">
                  {tr("pages.setup_wizard.steps.server_storage_step.vaapi")}
                </SelectItem>
                <SelectItem value="nvenc">
                  {tr("pages.setup_wizard.steps.server_storage_step.nvenc")}
                </SelectItem>
                <SelectItem value="videotoolbox">
                  {tr("pages.setup_wizard.steps.server_storage_step.video_toolbox_mac_os")}
                </SelectItem>
                <SelectItem value="qsv">
                  {tr("pages.setup_wizard.steps.server_storage_step.qsv")}
                </SelectItem>
                <SelectItem value="none">
                  {tr("pages.setup_wizard.steps.server_storage_step.none")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pb-1.5">
            <Switch
              id="setup-transcode-enabled"
              checked={form.getValue("playback.transcode_enabled") !== "false"}
              onCheckedChange={(v) =>
                form.setValue("playback.transcode_enabled", v ? "true" : "false")
              }
            />
            <Label htmlFor="setup-transcode-enabled" className="text-xs">
              {tr("pages.setup_wizard.steps.server_storage_step.transcoding")}
            </Label>
          </div>
        </div>
      </Section>

      <Section
        label={tr("pages.setup_wizard.steps.server_storage_step.jellyfin_compatible_app_support")}
        description={tr(
          "pages.setup_wizard.steps.server_storage_step.for_vid_hub_findroid_infuse_and_other_jellyfin_clients",
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="border-foreground/[0.06] bg-background/40 rounded-lg border px-3 py-3">
            <p className="text-xs font-medium">
              {tr("pages.setup_wizard.steps.server_storage_step.api_layer")}
            </p>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              {tr(
                "pages.setup_wizard.steps.server_storage_step.lets_jellyfin_compatible_apps_discover_silo_sign_in_browse_libraries",
              )}
            </p>
          </div>
          <div className="border-foreground/[0.06] bg-background/40 rounded-lg border px-3 py-3">
            <p className="text-xs font-medium">
              {tr("pages.setup_wizard.steps.server_storage_step.web_ui_layer")}
            </p>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              {tr(
                "pages.setup_wizard.steps.server_storage_step.downloads_and_builds_jellyfin_web_assets_for_clients_that_expect",
              )}
            </p>
          </div>
        </div>
        <div className="mb-4 flex items-center gap-2 pb-1">
          <Switch
            id="setup-jellyfin-enabled"
            checked={jellyfinAPIEnabled}
            onCheckedChange={(v) => {
              form.setValue("jellyfin_compat.enabled", v ? "true" : "false");
              if (!v) setJellyfinWebInstallRequested(false);
            }}
          />
          <Label htmlFor="setup-jellyfin-enabled" className="text-xs">
            {tr("pages.setup_wizard.steps.server_storage_step.enable_jellyfin_compatible_api")}
          </Label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="setup-jellyfin-url" className="text-xs">
              {tr("pages.setup_wizard.steps.server_storage_step.public_url")}
            </Label>
            <Input
              id="setup-jellyfin-url"
              value={form.getValue("jellyfin_compat.public_url")}
              onChange={(e) => form.setValue("jellyfin_compat.public_url", e.target.value)}
              placeholder={tr("pages.setup_wizard.steps.server_storage_step.http_your_server_8096")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="setup-jellyfin-name" className="text-xs">
              {tr("pages.setup_wizard.steps.server_storage_step.server_name")}
            </Label>
            <Input
              id="setup-jellyfin-name"
              value={form.getValue("jellyfin_compat.server_name")}
              onChange={(e) => form.setValue("jellyfin_compat.server_name", e.target.value)}
              placeholder={tr("pages.setup_wizard.steps.server_storage_step.silo")}
            />
          </div>
        </div>
        <div className="border-foreground/[0.07] mt-4 space-y-3 border-t pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="setup-jellyfin-web-version" className="text-xs">
                {tr("pages.setup_wizard.steps.server_storage_step.pinned_web_version")}
              </Label>
              <Input
                id="setup-jellyfin-web-version"
                value={form.getValue("jellyfin_compat.web_version")}
                onChange={(e) => form.setValue("jellyfin_compat.web_version", e.target.value)}
                placeholder={tr(
                  "pages.setup_wizard.steps.server_storage_step.auto_select_compatible_release",
                )}
              />
              <p className="text-muted-foreground/70 text-xs">
                {tr(
                  "pages.setup_wizard.steps.server_storage_step.optional_leave_blank_to_use_the_latest_compatible_released_jellyfin",
                )}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="setup-jellyfin-web-install-dir" className="text-xs">
                {tr("pages.setup_wizard.steps.server_storage_step.web_install_directory")}
              </Label>
              <Input
                id="setup-jellyfin-web-install-dir"
                value={form.getValue("jellyfin_compat.web_install_dir")}
                onChange={(e) => form.setValue("jellyfin_compat.web_install_dir", e.target.value)}
                placeholder={tr(
                  "pages.setup_wizard.steps.server_storage_step.use_silo_managed_directory",
                )}
              />
              <p className="text-muted-foreground/70 text-xs">
                {tr("pages.setup_wizard.steps.server_storage_step.optional_defaults_to")}{" "}
                <span className="font-mono">
                  {tr(
                    "pages.setup_wizard.steps.server_storage_step.var_lib_silo_compat_jellyfin_web",
                  )}
                </span>
                .
              </p>
            </div>
          </div>

          <div className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">
                {tr("pages.setup_wizard.steps.server_storage_step.web_ui_status")}
              </span>
              <span>{statusLabel(jellyfinStatus?.web_state)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">
                {tr("pages.setup_wizard.steps.server_storage_step.pinned_version")}
              </span>
              <span>
                {jellyfinStatus?.pinned_version ||
                  tr("pages.setup_wizard.steps.server_storage_step.not_set")}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">
                {tr("pages.setup_wizard.steps.server_storage_step.installed_version")}
              </span>
              <span>
                {jellyfinStatus?.installed_version ||
                  tr("pages.setup_wizard.steps.server_storage_step.not_installed")}
              </span>
            </div>
            <div className="space-y-0.5 sm:col-span-2">
              <span className="text-muted-foreground">
                {tr("pages.setup_wizard.steps.server_storage_step.install_path")}
              </span>
              <div className="truncate font-mono">
                {jellyfinStatus?.install_path ||
                  tr("pages.setup_wizard.steps.server_storage_step.not_set")}
              </div>
            </div>
          </div>

          {jellyfinStatus?.last_error && (
            <div className="text-destructive flex items-start gap-2 text-xs">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>{jellyfinStatus.last_error}</span>
            </div>
          )}

          {jellyfinStatus?.operation?.state === "running" && (
            <div className="border-border/70 bg-muted/30 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs">
              <CheckCircle2 className="text-muted-foreground mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span className="text-muted-foreground leading-relaxed">
                {tr("pages.setup_wizard.steps.server_storage_step.jellyfin_web_install_is_running")}
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {!pinnedJellyfinWebInstalled && (
              <Button
                type="button"
                size="sm"
                variant="default"
                disabled={
                  !jellyfinAPIEnabled ||
                  installJellyfinWeb.isPending ||
                  jellyfinOperationRunning ||
                  jellyfinStatus?.installer_ready === false
                }
                onClick={() => setJellyfinWebInstallRequested((requested) => !requested)}
              >
                {jellyfinWebInstallRequested ? (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {jellyfinWebInstallRequested
                  ? tr("pages.setup_wizard.steps.server_storage_step.web_ui_will_be_installed")
                  : jellyfinStatus?.web_state === "update_available"
                    ? tr("pages.setup_wizard.steps.server_storage_step.update_web_ui")
                    : jellyfinOperationRunning || installJellyfinWeb.isPending
                      ? tr("pages.setup_wizard.steps.server_storage_step.web_ui_busy")
                      : tr("pages.setup_wizard.steps.server_storage_step.install_web_ui")}
              </Button>
            )}
            {pinnedJellyfinWebInstalled && (
              <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {tr("pages.setup_wizard.steps.server_storage_step.pinned_web_ui_version_installed")}
              </span>
            )}
            {jellyfinStatus?.license_present && jellyfinStatus?.provenance_present && (
              <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {tr(
                  "pages.setup_wizard.steps.server_storage_step.license_and_provenance_files_found",
                )}
              </span>
            )}
            {!jellyfinAPIEnabled && !pinnedJellyfinWebInstalled && (
              <span className="text-muted-foreground text-xs">
                {tr(
                  "pages.setup_wizard.steps.server_storage_step.enable_the_jellyfin_compatible_api_before_installing_web_ui",
                )}
              </span>
            )}
            {jellyfinSettingsDirty && !jellyfinWebInstallRequested && (
              <span className="text-muted-foreground text-xs">
                {tr(
                  "pages.setup_wizard.steps.server_storage_step.pending_jellyfin_settings_will_be_saved_when_you_continue",
                )}
              </span>
            )}
            {jellyfinMissingPrerequisites.length > 0 && (
              <span className="text-muted-foreground text-xs">
                {tr("pages.setup_wizard.steps.server_storage_step.missing_installer_prerequisites")}{" "}
                {jellyfinMissingPrerequisites.map((item) => item.command).join(", ")}
              </span>
            )}
          </div>
        </div>
      </Section>

      <StorageBlock
        title={tr("pages.setup_wizard.steps.server_storage_step.public_assets_storage_s3")}
        expanded={publicExpanded}
        onToggle={() => setPublicExpanded((value) => !value)}
      >
        <p className="text-muted-foreground/80 text-xs leading-relaxed">
          {tr(
            "pages.setup_wizard.steps.server_storage_step.stores_client_facing_assets_such_as_artwork_chapter_thumbnails_and",
          )}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">
              {tr("pages.setup_wizard.steps.server_storage_step.endpoint")}
            </Label>
            <Input
              value={form.getValue("s3.public_endpoint")}
              onChange={(e) => form.setValue("s3.public_endpoint", e.target.value)}
              placeholder={tr(
                "pages.setup_wizard.steps.server_storage_step.https_s3_amazonaws_com",
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">
              {tr("pages.setup_wizard.steps.server_storage_step.bucket")}
            </Label>
            <Input
              value={form.getValue("s3.public_bucket")}
              onChange={(e) => form.setValue("s3.public_bucket", e.target.value)}
            />
          </div>
        </div>
        <KeyPrefixField
          value={form.getValue("s3.public_key_prefix")}
          onChange={(v) => form.setValue("s3.public_key_prefix", v)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <SettingField
            label={tr("pages.setup_wizard.steps.server_storage_step.access_key")}
            type="password"
            value={form.getValue("s3.public_access_key")}
            onChange={(v) => form.setValue("s3.public_access_key", v)}
            sensitiveConfigured={form.sensitiveConfigured.includes("s3.public_access_key")}
          />
          <SettingField
            label={tr("pages.setup_wizard.steps.server_storage_step.secret_key")}
            type="password"
            value={form.getValue("s3.public_secret_key")}
            onChange={(v) => form.setValue("s3.public_secret_key", v)}
            sensitiveConfigured={form.sensitiveConfigured.includes("s3.public_secret_key")}
          />
        </div>
        <div className="border-foreground/[0.06] border-t pt-3">
          <SettingField
            label={tr("pages.setup_wizard.steps.server_storage_step.url_auth_method")}
            type="select"
            value={publicURLAuth}
            onChange={(v) => form.setValue("s3.public_url_auth", v)}
            options={[
              {
                value: "presigned",
                label: tr(
                  "pages.setup_wizard.steps.server_storage_step.s3_presigned_urls_recommended",
                ),
              },
              {
                value: "public",
                label: tr("pages.setup_wizard.steps.server_storage_step.public_no_auth"),
              },
              {
                value: "cloudflare_token",
                label: tr("pages.setup_wizard.steps.server_storage_step.cloudflare_token_auth"),
              },
            ]}
          />
          {publicURLAuth !== "presigned" && (
            <SettingField
              label={tr("pages.setup_wizard.steps.server_storage_step.read_endpoint")}
              value={form.getValue("s3.public_read_endpoint")}
              onChange={(v) => form.setValue("s3.public_read_endpoint", v)}
              hint={tr("pages.setup_wizard.steps.server_storage_step.https_cdn_example_com")}
            />
          )}
        </div>
        <ConnectionCheckAction
          onClick={handlePublicS3Check}
          result={publicS3ConnectionResult}
          isPending={publicS3ConnectionCheck.isPending}
          disabled={submitting || form.isSaving}
        />
      </StorageBlock>

      <StorageBlock
        title={tr("pages.setup_wizard.steps.server_storage_step.private_internal_storage_s3")}
        expanded={privateExpanded}
        onToggle={() => setPrivateExpanded((value) => !value)}
      >
        <p className="text-muted-foreground/80 text-xs leading-relaxed">
          {tr(
            "pages.setup_wizard.steps.server_storage_step.stores_non_public_silo_objects_such_as_imports_exports_and",
          )}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">
              {tr("pages.setup_wizard.steps.server_storage_step.endpoint")}
            </Label>
            <Input
              value={form.getValue("s3.private_endpoint")}
              onChange={(e) => form.setValue("s3.private_endpoint", e.target.value)}
              placeholder={tr(
                "pages.setup_wizard.steps.server_storage_step.https_s3_amazonaws_com",
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">
              {tr("pages.setup_wizard.steps.server_storage_step.bucket")}
            </Label>
            <Input
              value={form.getValue("s3.private_bucket")}
              onChange={(e) => form.setValue("s3.private_bucket", e.target.value)}
            />
          </div>
        </div>
        <KeyPrefixField
          value={form.getValue("s3.private_key_prefix")}
          onChange={(v) => form.setValue("s3.private_key_prefix", v)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <SettingField
            label={tr("pages.setup_wizard.steps.server_storage_step.access_key")}
            type="password"
            value={form.getValue("s3.private_access_key")}
            onChange={(v) => form.setValue("s3.private_access_key", v)}
            sensitiveConfigured={form.sensitiveConfigured.includes("s3.private_access_key")}
          />
          <SettingField
            label={tr("pages.setup_wizard.steps.server_storage_step.secret_key")}
            type="password"
            value={form.getValue("s3.private_secret_key")}
            onChange={(v) => form.setValue("s3.private_secret_key", v)}
            sensitiveConfigured={form.sensitiveConfigured.includes("s3.private_secret_key")}
          />
        </div>
        <ConnectionCheckAction
          onClick={handlePrivateS3Check}
          result={privateS3ConnectionResult}
          isPending={privateS3ConnectionCheck.isPending}
          disabled={submitting || form.isSaving}
        />
      </StorageBlock>

      <div className="border-foreground/[0.07] bg-foreground/[0.03] rounded-xl border px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.1em] uppercase">
              {tr("pages.setup_wizard.steps.server_storage_step.store_artwork_in_your_bucket")}
            </p>
            <p className="text-muted-foreground/70 mt-0.5 text-xs">
              {tr(
                "pages.setup_wizard.steps.server_storage_step.copies_posters_and_backdrops_from_metadata_providers_into_your_public",
              )}
            </p>
          </div>
          <Switch
            id="setup-cache-images"
            checked={form.getValue("metadata.cache_images") === "true"}
            onCheckedChange={(v) => form.setValue("metadata.cache_images", v ? "true" : "false")}
            className="ml-4 shrink-0"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <Button type="submit" disabled={submitting || form.isSaving}>
          {submitting || form.isSaving
            ? tr("pages.setup_wizard.steps.server_storage_step.saving")
            : tr("pages.setup_wizard.steps.server_storage_step.save_continue")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={handleSkip}
          disabled={submitting || form.isSaving}
        >
          {tr("common.actions.skip")}
        </Button>
      </div>
    </form>
  );
}
