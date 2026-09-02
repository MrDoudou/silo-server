import {
  Blocks,
  Bot,
  CalendarClock,
  Captions,
  Download,
  FileWarning,
  History,
  KeyRound,
  LayoutDashboard,
  LayoutPanelTop,
  Library,
  MonitorSmartphone,
  PanelsTopLeft,
  Puzzle,
  Radio,
  ScrollText,
  Send,
  Server,
  Settings2,
  ShieldCheck,
  SkipForward,
  Users,
  UsersRound,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { PluginInstallation } from "@/api/types";
import type { SettingsSearchGroup, SettingsSearchItem } from "@/components/settings/settingsSearch";
import { ADMIN_SETTINGS_NAV } from "@/lib/adminSettingsSearch";
import { pluginRouteHref } from "@/lib/pluginRouteHref";

import { tr } from "@/i18n/translate";

export interface AdminNavItem extends SettingsSearchItem {
  label: string;
  icon: LucideIcon;
  href: string;
  exact?: boolean;
  external?: boolean;
}

export type AdminNavGroup = SettingsSearchGroup<AdminNavItem>;

export interface AdminNavVisibility {
  policyEditorAvailable?: boolean;
}

export const ADMIN_NAV_SECTIONS: AdminNavGroup[] = [
  {
    get label() {
      return tr("lib.admin_navigation.overview");
    },
    items: [
      {
        get label() {
          return tr("lib.admin_navigation.dashboard");
        },
        get description() {
          return tr("lib.admin_navigation.live_sessions_content_health_and_server_activity");
        },
        keywords: ["overview", "stats", "health", "scan all"],
        icon: LayoutDashboard,
        href: "/admin",
        exact: true,
      },
      {
        get label() {
          return tr("lib.admin_navigation.activity");
        },
        get description() {
          return tr("lib.admin_navigation.live_streams_and_current_playback_sessions");
        },
        keywords: ["streams", "sessions", "now playing", "transcode"],
        icon: Radio,
        href: "/admin/activity",
      },
      {
        get label() {
          return tr("lib.admin_navigation.logs");
        },
        get description() {
          return tr("lib.admin_navigation.server_log_stream_and_operational_output");
        },
        keywords: ["server logs", "debug", "tail", "events"],
        icon: ScrollText,
        href: "/admin/logs",
      },
      {
        get label() {
          return tr("lib.admin_navigation.diagnostics");
        },
        get description() {
          return tr(
            "lib.admin_navigation.uploaded_client_crash_reports_device_context_and_debug_bundles",
          );
        },
        keywords: ["client diagnostics", "crash reports", "debug bundles", "support"],
        icon: FileWarning,
        href: "/admin/diagnostics",
      },
    ],
  },
  {
    get label() {
      return tr("lib.admin_navigation.content");
    },
    items: [
      {
        get label() {
          return tr("lib.admin_navigation.libraries");
        },
        get description() {
          return tr(
            "lib.admin_navigation.media_libraries_paths_scanning_autoscan_sources_and_catalog_import",
          );
        },
        keywords: [
          "library",
          "paths",
          "scan",
          "catalog",
          "seed",
          "autoscan",
          "scan queue",
          "polling",
          "webhook source",
        ],
        icon: Library,
        href: "/admin/libraries",
      },
      {
        get label() {
          return tr("lib.admin_navigation.collections");
        },
        get description() {
          return tr("lib.admin_navigation.curated_and_smart_collection_management");
        },
        keywords: ["collection groups", "templates", "smart collections"],
        icon: LayoutPanelTop,
        href: "/admin/collections",
      },
      {
        get label() {
          return tr("lib.admin_navigation.sections");
        },
        get description() {
          return tr("lib.admin_navigation.home_and_catalog_section_configuration");
        },
        keywords: ["home rows", "rails", "featured sections"],
        icon: PanelsTopLeft,
        href: "/admin/sections",
      },
      {
        get label() {
          return tr("lib.admin_navigation.requests");
        },
        get description() {
          return tr("lib.admin_navigation.user_media_requests_and_request_handling");
        },
        keywords: ["requested media", "approvals", "overseerr"],
        icon: Send,
        href: "/admin/requests",
      },
    ],
  },
  {
    get label() {
      return tr("lib.admin_navigation.automation");
    },
    items: [
      {
        get label() {
          return tr("lib.admin_navigation.scheduled_tasks");
        },
        get description() {
          return tr("lib.admin_navigation.background_task_schedules_runs_and_job_history");
        },
        keywords: ["tasks", "jobs", "scheduler", "sync"],
        icon: CalendarClock,
        href: "/admin/tasks",
      },
      {
        get label() {
          return tr("lib.admin_navigation.subtitle_files");
        },
        get description() {
          return tr("lib.admin_navigation.downloaded_subtitle_records_and_subtitle_admin_tools");
        },
        keywords: ["captions", "subtitle downloads", "providers"],
        icon: Captions,
        href: "/admin/subtitles",
      },
      {
        get label() {
          return tr("lib.admin_navigation.markers");
        },
        get description() {
          return tr("lib.admin_navigation.intro_recap_and_credits_marker_history");
        },
        keywords: ["intro markers", "credits", "recaps", "chapters"],
        icon: SkipForward,
        href: "/admin/marker-history",
      },
      {
        get label() {
          return tr("lib.admin_navigation.recommendations");
        },
        get description() {
          return tr(
            "lib.admin_navigation.recommendation_diagnostics_seed_data_and_ranking_controls",
          );
        },
        keywords: ["taste", "ranking", "recommendation seeds"],
        icon: Bot,
        href: "/admin/recommendations",
      },
    ],
  },
  {
    get label() {
      return tr("lib.admin_navigation.users");
    },
    items: [
      {
        get label() {
          return tr("lib.admin_navigation.users");
        },
        get description() {
          return tr("lib.admin_navigation.accounts_roles_profile_settings_and_access");
        },
        keywords: ["accounts", "profiles", "roles", "permissions"],
        icon: Users,
        href: "/admin/users",
      },
      {
        get label() {
          return tr("lib.admin_navigation.access_groups");
        },
        get description() {
          return tr(
            "lib.admin_navigation.shared_access_defaults_libraries_downloads_streams_permissions",
          );
        },
        keywords: ["groups", "roles", "permissions", "library access", "downloads", "limits"],
        icon: UsersRound,
        href: "/admin/access-groups",
      },
      {
        get label() {
          return tr("lib.admin_navigation.devices");
        },
        get description() {
          return tr("lib.admin_navigation.registered_devices_overrides_and_per_device_settings");
        },
        keywords: ["clients", "device overrides", "sessions"],
        icon: MonitorSmartphone,
        href: "/admin/devices",
      },
      {
        get label() {
          return tr("lib.admin_navigation.playback_history");
        },
        get description() {
          return tr("lib.admin_navigation.historical_playback_events_across_users_and_profiles");
        },
        keywords: ["history", "watched", "progress", "plays"],
        icon: History,
        href: "/admin/history",
      },
      {
        get label() {
          return tr("lib.admin_navigation.history_import");
        },
        get description() {
          return tr("lib.admin_navigation.admin_history_import_mappings_and_bulk_import_runs");
        },
        keywords: ["emby", "imports", "mappings", "watch history"],
        icon: Download,
        href: "/admin/history-import",
      },
    ],
  },
  {
    get label() {
      return tr("lib.admin_navigation.settings");
    },
    items: [
      {
        get label() {
          return tr("lib.admin_navigation.settings");
        },
        get description() {
          return tr(
            "lib.admin_navigation.server_configuration_integrations_playback_storage_and_access",
          );
        },
        keywords: ["settings", "configuration", "server settings", "preferences"],
        icon: Settings2,
        href: "/admin/settings",
      },
    ],
  },
  {
    get label() {
      return tr("lib.admin_navigation.system");
    },
    items: [
      {
        get label() {
          return tr("lib.admin_navigation.plugins");
        },
        get description() {
          return tr(
            "lib.admin_navigation.plugin_catalog_repositories_installs_and_plugin_configuration",
          );
        },
        keywords: ["extensions", "plugin catalog", "repositories"],
        icon: Blocks,
        href: "/admin/plugins",
      },
      {
        get label() {
          return tr("lib.admin_navigation.policy");
        },
        get description() {
          return tr(
            "lib.admin_navigation.opa_policy_documents_vendor_modules_simulations_and_decision_logs",
          );
        },
        keywords: ["opa", "rego", "authorization", "decision log", "access policy"],
        icon: ShieldCheck,
        href: "/admin/policy",
      },
      {
        get label() {
          return tr("lib.admin_navigation.nodes");
        },
        get description() {
          return tr("lib.admin_navigation.stream_nodes_and_remote_worker_status");
        },
        keywords: ["stream nodes", "workers", "transcode nodes"],
        icon: Server,
        href: "/admin/nodes",
      },
      {
        get label() {
          return tr("lib.admin_navigation.api_keys");
        },
        get description() {
          return tr("lib.admin_navigation.admin_api_keys_and_tier_assignment");
        },
        keywords: ["tokens", "keys", "access", "rate limit tier"],
        icon: KeyRound,
        href: "/admin/api-keys",
      },
      {
        get label() {
          return tr("lib.admin_navigation.maintenance");
        },
        get description() {
          return tr("lib.admin_navigation.operational_maintenance_tools");
        },
        keywords: ["repair", "cleanup", "system maintenance"],
        icon: Wrench,
        href: "/admin/maintenance",
      },
    ],
  },
];

export function buildAdminNavSections(visibility: AdminNavVisibility = {}): AdminNavGroup[] {
  return ADMIN_NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => item.href !== "/admin/policy" || visibility.policyEditorAvailable === true,
    ),
  }));
}

export function buildAdminPluginNavItems(
  installations: readonly PluginInstallation[] | undefined,
): AdminNavItem[] {
  const items: AdminNavItem[] = [];

  for (const installation of installations ?? []) {
    if (!installation.enabled) continue;

    for (const route of installation.routes ?? []) {
      if (!route.navigable || route.navigation_kind !== "admin") continue;

      const label = route.navigation_label || installation.plugin_id;
      items.push({
        label,
        get description() {
          return tr("lib.admin_navigation.value1_plugin_app", { value1: installation.plugin_id });
        },
        keywords: [installation.plugin_id, "plugin", "plugin app"],
        icon: Puzzle,
        href: pluginRouteHref(installation.id, route.path),
        external: true,
      });
    }
  }

  return items;
}

export function appendAdminPluginNavSection(
  sections: readonly AdminNavGroup[],
  installations: readonly PluginInstallation[] | undefined,
): AdminNavGroup[] {
  const pluginItems = buildAdminPluginNavItems(installations);

  if (!pluginItems.length) {
    return sections.map((section) => ({ ...section, items: [...section.items] }));
  }

  return [
    ...sections.map((section) => ({ ...section, items: [...section.items] })),
    { label: tr("lib.admin_navigation.plugin_apps"), items: pluginItems },
  ];
}

export function buildAdminCommandNavSections(
  installations: readonly PluginInstallation[] | undefined,
  visibility: AdminNavVisibility = {},
): AdminNavGroup[] {
  // Keep the persistent sidebar quiet while preserving direct access to every
  // settings category and individual setting through Cmd+K.
  const sections = buildAdminNavSections(visibility).map((section) =>
    section.label === "Settings"
      ? {
          ...section,
          items: [
            ...section.items,
            ...ADMIN_SETTINGS_NAV.map((item) => ({
              label: item.label,
              description: item.description,
              keywords: ["settings", "configuration", ...(item.keywords ?? [])],
              settings: item.settings,
              icon: item.icon,
              href: `/admin/settings/${encodeURIComponent(item.id)}`,
            })),
          ],
        }
      : section,
  );

  return appendAdminPluginNavSection(sections, installations);
}
