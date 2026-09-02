import { ArrowLeft, Plus, Trash2, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";

import type { AccessGroup, AccessGroupInput } from "@/api/types";
import { LibraryAccessSelector } from "@/components/LibraryAccessSelector";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  useAccessGroups,
  useCreateAccessGroup,
  useDeleteAccessGroup,
  useUpdateAccessGroup,
} from "@/hooks/queries/admin/accessGroups";
import { useAdminLibraries } from "@/hooks/queries/admin/libraries";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { PERMISSION_MARKER_EDIT, PERMISSION_METADATA_CURATION } from "@/lib/permissions";
import {
  PLAYBACK_QUALITY_OPTIONS,
  playbackQualityPresetFromValue,
  playbackQualityValueFromPreset,
  type PlaybackQualityPreset,
} from "@/lib/playback-quality";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

// The two assignable permissions (mirrors auth.assignablePermissions). A group
// mask of `null` means "all assignable"; a list narrows to those named.
const ASSIGNABLE_PERMISSIONS: Array<{ value: string; label: string; description: string }> = [
  {
    value: PERMISSION_METADATA_CURATION,
    get label() {
      return tr("pages.admin_access_groups.metadata_curation");
    },
    get description() {
      return tr("pages.admin_access_groups.edit_metadata_for_items_in_the_member_s_libraries");
    },
  },
  {
    value: PERMISSION_MARKER_EDIT,
    get label() {
      return tr("pages.admin_access_groups.marker_editing");
    },
    get description() {
      return tr("pages.admin_access_groups.create_and_adjust_intro_credit_markers");
    },
  },
];

function limitLabel(value: number) {
  return value > 0 ? String(value) : "Unlimited";
}

export default function AdminAccessGroups() {
  useUILanguage();
  useDocumentTitle(tr("pages.admin_access_groups.access_groups"));
  const groups = useAccessGroups();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const createGroup = useCreateAccessGroup();

  const selected = useMemo(
    () => groups.data?.find((group) => group.id === selectedId),
    [groups.data, selectedId],
  );

  async function create() {
    const name = newName.trim();
    if (!name) return;
    const group = await createGroup.mutateAsync({ name });
    setNewName("");
    setCreating(false);
    setSelectedId(group.id);
  }

  if (selected) {
    return (
      <div className="page-shell space-y-6 py-4 sm:py-6">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground -ml-2 w-fit"
          onClick={() => setSelectedId(null)}
        >
          <ArrowLeft className="size-4" />
          {tr("pages.admin_access_groups.all_groups")}
        </Button>
        <AccessGroupEditor
          key={selected.id}
          group={selected}
          onDeleted={() => setSelectedId(null)}
        />
      </div>
    );
  }

  return (
    <div className="page-shell space-y-6 py-4 sm:py-6">
      <div className="page-header gap-5">
        <div className="space-y-3">
          <h1 className="page-title text-[clamp(2rem,4vw,3rem)]">
            {tr("pages.admin_access_groups.access_groups")}
          </h1>
          <p className="page-subtitle text-sm sm:text-base">
            {tr("pages.admin_access_groups.the_shared_policy_layer_for_a_set_of_users_a")}
          </p>
        </div>
        {!creating && (
          <Button type="button" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            {tr("pages.admin_access_groups.new_group")}
          </Button>
        )}
      </div>

      {creating && (
        <div className="surface-panel-subtle flex flex-wrap items-center gap-2 rounded-2xl p-4">
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void create();
            }}
            placeholder={tr("pages.admin_access_groups.group_name_e_g_kids_guests")}
            aria-label={tr("pages.admin_access_groups.new_group_name")}
            className="max-w-xs"
            autoFocus
          />
          <Button type="button" onClick={create} disabled={createGroup.isPending}>
            {tr("common.actions.create")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setCreating(false);
              setNewName("");
            }}
          >
            {tr("common.actions.cancel")}
          </Button>
        </div>
      )}

      {groups.isLoading && (
        <p className="text-muted-foreground text-sm">
          {tr("pages.admin_access_groups.loading_access_groups")}
        </p>
      )}

      {!groups.isLoading && groups.data?.length === 0 && !creating && (
        <div className="surface-panel-subtle rounded-2xl p-8 text-center">
          <UsersRound className="text-muted-foreground mx-auto size-8" />
          <h2 className="mt-3 text-lg font-semibold">
            {tr("pages.admin_access_groups.no_access_groups_yet")}
          </h2>
          <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
            {tr(
              "pages.admin_access_groups.create_a_group_to_manage_libraries_downloads_streams_and_permissions",
            )}
          </p>
        </div>
      )}

      {groups.data && groups.data.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.data.map((group) => (
            <AccessGroupCard key={group.id} group={group} onClick={() => setSelectedId(group.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function AccessGroupCard({ group, onClick }: { group: AccessGroup; onClick: () => void }) {
  useUILanguage();
  const facts = [
    group.library_ids === null
      ? "All libraries"
      : `${group.library_ids.length} librar${group.library_ids.length === 1 ? "y" : "ies"}`,
    group.download_allowed ? "Downloads on" : "No downloads",
    `${limitLabel(group.max_streams)} stream${group.max_streams === 1 ? "" : "s"}`,
    group.requests_allowed ? "Requests on" : "No requests",
  ];
  return (
    <button
      type="button"
      onClick={onClick}
      className="surface-panel hover:border-ring/40 focus-visible:ring-ring/60 flex flex-col gap-3 rounded-2xl border border-transparent p-5 text-left transition-colors outline-none focus-visible:ring-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold tracking-tight">{group.name}</h2>
            {group.is_default && (
              <span className="border-border text-muted-foreground shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
                {tr("pages.admin_access_groups.default")}
              </span>
            )}
          </div>
          {group.description && (
            <p className="text-muted-foreground mt-0.5 line-clamp-2 text-sm">{group.description}</p>
          )}
        </div>
        <span className="bg-secondary text-secondary-foreground shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium">
          {group.member_count}{" "}
          {group.member_count === 1
            ? tr("pages.admin_access_groups.member")
            : tr("pages.admin_access_groups.members")}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {facts.map((fact) => (
          <span
            key={fact}
            className="border-border text-muted-foreground rounded-md border px-2 py-0.5 text-xs"
          >
            {fact}
          </span>
        ))}
      </div>
    </button>
  );
}

interface AccessGroupEditorProps {
  group: AccessGroup;
  onDeleted: () => void;
}

function AccessGroupEditor({ group, onDeleted }: AccessGroupEditorProps) {
  useUILanguage();
  const libraries = useAdminLibraries();
  const updateGroup = useUpdateAccessGroup();
  const deleteGroup = useDeleteAccessGroup();
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Draft state, keyed by group id via the parent's selection so switching
  // groups remounts this component with fresh initial values.
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [libraryIds, setLibraryIds] = useState<number[] | null>(group.library_ids);
  const [qualityPreset, setQualityPreset] = useState<PlaybackQualityPreset>(
    playbackQualityPresetFromValue(group.max_playback_quality),
  );
  const [downloadAllowed, setDownloadAllowed] = useState(group.download_allowed);
  const [transcodeAllowed, setTranscodeAllowed] = useState(group.download_transcode_allowed);
  const [videoTranscodeAllowed, setVideoTranscodeAllowed] = useState(group.transcode_allowed);
  const [audioTranscodeAllowed, setAudioTranscodeAllowed] = useState(group.audio_transcode_allowed);
  const [maxStreams, setMaxStreams] = useState(group.max_streams);
  const [maxTranscodes, setMaxTranscodes] = useState(group.max_transcodes);
  const [permissions, setPermissions] = useState<string[] | null>(group.allowed_permissions);
  const [requestsAllowed, setRequestsAllowed] = useState(group.requests_allowed);
  const [isDefault, setIsDefault] = useState(group.is_default);

  const allPermissions = permissions === null;

  function setPermissionAllowed(permission: string, allowed: boolean) {
    const current = permissions ?? ASSIGNABLE_PERMISSIONS.map((entry) => entry.value);
    const next = allowed
      ? Array.from(new Set([...current, permission]))
      : current.filter((value) => value !== permission);
    setPermissions(next);
  }

  async function save() {
    const body: AccessGroupInput = {
      name: name.trim(),
      description: description.trim(),
      library_ids: libraryIds,
      max_playback_quality: playbackQualityValueFromPreset(qualityPreset),
      download_allowed: downloadAllowed,
      // The transcode toggle is disabled (not reset) when downloads are off,
      // so clamp it here to avoid saving a contradictory record.
      download_transcode_allowed: downloadAllowed && transcodeAllowed,
      transcode_allowed: videoTranscodeAllowed,
      audio_transcode_allowed: audioTranscodeAllowed,
      max_streams: maxStreams,
      max_transcodes: maxTranscodes,
      allowed_permissions: permissions,
      requests_allowed: requestsAllowed,
      is_default: isDefault,
    };
    await updateGroup.mutateAsync({ id: group.id, body });
  }

  async function remove() {
    await deleteGroup.mutateAsync(group.id);
    setConfirmDelete(false);
    onDeleted();
  }

  return (
    <div className="space-y-5">
      <div className="surface-panel space-y-4 rounded-2xl border-0 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="group-name">{tr("pages.admin_access_groups.name")}</Label>
            <Input id="group-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="group-description">{tr("pages.admin_access_groups.description")}</Label>
            <Input
              id="group-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={tr("pages.admin_access_groups.optional")}
            />
          </div>
        </div>
        <ToggleRow
          label={tr("pages.admin_access_groups.default_for_new_users")}
          description={
            group.is_default
              ? tr(
                  "pages.admin_access_groups.newly_created_accounts_are_placed_in_this_group_automatically_to",
                )
              : tr(
                  "pages.admin_access_groups.newly_created_accounts_are_placed_in_this_group_automatically_existing",
                )
          }
          checked={isDefault}
          onCheckedChange={setIsDefault}
          disabled={group.is_default}
        />
      </div>

      <section className="surface-panel space-y-4 rounded-2xl border-0 p-5">
        <h2 className="text-sm font-semibold">
          {tr("pages.admin_access_groups.libraries_playback")}
        </h2>
        <LibraryAccessSelector
          libraries={libraries.data ?? []}
          value={libraryIds}
          onChange={setLibraryIds}
        />
        <div className="space-y-2">
          <Label htmlFor="group-quality">
            {tr("pages.admin_access_groups.maximum_playback_quality")}
          </Label>
          <Select
            value={qualityPreset}
            onValueChange={(value) => setQualityPreset(value as PlaybackQualityPreset)}
          >
            <SelectTrigger id="group-quality" className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAYBACK_QUALITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label} — {option.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="surface-panel space-y-3 rounded-2xl border-0 p-5">
        <h2 className="text-sm font-semibold">
          {tr("pages.admin_access_groups.downloads_requests")}
        </h2>
        <ToggleRow
          label={tr("pages.admin_access_groups.allow_downloads")}
          description={tr("pages.admin_access_groups.members_may_download_items_to_their_devices")}
          checked={downloadAllowed}
          onCheckedChange={setDownloadAllowed}
        />
        <ToggleRow
          label={tr("pages.admin_access_groups.allow_transcoded_downloads")}
          description={tr(
            "pages.admin_access_groups.members_may_download_converted_versions_not_just_the_original_file",
          )}
          checked={transcodeAllowed}
          onCheckedChange={setTranscodeAllowed}
          disabled={!downloadAllowed}
        />
        <ToggleRow
          label={tr("pages.admin_access_groups.allow_media_requests")}
          description={tr(
            "pages.admin_access_groups.members_may_request_titles_that_aren_t_in_the_library",
          )}
          checked={requestsAllowed}
          onCheckedChange={setRequestsAllowed}
        />
      </section>

      <section className="surface-panel space-y-4 rounded-2xl border-0 p-5">
        <h2 className="text-sm font-semibold">
          {tr("pages.admin_access_groups.concurrent_streams")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <LimitField
            id="group-streams"
            label={tr("pages.admin_access_groups.max_streams")}
            hint={tr("pages.admin_access_groups.value_0_unlimited")}
            value={maxStreams}
            onChange={setMaxStreams}
          />
          <LimitField
            id="group-transcodes"
            label={tr("pages.admin_access_groups.max_transcodes")}
            hint={tr("pages.admin_access_groups.value_0_unlimited")}
            value={maxTranscodes}
            onChange={setMaxTranscodes}
          />
        </div>
        <ToggleRow
          label={tr("pages.admin_access_groups.allow_video_transcoding")}
          description={tr(
            "pages.admin_access_groups.members_may_play_items_that_need_server_side_video_conversion",
          )}
          checked={videoTranscodeAllowed}
          onCheckedChange={setVideoTranscodeAllowed}
        />
        <ToggleRow
          label={tr("pages.admin_access_groups.allow_audio_transcoding")}
          description={tr(
            "pages.admin_access_groups.members_may_play_items_that_need_audio_conversion_without_video",
          )}
          checked={audioTranscodeAllowed}
          onCheckedChange={setAudioTranscodeAllowed}
        />
      </section>

      <section className="surface-panel space-y-3 rounded-2xl border-0 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">{tr("pages.admin_access_groups.permissions")}</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {tr(
                "pages.admin_access_groups.a_member_also_needs_the_permission_granted_on_their_own",
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">
              {tr("pages.admin_access_groups.allow_all")}
            </span>
            <Switch
              checked={allPermissions}
              onCheckedChange={(checked) =>
                setPermissions(checked ? null : ASSIGNABLE_PERMISSIONS.map((entry) => entry.value))
              }
              aria-label={tr("pages.admin_access_groups.allow_all_permissions")}
            />
          </div>
        </div>
        {!allPermissions && (
          <div className="space-y-2">
            {ASSIGNABLE_PERMISSIONS.map((permission) => (
              <ToggleRow
                key={permission.value}
                label={permission.label}
                description={permission.description}
                checked={permissions?.includes(permission.value) ?? false}
                onCheckedChange={(checked) => setPermissionAllowed(permission.value, checked)}
              />
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
            disabled={group.is_default}
          >
            <Trash2 className="size-4" />
            {tr("pages.admin_access_groups.delete_group")}
          </Button>
          {group.is_default && (
            <p className="text-muted-foreground text-xs">
              {tr(
                "pages.admin_access_groups.the_default_group_can_t_be_deleted_make_another_group",
              )}
            </p>
          )}
        </div>
        <Button type="button" onClick={save} disabled={updateGroup.isPending}>
          {updateGroup.isPending
            ? tr("pages.admin_access_groups.saving")
            : tr("pages.admin_access_groups.save_changes")}
        </Button>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tr("pages.admin_access_groups.delete")}
              {group.name}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {group.member_count > 0
                ? tr(
                    "pages.admin_access_groups.member_count_value_will_move_to_no_group_and_fall",
                    {
                      member_count: group.member_count,
                      value: group.member_count === 1 ? "member" : "members",
                    },
                  )
                : tr("pages.admin_access_groups.this_group_has_no_members_this_can_t_be_undone")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("common.actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              disabled={deleteGroup.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {tr("common.actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

function ToggleRow({ label, description, checked, onCheckedChange, disabled }: ToggleRowProps) {
  useUILanguage();
  return (
    <div className="border-border flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={label}
      />
    </div>
  );
}

interface LimitFieldProps {
  id: string;
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
}

function LimitField({ id, label, hint, value, onChange }: LimitFieldProps) {
  useUILanguage();
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-muted-foreground text-xs">{hint}</span>
      </div>
      <Input
        id={id}
        type="number"
        min={0}
        value={value}
        onChange={(event) => {
          const next = Number.parseInt(event.target.value, 10);
          onChange(Number.isFinite(next) && next > 0 ? next : 0);
        }}
      />
    </div>
  );
}
