import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Server,
  Trash2,
} from "lucide-react";
import { useProfiles } from "@/hooks/queries/profiles";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";

import { SettingsGroup } from "@/components/settings/SettingsGroup";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "@/i18n/toast";
import type {
  WebhookSyncConnection,
  WebhookSyncDiscoveredUser,
  WebhookSyncEventLog,
  WebhookSyncProfileMapping,
} from "@/api/types";
import {
  useCreateWebhookSyncConnection,
  useDeleteWebhookSyncConnection,
  useRotateWebhookSyncWebhook,
  useUpdateWebhookSyncConnection,
  useUpdateWebhookSyncProfileMappings,
  useWebhookSyncConnections,
  useWebhookSyncEvents,
  useWebhookSyncProfileMappings,
} from "@/hooks/queries/webhook-sync";
import {
  buildPlexAuthURL,
  completePlexAuthentication,
  createPlexPin,
  getPreferredPlexServerURL,
  type BrowserPlexServer,
} from "@/lib/plexAuth";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

const UNMAPPED_VALUE = "__unmapped__";

const JELLYFIN_TEMPLATE = `{
  "provider": "jellyfin",
  "notification_type": "{{NotificationType}}",
  "timestamp": "{{UtcTimestamp}}",
  "server_name": "{{ServerName}}",
  "user": {
    "id": "{{UserId}}",
    "name": "{{{Username}}}"
  },
  "item": {
    "id": "{{ItemId}}",
    "type": "{{ItemType}}",
    "name": "{{{Name}}}",
    "series_name": "{{{SeriesName}}}",
    "year": {{#if_exist Year}}{{Year}}{{else}}0{{/if_exist}},
    "season_number": {{#if_exist SeasonNumber}}{{SeasonNumber}}{{else}}0{{/if_exist}},
    "episode_number": {{#if_exist EpisodeNumber}}{{EpisodeNumber}}{{else}}0{{/if_exist}},
    "runtime_ticks": {{#if_exist RunTimeTicks}}{{RunTimeTicks}}{{else}}0{{/if_exist}},
    "provider_ids": {
      "imdb": "{{Provider_imdb}}",
      "tmdb": "{{Provider_tmdb}}",
      "tvdb": "{{Provider_tvdb}}"
    }
  },
  "playback": {
    "position_ticks": {{#if_exist PlaybackPositionTicks}}{{PlaybackPositionTicks}}{{else}}0{{/if_exist}},
    "played_to_completion": {{#if_equals PlayedToCompletion 'true'}}true{{else}}false{{/if_equals}},
    "runtime_ticks": {{#if_exist RunTimeTicks}}{{RunTimeTicks}}{{else}}0{{/if_exist}}
  }
}`;

function formatTimestamp(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function relativeTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

type ConnectionHealth = "healthy" | "error" | "waiting";

function connectionHealth(connection: WebhookSyncConnection): ConnectionHealth {
  if (connection.last_webhook_error_at) {
    const errorTime = new Date(connection.last_webhook_error_at).getTime();
    const receivedTime = connection.last_webhook_received_at
      ? new Date(connection.last_webhook_received_at).getTime()
      : Number.NEGATIVE_INFINITY;
    if (Number.isFinite(errorTime) && errorTime > receivedTime) {
      return "error";
    }
  }
  if (connection.last_webhook_received_at) return "healthy";
  if (connection.last_webhook_error_message) return "error";
  return "waiting";
}

const HEALTH_DOT: Record<ConnectionHealth, string> = {
  healthy: "bg-emerald-400",
  error: "bg-red-400",
  waiting: "bg-yellow-400/70",
};

const HEALTH_LABEL: Record<ConnectionHealth, string> = {
  healthy: "Receiving events",
  error: "Needs attention",
  waiting: "Awaiting first event",
};

const EVENT_OUTCOME_LABEL: Record<WebhookSyncEventLog["outcome"], string> = {
  applied: "Applied",
  ignored: "Ignored",
  unmatched: "Unmatched",
  skipped: "Skipped",
  rejected: "Rejected",
  error: "Error",
};

const EVENT_OUTCOME_BADGE: Record<WebhookSyncEventLog["outcome"], string> = {
  applied: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  ignored: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  unmatched: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  skipped: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
  rejected: "border-red-500/30 bg-red-500/10 text-red-300",
  error: "border-red-500/30 bg-red-500/10 text-red-300",
};

function providerLabel(provider: WebhookSyncConnection["provider"] | ProviderType) {
  switch (provider) {
    case "plex":
      return "Plex";
    case "emby":
      return "Emby";
    case "jellyfin":
      return "Jellyfin";
  }
}

function eventAttrString(event: WebhookSyncEventLog, key: string) {
  const value = event.attrs?.[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function eventUserLabel(event: WebhookSyncEventLog) {
  const userName = eventAttrString(event, "external_user_name");
  const userID = eventAttrString(event, "external_user_id");
  if (userName && userID) return `${userName} (${userID})`;
  return userName || userID || "Unknown user";
}

function eventMatchedItemLabel(event: WebhookSyncEventLog) {
  return eventAttrString(event, "matched_media_item_title") || null;
}

const EVENT_ATTR_LABELS: Record<string, string> = {
  event_kind: "pages.settings.webhook_sync_settings.event_kind",
  action: "pages.settings.webhook_sync_settings.action",
  external_user_id: "pages.settings.webhook_sync_settings.external_user_id",
  external_user_name: "pages.settings.webhook_sync_settings.external_user",
  external_item_id: "pages.settings.webhook_sync_settings.external_item_id",
  media_kind: "pages.settings.webhook_sync_settings.media_kind",
  matched_media_item_id: "pages.settings.webhook_sync_settings.matched_item_id",
  matched_media_item_title: "pages.settings.webhook_sync_settings.matched_item",
  profile_id: "pages.settings.webhook_sync_settings.profile_id",
  client_ip: "pages.settings.webhook_sync_settings.client_ip",
  content_type: "pages.settings.webhook_sync_settings.content_type",
  user_agent: "pages.settings.webhook_sync_settings.user_agent",
  path_pattern: "pages.settings.webhook_sync_settings.path_pattern",
};

function eventAttrLabel(key: string) {
  const knownLabel = EVENT_ATTR_LABELS[key];
  return knownLabel ? tr(knownLabel) : key.replace(/_/g, " ");
}

type ProviderType = "plex" | "emby" | "jellyfin";
type ConnectionDraft = { serverName: string; defaultProfileId: string };

type EventMatrixTone = "required" | "recommended" | "skip";
type EventMatrixSection = {
  label: string;
  tone: EventMatrixTone;
  items: { event: string; note: string }[];
};

const EVENT_MATRIX_TONE: Record<EventMatrixTone, string> = {
  required: "text-emerald-300",
  recommended: "text-sky-300",
  skip: "text-muted-foreground",
};

function EventMatrix({ sections }: { sections: EventMatrixSection[] }) {
  useUILanguage();
  return (
    <div className="border-border/50 divide-border/50 divide-y rounded-md border">
      {sections.map((section) => (
        <div key={section.label} className="space-y-1.5 px-3 py-2.5">
          <p
            className={cn(
              "text-[11px] font-medium tracking-wide uppercase",
              EVENT_MATRIX_TONE[section.tone],
            )}
          >
            {section.label}
          </p>
          <ul className="space-y-1">
            {section.items.map((item) => (
              <li key={item.event} className="text-[13px] leading-relaxed">
                <span className="text-foreground font-medium">{item.event}</span>
                <span className="text-muted-foreground"> — {item.note}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function WebhookSyncSettings() {
  useUILanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useCurrentProfile();
  const { data: profiles = [] } = useProfiles();
  const connectionsQuery = useWebhookSyncConnections();
  const createConnectionMutation = useCreateWebhookSyncConnection();
  const deleteConnectionMutation = useDeleteWebhookSyncConnection();
  const rotateWebhookMutation = useRotateWebhookSyncWebhook();
  const updateConnectionMutation = useUpdateWebhookSyncConnection();
  const updateMappingsMutation = useUpdateWebhookSyncProfileMappings();

  const [provider, setProvider] = useState<ProviderType>("plex");
  const [manualServerName, setManualServerName] = useState("");
  const [plexServers, setPlexServers] = useState<BrowserPlexServer[]>([]);
  const [selectedServerId, setSelectedServerId] = useState("");
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>("");
  const [defaultProfileId, setDefaultProfileId] = useState(profile?.id ?? "");
  const [webhookUrls, setWebhookUrls] = useState<Record<string, string>>({});
  const [connectionDraftsById, setConnectionDraftsById] = useState<Record<string, ConnectionDraft>>(
    {},
  );
  const [mappingDraftsByConnection, setMappingDraftsByConnection] = useState<
    Record<string, Record<string, string>>
  >({});
  const [plexAuthPending, setPlexAuthPending] = useState(false);
  const [plexAuthError, setPlexAuthError] = useState<string | null>(null);
  const [eventSearch, setEventSearch] = useState("");
  const [eventOutcomeFilter, setEventOutcomeFilter] = useState<
    WebhookSyncEventLog["outcome"] | "all"
  >("all");
  const [eventPage, setEventPage] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<WebhookSyncEventLog | null>(null);

  const connections = useMemo(() => connectionsQuery.data ?? [], [connectionsQuery.data]);

  const selectedConnection = useMemo(() => {
    return connections.find((c) => c.id === selectedConnectionId) ?? connections[0] ?? null;
  }, [connections, selectedConnectionId]);

  const currentConnectionId = selectedConnection?.id ?? "";
  const mappingsQuery = useWebhookSyncProfileMappings(currentConnectionId || undefined);
  const eventsQuery = useWebhookSyncEvents(currentConnectionId || undefined);
  const effectiveSelectedServerId = selectedServerId || plexServers[0]?.clientIdentifier || "";
  const effectiveDefaultProfileId = defaultProfileId || profile?.id || profiles[0]?.id || "";
  const currentMappingDrafts = mappingDraftsByConnection[currentConnectionId] ?? {};
  const currentConnectionDraft = currentConnectionId
    ? connectionDraftsById[currentConnectionId]
    : undefined;
  const selectedPlexServer = useMemo(
    () =>
      plexServers.find((server) => server.clientIdentifier === effectiveSelectedServerId) ?? null,
    [effectiveSelectedServerId, plexServers],
  );

  const mappingRows = useMemo(() => {
    const discoveredUsers = mappingsQuery.data?.discovered_users ?? [];
    const mappings = mappingsQuery.data?.mappings ?? [];
    const byUserId = new Map<
      string,
      { user: WebhookSyncDiscoveredUser; mapping?: WebhookSyncProfileMapping }
    >();

    for (const user of discoveredUsers) {
      byUserId.set(user.external_user_id, { user });
    }
    for (const mapping of mappings) {
      const existing = byUserId.get(mapping.external_user_id);
      byUserId.set(mapping.external_user_id, {
        user: existing?.user ?? {
          external_user_id: mapping.external_user_id,
          external_user_name: mapping.external_user_name,
        },
        mapping,
      });
    }

    return Array.from(byUserId.values())
      .map(({ user, mapping }) => ({
        external_user_id: user.external_user_id,
        external_user_name: user.external_user_name,
        silo_profile_id: mapping?.silo_profile_id ?? "",
      }))
      .sort((a, b) => a.external_user_name.localeCompare(b.external_user_name));
  }, [mappingsQuery.data]);

  const EVENTS_PER_PAGE = 15;

  const filteredEvents = useMemo(() => {
    let events = eventsQuery.data ?? [];
    if (eventOutcomeFilter !== "all") {
      events = events.filter((e) => e.outcome === eventOutcomeFilter);
    }
    if (eventSearch.trim()) {
      const q = eventSearch.trim().toLowerCase();
      events = events.filter(
        (e) =>
          e.summary.toLowerCase().includes(q) ||
          eventUserLabel(e).toLowerCase().includes(q) ||
          (e.error_message ?? "").toLowerCase().includes(q),
      );
    }
    return events;
  }, [eventsQuery.data, eventOutcomeFilter, eventSearch]);

  const eventTotalPages = Math.max(1, Math.ceil(filteredEvents.length / EVENTS_PER_PAGE));
  const eventPageClamped = Math.min(eventPage, eventTotalPages - 1);
  const pagedEvents = useMemo(
    () =>
      filteredEvents.slice(
        eventPageClamped * EVENTS_PER_PAGE,
        eventPageClamped * EVENTS_PER_PAGE + EVENTS_PER_PAGE,
      ),
    [filteredEvents, eventPageClamped],
  );
  const eventRangeStart = filteredEvents.length === 0 ? 0 : eventPageClamped * EVENTS_PER_PAGE + 1;
  const eventRangeEnd = Math.min((eventPageClamped + 1) * EVENTS_PER_PAGE, filteredEvents.length);

  const returnedPlexAuth = searchParams.get("plex_auth");
  const returnedPlexPinId = searchParams.get("plex_pin_id");
  const returnedPlexPinCode = searchParams.get("plex_pin_code");
  const currentConnectionServerName =
    currentConnectionDraft?.serverName ?? selectedConnection?.server_name ?? "";
  const currentConnectionDefaultProfileId =
    currentConnectionDraft?.defaultProfileId ?? selectedConnection?.default_profile_id ?? "";
  const currentConnectionDefaultValue = currentConnectionDefaultProfileId || UNMAPPED_VALUE;
  const currentConnectionHasUnsavedChanges =
    !!selectedConnection &&
    (currentConnectionServerName !== selectedConnection.server_name ||
      currentConnectionDefaultProfileId !== selectedConnection.default_profile_id);

  useEffect(() => {
    if (returnedPlexAuth !== "1") {
      return;
    }

    if (!returnedPlexPinId || !returnedPlexPinCode) {
      setPlexAuthError(
        tr(
          "pages.settings.webhook_sync_settings.plex_sign_in_returned_without_the_expected_session_details_please",
        ),
      );
      void navigate("/settings/webhook-sync", { replace: true });
      return;
    }

    const pinID = Number(returnedPlexPinId);
    if (!Number.isFinite(pinID) || pinID <= 0) {
      setPlexAuthError(
        tr(
          "pages.settings.webhook_sync_settings.plex_sign_in_returned_an_invalid_pin_please_try_again",
        ),
      );
      void navigate("/settings/webhook-sync", { replace: true });
      return;
    }

    let cancelled = false;
    setPlexAuthPending(true);
    setPlexAuthError(null);

    void (async () => {
      try {
        const { servers } = await completePlexAuthentication(pinID, returnedPlexPinCode);
        if (cancelled) {
          return;
        }
        setPlexServers(servers);
        setSelectedServerId(servers[0]?.clientIdentifier ?? "");
      } catch (error) {
        if (cancelled) {
          return;
        }
        setPlexServers([]);
        setSelectedServerId("");
        setPlexAuthError(
          tr.error("errors.settings.webhook_sync_settings.failed_to_finish_plex_sign_in", error),
        );
      } finally {
        if (!cancelled) {
          setPlexAuthPending(false);
          void navigate("/settings/webhook-sync", { replace: true });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, returnedPlexAuth, returnedPlexPinCode, returnedPlexPinId]);

  useEffect(() => {
    if (provider !== "plex") {
      setPlexAuthError(null);
      setPlexAuthPending(false);
      setPlexServers([]);
      setSelectedServerId("");
    }
  }, [provider]);

  // Reset delivery filters when the selected connection changes.
  useEffect(() => {
    setEventSearch("");
    setEventOutcomeFilter("all");
    setEventPage(0);
  }, [currentConnectionId]);

  // Reset page when filters change.
  useEffect(() => {
    setEventPage(0);
  }, [eventSearch, eventOutcomeFilter]);

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("feedback.settings.webhook_sync_settings.copied_to_clipboard");
    } catch {
      toast.error("errors.settings.webhook_sync_settings.failed_to_copy_to_clipboard");
    }
  }

  async function handleStartPlexAuth() {
    setPlexAuthPending(true);
    setPlexAuthError(null);
    setPlexServers([]);
    setSelectedServerId("");

    try {
      const pin = await createPlexPin();
      const forwardURL = new URL("/settings/webhook-sync", window.location.origin);
      forwardURL.searchParams.set("plex_auth", "1");
      forwardURL.searchParams.set("plex_pin_id", String(pin.id));
      forwardURL.searchParams.set("plex_pin_code", pin.code);
      window.location.assign(buildPlexAuthURL(pin.code, forwardURL.toString()));
    } catch (error) {
      setPlexAuthPending(false);
      setPlexAuthError(
        tr.error("errors.settings.webhook_sync_settings.failed_to_start_plex_sign_in", error),
      );
    }
  }

  async function handleCreateConnection() {
    if (!effectiveDefaultProfileId || effectiveDefaultProfileId === UNMAPPED_VALUE) {
      return;
    }

    const result = await createConnectionMutation.mutateAsync(
      provider === "plex"
        ? {
            provider: "plex",
            server_id: selectedPlexServer?.clientIdentifier ?? "",
            server_name: selectedPlexServer?.name ?? "",
            base_url: selectedPlexServer ? getPreferredPlexServerURL(selectedPlexServer) : "",
            access_token: selectedPlexServer?.accessToken ?? "",
            default_profile_id: effectiveDefaultProfileId,
          }
        : {
            provider,
            server_name: manualServerName.trim(),
            default_profile_id: effectiveDefaultProfileId,
          },
    );

    setWebhookUrls((current) => ({
      ...current,
      [result.connection.id]: result.webhook_url,
    }));
    setSelectedConnectionId(result.connection.id);
  }

  async function handleSaveMappings() {
    if (!currentConnectionId) {
      return;
    }

    await updateMappingsMutation.mutateAsync({
      connectionId: currentConnectionId,
      body: {
        mappings: mappingRows.map((row) => {
          const value = currentMappingDrafts[row.external_user_id] ?? row.silo_profile_id;
          return {
            external_user_id: row.external_user_id,
            external_user_name: row.external_user_name,
            silo_profile_id: !value || value === UNMAPPED_VALUE ? null : value,
          };
        }),
      },
    });
  }

  function setDraftProfile(externalUserId: string, profileId: string) {
    if (!currentConnectionId) {
      return;
    }
    setMappingDraftsByConnection((current) => ({
      ...current,
      [currentConnectionId]: {
        ...(current[currentConnectionId] ?? {}),
        [externalUserId]: profileId,
      },
    }));
  }

  function setConnectionDraft(update: Partial<ConnectionDraft>) {
    if (!currentConnectionId || !selectedConnection) {
      return;
    }
    setConnectionDraftsById((current) => ({
      ...current,
      [currentConnectionId]: {
        serverName: current[currentConnectionId]?.serverName ?? selectedConnection.server_name,
        defaultProfileId:
          current[currentConnectionId]?.defaultProfileId ?? selectedConnection.default_profile_id,
        ...update,
      },
    }));
  }

  const hasSignedInToPlex = plexServers.length > 0;
  const canCreateConnection =
    effectiveDefaultProfileId &&
    effectiveDefaultProfileId !== UNMAPPED_VALUE &&
    (provider === "plex" ? !!selectedPlexServer : manualServerName.trim().length > 0);

  return (
    <div className="space-y-6 pb-6">
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {tr("pages.settings.webhook_sync_settings.webhook_sync")}
        </h2>
        <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
          {tr(
            "pages.settings.webhook_sync_settings.receive_watched_stop_and_progress_events_from_plex_emby_and",
          )}
        </p>
      </div>

      <SettingsGroup
        title={tr("pages.settings.webhook_sync_settings.add_a_connection")}
        description={tr(
          "pages.settings.webhook_sync_settings.create_a_provider_specific_webhook_endpoint_and_choose_the_default",
        )}
      >
        <div className="flex flex-col gap-3">
          <Label className="text-sm font-medium">
            {tr("pages.settings.webhook_sync_settings.provider")}
          </Label>
          <Select value={provider} onValueChange={(value) => setProvider(value as ProviderType)}>
            <SelectTrigger className="w-full sm:w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="plex">
                {tr("pages.settings.webhook_sync_settings.plex")}
              </SelectItem>
              <SelectItem value="emby">
                {tr("pages.settings.webhook_sync_settings.emby")}
              </SelectItem>
              <SelectItem value="jellyfin">
                {tr("pages.settings.webhook_sync_settings.jellyfin")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {provider === "plex" ? (
          <>
            <div className="border-border/50 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-0.5">
                <Label className="text-sm font-medium">
                  {tr("pages.settings.webhook_sync_settings.plex_account")}
                </Label>
                <p className="text-muted-foreground text-[13px] leading-relaxed">
                  {hasSignedInToPlex
                    ? tr("pages.settings.webhook_sync_settings.length_server_value_available", {
                        length: plexServers.length,
                        value: plexServers.length === 1 ? "" : "s",
                      })
                    : tr(
                        "pages.settings.webhook_sync_settings.authorize_via_plex_tv_to_discover_your_servers",
                      )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {plexAuthPending ? (
                  <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                ) : null}
                <Button
                  variant={hasSignedInToPlex ? "outline" : "default"}
                  size="sm"
                  onClick={handleStartPlexAuth}
                  disabled={plexAuthPending}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {hasSignedInToPlex
                    ? tr("pages.settings.webhook_sync_settings.re_authenticate")
                    : tr("pages.settings.webhook_sync_settings.sign_in_to_plex")}
                </Button>
              </div>
            </div>

            {plexAuthError ? <p className="text-destructive text-xs">{plexAuthError}</p> : null}

            {hasSignedInToPlex ? (
              <div className="border-border/50 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-0.5">
                  <Label className="text-sm font-medium">
                    {tr("pages.settings.webhook_sync_settings.server")}
                  </Label>
                  <p className="text-muted-foreground text-[13px] leading-relaxed">
                    {tr(
                      "pages.settings.webhook_sync_settings.the_plex_media_server_that_will_send_webhook_events",
                    )}
                  </p>
                </div>
                <Select
                  value={effectiveSelectedServerId}
                  onValueChange={(value) => {
                    setSelectedServerId(value);
                  }}
                >
                  <SelectTrigger className="w-full sm:w-[240px]">
                    <SelectValue
                      placeholder={tr("pages.settings.webhook_sync_settings.select_a_server")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {plexServers.map((server) => (
                      <SelectItem key={server.clientIdentifier} value={server.clientIdentifier}>
                        {server.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </>
        ) : (
          <div className="border-border/50 flex flex-col gap-3 border-t pt-4">
            <Label className="text-sm font-medium">
              {tr("pages.settings.webhook_sync_settings.connection_name")}
            </Label>
            <Input
              value={manualServerName}
              onChange={(event) => setManualServerName(event.target.value)}
              placeholder={
                provider === "emby"
                  ? tr("pages.settings.webhook_sync_settings.my_emby_server")
                  : tr("pages.settings.webhook_sync_settings.my_jellyfin_server")
              }
            />
          </div>
        )}

        <div className="border-border/50 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-0.5">
            <Label className="text-sm font-medium">
              {tr("pages.settings.webhook_sync_settings.default_profile")}
            </Label>
            <p className="text-muted-foreground text-[13px] leading-relaxed">
              {tr(
                "pages.settings.webhook_sync_settings.the_signed_in_external_user_is_linked_to_this_profile",
              )}
            </p>
          </div>
          <Select
            value={effectiveDefaultProfileId || UNMAPPED_VALUE}
            onValueChange={(value) => setDefaultProfileId(value === UNMAPPED_VALUE ? "" : value)}
          >
            <SelectTrigger className="w-full sm:w-[240px]">
              <SelectValue
                placeholder={tr("pages.settings.webhook_sync_settings.choose_a_profile")}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNMAPPED_VALUE}>
                {tr("pages.settings.webhook_sync_settings.choose_a_profile")}
              </SelectItem>
              {profiles.map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  {candidate.name}
                  {profile?.id === candidate.id
                    ? tr("pages.settings.webhook_sync_settings.current")
                    : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="border-border/50 flex justify-end border-t pt-4">
          <Button
            onClick={handleCreateConnection}
            disabled={!canCreateConnection || createConnectionMutation.isPending}
          >
            {createConnectionMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {tr("pages.settings.webhook_sync_settings.create_connection")}
          </Button>
        </div>
      </SettingsGroup>

      {/* ── Connected servers ── */}
      <SettingsGroup
        title={tr("pages.settings.webhook_sync_settings.connected_servers")}
        description={tr(
          "pages.settings.webhook_sync_settings.manage_webhook_endpoints_provider_setup_instructions_and_profile_mappings",
        )}
      >
        {connectionsQuery.isLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            {tr("pages.settings.webhook_sync_settings.loading_connections")}
          </div>
        ) : connectionsQuery.isError ? (
          <div className="flex items-start gap-2.5 rounded-md bg-red-500/10 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
            <p className="text-sm leading-relaxed text-red-300">
              {connectionsQuery.error instanceof Error
                ? connectionsQuery.error.message
                : tr("pages.settings.webhook_sync_settings.failed_to_load_webhook_connections")}
            </p>
          </div>
        ) : connections.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {tr(
              "pages.settings.webhook_sync_settings.no_webhook_connections_yet_create_one_above_to_generate_a",
            )}
          </p>
        ) : (
          <div className="space-y-2">
            {connections.map((connection) => {
              const health = connectionHealth(connection);
              const isSelected = connection.id === currentConnectionId;

              return (
                <button
                  key={connection.id}
                  type="button"
                  onClick={() => setSelectedConnectionId(connection.id)}
                  className={cn(
                    "group flex w-full items-center justify-between gap-4 rounded-lg px-4 py-3 text-left transition-colors",
                    isSelected ? "bg-accent/50 ring-border ring-1" : "hover:bg-accent/20",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", HEALTH_DOT[health])} />
                    <div className="min-w-0">
                      <span className="text-sm font-medium">
                        {connection.server_name}
                        <span className="text-muted-foreground ml-2 text-xs font-normal">
                          {providerLabel(connection.provider)}
                        </span>
                      </span>
                      <p className="text-muted-foreground text-xs">
                        {connection.user_count ?? 0}{" "}
                        {tr("pages.settings.webhook_sync_settings.user")}
                        {(connection.user_count ?? 0) === 1
                          ? ""
                          : tr("pages.settings.webhook_sync_settings.s")}
                        {connection.last_webhook_received_at
                          ? tr("pages.settings.webhook_sync_settings.last_event_value", {
                              value:
                                relativeTime(connection.last_webhook_received_at) ??
                                formatTimestamp(connection.last_webhook_received_at),
                            })
                          : ""}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={health === "error" ? "destructive" : "outline"}
                    className="shrink-0 text-[11px]"
                  >
                    {HEALTH_LABEL[health]}
                  </Badge>
                </button>
              );
            })}
          </div>
        )}
      </SettingsGroup>

      {/* ── Selected connection detail ── */}
      {selectedConnection ? (
        <>
          <SettingsGroup
            title={selectedConnection.server_name}
            description={tr("pages.settings.webhook_sync_settings.value_webhook_endpoint", {
              value: providerLabel(selectedConnection.provider),
            })}
          >
            {(() => {
              const health = connectionHealth(selectedConnection);
              const webhookURL =
                webhookUrls[selectedConnection.id] || selectedConnection.webhook_url || "";

              return (
                <>
                  {health === "error" && selectedConnection.last_webhook_error_message ? (
                    <div className="flex items-start gap-2.5 rounded-md bg-red-500/10 px-3 py-2.5">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm font-medium text-red-300">
                          {tr("pages.settings.webhook_sync_settings.error")}{" "}
                          {formatTimestamp(selectedConnection.last_webhook_error_at)}
                        </p>
                        <p className="text-[13px] leading-relaxed text-red-300/80">
                          {selectedConnection.last_webhook_error_message}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-[13px]">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-muted-foreground">
                        {tr(
                          "pages.settings.webhook_sync_settings.ready_to_receive_webhook_traffic",
                        )}
                      </span>
                    </div>
                  )}

                  {/* Webhook URL */}
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">
                      {tr("pages.settings.webhook_sync_settings.webhook_url")}
                    </Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input value={webhookURL} readOnly className="font-mono text-xs" />
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => webhookURL && void copyText(webhookURL)}
                          disabled={!webhookURL}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {tr("common.actions.copy")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            const result = await rotateWebhookMutation.mutateAsync(
                              selectedConnection.id,
                            );
                            setWebhookUrls((current) => ({
                              ...current,
                              [selectedConnection.id]: result.webhook_url,
                            }));
                          }}
                          disabled={rotateWebhookMutation.isPending}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          {tr("pages.settings.webhook_sync_settings.rotate")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            await deleteConnectionMutation.mutateAsync(selectedConnection.id);
                            setSelectedConnectionId("");
                          }}
                          disabled={deleteConnectionMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {tr("common.actions.delete")}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Connection name + default profile */}
                  <div className="border-border/50 space-y-3 border-t pt-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-muted-foreground text-xs">
                          {tr("pages.settings.webhook_sync_settings.connection_name")}
                        </Label>
                        <Input
                          value={currentConnectionServerName}
                          onChange={(event) =>
                            setConnectionDraft({ serverName: event.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-muted-foreground text-xs">
                          {tr("pages.settings.webhook_sync_settings.default_profile")}
                        </Label>
                        <Select
                          value={currentConnectionDefaultValue}
                          onValueChange={(value) =>
                            setConnectionDraft({
                              defaultProfileId: value === UNMAPPED_VALUE ? "" : value,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={tr(
                                "pages.settings.webhook_sync_settings.choose_a_profile",
                              )}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={UNMAPPED_VALUE}>
                              {tr("pages.settings.webhook_sync_settings.no_default_profile")}
                            </SelectItem>
                            {profiles.map((candidate) => (
                              <SelectItem key={candidate.id} value={candidate.id}>
                                {candidate.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        onClick={async () => {
                          if (!selectedConnection) {
                            return;
                          }
                          const trimmedServerName = currentConnectionServerName.trim();
                          if (!trimmedServerName) {
                            return;
                          }
                          await updateConnectionMutation.mutateAsync({
                            connectionId: selectedConnection.id,
                            body: {
                              server_name: trimmedServerName,
                              default_profile_id: currentConnectionDefaultProfileId,
                            },
                          });
                        }}
                        disabled={
                          updateConnectionMutation.isPending ||
                          !currentConnectionHasUnsavedChanges ||
                          currentConnectionServerName.trim().length === 0
                        }
                      >
                        {updateConnectionMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        {tr("pages.settings.webhook_sync_settings.save_connection")}
                      </Button>
                    </div>
                  </div>

                  {/* Profile mapping — part of connection config */}
                  <div className="border-border/50 space-y-3 border-t pt-4">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        {tr("pages.settings.webhook_sync_settings.profile_mapping")}
                      </Label>
                      <p className="text-muted-foreground text-[13px] leading-relaxed">
                        {tr(
                          "pages.settings.webhook_sync_settings.map_each_external_user_to_a_silo_profile_unmapped_users",
                        )}
                      </p>
                    </div>

                    {mappingsQuery.isLoading ? (
                      <div className="text-muted-foreground flex items-center gap-2 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {tr("pages.settings.webhook_sync_settings.loading_users")}
                      </div>
                    ) : mappingsQuery.isError ? (
                      <div className="flex items-start gap-2.5 rounded-md bg-red-500/10 px-3 py-2.5">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                        <p className="text-sm leading-relaxed text-red-300">
                          {mappingsQuery.error instanceof Error
                            ? mappingsQuery.error.message
                            : tr(
                                "pages.settings.webhook_sync_settings.failed_to_load_profile_mappings",
                              )}
                        </p>
                      </div>
                    ) : mappingRows.length > 0 ? (
                      <div className="space-y-3">
                        {mappingRows.map((row) => (
                          <div
                            key={row.external_user_id}
                            className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{row.external_user_name}</p>
                              <p className="text-muted-foreground truncate text-xs">
                                {row.external_user_id}
                              </p>
                            </div>
                            <Select
                              value={
                                currentMappingDrafts[row.external_user_id] ??
                                row.silo_profile_id ??
                                UNMAPPED_VALUE
                              }
                              onValueChange={(value) =>
                                setDraftProfile(row.external_user_id, value)
                              }
                            >
                              <SelectTrigger className="w-full sm:w-[240px]">
                                <SelectValue
                                  placeholder={tr(
                                    "pages.settings.webhook_sync_settings.choose_a_profile",
                                  )}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={UNMAPPED_VALUE}>
                                  {tr("pages.settings.webhook_sync_settings.ignore_this_user")}
                                </SelectItem>
                                {profiles.map((candidate) => (
                                  <SelectItem key={candidate.id} value={candidate.id}>
                                    {candidate.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}

                        <div className="flex justify-end">
                          <Button
                            onClick={handleSaveMappings}
                            disabled={updateMappingsMutation.isPending}
                          >
                            {updateMappingsMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : null}
                            {tr("pages.settings.webhook_sync_settings.save_mappings")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        {tr(
                          "pages.settings.webhook_sync_settings.no_users_discovered_yet_send_a_webhook_event_first_then",
                        )}
                      </p>
                    )}
                  </div>

                  {/* Setup instructions */}
                  <details className="border-border/50 border-t pt-4">
                    <summary className="text-muted-foreground flex cursor-pointer items-center gap-2 text-sm font-medium select-none">
                      <Server className="h-3.5 w-3.5" />
                      {tr("pages.settings.webhook_sync_settings.setup_instructions")}
                    </summary>
                    <div className="mt-3">
                      {selectedConnection.provider === "plex" ? (
                        <ol className="text-muted-foreground list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">
                          <li>
                            {tr("pages.settings.webhook_sync_settings.in_plex_open")}{" "}
                            <span className="text-foreground">
                              {tr("pages.settings.webhook_sync_settings.settings_webhooks")}
                            </span>{" "}
                            {tr("pages.settings.webhook_sync_settings.plex_pass_required")}
                          </li>
                          <li>
                            {tr("pages.settings.webhook_sync_settings.click")}{" "}
                            <span className="text-foreground">
                              {tr("pages.settings.webhook_sync_settings.add_webhook")}
                            </span>{" "}
                            {tr("pages.settings.webhook_sync_settings.and_paste_the_url_above")}
                          </li>
                          <li>
                            {tr(
                              "pages.settings.webhook_sync_settings.save_plex_sends_events_automatically_no_per_event_toggles_to",
                            )}
                          </li>
                        </ol>
                      ) : null}
                      {selectedConnection.provider === "emby" ? (
                        <div className="space-y-4 text-sm">
                          <ol className="text-muted-foreground list-decimal space-y-1.5 pl-5 leading-relaxed">
                            <li>
                              {tr(
                                "pages.settings.webhook_sync_settings.in_the_emby_dashboard_open",
                              )}{" "}
                              <span className="text-foreground">
                                {tr("pages.settings.webhook_sync_settings.notifications")}
                              </span>{" "}
                              {tr("pages.settings.webhook_sync_settings.and_add_a_new")}{" "}
                              <span className="text-foreground">
                                {tr("pages.settings.webhook_sync_settings.webhooks")}
                              </span>{" "}
                              {tr("pages.settings.webhook_sync_settings.notification")}
                            </li>
                            <li>
                              {tr("pages.settings.webhook_sync_settings.paste_the_url_above_into")}{" "}
                              <span className="text-foreground">
                                {tr("pages.settings.webhook_sync_settings.url")}
                              </span>
                              {tr("pages.settings.webhook_sync_settings.and_set")}{" "}
                              <span className="text-foreground">
                                {tr("pages.settings.webhook_sync_settings.request_content_type")}
                              </span>{" "}
                              {tr("pages.settings.webhook_sync_settings.to")}{" "}
                              <span className="text-foreground">
                                {tr("pages.settings.webhook_sync_settings.application_json")}
                              </span>
                              .
                            </li>
                            <li>
                              {tr(
                                "pages.settings.webhook_sync_settings.enable_the_events_listed_below_then_save",
                              )}
                            </li>
                          </ol>

                          <EventMatrix
                            sections={[
                              {
                                label: tr("pages.settings.webhook_sync_settings.required"),
                                tone: "required",
                                items: [
                                  {
                                    event: "Playback → Stop",
                                    note: "Records watch progress and completion.",
                                  },
                                ],
                              },
                              {
                                label: tr("pages.settings.webhook_sync_settings.recommended"),
                                tone: "recommended",
                                items: [
                                  {
                                    event: "Users → Add to Favorites, Remove from Favorites",
                                    note: "Syncs favorites to the mapped Silo profile.",
                                  },
                                  {
                                    event: "Users → Mark Played, Mark Unplayed",
                                    note: "Needed only if your household manually marks items watched without playing them. Mark Played will duplicate Stop for normal completions, but the result is the same.",
                                  },
                                ],
                              },
                              {
                                label: tr("common.actions.skip"),
                                tone: "skip",
                                items: [
                                  {
                                    event: "Playback → Start, Pause, Unpause",
                                    note: "Silo only records completion, not in-progress state.",
                                  },
                                ],
                              },
                            ]}
                          />
                        </div>
                      ) : null}
                      {selectedConnection.provider === "jellyfin" ? (
                        <div className="space-y-4 text-sm">
                          <ol className="text-muted-foreground list-decimal space-y-1.5 pl-5 leading-relaxed">
                            <li>
                              {tr("pages.settings.webhook_sync_settings.install_the_official")}{" "}
                              <span className="text-foreground">
                                {tr("pages.settings.webhook_sync_settings.webhook")}
                              </span>{" "}
                              {tr("pages.settings.webhook_sync_settings.plugin_from")}{" "}
                              <span className="text-foreground">
                                {tr(
                                  "pages.settings.webhook_sync_settings.dashboard_plugins_catalog",
                                )}
                              </span>{" "}
                              {tr("pages.settings.webhook_sync_settings.and_restart_jellyfin")}
                            </li>
                            <li>
                              {tr("pages.settings.webhook_sync_settings.open")}{" "}
                              <span className="text-foreground">
                                {tr(
                                  "pages.settings.webhook_sync_settings.dashboard_plugins_webhook",
                                )}
                              </span>{" "}
                              {tr("pages.settings.webhook_sync_settings.and_add_a")}{" "}
                              <span className="text-foreground">
                                {tr("pages.settings.webhook_sync_settings.generic_destination")}
                              </span>
                              .
                            </li>
                            <li>
                              {tr("pages.settings.webhook_sync_settings.paste_the_url_above_into")}{" "}
                              <span className="text-foreground">
                                {tr("pages.settings.webhook_sync_settings.webhook_url_54038d3a")}
                              </span>
                              .
                            </li>
                            <li>
                              {tr("pages.settings.webhook_sync_settings.under")}{" "}
                              <span className="text-foreground">
                                {tr("pages.settings.webhook_sync_settings.notification_type")}
                              </span>
                              {tr("pages.settings.webhook_sync_settings.enable_only")}{" "}
                              <span className="text-foreground">
                                {tr("pages.settings.webhook_sync_settings.playback_stop")}
                              </span>
                              {tr("pages.settings.webhook_sync_settings.leave")}{" "}
                              <span className="text-foreground">
                                {tr("pages.settings.webhook_sync_settings.playback_progress")}
                              </span>{" "}
                              {tr("pages.settings.webhook_sync_settings.and")}{" "}
                              <span className="text-foreground">
                                {tr("pages.settings.webhook_sync_settings.user_data_saved")}
                              </span>{" "}
                              {tr(
                                "pages.settings.webhook_sync_settings.off_silo_ignores_them_and_they_generate_heavy_traffic",
                              )}
                            </li>
                            <li>
                              {tr(
                                "pages.settings.webhook_sync_settings.paste_the_template_below_into",
                              )}{" "}
                              <span className="text-foreground">
                                {tr("pages.settings.webhook_sync_settings.template")}
                              </span>{" "}
                              {tr("pages.settings.webhook_sync_settings.and_save")}
                            </li>
                          </ol>

                          <div className="space-y-1.5">
                            <Label className="text-muted-foreground text-xs">
                              {tr("pages.settings.webhook_sync_settings.webhook_payload_template")}
                            </Label>
                            <textarea
                              readOnly
                              value={JELLYFIN_TEMPLATE}
                              className="border-input bg-background min-h-56 w-full rounded-md border px-3 py-2 font-mono text-xs"
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void copyText(JELLYFIN_TEMPLATE)}
                            >
                              <Copy className="h-3.5 w-3.5" />
                              {tr("pages.settings.webhook_sync_settings.copy_template")}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </details>
                </>
              );
            })()}
          </SettingsGroup>

          {/* Recent deliveries — table */}
          <SettingsGroup
            title={tr("pages.settings.webhook_sync_settings.recent_deliveries")}
            description={tr(
              "pages.settings.webhook_sync_settings.latest_webhook_requests_for_this_connection",
            )}
          >
            {eventsQuery.isLoading ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                {tr("pages.settings.webhook_sync_settings.loading_deliveries")}
              </div>
            ) : eventsQuery.isError ? (
              <div className="flex items-start gap-2.5 rounded-md bg-red-500/10 px-3 py-2.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                <p className="text-sm leading-relaxed text-red-300">
                  {eventsQuery.error instanceof Error
                    ? eventsQuery.error.message
                    : tr(
                        "pages.settings.webhook_sync_settings.failed_to_load_recent_webhook_deliveries",
                      )}
                </p>
              </div>
            ) : (eventsQuery.data?.length ?? 0) > 0 ? (
              <>
                {/* Filter bar */}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
                    <Input
                      value={eventSearch}
                      onChange={(e) => setEventSearch(e.target.value)}
                      placeholder={tr("pages.settings.webhook_sync_settings.search_events")}
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                  <Select
                    value={eventOutcomeFilter}
                    onValueChange={(v) =>
                      setEventOutcomeFilter(v as WebhookSyncEventLog["outcome"] | "all")
                    }
                  >
                    <SelectTrigger className="h-8 w-full text-xs sm:w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {tr("pages.settings.webhook_sync_settings.all_outcomes")}
                      </SelectItem>
                      {(Object.keys(EVENT_OUTCOME_LABEL) as WebhookSyncEventLog["outcome"][]).map(
                        (key) => (
                          <SelectItem key={key} value={key}>
                            {EVENT_OUTCOME_LABEL[key]}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Table */}
                {pagedEvents.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">
                          {tr("pages.settings.webhook_sync_settings.status")}
                        </TableHead>
                        <TableHead className="text-xs">
                          {tr("pages.settings.webhook_sync_settings.event")}
                        </TableHead>
                        <TableHead className="text-xs">
                          {tr("pages.settings.webhook_sync_settings.item")}
                        </TableHead>
                        <TableHead className="text-xs">
                          {tr("pages.settings.webhook_sync_settings.user_9f8a2389")}
                        </TableHead>
                        <TableHead className="text-right text-xs">
                          {tr("pages.settings.webhook_sync_settings.time")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedEvents.map((event) => (
                        <TableRow
                          key={event.id}
                          className="cursor-pointer"
                          onClick={() => setSelectedEvent(event)}
                        >
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn("text-[11px]", EVENT_OUTCOME_BADGE[event.outcome])}
                            >
                              {EVENT_OUTCOME_LABEL[event.outcome]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm leading-snug">{event.summary}</p>
                            {event.error_message ? (
                              <p className="mt-0.5 text-xs leading-relaxed text-red-300/80">
                                {event.error_message}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell className="max-w-[200px] text-xs">
                            {eventMatchedItemLabel(event) ?? (
                              <span className="text-muted-foreground">
                                {tr("pages.settings.webhook_sync_settings.mdash")}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {eventUserLabel(event)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-right text-xs">
                            {relativeTime(event.received_at) ?? formatTimestamp(event.received_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-muted-foreground py-4 text-center text-sm">
                    {tr(
                      "pages.settings.webhook_sync_settings.no_deliveries_match_the_current_filters",
                    )}
                  </p>
                )}

                {/* Pagination */}
                {filteredEvents.length > EVENTS_PER_PAGE ? (
                  <div className="border-border/40 flex items-center justify-between border-t px-1 pt-3">
                    <span className="text-muted-foreground text-xs tracking-tight tabular-nums">
                      {eventRangeStart}
                      {tr("pages.settings.webhook_sync_settings.ndash")}
                      {eventRangeEnd} {tr("pages.settings.webhook_sync_settings.of")}{" "}
                      {filteredEvents.length}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={eventPageClamped <= 0}
                        onClick={() => setEventPage(0)}
                        title={tr("pages.settings.webhook_sync_settings.first_page")}
                      >
                        <ChevronsLeft className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={eventPageClamped <= 0}
                        onClick={() => setEventPage((p) => Math.max(0, p - 1))}
                        title={tr("pages.settings.webhook_sync_settings.previous_page")}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={eventPageClamped >= eventTotalPages - 1}
                        onClick={() => setEventPage((p) => Math.min(eventTotalPages - 1, p + 1))}
                        title={tr("pages.settings.webhook_sync_settings.next_page")}
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={eventPageClamped >= eventTotalPages - 1}
                        onClick={() => setEventPage(eventTotalPages - 1)}
                        title={tr("pages.settings.webhook_sync_settings.last_page")}
                      >
                        <ChevronsRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                {tr(
                  "pages.settings.webhook_sync_settings.no_deliveries_yet_send_a_test_event_from_the_provider",
                )}
              </p>
            )}
          </SettingsGroup>
        </>
      ) : null}

      {/* Event detail dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        {selectedEvent ? (
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base">{selectedEvent.summary}</DialogTitle>
              <DialogDescription>
                {formatTimestamp(selectedEvent.received_at)}{" "}
                {tr("pages.settings.webhook_sync_settings.http")} {selectedEvent.http_status}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Outcome + matched item */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn("text-[11px]", EVENT_OUTCOME_BADGE[selectedEvent.outcome])}
                >
                  {EVENT_OUTCOME_LABEL[selectedEvent.outcome]}
                </Badge>
                {eventMatchedItemLabel(selectedEvent) ? (
                  <span className="text-sm">{eventMatchedItemLabel(selectedEvent)}</span>
                ) : null}
              </div>

              {selectedEvent.error_message ? (
                <p className="text-sm leading-relaxed text-red-300/80">
                  {selectedEvent.error_message}
                </p>
              ) : null}

              {/* Attributes */}
              {Object.keys(selectedEvent.attrs ?? {}).length > 0 ? (
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">
                    {tr("pages.settings.webhook_sync_settings.attributes")}
                  </Label>
                  <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                    {Object.entries(selectedEvent.attrs ?? {})
                      .filter(([, v]) => v !== "" && v != null)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([key, value]) => (
                        <div key={key} className="min-w-0">
                          <p className="text-muted-foreground text-[11px]">{eventAttrLabel(key)}</p>
                          <p className="truncate text-xs break-all">
                            {typeof value === "string" ? value : JSON.stringify(value)}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}

              {/* Body excerpt */}
              {selectedEvent.body_excerpt ? (
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">
                    {tr("pages.settings.webhook_sync_settings.body_excerpt")}
                  </Label>
                  <pre className="bg-background max-h-60 overflow-auto rounded-md border px-3 py-2 text-xs whitespace-pre-wrap">
                    {selectedEvent.body_excerpt}
                  </pre>
                </div>
              ) : null}

              {/* Request ID */}
              {selectedEvent.request_id ? (
                <p className="text-muted-foreground text-xs">
                  {tr("pages.settings.webhook_sync_settings.request_id")} {selectedEvent.request_id}
                </p>
              ) : null}
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
