import { useMemo } from "react";

import type { AdminServerStatus } from "@/api/types";
import { emailReady } from "@/lib/emailReadiness";
import { useBranding } from "@/hooks/useBranding";
import {
  useAdminSensitiveStatus,
  useAdminServerSettings,
  useAdminServerStatus,
  useCatalogSearchStatus,
  type CatalogSearchStatus,
} from "@/hooks/queries/admin/settings";
import { useHWAccelDetection, type HWAccelInfo } from "@/hooks/queries/admin/system";

import { tr } from "@/i18n/translate";

/**
 * The settings pages the overview links to. The ids here are stable route
 * segments and have to match the pages the settings layout mounts.
 */
export const ADMIN_SETTINGS_PAGE_IDS = [
  "general",
  "infrastructure",
  "appearance",
  "security",
  "library",
  "playback",
  "downloads",
  "providers",
  "watch-sync",
  "ai",
  "notifications",
  "compatibility",
] as const;

export type AdminSettingsPageID = (typeof ADMIN_SETTINGS_PAGE_IDS)[number];

/** Colour band a health tile reads in: green, amber, dimmed, or neutral blue. */
export type OverviewState = "ok" | "warn" | "off" | "info";

export interface OverviewTileAction {
  label: string;
  page: AdminSettingsPageID;
}

export interface OverviewTile {
  id: string;
  label: string;
  state: OverviewState;
  /** One or two words, e.g. "Healthy" or "Restart pending". */
  stateText: string;
  /** Single supporting line under the state. */
  detail: string;
  action?: OverviewTileAction;
}

export interface OverviewCard {
  id: AdminSettingsPageID;
}

export interface SettingsOverviewModel {
  /** True until the settings map has arrived; the page shows skeletons. */
  isLoading: boolean;
  tiles: OverviewTile[];
  cards: OverviewCard[];
}

/**
 * Everything the model is derived from. Kept as plain data (rather than read
 * off hooks inside the builder) so the derivation is testable without a query
 * client, and so a missing/failed query is just `undefined` here.
 */
export interface SettingsOverviewInput {
  settings?: Record<string, string>;
  sensitiveConfigured?: readonly string[];
  storageAvailable?: boolean;
  serverStatus?: AdminServerStatus;
  search?: CatalogSearchStatus;
  hwAccel?: HWAccelInfo;
}

/** Deep link to one settings page. */
export function settingsPageHref(page: string): string {
  return `/admin/settings/${encodeURIComponent(page)}`;
}

const TRUE_VALUES = new Set(["true", "1", "yes", "on"]);

function readText(settings: Record<string, string> | undefined, key: string): string {
  return (settings?.[key] ?? "").trim();
}

function readBool(settings: Record<string, string> | undefined, key: string): boolean {
  return TRUE_VALUES.has(readText(settings, key).toLowerCase());
}

function readInt(settings: Record<string, string> | undefined, key: string): number | null {
  const parsed = Number.parseInt(readText(settings, key), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function join(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(" · ");
}

function sentenceCase(value: string): string {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const HW_ACCEL_LABELS: Record<string, string> = {
  auto: "hooks.admin.use_settings_overview.auto",
  qsv: "hooks.admin.use_settings_overview.quick_sync",
  vaapi: "hooks.admin.use_settings_overview.va_api",
  nvenc: "hooks.admin.use_settings_overview.nvenc",
  videotoolbox: "hooks.admin.use_settings_overview.video_toolbox",
  none: "hooks.admin.use_settings_overview.software",
};

function hwAccelLabel(value: string): string {
  const knownLabel = HW_ACCEL_LABELS[value];
  return knownLabel ? tr(knownLabel) : value.toUpperCase();
}

/**
 * How transcoding is set up, in one phrase: the configured mode, and for
 * "auto" the mode detection actually resolved to.
 */
function transcodeModeLabel(configured: string, detection: HWAccelInfo | undefined): string {
  const mode = configured || "auto";
  if (mode !== "auto") return hwAccelLabel(mode);
  const resolved = detection?.resolved;
  if (!resolved) return tr("hooks.admin.use_settings_overview.auto");
  if (resolved === "none") return tr("hooks.admin.use_settings_overview.auto_software");
  return tr("hooks.admin.use_settings_overview.auto_value", { value: hwAccelLabel(resolved) });
}

const SEARCH_PROVIDER_LABELS: Record<string, string> = {
  postgres: "hooks.admin.use_settings_overview.postgres",
  meilisearch: "hooks.admin.use_settings_overview.meilisearch",
};

function searchProviderLabel(value: string): string {
  const knownLabel = SEARCH_PROVIDER_LABELS[value];
  return knownLabel ? tr(knownLabel) : sentenceCase(value);
}

/**
 * Restart reasons that name a subsystem other than the settings batch. Only
 * used against servers that predate the accumulated per-key reasons list,
 * where the single last-writer reason is the closest signal there is.
 */
const NON_SETTINGS_RESTART_REASONS = new Set([
  "jellyfin_compat",
  "ratelimit_backend",
  "plugin_auth_binding",
  "plugin_task_binding",
]);

function legacySettingsRestartPending(status: AdminServerStatus): boolean {
  const reason = (status.restart_required_reason ?? "").trim();
  return reason === "" || !NON_SETTINGS_RESTART_REASONS.has(reason);
}

/**
 * Whether a saved setting under one of `prefixes` is waiting for a restart.
 *
 * The server accumulates one "setting:<key>" reason per restart-required save,
 * so a tile can warn about its own keys and stay quiet for everyone else's —
 * and a later unrelated save cannot overwrite the evidence. An older server
 * without the list falls back to the coarse last-reason heuristic, which warns
 * for any settings save rather than missing a real one.
 */
function settingsRestartPending(
  status: AdminServerStatus | undefined,
  prefixes: readonly string[],
): boolean {
  if (!status?.restart_required) return false;
  const reasons = status.restart_required_reasons;
  if (!reasons) return legacySettingsRestartPending(status);
  return reasons.some((reason) => {
    if (!reason.startsWith("setting:")) return false;
    const key = reason.slice("setting:".length);
    return prefixes.some((prefix) => key.startsWith(prefix));
  });
}

// ---------------------------------------------------------------------------
// Health tiles
// ---------------------------------------------------------------------------

/**
 * The link a tile carries. Only a tile the admin has to do something about
 * gets one — a healthy tile is a fact, not a task.
 */
function tileAction(
  state: OverviewState,
  page: AdminSettingsPageID,
): OverviewTileAction | undefined {
  if (state === "warn") return { label: tr("hooks.admin.use_settings_overview.fix"), page };
  if (state === "off") return { label: tr("hooks.admin.use_settings_overview.set_up"), page };
  return undefined;
}

function buildTiles(input: SettingsOverviewInput): OverviewTile[] {
  const { settings } = input;
  const configured = new Set(input.sensitiveConfigured ?? []);

  const publicBucket = readText(settings, "s3.public_bucket");
  const privateBucket = readText(settings, "s3.private_bucket");
  const storageReady = input.storageAvailable === true;
  const bucketDetail = privateBucket
    ? "S3 · public + private"
    : publicBucket
      ? `S3 · ${publicBucket}`
      : "No bucket configured";
  // `storage_available` is decided when the S3 client is built at boot, so the
  // save that first configures a bucket cannot flip it — only the restart that
  // save already asked for can. Reporting "Not set up" in that window tells an
  // admin who just did the work that it did not take.
  const storageRestartPending =
    !storageReady && publicBucket !== "" && settingsRestartPending(input.serverStatus, ["s3."]);
  const storageState: OverviewState = storageReady ? "ok" : storageRestartPending ? "warn" : "off";

  const maxConnections = readInt(settings, "database.max_connections");
  const redisConfigured = configured.has("redis.url") || readText(settings, "redis.url") !== "";

  const transcodeEnabled = readBool(settings, "playback.transcode_enabled");
  const transcodeMode = transcodeModeLabel(readText(settings, "playback.hw_accel"), input.hwAccel);
  const renderDevice = input.hwAccel?.render_devices?.[0] ?? "";
  const playbackRestartPending = settingsRestartPending(input.serverStatus, ["playback."]);
  const transcodeState: OverviewState = playbackRestartPending
    ? "warn"
    : transcodeEnabled
      ? "ok"
      : "off";

  const activeSearch =
    input.search?.active_provider || readText(settings, "catalog.search.provider") || "postgres";
  const searchStatusResolved = input.search != null;
  const meiliConfigured = input.search?.meilisearch.configured ?? false;
  const meiliHealthy = input.search?.meilisearch.healthy ?? false;
  const searchDegraded = input.search?.degraded ?? false;
  const searchState: OverviewState =
    activeSearch === "meilisearch"
      ? !searchStatusResolved
        ? "info"
        : meiliHealthy && !searchDegraded
          ? "ok"
          : "warn"
      : meiliConfigured
        ? "warn"
        : "info";

  const emailHost = readText(settings, "email.smtp_host");
  const mailReady = emailReady(
    readBool(settings, "email.enabled"),
    emailHost,
    readText(settings, "email.from_address"),
  );
  const emailState: OverviewState = mailReady ? "ok" : "off";

  return [
    {
      id: "storage",
      label: tr("hooks.admin.use_settings_overview.storage"),
      state: storageState,
      get stateText() {
        return tr(
          storageReady
            ? "hooks.admin.use_settings_overview.healthy"
            : storageRestartPending
              ? "hooks.admin.use_settings_overview.restart_pending"
              : "hooks.admin.use_settings_overview.not_set_up",
        );
      },
      get detail() {
        if (storageReady) return bucketDetail;
        if (storageRestartPending) {
          return tr("hooks.admin.use_settings_overview.detail_applies_after_a_restart", {
            detail: bucketDetail,
          });
        }
        return tr("hooks.admin.use_settings_overview.artwork_and_uploads_have_nowhere_to_go");
      },
      action: tileAction(storageState, "infrastructure"),
    },
    {
      id: "database",
      label: tr("hooks.admin.use_settings_overview.database"),
      state: "ok",
      get stateText() {
        return tr("hooks.admin.use_settings_overview.healthy");
      },
      detail: join([
        "Postgres",
        maxConnections ? `max ${maxConnections} connections` : null,
        redisConfigured ? "Redis" : null,
      ]),
    },
    {
      id: "transcoding",
      label: tr("hooks.admin.use_settings_overview.transcoding"),
      state: transcodeState,
      get stateText() {
        return tr(
          playbackRestartPending
            ? "hooks.admin.use_settings_overview.restart_pending"
            : transcodeEnabled
              ? "hooks.admin.use_settings_overview.ready"
              : "hooks.admin.use_settings_overview.off",
        );
      },
      get detail() {
        if (playbackRestartPending)
          return tr("hooks.admin.use_settings_overview.saved_changes_apply_after_a_restart");
        if (transcodeEnabled) return join([transcodeMode, renderDevice]);
        return tr("hooks.admin.use_settings_overview.clients_only_get_what_they_can_already_play");
      },
      action: tileAction(transcodeState, "playback"),
    },
    {
      id: "search",
      label: tr("common.actions.search"),
      state: searchState,
      stateText: searchProviderLabel(activeSearch),
      get detail() {
        if (activeSearch === "meilisearch") {
          if (!searchStatusResolved)
            return tr("hooks.admin.use_settings_overview.checking_connection");
          if (searchDegraded) {
            return input.search?.degraded_reason
              ? tr.remote({ message: input.search.degraded_reason })
              : tr("hooks.admin.use_settings_overview.search_is_running_in_a_degraded_mode");
          }
          return meiliHealthy
            ? tr("hooks.admin.use_settings_overview.meilisearch_connected")
            : tr("hooks.admin.use_settings_overview.meilisearch_not_reachable");
        }
        return meiliConfigured
          ? tr("hooks.admin.use_settings_overview.meilisearch_configured_but_not_active")
          : tr("hooks.admin.use_settings_overview.meilisearch_not_connected");
      },
      action: tileAction(searchState, "library"),
    },
    {
      id: "email",
      label: tr("hooks.admin.use_settings_overview.email"),
      state: emailState,
      get stateText() {
        return tr(
          mailReady
            ? "hooks.admin.use_settings_overview.ready"
            : "hooks.admin.use_settings_overview.not_set_up",
        );
      },
      get detail() {
        return mailReady
          ? tr("hooks.admin.use_settings_overview.smtp_email_host", { emailHost })
          : tr("hooks.admin.use_settings_overview.invites_and_resets_can_t_send");
      },
      action: tileAction(emailState, "notifications"),
    },
  ];
}

// ---------------------------------------------------------------------------
// Settings groups
// ---------------------------------------------------------------------------

function buildCards(): OverviewCard[] {
  return ADMIN_SETTINGS_PAGE_IDS.map((id) => ({ id }));
}

/** Derives the whole overview model from already-fetched data. */
export function buildSettingsOverview(input: SettingsOverviewInput): SettingsOverviewModel {
  const tiles = buildTiles(input);
  const cards = buildCards();

  return { isLoading: false, tiles, cards };
}

/**
 * Live settings state for the admin settings landing page. Every query it
 * reads is one an individual page already loads, so opening the overview warms
 * the caches those pages go on to use.
 */
export function useSettingsOverview(): SettingsOverviewModel {
  const { data: settings, isLoading: settingsLoading } = useAdminServerSettings();
  const { data: sensitive } = useAdminSensitiveStatus();
  const { data: serverStatus } = useAdminServerStatus();
  const branding = useBranding();

  // Postgres search has no external service to check. Avoid paying for the
  // Meilisearch status request unless this server actually selected it.
  const searchProvider = (settings?.["catalog.search.provider"] ?? "").trim() || "postgres";
  const { data: search } = useCatalogSearchStatus(
    settings != null && searchProvider === "meilisearch",
  );

  // Hardware detection shells out to ffmpeg on the transcode host, so it is
  // only asked for when transcoding could actually use it.
  const hwAccelMode = (settings?.["playback.hw_accel"] ?? "").trim();
  const transcodeEnabled = TRUE_VALUES.has(
    (settings?.["playback.transcode_enabled"] ?? "").trim().toLowerCase(),
  );
  const { data: hwAccel } = useHWAccelDetection(
    settings != null && transcodeEnabled && hwAccelMode !== "none",
  );

  return useMemo(() => {
    const model = buildSettingsOverview({
      settings,
      sensitiveConfigured: sensitive?.configured,
      storageAvailable: branding.storageAvailable,
      serverStatus,
      search,
      hwAccel,
    });
    return { ...model, isLoading: settingsLoading && settings == null };
  }, [
    branding.storageAvailable,
    hwAccel,
    search,
    sensitive?.configured,
    serverStatus,
    settings,
    settingsLoading,
  ]);
}
