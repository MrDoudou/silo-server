import { tr } from "@/i18n/translate";

/** Default app name, overridable by admin branding settings. */
export let APP_DOCUMENT_TITLE = "Silo";

/**
 * The label of the currently-mounted page (set by useDocumentTitle). Tracked
 * here so setAppDocumentTitle can re-apply the full title when branding loads
 * after the page has already set its title.
 */
let activeLabel: string | null = null;

/** Records the active page label so the title can be recomputed on rebrand. */
export function setActiveDocumentTitleLabel(label: string | null | undefined) {
  activeLabel = label ?? null;
}

/**
 * Called by the branding provider to update the document title prefix. Also
 * re-applies the current page's title so an already-rendered page reflects the
 * server name as soon as branding resolves.
 */
export function setAppDocumentTitle(name: string) {
  APP_DOCUMENT_TITLE = name || "Silo";
  if (typeof document !== "undefined") {
    document.title = formatDocumentTitle(activeLabel);
  }
}

const SETTINGS_TITLES: Record<string, string> = {
  account: "lib.document_title.account_settings",
  appearance: "lib.document_title.appearance_settings",
  interface: "lib.document_title.navigation_card_settings",
  accessibility: "lib.document_title.accessibility_settings",
  playback: "lib.document_title.playback_settings",
  profiles: "lib.document_title.profile_settings",
  libraries: "lib.document_title.library_settings",
  "history-import": "lib.document_title.history_import_settings",
  "plex-webhooks": "lib.document_title.webhook_sync_settings",
  "webhook-sync": "lib.document_title.webhook_sync_settings",
  "subtitle-appearance": "lib.document_title.subtitle_settings",
  "home-screen": "lib.document_title.home_screen_settings",
  "card-overlays": "lib.document_title.card_overlay_settings",
  "connect-apps": "lib.document_title.connect_apps_settings",
};

const ADMIN_TITLES: Record<string, string> = {
  "access-groups": "lib.document_title.admin_access_groups",
  activity: "lib.document_title.admin_activity",
  "api-keys": "lib.document_title.admin_api_keys",
  autoscan: "lib.document_title.admin_autoscan",
  collections: "lib.document_title.admin_collections",
  devices: "lib.document_title.admin_devices",
  "settings/devices": "lib.document_title.your_devices",
  diagnostics: "lib.document_title.admin_client_diagnostics",
  history: "lib.document_title.admin_playback_history",
  "history-import": "lib.document_title.admin_history_import",
  "marker-history": "lib.document_title.admin_marker_history",
  libraries: "lib.document_title.admin_libraries",
  logs: "lib.document_title.admin_logs",
  maintenance: "lib.document_title.admin_maintenance",
  nodes: "lib.document_title.admin_nodes",
  plugins: "lib.document_title.admin_plugins",
  policy: "lib.document_title.admin_policy",
  recommendations: "lib.document_title.admin_recommendations",
  requests: "lib.document_title.admin_requests",
  sections: "lib.document_title.admin_sections",
  subtitles: "lib.document_title.admin_subtitles",
  settings: "lib.document_title.admin_settings",
  tasks: "lib.document_title.admin_tasks",
  users: "lib.document_title.admin_users",
};

export function formatDocumentTitle(label?: string | null): string {
  const normalized = label?.trim();
  if (!normalized) {
    return APP_DOCUMENT_TITLE;
  }
  return `${normalized} · ${APP_DOCUMENT_TITLE}`;
}

export function resolveSettingsDocumentTitle(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const settingsSegment = segments[1];
  return tr(SETTINGS_TITLES[settingsSegment ?? ""] ?? "lib.document_title.settings");
}

export function resolveAdminDocumentTitle(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const adminSegment = segments[1];
  const nestedSegment = segments[2];

  if (!adminSegment) {
    return tr("lib.document_title.admin");
  }

  if (adminSegment === "collections") {
    if (nestedSegment === "new") {
      return tr("lib.document_title.new_admin_collection");
    }
    if (segments[3] === "edit") {
      return tr("lib.document_title.edit_admin_collection");
    }
  }

  if (adminSegment === "tasks" && nestedSegment) {
    return tr("lib.document_title.admin_task");
  }

  if (adminSegment === "users" && nestedSegment) {
    return tr("lib.document_title.admin_user");
  }

  return tr(ADMIN_TITLES[adminSegment] ?? "lib.document_title.admin");
}
