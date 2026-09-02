import { useState, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router";
import { useEventChannel } from "@/components/realtimeEventsContext";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleSlash2,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Pencil,
  Play,
  Plus,
  Search,
  Server,
  Trash2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useClearAdminSourceToken,
  useCreateAdminHistoryImportSource,
  useDeleteAdminHistoryImportSource,
  useDiscoverExternalUsers,
  usePlexLogin,
  useSetAdminSourceToken,
  useUpdateAdminHistoryImportSource,
  useAdminHistoryImportSources,
} from "@/hooks/queries/admin/history-import-sources";
import {
  useAdminHistoryImportRuns,
  useAdminBulkRun,
  useCancelAdminRun,
  useCreateAdminMapping,
  useCreateAdminRunForMapping,
  useDeleteAdminMapping,
  useAdminHistoryImportMappings,
} from "@/hooks/queries/admin/history-import-admin";
import { useAdminUsers } from "@/hooks/queries/admin/users";
import { useAdminUserProfiles } from "@/hooks/queries/admin/history";
import type {
  CreateHistoryImportSourceRequest,
  HistoryImportExternalUser,
  HistoryImportRun,
  HistoryImportSource,
  HistoryImportUserMapping,
  UpdateHistoryImportSourceRequest,
} from "@/api/types";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/date";
import { formatDateTime as formatPreferredDateTime } from "@/lib/datetime";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG = {
  queued: {
    icon: Clock,
    color: "text-info",
    bg: "bg-info/10 border-info/20",
    get label() {
      return tr("pages.admin_history_import.queued");
    },
  },
  running: {
    icon: Loader2,
    color: "text-warning",
    bg: "bg-warning/10 border-warning/20",
    get label() {
      return tr("pages.admin_history_import.running");
    },
    spin: true,
  },
  completed: {
    icon: CheckCircle2,
    color: "text-success",
    bg: "bg-success/10 border-success/20",
    get label() {
      return tr("pages.admin_history_import.completed");
    },
  },
  failed: {
    icon: XCircle,
    color: "text-destructive",
    bg: "bg-destructive/10 border-destructive/20",
    get label() {
      return tr("pages.admin_history_import.failed");
    },
  },
  cancelled: {
    icon: CircleSlash2,
    color: "text-muted-foreground",
    bg: "bg-muted border-border",
    get label() {
      return tr("pages.admin_history_import.cancelled");
    },
  },
} as const;

function StatusBadge({ status }: { status: HistoryImportRun["status"] }) {
  useUILanguage();
  const c = STATUS_CONFIG[status];
  const Icon = c.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        c.bg,
        c.color,
      )}
    >
      <Icon className={cn("h-3 w-3", "spin" in c && c.spin && "animate-spin")} />
      {c.label}
    </span>
  );
}

function timeAgo(dateStr: string | undefined) {
  return formatRelativeTime(dateStr, { rounding: "floor", absoluteAfterDays: 1 }) ?? "Never";
}

function formatDate(dateStr: string | undefined) {
  if (!dateStr) return "—";
  return formatPreferredDateTime(dateStr);
}

// ---------------------------------------------------------------------------
// Source dialogs (create/edit + set token) — infrequent operations, keep as dialogs
// ---------------------------------------------------------------------------

type SourceMode = { kind: "create" } | { kind: "edit"; source: HistoryImportSource };

const SOURCE_HINTS = {
  jellyfin: { name: "My Jellyfin Server", url: "https://jellyfin.example.com" },
  emby: { name: "My Emby Server", url: "https://emby.example.com" },
  plex: { name: "My Plex Server", url: "https://plex.example.com:32400" },
} as const;

function SourceDialog({
  mode,
  open,
  onClose,
}: {
  mode: SourceMode;
  open: boolean;
  onClose: () => void;
}) {
  useUILanguage();
  const isEdit = mode.kind === "edit";
  const existing = isEdit ? mode.source : null;
  const [name, setName] = useState(existing?.name ?? "");
  const [sourceType, setSourceType] = useState<"emby" | "jellyfin" | "plex">(
    (existing?.source_type as "emby" | "jellyfin" | "plex") ?? "jellyfin",
  );
  const [baseURL, setBaseURL] = useState(existing?.base_url ?? "");
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [adminToken, setAdminToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [plexUser, setPlexUser] = useState("");
  const [plexPass, setPlexPass] = useState("");
  const [tokenMode, setTokenMode] = useState<"login" | "token">(
    sourceType === "plex" ? "login" : "token",
  );
  const create = useCreateAdminHistoryImportSource();
  const update = useUpdateAdminHistoryImportSource();
  const plexLogin = usePlexLogin();
  const setTokenMut = useSetAdminSourceToken();
  const isPending = create.isPending || update.isPending || plexLogin.isPending;

  const hints = SOURCE_HINTS[sourceType] || SOURCE_HINTS.jellyfin;
  const isPlex = sourceType === "plex";

  function handleSave() {
    if (!name.trim() || !baseURL.trim()) return;
    if (isEdit && existing) {
      const body: UpdateHistoryImportSourceRequest = {
        name: name.trim(),
        base_url: baseURL.trim(),
        enabled,
      };
      update.mutate({ id: existing.id, body }, { onSuccess: onClose });
    } else if (isPlex && tokenMode === "login" && plexUser.trim() && plexPass) {
      // Create source first, then authenticate with Plex and set the token.
      const body: CreateHistoryImportSourceRequest = {
        name: name.trim(),
        source_type: sourceType,
        base_url: baseURL.trim(),
        enabled,
        sort_order: 0,
      };
      create.mutate(body, {
        onSuccess: (source) => {
          if (!source?.id) {
            onClose();
            return;
          }
          plexLogin.mutate(
            { username: plexUser.trim(), password: plexPass },
            {
              onSuccess: (data) => {
                if (data?.token) {
                  setTokenMut.mutate(
                    { id: source.id, body: { token: data.token } },
                    { onSuccess: onClose },
                  );
                } else {
                  onClose();
                }
              },
              onError: () => onClose(), // source created but login failed — user can set token later
            },
          );
        },
      });
    } else {
      const body: CreateHistoryImportSourceRequest = {
        name: name.trim(),
        source_type: sourceType,
        base_url: baseURL.trim(),
        enabled,
        sort_order: 0,
        admin_token: adminToken.trim() || undefined,
      };
      create.mutate(body, { onSuccess: onClose });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? tr("pages.admin_history_import.edit_server")
              : tr("pages.admin_history_import.add_source_server")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="src-name">{tr("pages.admin_history_import.name")}</Label>
              <Input
                id="src-name"
                placeholder={hints.name}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            {!isEdit ? (
              <div className="space-y-1.5">
                <Label>{tr("pages.admin_history_import.type")}</Label>
                <Select
                  value={sourceType}
                  onValueChange={(v) => {
                    const t = v as "emby" | "jellyfin" | "plex";
                    setSourceType(t);
                    setTokenMode(t === "plex" ? "login" : "token");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jellyfin">
                      {tr("pages.admin_history_import.jellyfin")}
                    </SelectItem>
                    <SelectItem value="emby">{tr("pages.admin_history_import.emby")}</SelectItem>
                    <SelectItem value="plex">{tr("pages.admin_history_import.plex")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>{tr("pages.admin_history_import.type")}</Label>
                <Input value={existing?.source_type ?? ""} disabled className="capitalize" />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="src-url">{tr("pages.admin_history_import.server_url")}</Label>
            <Input
              id="src-url"
              placeholder={hints.url}
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
            />
          </div>

          {/* Token / login section (create mode only) */}
          {!isEdit && (
            <>
              {isPlex && (
                <div className="flex items-center gap-1 rounded-lg border p-0.5">
                  <button
                    type="button"
                    onClick={() => setTokenMode("login")}
                    className={cn(
                      "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      tokenMode === "login"
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {tr("pages.admin_history_import.sign_in_with_plex")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTokenMode("token")}
                    className={cn(
                      "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      tokenMode === "token"
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {tr("pages.admin_history_import.paste_token")}
                  </button>
                </div>
              )}

              {isPlex && tokenMode === "login" ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="plex-user-create">
                      {tr("pages.admin_history_import.plex_email_or_username")}
                    </Label>
                    <Input
                      id="plex-user-create"
                      placeholder={tr("pages.admin_history_import.you_example_com")}
                      value={plexUser}
                      onChange={(e) => setPlexUser(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="plex-pass-create">
                      {tr("pages.admin_history_import.plex_password")}
                    </Label>
                    <Input
                      id="plex-pass-create"
                      type="password"
                      value={plexPass}
                      onChange={(e) => setPlexPass(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="src-token">
                    {isPlex
                      ? tr("pages.admin_history_import.plex_auth_token")
                      : tr("pages.admin_history_import.admin_api_key")}{" "}
                    <span className="text-muted-foreground font-normal">
                      {tr("pages.admin_history_import.optional")}
                    </span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="src-token"
                      type={showToken ? "text" : "password"}
                      placeholder={
                        isPlex
                          ? tr("pages.admin_history_import.paste_plex_token_here")
                          : tr("pages.admin_history_import.paste_api_key_here")
                      }
                      value={adminToken}
                      onChange={(e) => setAdminToken(e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken((v) => !v)}
                      className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
                    >
                      {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex items-center gap-3">
            <Switch id="src-enabled" checked={enabled} onCheckedChange={setEnabled} />
            <Label htmlFor="src-enabled">{tr("pages.admin_history_import.enabled")}</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tr("common.actions.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || !baseURL.trim() || isPending}>
            {isPending
              ? tr("pages.admin_history_import.saving")
              : isEdit
                ? tr("common.actions.save")
                : tr("pages.admin_history_import.add_server")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TokenDialog({
  source,
  open,
  onClose,
}: {
  source: HistoryImportSource;
  open: boolean;
  onClose: () => void;
}) {
  useUILanguage();
  const isPlex = source.source_type === "plex";
  const [mode, setMode] = useState<"token" | "login">(isPlex ? "login" : "token");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [plexUser, setPlexUser] = useState("");
  const [plexPass, setPlexPass] = useState("");
  const setToken_ = useSetAdminSourceToken();
  const clearToken = useClearAdminSourceToken();
  const plexLogin = usePlexLogin();

  function handleSaveToken() {
    if (!token.trim()) return;
    setToken_.mutate({ id: source.id, body: { token: token.trim() } }, { onSuccess: onClose });
  }

  function handlePlexLogin() {
    if (!plexUser.trim() || !plexPass) return;
    plexLogin.mutate(
      { username: plexUser.trim(), password: plexPass },
      {
        onSuccess: (data) => {
          if (data?.token) {
            setToken_.mutate(
              { id: source.id, body: { token: data.token } },
              { onSuccess: onClose },
            );
          }
        },
      },
    );
  }

  const isSaving = setToken_.isPending || plexLogin.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {tr("pages.admin_history_import.admin_api_key_89d70b41")} {source.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Mode toggle for Plex sources */}
          {isPlex && (
            <div className="flex items-center gap-1 rounded-lg border p-0.5">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  mode === "login"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tr("pages.admin_history_import.sign_in_with_plex")}
              </button>
              <button
                type="button"
                onClick={() => setMode("token")}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  mode === "token"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tr("pages.admin_history_import.paste_token")}
              </button>
            </div>
          )}

          {mode === "login" && isPlex ? (
            <div className="space-y-3">
              <p className="text-muted-foreground text-sm">
                {tr(
                  "pages.admin_history_import.sign_in_with_your_plex_account_to_generate_an_admin",
                )}
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="plex-user">
                  {tr("pages.admin_history_import.email_or_username")}
                </Label>
                <Input
                  id="plex-user"
                  placeholder={tr("pages.admin_history_import.you_example_com")}
                  value={plexUser}
                  onChange={(e) => setPlexUser(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plex-pass">{tr("pages.admin_history_import.password")}</Label>
                <Input
                  id="plex-pass"
                  type="password"
                  value={plexPass}
                  onChange={(e) => setPlexPass(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-muted-foreground text-sm">
                {isPlex
                  ? tr("pages.admin_history_import.paste_your_plex_auth_token_directly")
                  : tr(
                      "pages.admin_history_import.this_key_is_used_to_discover_users_on_the_server",
                    )}
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="admin-token">
                  {tr("pages.admin_history_import.api_key_token")}
                </Label>
                <div className="relative">
                  <Input
                    id="admin-token"
                    type={showToken ? "text" : "password"}
                    placeholder={tr("pages.admin_history_import.paste_token_here")}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((v) => !v)}
                    className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {source.has_admin_token && (
            <p className="text-muted-foreground text-xs">
              {tr(
                "pages.admin_history_import.a_token_is_already_configured_saving_will_replace_it",
              )}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2">
          {source.has_admin_token && (
            <Button
              variant="destructive"
              onClick={() => clearToken.mutate(source.id, { onSuccess: onClose })}
              disabled={clearToken.isPending}
            >
              {tr("common.actions.remove")}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            {tr("common.actions.cancel")}
          </Button>
          {mode === "login" && isPlex ? (
            <Button onClick={handlePlexLogin} disabled={!plexUser.trim() || !plexPass || isSaving}>
              {isSaving
                ? tr("pages.admin_history_import.signing_in")
                : tr("pages.admin_history_import.sign_in_save")}
            </Button>
          ) : (
            <Button onClick={handleSaveToken} disabled={!token.trim() || isSaving}>
              {isSaving ? tr("pages.admin_history_import.saving") : tr("common.actions.save")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// User discovery + mapping dialog
// ---------------------------------------------------------------------------

function DiscoverDialog({
  source,
  existingMappings,
  open,
  onClose,
}: {
  source: HistoryImportSource;
  existingMappings: HistoryImportUserMapping[];
  open: boolean;
  onClose: () => void;
}) {
  useUILanguage();
  const { data: externalUsers, isFetching, refetch, error } = useDiscoverExternalUsers(source.id);
  const { data: users = [] } = useAdminUsers();
  const createMapping = useCreateAdminMapping();
  const [mappingTarget, setMappingTarget] = useState<HistoryImportExternalUser | null>(null);
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState("");
  const [profileId, setProfileId] = useState("");
  const { data: profiles = [] } = useAdminUserProfiles(userId ? Number(userId) : undefined);

  const mappedIds = useMemo(
    () => new Set(existingMappings.map((m) => m.external_user_id)),
    [existingMappings],
  );

  const unmappedUsers = useMemo(
    () => (externalUsers ?? []).filter((u) => !mappedIds.has(u.id)),
    [externalUsers, mappedIds],
  );

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return unmappedUsers;
    const q = search.toLowerCase();
    return unmappedUsers.filter(
      (u) => u.name.toLowerCase().includes(q) || u.id.toLowerCase().includes(q),
    );
  }, [unmappedUsers, search]);
  const discoverErrorMessage =
    error instanceof Error && error.message.trim()
      ? error.message
      : "Could not connect. Check the server URL and admin token, then try again.";

  function handleSave() {
    if (!mappingTarget || !userId || !profileId) return;
    createMapping.mutate(
      {
        source_id: source.id,
        external_user_id: mappingTarget.id,
        external_user_name: mappingTarget.name,
        silo_user_id: Number(userId),
        silo_profile_id: profileId,
      },
      {
        onSuccess: () => {
          setMappingTarget(null);
          setUserId("");
          setProfileId("");
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {tr("pages.admin_history_import.discover_users_on")} {source.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Trigger */}
          {!externalUsers && !isFetching && !error && (
            <div className="surface-panel-subtle flex flex-col items-center gap-3 rounded-xl p-8 text-center">
              <Search className="text-muted-foreground h-8 w-8" />
              <p className="text-muted-foreground text-sm">
                {tr(
                  "pages.admin_history_import.query_the_server_to_find_user_accounts_available_for_import",
                )}
              </p>
              <Button onClick={() => refetch()} size="sm">
                {tr("pages.admin_history_import.discover_users")}
              </Button>
            </div>
          )}

          {isFetching && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm">
              <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
              <span className="text-muted-foreground">
                {tr("pages.admin_history_import.connecting_to_server")}
              </span>
            </div>
          )}

          {error && (
            <div className="space-y-3">
              <div className="bg-destructive/10 border-destructive/20 flex items-start gap-2 rounded-xl border p-3 text-sm">
                <AlertTriangle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
                <span>{discoverErrorMessage}</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                {tr("common.actions.retry")}
              </Button>
            </div>
          )}

          {/* Results */}
          {externalUsers && !isFetching && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-sm">
                  {unmappedUsers.length === 0
                    ? tr("pages.admin_history_import.all_users_are_already_mapped")
                    : tr("pages.admin_history_import.length_unmapped_user_value_found", {
                        length: unmappedUsers.length,
                        value: unmappedUsers.length !== 1 ? "s" : "",
                      })}
                </p>
                <Button variant="ghost" size="sm" onClick={() => refetch()}>
                  {tr("common.actions.refresh")}
                </Button>
              </div>

              {unmappedUsers.length > 0 && (
                <>
                  <div className="relative">
                    <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input
                      placeholder={tr("pages.admin_history_import.search_users")}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="surface-panel-subtle max-h-96 divide-y overflow-y-auto rounded-xl border-0">
                    {filteredUsers.length === 0 ? (
                      <p className="text-muted-foreground px-4 py-6 text-center text-sm">
                        {tr("pages.admin_history_import.no_users_matching_ldquo")}
                        {search}
                        {tr("pages.admin_history_import.rdquo")}
                      </p>
                    ) : (
                      filteredUsers.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            setMappingTarget(u);
                            setUserId("");
                            setProfileId("");
                          }}
                          className={cn(
                            "flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors",
                            mappingTarget?.id === u.id ? "bg-accent" : "hover:bg-accent/50",
                          )}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{u.name}</p>
                            <p className="text-muted-foreground truncate text-xs">{u.id}</p>
                          </div>
                          {mappingTarget?.id === u.id ? (
                            <Badge variant="outline" className="shrink-0 text-xs">
                              {tr("pages.admin_history_import.selected")}
                            </Badge>
                          ) : (
                            <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}

              {/* Mapping form — shown when a user is selected */}
              {mappingTarget && (
                <div className="surface-panel-subtle space-y-4 rounded-xl border-0 p-4">
                  <p className="text-sm font-medium">
                    {tr("pages.admin_history_import.map")}{" "}
                    <span className="text-primary">{mappingTarget.name}</span>{" "}
                    {tr("pages.admin_history_import.to_a_silo_user_and_profile")}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        {tr("pages.admin_history_import.silo_user")}
                      </Label>
                      <Select
                        value={userId}
                        onValueChange={(v) => {
                          setUserId(v);
                          setProfileId("");
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={tr("pages.admin_history_import.select_user")} />
                        </SelectTrigger>
                        <SelectContent>
                          {users.map((u) => (
                            <SelectItem key={u.id} value={String(u.id)}>
                              {u.username}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{tr("pages.admin_history_import.profile")}</Label>
                      <Select value={profileId} onValueChange={setProfileId} disabled={!userId}>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={tr("pages.admin_history_import.select_profile")}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {profiles.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={!userId || !profileId || createMapping.isPending}
                    >
                      {createMapping.isPending ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          {tr("pages.admin_history_import.saving")}
                        </>
                      ) : (
                        tr("pages.admin_history_import.save_mapping")
                      )}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setMappingTarget(null)}>
                      {tr("common.actions.cancel")}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tr("common.actions.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Source selector bar
// ---------------------------------------------------------------------------

function SourceBar({
  sources,
  selected,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
  onSetToken,
}: {
  sources: HistoryImportSource[];
  selected: HistoryImportSource | undefined;
  onSelect: (id: number) => void;
  onAdd: () => void;
  onEdit: (s: HistoryImportSource) => void;
  onDelete: (s: HistoryImportSource) => void;
  onSetToken: (s: HistoryImportSource) => void;
}) {
  useUILanguage();
  if (sources.length === 0) {
    return (
      <div className="surface-panel-subtle flex flex-col items-center gap-4 rounded-xl border-0 px-6 py-12 text-center">
        <div className="bg-accent flex h-12 w-12 items-center justify-center rounded-xl">
          <Server className="text-muted-foreground h-6 w-6" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {tr("pages.admin_history_import.no_source_servers")}
          </p>
          <p className="text-muted-foreground max-w-sm text-sm">
            {tr("pages.admin_history_import.add_the_jellyfin_emby_or_plex_server_you_want_to")}
          </p>
        </div>
        <Button size="sm" onClick={onAdd}>
          <Plus className="mr-2 h-4 w-4" />
          {tr("pages.admin_history_import.add_server")}
        </Button>
      </div>
    );
  }

  return (
    <div className="surface-panel overflow-hidden rounded-2xl border-0">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Select
            value={selected ? String(selected.id) : ""}
            onValueChange={(v) => onSelect(Number(v))}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder={tr("pages.admin_history_import.select_a_server")} />
            </SelectTrigger>
            <SelectContent>
              {sources.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  <span className="flex items-center gap-2">
                    {s.name}
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {s.source_type}
                    </Badge>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selected && (
            <span className="text-muted-foreground hidden text-xs sm:inline">
              {selected.base_url}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {selected && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onSetToken(selected)}
                title={tr("pages.admin_history_import.set_api_key")}
              >
                <KeyRound className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onEdit(selected)}
                title={tr("pages.admin_history_import.edit_server")}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(selected)}
                title={tr("pages.admin_history_import.delete_server")}
              >
                <Trash2 className="text-destructive h-3.5 w-3.5" />
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" onClick={onAdd}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {tr("common.actions.add")}
          </Button>
        </div>
      </div>

      {/* Token status callout */}
      {selected && !selected.has_admin_token && (
        <div className="bg-warning/5 flex items-center gap-3 border-b px-4 py-3">
          <AlertTriangle className="text-warning h-4 w-4 shrink-0" />
          <p className="text-muted-foreground flex-1 text-sm">
            {tr("pages.admin_history_import.no_admin_api_key_configured_add_one_to_discover_users")}
          </p>
          <Button size="sm" variant="outline" onClick={() => onSetToken(selected)}>
            <KeyRound className="mr-1.5 h-3.5 w-3.5" />
            {tr("pages.admin_history_import.set_api_key")}
          </Button>
        </div>
      )}

      {selected && selected.has_admin_token && (
        <div className="flex items-center gap-2 px-4 py-2">
          <span className="bg-success/20 inline-flex h-2 w-2 rounded-full" />
          <span className="text-muted-foreground text-xs">
            {tr("pages.admin_history_import.api_key_configured")}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// User mappings section
// ---------------------------------------------------------------------------

function MappingsSection({
  source,
  mappings,
}: {
  source: HistoryImportSource;
  mappings: HistoryImportUserMapping[];
}) {
  useUILanguage();
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const deleteMapping = useDeleteAdminMapping();
  const createRun = useCreateAdminRunForMapping();
  const bulkRun = useAdminBulkRun();
  const [deleteTarget, setDeleteTarget] = useState<HistoryImportUserMapping | null>(null);

  if (!source.has_admin_token) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide">
          {tr("pages.admin_history_import.user_mappings")}
        </h2>
        <div className="flex items-center gap-2">
          {mappings.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkRun.mutate(source.id)}
              disabled={bulkRun.isPending}
            >
              {bulkRun.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="mr-1.5 h-3.5 w-3.5" />
              )}
              {tr("pages.admin_history_import.import_all")}
            </Button>
          )}
          <Button size="sm" onClick={() => setDiscoverOpen(true)}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            {tr("pages.admin_history_import.discover_users")}
          </Button>
        </div>
      </div>

      {mappings.length === 0 ? (
        <div className="surface-panel-subtle flex flex-col items-center gap-3 rounded-xl border-0 py-10 text-center">
          <p className="text-muted-foreground text-sm">
            {tr("pages.admin_history_import.no_user_mappings_yet_discover_users_on_the_server_to")}
          </p>
          <Button size="sm" variant="outline" onClick={() => setDiscoverOpen(true)}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            {tr("pages.admin_history_import.discover_users")}
          </Button>
        </div>
      ) : (
        <div className="surface-panel overflow-x-auto rounded-2xl border-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr("pages.admin_history_import.source_user")}</TableHead>
                <TableHead className="hidden sm:table-cell">
                  <ArrowRight className="h-3.5 w-3.5" />
                </TableHead>
                <TableHead>{tr("pages.admin_history_import.silo_user")}</TableHead>
                <TableHead>{tr("pages.admin_history_import.last_imported")}</TableHead>
                <TableHead className="w-24 text-right">
                  {tr("pages.admin_history_import.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <p className="text-sm font-medium">
                      {m.external_user_name || m.external_user_id}
                    </p>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden sm:table-cell">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">
                      {m.silo_username ||
                        tr("pages.admin_history_import.user_silo_user_id", {
                          silo_user_id: m.silo_user_id,
                        })}
                    </p>
                    {m.silo_profile_name && (
                      <p className="text-muted-foreground text-xs">{m.silo_profile_name}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {timeAgo(m.last_imported_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => createRun.mutate(m.id)}
                        disabled={createRun.isPending}
                        title={tr("pages.admin_history_import.run_import")}
                      >
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteTarget(m)}
                        title={tr("pages.admin_history_import.remove_mapping")}
                      >
                        <Trash2 className="text-destructive h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {discoverOpen && (
        <DiscoverDialog
          source={source}
          existingMappings={mappings}
          open
          onClose={() => setDiscoverOpen(false)}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={tr("pages.admin_history_import.remove_mapping")}
        description={tr(
          "pages.admin_history_import.remove_the_mapping_for_value_this_won_t_delete_any",
          { value: deleteTarget?.external_user_name || deleteTarget?.external_user_id },
        )}
        confirmLabel={tr("common.actions.remove")}
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) deleteMapping.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent import runs section
// ---------------------------------------------------------------------------

type RunFilter = "all" | "admin" | "user";

function RunsSection({ sourceId }: { sourceId: number }) {
  useUILanguage();
  const { data: allRuns = [] } = useAdminHistoryImportRuns(sourceId);
  const { data: users = [] } = useAdminUsers();
  const cancelRun = useCancelAdminRun();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<RunFilter>("all");

  const userMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const u of users) m.set(u.id, u.username);
    return m;
  }, [users]);

  const runs = useMemo(() => {
    if (filter === "all") return allRuns;
    if (filter === "admin") return allRuns.filter((r) => r.connection_mode === "admin_token");
    return allRuns.filter((r) => r.connection_mode !== "admin_token");
  }, [allRuns, filter]);

  if (allRuns.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide">
          {tr("pages.admin_history_import.recent_imports")}
        </h2>
        <div className="flex items-center gap-1 rounded-lg border p-0.5">
          {(["all", "admin", "user"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setFilter(v)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                filter === v
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="surface-panel overflow-hidden rounded-2xl border-0">
        {runs.length === 0 ? (
          <p className="text-muted-foreground px-4 py-6 text-center text-sm">
            {tr("common.actions.no")} {filter === "all" ? "" : filter + " "}
            {tr("pages.admin_history_import.imports_to_show")}
          </p>
        ) : (
          <div className="divide-y">
            {runs.map((run) => {
              const isActive = run.status === "queued" || run.status === "running";
              const expanded = expandedId === run.id;
              return (
                <div key={run.id}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      onClick={() => setExpandedId(expanded ? null : run.id)}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                    >
                      {expanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    <StatusBadge status={run.status} />
                    <div className="flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium capitalize">
                          {run.source_type} {tr("pages.admin_history_import.import")}
                        </p>
                        {run.connection_mode === "admin_token" ? (
                          <Badge variant="outline" className="text-[10px]">
                            {tr("pages.admin_history_import.admin")}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">
                            {tr("pages.admin_history_import.self")}
                          </Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground text-xs">
                        {userMap.get(run.user_id) ??
                          tr("pages.admin_history_import.user_user_id", { user_id: run.user_id })}
                        {" · "}
                        {formatDate(run.created_at)}
                      </p>
                    </div>
                    <div className="text-muted-foreground hidden items-center gap-4 text-xs sm:flex">
                      {run.fetched > 0 && (
                        <span>
                          {run.fetched} {tr("pages.admin_history_import.fetched")}
                        </span>
                      )}
                      {run.matched > 0 && (
                        <span className="text-success">
                          {run.matched} {tr("pages.admin_history_import.matched")}
                        </span>
                      )}
                      {run.unmatched > 0 && (
                        <span className="text-warning">
                          {run.unmatched} {tr("pages.admin_history_import.unmatched")}
                        </span>
                      )}
                    </div>
                    {isActive && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cancelRun.mutate(run.id)}
                        disabled={cancelRun.isPending}
                        className="text-destructive hover:text-destructive"
                      >
                        {tr("common.actions.cancel")}
                      </Button>
                    )}
                  </div>
                  {expanded && (
                    <div className="bg-accent/30 space-y-3 px-11 pb-4">
                      {run.error_message && (
                        <div className="bg-destructive/10 border-destructive/20 flex items-start gap-2 rounded-lg border p-3 text-sm">
                          <AlertTriangle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
                          {run.error_message}
                        </div>
                      )}
                      <div className="text-muted-foreground grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
                        <div>
                          <p className="font-medium">
                            {tr("pages.admin_history_import.fetched_44169079")}
                          </p>
                          <p>{run.fetched}</p>
                        </div>
                        <div>
                          <p className="font-medium">
                            {tr("pages.admin_history_import.matched_1bf3ec5b")}
                          </p>
                          <p>{run.matched}</p>
                        </div>
                        <div>
                          <p className="font-medium">
                            {tr("pages.admin_history_import.unmatched_c625b458")}
                          </p>
                          <p>{run.unmatched}</p>
                        </div>
                        <div>
                          <p className="font-medium">{tr("pages.admin_history_import.updated")}</p>
                          <p>{run.progress_updated}</p>
                        </div>
                        <div>
                          <p className="font-medium">{tr("pages.admin_history_import.history")}</p>
                          <p>{run.history_created}</p>
                        </div>
                        <div>
                          <p className="font-medium">
                            {tr("pages.admin_history_import.favorites")}
                          </p>
                          <p>{run.favorites_imported}</p>
                        </div>
                        <div>
                          <p className="font-medium">
                            {tr("pages.admin_history_import.watchlist")}
                          </p>
                          <p>{run.watchlist_added}</p>
                        </div>
                        <div>
                          <p className="font-medium">{tr("pages.admin_history_import.skipped")}</p>
                          <p>{run.skipped}</p>
                        </div>
                      </div>
                      {run.warnings.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-muted-foreground text-xs font-medium">
                            {tr("pages.admin_history_import.warnings")}
                            {run.warnings.length})
                          </p>
                          <ul className="text-muted-foreground list-inside list-disc space-y-0.5 text-xs">
                            {run.warnings.slice(0, 5).map((w, i) => (
                              <li key={i}>{w}</li>
                            ))}
                            {run.warnings.length > 5 && (
                              <li className="italic">
                                {tr("pages.admin_history_import.and")} {run.warnings.length - 5}{" "}
                                {tr("pages.admin_history_import.more")}
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
                      {run.unmatched_samples.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-muted-foreground text-xs font-medium">
                            {tr("pages.admin_history_import.unmatched_samples")}
                          </p>
                          <ul className="text-muted-foreground list-inside list-disc space-y-0.5 text-xs">
                            {run.unmatched_samples.map((s, i) => (
                              <li key={i}>
                                {s.title}
                                {s.year
                                  ? tr("pages.admin_history_import.year", { year: s.year })
                                  : ""}{" "}
                                — {s.reason}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {!run.error_message &&
                        run.warnings.length === 0 &&
                        run.unmatched_samples.length === 0 && (
                          <p className="text-muted-foreground text-xs">
                            {tr("pages.admin_history_import.no_issues")}
                          </p>
                        )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminHistoryImport() {
  useUILanguage();
  useEventChannel("history_import");
  const { data: sources = [] } = useAdminHistoryImportSources();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sourceMode, setSourceMode] = useState<SourceMode | null>(null);
  const [tokenSource, setTokenSource] = useState<HistoryImportSource | null>(null);
  const [deleteSource, setDeleteSource] = useState<HistoryImportSource | null>(null);
  const deleteMutation = useDeleteAdminHistoryImportSource();

  // Persist selected source in URL so it survives page refresh.
  const selectedId = searchParams.get("source") ? Number(searchParams.get("source")) : null;
  const setSelectedId = useCallback(
    (id: number) => setSearchParams({ source: String(id) }, { replace: true }),
    [setSearchParams],
  );

  // Auto-select first source if none selected or selected source no longer exists.
  const effectiveId =
    selectedId && sources.some((s) => s.id === selectedId) ? selectedId : (sources[0]?.id ?? null);
  const selected = sources.find((s) => s.id === effectiveId);

  // Query runs at page level so we can pass hasActiveRuns to mappings for auto-refresh.
  const { data: runs = [] } = useAdminHistoryImportRuns(effectiveId ?? undefined);
  const hasActiveRuns = runs.some((r) => r.status === "queued" || r.status === "running");

  const { data: mappings = [] } = useAdminHistoryImportMappings(
    selected?.has_admin_token ? (effectiveId ?? undefined) : undefined,
    hasActiveRuns,
  );

  return (
    <div className="page-shell space-y-8 py-4 sm:py-6">
      <div className="page-header">
        <div className="space-y-3">
          <h1 className="page-title text-[clamp(2rem,4vw,3rem)]">
            {tr("pages.admin_history_import.history_import")}
          </h1>
          <p className="page-subtitle text-sm sm:text-base">
            {tr(
              "pages.admin_history_import.import_watch_history_from_external_servers_into_silo_user_profiles",
            )}
          </p>
        </div>
      </div>

      {/* Source selector */}
      <SourceBar
        sources={sources}
        selected={selected}
        onSelect={setSelectedId}
        onAdd={() => setSourceMode({ kind: "create" })}
        onEdit={(s) => setSourceMode({ kind: "edit", source: s })}
        onDelete={setDeleteSource}
        onSetToken={setTokenSource}
      />

      {/* Mappings */}
      {selected && <MappingsSection source={selected} mappings={mappings} />}

      {/* Recent runs */}
      {selected && effectiveId && <RunsSection sourceId={effectiveId} />}

      {/* Dialogs */}
      {sourceMode && <SourceDialog mode={sourceMode} open onClose={() => setSourceMode(null)} />}
      {tokenSource && (
        <TokenDialog source={tokenSource} open onClose={() => setTokenSource(null)} />
      )}
      <ConfirmDialog
        open={deleteSource !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteSource(null);
        }}
        title={tr("pages.admin_history_import.delete_server")}
        description={tr(
          "pages.admin_history_import.delete_name_all_user_mappings_for_this_server_will_also",
          { name: deleteSource?.name },
        )}
        confirmLabel={tr("common.actions.delete")}
        variant="destructive"
        onConfirm={() => {
          if (deleteSource) deleteMutation.mutate(deleteSource.id);
          setDeleteSource(null);
        }}
      />
    </div>
  );
}
