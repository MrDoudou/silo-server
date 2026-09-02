import { useState, useId, useMemo } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import type { AdminUser, CreateUserRequest, UpdateUserRequest } from "@/api/types";
import {
  useAdminUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
} from "@/hooks/queries/admin/users";
import { useAdminServerSettings } from "@/hooks/queries/admin/settings";
import { useAdminLibraries } from "@/hooks/queries/admin/libraries";
import { useAccessGroups } from "@/hooks/queries/admin/accessGroups";
import {
  PolicyAccessFields,
  PolicyLimitFields,
  effectiveAccessGroupID,
  policyCreateFields,
  policyInheritHints,
  policyStateFromUser,
  policyUpdateFields,
} from "@/components/UserPolicyFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  History,
  Plus,
  Pencil,
  Trash2,
  Settings2,
  Search,
  X,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Skeleton } from "@/components/ui/skeleton";
import InvitationsTab from "./admin-settings/InvitationsTab";
import InviteCodesTab from "./admin-settings/InviteCodesTab";
import {
  PERMISSION_MARKER_EDIT,
  PERMISSION_METADATA_CURATION,
  hasAssignedPermission,
  setAssignedPermission,
} from "@/lib/permissions";
import { formatDateTime as formatDateTimePreferred } from "@/lib/datetime";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

const PAGE_SIZE_OPTIONS = ["25", "50", "100"] as const;
type UserSortField = "username" | "email" | "role" | "enabled" | "created_at" | "last_active_at";
type SortDirection = "asc" | "desc";

// Tab ids are a URL contract: other pages deep-link here (General settings
// points at ?tab=invite-codes), so reuse the trigger values verbatim.
const ADMIN_USERS_TABS = ["users", "invitations", "invite-codes"] as const;
type AdminUsersTab = (typeof ADMIN_USERS_TABS)[number];

function normalizeAdminUsersTab(value: string | null): AdminUsersTab {
  return ADMIN_USERS_TABS.includes(value as AdminUsersTab) ? (value as AdminUsersTab) : "users";
}

export default function AdminUsers() {
  useUILanguage();
  const { data: users = [], isLoading } = useAdminUsers();
  const { data: serverSettings } = useAdminServerSettings();
  const signupsEnabled = serverSettings?.["signup.enabled"] === "true";
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = normalizeAdminUsersTab(searchParams.get("tab"));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<AdminUser | null>(null);
  const deleteMutation = useDeleteUser();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [sortField, setSortField] = useState<UserSortField>("username");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");

  const filteredUsers = useMemo(() => {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) => u.username?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q),
    );
  }, [users, search]);

  const sortedUsers = useMemo(
    () => sortAdminUsers(filteredUsers, sortField, sortDir),
    [filteredUsers, sortField, sortDir],
  );

  const total = sortedUsers.length;
  const paginatedUsers = sortedUsers.slice(page * pageSize, (page + 1) * pageSize);

  function handleSort(field: UserSortField) {
    setPage(0);
    if (field === sortField) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDir(field === "created_at" || field === "last_active_at" ? "desc" : "asc");
  }

  function handleDelete(u: AdminUser) {
    setConfirmDeleteUser(u);
  }

  function setActiveTab(value: string) {
    const nextTab = normalizeAdminUsersTab(value);
    const next = new URLSearchParams(searchParams);

    // The default tab stays the bare /admin/users URL.
    if (nextTab === "users") {
      next.delete("tab");
    } else {
      next.set("tab", nextTab);
    }

    setSearchParams(next, { replace: true });
  }

  if (isLoading)
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full rounded-lg" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={confirmDeleteUser !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteUser(null);
        }}
        title={tr("pages.admin_users.delete_user")}
        description={tr("pages.admin_users.delete_user_username_this_action_cannot_be_undone", {
          username: confirmDeleteUser?.username,
        })}
        confirmLabel={tr("common.actions.delete")}
        variant="destructive"
        onConfirm={() => {
          if (confirmDeleteUser) deleteMutation.mutate(confirmDeleteUser.id);
          setConfirmDeleteUser(null);
        }}
      />
      <div className="page-header">
        <div className="space-y-3">
          <h1 className="page-title text-[clamp(2rem,4vw,3rem)]">
            {tr("pages.admin_users.users")}
          </h1>
          <p className="page-subtitle text-sm sm:text-base">
            {tr("pages.admin_users.manage_access_defaults_and_invite_flow_for_the_people_using")}
          </p>
          {serverSettings !== undefined && (
            <Link
              to="/admin/settings/general"
              className="inline-flex w-fit items-center gap-1 hover:opacity-80"
            >
              <Badge
                variant={signupsEnabled ? "outline" : "secondary"}
                className={
                  signupsEnabled
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                    : undefined
                }
              >
                {signupsEnabled
                  ? tr("pages.admin_users.public_signups_on")
                  : tr("pages.admin_users.public_signups_off")}
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Badge>
            </Link>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/access-groups">
              <Settings2 className="mr-1 h-4 w-4" /> {tr("pages.admin_users.access_groups")}
            </Link>
          </Button>
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) setEditingUser(null);
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" /> {tr("pages.admin_users.add_user")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {editingUser
                    ? tr("pages.admin_users.edit_user")
                    : tr("pages.admin_users.create_user")}
                </DialogTitle>
              </DialogHeader>
              <UserForm
                user={editingUser}
                onClose={() => {
                  setDialogOpen(false);
                  setEditingUser(null);
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList variant="line" className="border-border w-full justify-start border-b">
          <TabsTrigger value="users">{tr("pages.admin_users.users")}</TabsTrigger>
          <TabsTrigger value="invitations">{tr("pages.admin_users.invitations")}</TabsTrigger>
          <TabsTrigger value="invite-codes">{tr("pages.admin_users.invite_codes")}</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="pt-4">
          <div className="relative mb-4">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder={tr("pages.admin_users.search_by_username_or_email")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="pr-9 pl-9"
            />
            {search && (
              <button
                type="button"
                aria-label={tr("pages.admin_users.clear_search")}
                onClick={() => {
                  setSearch("");
                  setPage(0);
                }}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="surface-panel overflow-x-auto rounded-2xl border-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableUserHead
                    field="username"
                    activeField={sortField}
                    activeDir={sortDir}
                    onSort={handleSort}
                  >
                    {tr("pages.admin_users.username")}
                  </SortableUserHead>
                  <SortableUserHead
                    field="email"
                    activeField={sortField}
                    activeDir={sortDir}
                    onSort={handleSort}
                  >
                    {tr("pages.admin_users.email")}
                  </SortableUserHead>
                  <SortableUserHead
                    field="role"
                    activeField={sortField}
                    activeDir={sortDir}
                    onSort={handleSort}
                  >
                    {tr("pages.admin_users.role")}
                  </SortableUserHead>
                  <SortableUserHead
                    field="enabled"
                    activeField={sortField}
                    activeDir={sortDir}
                    onSort={handleSort}
                  >
                    {tr("pages.admin_users.status")}
                  </SortableUserHead>
                  <SortableUserHead
                    field="created_at"
                    activeField={sortField}
                    activeDir={sortDir}
                    onSort={handleSort}
                  >
                    {tr("pages.admin_users.created")}
                  </SortableUserHead>
                  <SortableUserHead
                    field="last_active_at"
                    activeField={sortField}
                    activeDir={sortDir}
                    onSort={handleSort}
                  >
                    {tr("pages.admin_users.last_active")}
                  </SortableUserHead>
                  <TableHead className="w-24">{tr("pages.admin_users.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <Link to={"/admin/users/" + u.id} className="font-medium hover:underline">
                        {u.username}
                      </Link>
                    </TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.enabled ? "outline" : "destructive"}>
                        {u.enabled
                          ? tr("pages.admin_users.active")
                          : tr("pages.admin_users.disabled")}
                      </Badge>
                    </TableCell>
                    <TableCell title={formatFullDateTime(u.created_at)}>
                      {formatDateTime(u.created_at)}
                    </TableCell>
                    <TableCell title={u.last_active_at ? formatFullDateTime(u.last_active_at) : ""}>
                      {formatRelativeTime(u.last_active_at, "Never")}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                          <Link
                            to={"/admin/history?user_id=" + u.id}
                            aria-label={tr("pages.admin_users.view_username_playback_history", {
                              username: u.username,
                            })}
                          >
                            <History className="h-3 w-3" aria-hidden="true" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label={tr("pages.admin_users.edit_username", {
                            username: u.username,
                          })}
                          onClick={() => {
                            setEditingUser(u);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-3 w-3" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label={tr("pages.admin_users.delete_username", {
                            username: u.username,
                          })}
                          onClick={() => handleDelete(u)}
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {total > pageSize && (
              <div className="flex items-center justify-between px-4 py-4">
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground text-sm">
                    {tr("pages.admin_users.showing")} {page * pageSize + 1}-
                    {Math.min((page + 1) * pageSize, total)} {tr("pages.admin_users.of")} {total}
                  </span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => {
                      setPageSize(Number(v));
                      setPage(0);
                    }}
                  >
                    <SelectTrigger className="h-8 w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <SelectItem key={size} value={size}>
                          {size} {tr("pages.admin_users.rows")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p - 1)}
                    disabled={page === 0}
                  >
                    {tr("common.actions.previous")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={(page + 1) * pageSize >= total}
                  >
                    {tr("common.actions.next")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="invitations" className="pt-4">
          <InvitationsTab />
        </TabsContent>
        <TabsContent value="invite-codes" className="pt-4">
          <InviteCodesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SortableUserHead({
  field,
  activeField,
  activeDir,
  onSort,
  children,
}: {
  field: UserSortField;
  activeField: UserSortField;
  activeDir: SortDirection;
  onSort: (field: UserSortField) => void;
  children: ReactNode;
}) {
  useUILanguage();
  const active = field === activeField;

  return (
    <TableHead aria-sort={active ? (activeDir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className="hover:text-foreground inline-flex items-center gap-1 transition-colors"
        onClick={() => onSort(field)}
      >
        {children}
        {active ? (
          activeDir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <ChevronDown className="h-3 w-3 opacity-0" />
        )}
      </button>
    </TableHead>
  );
}

function sortAdminUsers(users: AdminUser[], field: UserSortField, dir: SortDirection) {
  const direction = dir === "asc" ? 1 : -1;

  return [...users].sort((a, b) => {
    let result = 0;
    switch (field) {
      case "username":
        result = compareText(a.username, b.username);
        break;
      case "email":
        result = compareText(a.email, b.email);
        break;
      case "role":
        result = compareText(a.role, b.role);
        break;
      case "enabled":
        result = compareText(a.enabled ? "active" : "disabled", b.enabled ? "active" : "disabled");
        break;
      case "created_at":
        result = compareTime(a.created_at, b.created_at, dir);
        break;
      case "last_active_at":
        result = compareTime(a.last_active_at, b.last_active_at, dir);
        break;
    }

    if (result !== 0) {
      return field === "created_at" || field === "last_active_at" ? result : result * direction;
    }

    return compareText(a.username, b.username) || a.id - b.id;
  });
}

function compareText(a?: string | null, b?: string | null) {
  return (a ?? "").localeCompare(b ?? "", undefined, { numeric: true, sensitivity: "base" });
}

function compareTime(a?: string | null, b?: string | null, dir: SortDirection = "asc") {
  const aTime = parseTime(a);
  const bTime = parseTime(b);
  if (aTime === null && bTime === null) return 0;
  if (aTime === null) return 1;
  if (bTime === null) return -1;
  return (aTime - bTime) * (dir === "asc" ? 1 : -1);
}

function parseTime(value?: string | null) {
  const timestamp = Date.parse(value ?? "");
  return Number.isNaN(timestamp) ? null : timestamp;
}

function formatDateTime(value?: string | null, fallback = "-") {
  const timestamp = parseTime(value);
  if (timestamp === null) return fallback;
  return formatDateTimePreferred(timestamp, { dateStyle: "medium", seconds: false });
}

function formatFullDateTime(value?: string | null) {
  const timestamp = parseTime(value);
  if (timestamp === null) return "";
  return formatDateTimePreferred(timestamp);
}

function formatRelativeTime(value?: string | null, fallback = "-") {
  const timestamp = parseTime(value);
  if (timestamp === null) return fallback;

  const seconds = Math.round((timestamp - Date.now()) / 1000);
  const ranges: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
    ["second", 1],
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "always" });

  for (const [unit, secondsPerUnit] of ranges) {
    if (Math.abs(seconds) >= secondsPerUnit || unit === "second") {
      return formatter.format(Math.round(seconds / secondsPerUnit), unit);
    }
  }

  return fallback;
}

function UserForm({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  useUILanguage();
  const { data: libraries = [] } = useAdminLibraries();
  const { data: accessGroups = [] } = useAccessGroups();
  const [username, setUsername] = useState(user?.username ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(user?.role ?? "user");
  const [enabled, setEnabled] = useState(user?.enabled ?? true);
  const [permissions, setPermissions] = useState<string[]>(
    user?.permissions ?? [PERMISSION_MARKER_EDIT],
  );
  // Policy fields inherit from the access group unless explicitly overridden.
  const [policy, setPolicy] = useState(() => policyStateFromUser(user));
  const [maxProfiles, setMaxProfiles] = useState<number>(user?.max_profiles ?? 5);
  const usernameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const roleId = useId();
  const enabledId = useId();
  const markerEditId = useId();
  const metadataCurationId = useId();
  const maxProfilesId = useId();
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const isPending = createMutation.isPending || updateMutation.isPending;
  // This form has no group picker: editing keeps the account's group, while a
  // new account lands on the default group — except an admin, which the server
  // deliberately leaves ungrouped (auth.Repository.CreateUser).
  const defaultGroupID = accessGroups.find((group) => group.is_default)?.id ?? null;
  const inheritGroupID = effectiveAccessGroupID(role, user ? user.access_group_id : defaultGroupID);
  const inheritHints =
    policyInheritHints(inheritGroupID, accessGroups) ??
    (role === "admin" ? undefined : user?.effective_policy);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (user) {
      const body: UpdateUserRequest = {
        username,
        email,
        role,
        permissions,
        enabled,
        max_profiles: maxProfiles,
        ...policyUpdateFields(policy),
      };
      if (role === "admin") {
        body.access_group_id = effectiveAccessGroupID(role, user.access_group_id);
      }
      if (password) body.password = password;
      updateMutation.mutate({ id: user.id, body }, { onSuccess: onClose });
    } else {
      const body: CreateUserRequest = {
        username,
        email,
        password,
        role,
        permissions,
        create_default_profile: true,
        max_profiles: maxProfiles,
        ...policyCreateFields(policy),
      };
      createMutation.mutate(body, { onSuccess: onClose });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-h-[70vh] flex-col">
      <Tabs defaultValue="account" className="min-h-0 flex-1">
        <TabsList variant="line" className="border-border mb-4 w-full justify-start border-b pb-1">
          <TabsTrigger value="account" className="flex-none px-1">
            {tr("pages.admin_users.account")}
          </TabsTrigger>
          <TabsTrigger value="access" className="flex-none px-1">
            {tr("pages.admin_users.access")}
          </TabsTrigger>
          <TabsTrigger value="limits" className="flex-none px-1">
            {tr("pages.admin_users.limits")}
          </TabsTrigger>
        </TabsList>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <TabsContent value="account" className="mt-0 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={usernameId}>{tr("pages.admin_users.username")}</Label>
                <Input
                  id={usernameId}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={emailId}>{tr("pages.admin_users.email")}</Label>
                <Input
                  id={emailId}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={passwordId}>
                  {tr("pages.admin_users.password")}{" "}
                  {user && tr("pages.admin_users.leave_blank_to_keep_current")}
                </Label>
                <Input
                  id={passwordId}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required={!user}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={roleId}>{tr("pages.admin_users.role")}</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger id={roleId}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">{tr("pages.admin_users.user")}</SelectItem>
                    <SelectItem value="admin">{tr("pages.admin_users.admin")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {user && (
              <div className="border-border flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <div className="text-sm font-medium">
                    {tr("pages.admin_users.account_status")}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {tr("pages.admin_users.disable_access_without_deleting_the_user")}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={enabledId} className="text-xs">
                    {tr("pages.admin_users.enabled")}
                  </Label>
                  <Switch id={enabledId} checked={enabled} onCheckedChange={setEnabled} />
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="access" className="mt-0 space-y-4">
            <div className="border-border flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <Label htmlFor={markerEditId}>{tr("pages.admin_users.marker_editing")}</Label>
                <p className="text-muted-foreground text-xs">
                  {tr(
                    "pages.admin_users.edit_intro_recap_credits_and_preview_markers_within_assigned_libraries",
                  )}
                </p>
              </div>
              <Switch
                id={markerEditId}
                checked={hasAssignedPermission(permissions, PERMISSION_MARKER_EDIT)}
                onCheckedChange={(checked) =>
                  setPermissions((current) =>
                    setAssignedPermission(current, PERMISSION_MARKER_EDIT, checked),
                  )
                }
              />
            </div>
            <div className="border-border flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <Label htmlFor={metadataCurationId}>
                  {tr("pages.admin_users.metadata_curation")}
                </Label>
                <p className="text-muted-foreground text-xs">
                  {tr(
                    "pages.admin_users.edit_refresh_and_rematch_metadata_within_assigned_libraries",
                  )}
                </p>
              </div>
              <Switch
                id={metadataCurationId}
                checked={hasAssignedPermission(permissions, PERMISSION_METADATA_CURATION)}
                onCheckedChange={(checked) =>
                  setPermissions((current) =>
                    setAssignedPermission(current, PERMISSION_METADATA_CURATION, checked),
                  )
                }
              />
            </div>
            <PolicyAccessFields
              state={policy}
              onChange={setPolicy}
              effective={inheritHints}
              libraries={libraries}
            />
          </TabsContent>

          <TabsContent value="limits" className="mt-0 space-y-4">
            <PolicyLimitFields state={policy} onChange={setPolicy} effective={inheritHints} />
            <div className="space-y-1">
              <Label htmlFor={maxProfilesId}>{tr("pages.admin_users.max_profiles")}</Label>
              <Input
                id={maxProfilesId}
                type="number"
                min={1}
                value={maxProfiles}
                onChange={(e) => setMaxProfiles(Number(e.target.value))}
              />
            </div>
          </TabsContent>
        </div>
      </Tabs>

      <div className="border-border mt-4 border-t pt-4">
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? tr("pages.admin_users.saving") : tr("common.actions.save")}
        </Button>
      </div>
    </form>
  );
}
