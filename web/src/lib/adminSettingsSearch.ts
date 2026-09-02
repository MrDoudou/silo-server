import {
  Bell,
  Captions,
  Database,
  Download,
  Library,
  Paintbrush,
  PlayCircle,
  Plug,
  RefreshCw,
  Settings2,
  Sparkles,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { SettingsSearchGroup, SettingsSearchItem } from "@/components/settings/settingsSearch";

import { tr } from "@/i18n/translate";

export interface AdminSettingsSearchItem extends SettingsSearchItem {
  id: string;
  label: string;
  description: string;
  /** The named sections visible inside this settings destination. */
  groups: readonly string[];
  keywords?: readonly string[];
  settings?: readonly { label: string; description?: string; keywords?: readonly string[] }[];
  icon: LucideIcon;
  /**
   * Short qualifier rendered next to the label in a nav that wants one. The
   * settings rail reads section health as a status dot instead, so nothing
   * sets this today; the prop stays so a future nav can opt in without
   * reshaping the item type.
   */
  badge?: string;
}

export type AdminSettingsSearchGroup = SettingsSearchGroup<AdminSettingsSearchItem>;

const settingIndex = (...labels: string[]) => labels.map((label) => ({ label }));

// Page ids are stable route segments. Old ids from the 20-tab layout are kept
// working by LEGACY_ADMIN_SETTINGS_PAGE_ALIASES below — regroup or reorder
// freely, but add an alias entry whenever an id disappears.
//
// One group keeps the Overview cards and command palette in the same order.
export const ADMIN_SETTINGS_GROUPS: AdminSettingsSearchGroup[] = [
  {
    get label() {
      return tr("lib.admin_settings_search.settings");
    },
    items: [
      {
        id: "general",
        get label() {
          return tr("lib.admin_settings_search.general");
        },
        get description() {
          return tr("lib.admin_settings_search.server_identity_public_signups_and_logging");
        },
        groups: ["Identity", "Access", "Logging"],
        keywords: [
          "server name",
          "login subtitle",
          "signup",
          "invite",
          "log level",
          "quiet",
          "silenced log messages",
          "branding name",
        ],
        settings: settingIndex(
          "Identity",
          "Server name",
          "Login subtitle",
          "Access",
          "Public signups",
          "Logging",
          "Log level",
          "Quiet log prefixes",
        ),
        icon: Settings2,
      },
      {
        id: "infrastructure",
        get label() {
          return tr("lib.admin_settings_search.storage_database");
        },
        get description() {
          return tr(
            "lib.admin_settings_search.redis_s3_storage_buckets_the_database_and_log_retention",
          );
        },
        groups: ["Redis", "Public storage", "Private storage", "Database", "Logs"],
        keywords: [
          "redis",
          "s3",
          "bucket",
          "endpoint",
          "region",
          "access key",
          "secret key",
          "postgres",
          "pool",
          "user db",
          "ops log",
          "retention",
          "decision log",
          "opa",
          "infrastructure",
        ],
        settings: settingIndex(
          "Redis",
          "Use Redis",
          "Connection URL",
          "Public storage",
          "Private storage",
          "Endpoint",
          "Region",
          "Bucket",
          "Access Key",
          "Secret Key",
          "Put the bucket name in the URL path",
          "Folder inside the bucket",
          "How asset links are authorized",
          "Address clients download from",
          "Token Secret",
          "Token query parameter",
          "Link lifetime (seconds)",
          "Database",
          "Maximum Postgres connections",
          "Where per-user data is stored",
          "Open files per user",
          "Close idle user databases after",
          "Logs",
          "How much to record",
          "Delete log entries older than (days)",
          "Maximum log entries",
          "Maximum log size (MB)",
          "Delete permission records older than (days)",
          "Record one allowed check in every",
        ),
        icon: Database,
      },
      {
        id: "appearance",
        get label() {
          return tr("lib.admin_settings_search.appearance");
        },
        get description() {
          return tr(
            "lib.admin_settings_search.logos_accent_color_default_theme_custom_css_and_poster_badges",
          );
        },
        groups: ["Logos and icons", "Colors and theme", "Card overlays"],
        keywords: [
          "logo",
          "wordmark",
          "favicon",
          "login background",
          "white label",
          "brand",
          "accent color",
          "default theme",
          "app name",
          "pwa",
          "light theme logo",
          "light wordmark",
          "light icon",
          "theme",
          "custom css",
          "community themes",
          "overlays",
          "poster badges",
        ],
        settings: settingIndex(
          "Logos and icons",
          "Logo (wordmark)",
          "Logo (wordmark, light themes)",
          "Logo (icon)",
          "Logo (icon, light themes)",
          "Favicon",
          "Login background",
          "Colors and theme",
          "Accent color",
          "Custom accent color",
          "Default theme",
          "Individual colors and fonts",
          "Custom CSS",
          "Community theme list",
          "Card overlays",
          "Show badges on poster art",
          "Badge style",
        ),
        icon: Paintbrush,
      },
      {
        id: "security",
        get label() {
          return tr("lib.admin_settings_search.security_access");
        },
        get description() {
          return tr(
            "lib.admin_settings_search.sign_in_sessions_trusted_proxies_and_request_rate_limits",
          );
        },
        groups: ["Sign-in sessions", "Network", "Rate limiting"],
        keywords: [
          "access token",
          "refresh token",
          "expiry",
          "session",
          "proxy",
          "x-forwarded-for",
          "client ip",
          "rate limit",
          "throttle",
          "429",
          "api key tier",
          "security",
        ],
        settings: settingIndex(
          "Sign-in sessions",
          "Access token expiry",
          "Refresh token expiry",
          "Network",
          "Trusted proxies",
          "Rate limiting",
          "Enable rate limiting",
          "Where counters are kept",
          "Whole-server requests per second",
          "Per client address",
          "Burst allowance",
          "Standard API keys",
          "Elevated API keys",
        ),
        icon: Users,
      },
      {
        id: "library",
        get label() {
          return tr("lib.admin_settings_search.library_metadata");
        },
        get description() {
          return tr(
            "lib.admin_settings_search.artwork_storage_scanning_intro_and_credits_markers_and_catalog_search",
          );
        },
        groups: ["Artwork", "Scanning", "Intro and credits markers", "Search"],
        keywords: [
          "scanner workers",
          "matcher",
          "batch size",
          "artwork",
          "posters",
          "image caching",
          "cache images",
          "object storage",
          "intro",
          "credits",
          "recap",
          "markers",
          "marker detection",
          "meilisearch",
          "postgres search",
          "semantic",
          "metadata",
        ],
        settings: settingIndex(
          "Artwork",
          "Store artwork in your bucket",
          "Scanning",
          "Scanner workers",
          "Matcher workers",
          "Matcher batch size",
          "Intro and credits markers",
          "Find intros and credits",
          "Fetch markers on playback",
          "Populate markers",
          "Contribute markers",
          "Search",
          "Search engine",
          "Meilisearch URL",
          "Meilisearch API key",
          "Index name prefix",
          "Query timeout (ms)",
          "When a search has several words",
          "Items sent to the index per batch",
          "Match by meaning as well as words",
          "Meaning-based share of results",
          "Search status",
        ),
        icon: Library,
      },
      {
        id: "playback",
        get label() {
          return tr("lib.admin_settings_search.playback");
        },
        get description() {
          return tr(
            "lib.admin_settings_search.transcoding_hardware_acceleration_and_watch_thresholds",
          );
        },
        groups: ["Transcoding", "Watch behavior"],
        keywords: [
          "ffmpeg",
          "transcode",
          "hardware acceleration",
          "gpu",
          "chapter thumbnails",
          "watched threshold",
          "resume",
          "4k",
        ],
        settings: settingIndex(
          "Transcoding",
          "Hardware acceleration",
          "Allow 4K transcoding",
          "FFmpeg path",
          "Transcode directory",
          "GPU devices",
          "Local transcode fallback",
          "Throttle transcoding",
          "Buffer ahead (seconds)",
          "Chapter thumbnail workers",
          "Generate chapter thumbnails on",
          "HDR handling",
          "Convert HDR colors on the CPU when the GPU cannot",
          "Watch behavior",
          "Mark watched at (%)",
          "Show in Continue Watching after (%)",
        ),
        icon: PlayCircle,
      },
      {
        id: "downloads",
        get label() {
          return tr("lib.admin_settings_search.downloads");
        },
        get description() {
          return tr(
            "lib.admin_settings_search.offline_downloads_per_user_and_server_wide_limits_and_prepared",
          );
        },
        groups: ["Downloads"],
        keywords: [
          "downloads",
          "offline",
          "bandwidth",
          "mbps",
          "throttle",
          "quota",
          "concurrency",
          "prepared copies",
          "artifacts",
          "storage budget",
        ],
        settings: settingIndex(
          "Downloads",
          "Allow downloads",
          "Per-user bandwidth",
          "Per user",
          "Downloads at once per user",
          "Downloads per period",
          "Period length",
          "Whole server",
          "Server bandwidth",
          "Prepare device-friendly copies",
          "Prepared file directory",
          "Files prepared at once",
          "Prepared file storage budget",
        ),
        icon: Download,
      },
      {
        id: "providers",
        get label() {
          return tr("lib.admin_settings_search.subtitles_metadata");
        },
        get description() {
          return tr(
            "lib.admin_settings_search.subtitle_provider_accounts_the_mdblist_metadata_key_and_marker_providers",
          );
        },
        groups: ["Subtitle providers", "Metadata providers", "Marker providers"],
        keywords: [
          "opensubtitles",
          "subdl",
          "subsource",
          "mdblist",
          "subtitles",
          "captions",
          "api key",
          "provider credentials",
          "integrations",
          "theintrodb",
          "introdb",
          "marker providers",
          "markers",
          "intro",
          "credits",
        ],
        settings: settingIndex(
          "Subtitle providers",
          "OpenSubtitles",
          "SubDL",
          "SubSource",
          "Username",
          "Password",
          "API key",
          "Metadata providers",
          "MDBList",
          "Marker providers",
          "TheIntroDB",
          "Use for online marker lookup",
          "Lookup order",
          "Allow contributions",
          "Send this server's markers automatically",
          "Minimum confidence",
        ),
        icon: Captions,
      },
      {
        id: "watch-sync",
        get label() {
          return tr("lib.admin_settings_search.watch_providers");
        },
        get description() {
          return tr(
            "lib.admin_settings_search.trakt_simkl_and_watch_provider_plugins_that_profiles_connect_their",
          );
        },
        groups: ["Watch providers"],
        keywords: [
          "trakt",
          "simkl",
          "scrobble",
          "watch providers",
          "client id",
          "client secret",
          "sync",
          "integrations",
          "plugin",
        ],
        settings: settingIndex("Watch providers", "Trakt", "Simkl", "Client ID", "Client secret"),
        icon: RefreshCw,
      },
      {
        id: "ai",
        get label() {
          return tr("lib.admin_settings_search.ai_services");
        },
        get description() {
          return tr(
            "lib.admin_settings_search.text_and_speech_to_text_models_and_the_features_that",
          );
        },
        groups: ["Models", "Features", "Usage and tuning"],
        keywords: [
          "openai",
          "ollama",
          "groq",
          "whisper",
          "llm",
          "model",
          "translation",
          "transcription",
          "subtitle translation",
          "integrations",
        ],
        settings: settingIndex(
          "Models",
          "Text model",
          "Speech-to-text",
          "Base URL",
          "Model",
          "API key",
          "Features",
          "Translate subtitles",
          "Create subtitles from audio",
          "Translate descriptions",
          "Description translation for viewers",
          "Jobs running at once",
          "Subtitle lines per request",
          "Surrounding lines sent for context",
          "Audio sent per request (seconds)",
          "Transcriptions per account",
          "Allowance resets",
        ),
        icon: Sparkles,
      },
      {
        id: "notifications",
        get label() {
          return tr("lib.admin_settings_search.notifications");
        },
        get description() {
          return tr(
            "lib.admin_settings_search.release_events_delivery_channels_the_mail_server_and_webhooks",
          );
        },
        groups: ["Release events", "Delivery channels", "Tuning", "Retention"],
        keywords: [
          "release events",
          "new episode",
          "email",
          "smtp",
          "mail",
          "silo push relay",
          "mobile push",
          "apns",
          "fcm",
          "discord",
          "web push",
          "webhooks",
          "server channels",
          "digest",
        ],
        settings: settingIndex(
          "Notice new content",
          "Enable release events",
          "Work out who wants it",
          "Enable fanout",
          "Delivery Channels",
          "In-App",
          "Web Push",
          "Silo Push Relay",
          "Relay URL",
          "Deployment ID",
          "Apple Push (APNs)",
          "Android Push (FCM)",
          "Email",
          "Send email from this server",
          "From address",
          "From name",
          "Mail server address",
          "Port",
          "Encryption",
          "Username",
          "Password",
          "Test email recipient",
          "Let people pick an email per episode",
          "Send the daily summary at",
          "Link back to this server at",
          "Discord",
          "Client ID",
          "Client secret",
          "Bot token",
          "Let people pick a DM per episode",
          "Show artwork in Discord messages",
          "Mention the requester on Discord",
          "Personal Webhooks",
          "Webhooks each person may create",
          "Webhook calls per minute, per person",
          "Allow webhooks to private addresses",
          "Server Channels",
          "Collect new items for (seconds)",
          "Grouping and flood control",
          "Wait before sending (seconds)",
          "Most messages per show at once",
          "Give up on content older than (hours)",
          "How long notifications are kept",
        ),
        icon: Bell,
      },
      {
        id: "compatibility",
        get label() {
          return tr("lib.admin_settings_search.compatibility");
        },
        get description() {
          return tr(
            "lib.admin_settings_search.jellyfin_and_audiobookshelf_client_compatibility_and_the_jellyfin_web_player",
          );
        },
        groups: ["Jellyfin", "Audiobookshelf"],
        keywords: [
          "jellyfin",
          "audiobookshelf",
          "abs",
          "proxy",
          "public url",
          "server id",
          "session ttl",
          "web player",
        ],
        settings: settingIndex(
          "Jellyfin",
          "Allow Jellyfin apps to connect",
          "Address Jellyfin apps should use",
          "Jellyfin Web install progress",
          "Web player version to install",
          "Web player install folder",
          "Name shown to Jellyfin apps",
          "Server ID",
          "Jellyfin version to report",
          "Stay signed in for",
          "Forget idle playback after",
          "Audiobookshelf",
          "Allow Audiobookshelf apps to connect",
        ),
        icon: Plug,
      },
    ],
  },
];

export const ADMIN_SETTINGS_NAV = ADMIN_SETTINGS_GROUPS.flatMap((group) => group.items);

const ADMIN_SETTINGS_PAGE_IDS = new Set(ADMIN_SETTINGS_NAV.map((item) => item.id));

/**
 * Deep links from earlier layouts. Bookmarks, docs, and older client builds
 * still point at these ids, so every one of them resolves to the page that
 * absorbed it rather than falling through to the settings overview.
 */
export const LEGACY_ADMIN_SETTINGS_PAGE_ALIASES: Readonly<Record<string, string>> = {
  branding: "appearance",
  theming: "appearance",
  overlays: "appearance",
  "rate-limiting": "security",
  scanner: "library",
  search: "library",
  intro: "library",
  subtitles: "providers",
  integrations: "providers",
  "watch-providers": "watch-sync",
  email: "notifications",
  jellyfin: "compatibility",
  "compatibility-proxies": "compatibility",
  database: "infrastructure",
  storage: "infrastructure",
  "log-retention": "infrastructure",
};

/** Resolves a route segment or legacy `?tab=` value to a current page id. */
export function resolveAdminSettingsPageID(value: string | null): string | null {
  if (!value) return null;
  if (ADMIN_SETTINGS_PAGE_IDS.has(value)) return value;
  return LEGACY_ADMIN_SETTINGS_PAGE_ALIASES[value] ?? null;
}
