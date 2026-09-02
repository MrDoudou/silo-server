import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { AdminJob, Library, LibraryCollection, LibraryCollectionGroup } from "@/api/types";
import { useAdminLibraries } from "@/hooks/queries/admin/libraries";
import {
  useAdminCollectionsBoard,
  useCreateCollectionGroup,
  useUpdateCollectionGroup,
  useDeleteCollectionGroup,
} from "@/hooks/queries/admin/collectionGroups";
import {
  useAdminCollections,
  useDeleteAdminCollection,
  useDeleteAdminCollections,
  useSyncAdminCollection,
  useTemplateBundleApplyJobs,
} from "@/hooks/queries/admin/collections";
import { invalidateAdminCollectionQueries } from "@/hooks/queries/collectionSurfaceRefresh";
import { sectionKeys } from "@/hooks/queries/keys";
import { useEventChannel } from "@/components/realtimeEventsContext";

import { GroupsBoard } from "@/components/collections/admin/GroupsBoard";
import { GroupEditDialog } from "@/components/collections/admin/GroupEditDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  AlertCircle,
  CheckCircle2,
  Library as LibraryIcon,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { CollectionTemplateGallery } from "@/components/CollectionTemplateGallery";
import { BulkSelectionCheckbox } from "@/components/BulkSelectionCheckbox";
import { updateCheckboxSelection } from "@/lib/checkboxSelection";
import { buildAdminCollectionEditorPath, collectionsInAdminScope } from "./adminCollectionsShared";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

export default function AdminCollections() {
  useUILanguage();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: libraries = [] } = useAdminLibraries();
  const requestedLibraryId = Number(searchParams.get("libraryId"));
  const initialLibraryId =
    Number.isFinite(requestedLibraryId) && requestedLibraryId > 0 ? requestedLibraryId : null;
  const selectedLibraryId = initialLibraryId;
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<{
    mode: "create" | "edit";
    id?: string;
  } | null>(null);
  const [confirmDeleteCollection, setConfirmDeleteCollection] = useState<LibraryCollection | null>(
    null,
  );
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [confirmDeleteSelected, setConfirmDeleteSelected] = useState(false);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<Set<string>>(new Set());

  const allCollections = useAdminCollections();
  const libraryCounts = useMemo(
    () => countCollectionsByLibrary(libraries, allCollections.data ?? []),
    [libraries, allCollections.data],
  );

  function clearCollectionSelection() {
    setSelectedCollectionIds(new Set());
  }

  const setSelectedLibraryId = (libraryId: number | null) => {
    clearCollectionSelection();
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (libraryId) {
        next.set("libraryId", String(libraryId));
      } else {
        next.delete("libraryId");
      }
      return next;
    });
  };

  const board = useAdminCollectionsBoard(selectedLibraryId ?? undefined);
  const collectionsInScope = useMemo(
    () => collectionsInAdminScope(allCollections.data ?? [], board.data, selectedLibraryId),
    [allCollections.data, board.data, selectedLibraryId],
  );
  const selectedCollections = useMemo(
    () => collectionsInScope.filter((collection) => selectedCollectionIds.has(collection.id)),
    [collectionsInScope, selectedCollectionIds],
  );
  const createGroup = useCreateCollectionGroup(selectedLibraryId ?? 0);
  const updateGroup = useUpdateCollectionGroup(selectedLibraryId ?? 0);
  const deleteGroup = useDeleteCollectionGroup(selectedLibraryId ?? 0);
  const deleteCollection = useDeleteAdminCollection();
  const deleteCollections = useDeleteAdminCollections();
  const syncCollection = useSyncAdminCollection();
  const isAllLibraries = selectedLibraryId === null;
  const applyJobs = useTemplateBundleApplyJobs();
  useEventChannel("jobs");
  const latestApplyJob = applyJobs.data?.[0] ?? null;
  const activeApplyJob = latestApplyJob !== null && isActiveTemplateBundleApplyJob(latestApplyJob);
  const lastInvalidatedJobID = useRef<string | null>(null);

  useEffect(() => {
    if (!latestApplyJob || activeApplyJob || lastInvalidatedJobID.current === latestApplyJob.id) {
      return;
    }
    lastInvalidatedJobID.current = latestApplyJob.id;
    void invalidateAdminCollectionQueries(queryClient);
    void queryClient.invalidateQueries({ queryKey: sectionKeys.all });
  }, [activeApplyJob, latestApplyJob, queryClient]);

  useEffect(() => {
    const clearSelection = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        confirmDeleteCollection === null &&
        !confirmDeleteSelected &&
        !confirmDeleteAll
      ) {
        setSelectedCollectionIds(new Set());
      }
    };
    window.addEventListener("keydown", clearSelection);
    return () => window.removeEventListener("keydown", clearSelection);
  }, [confirmDeleteAll, confirmDeleteCollection, confirmDeleteSelected]);

  if (allCollections.isLoading && libraries.length === 0) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full rounded-lg" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const editingTarget: LibraryCollectionGroup | null =
    editingGroup?.mode === "edit" && editingGroup.id
      ? (board.data?.groups.find((g) => g.id === editingGroup.id) ?? null)
      : null;

  const boardCollectionCount =
    (board.data?.ungrouped.length ?? 0) +
    (board.data?.groups.reduce((sum, group) => sum + group.collections.length, 0) ?? 0);
  const hasRegularBoardGroups =
    board.data?.groups.some((group) => group.kind === "regular") ?? false;
  const showScopedEmpty =
    !isAllLibraries &&
    !board.isLoading &&
    board.data &&
    boardCollectionCount === 0 &&
    !hasRegularBoardGroups;
  const selectedLibrary = libraries.find((library) => library.id === selectedLibraryId) ?? null;
  const collectionDeletionNotice =
    "Silo will keep collections that are still used by home or library sections. This action cannot be undone.";
  const deleteAllDescription = selectedLibrary
    ? `Delete all ${collectionsInScope.length} collections shown for ${selectedLibrary.name}? Shared collections will also be removed from their other libraries. ${collectionDeletionNotice}`
    : `Delete all ${collectionsInScope.length} server collections? ${collectionDeletionNotice}`;
  const deleteSelectedDescription = `Delete ${selectedCollections.length} selected collection${selectedCollections.length === 1 ? "" : "s"}? ${collectionDeletionNotice}`;
  const deleteProgressLabel = `Deleting ${deleteCollections.progress?.completed ?? 0} of ${deleteCollections.progress?.total ?? collectionsInScope.length} collections`;

  function handleDeleteSelected() {
    if (!activeApplyJob && selectedCollections.length > 0) {
      deleteCollections.mutate(selectedCollections.map((collection) => collection.id));
    }
    setConfirmDeleteSelected(false);
  }

  function handleDeleteAll() {
    if (!activeApplyJob && collectionsInScope.length > 0) {
      deleteCollections.mutate(collectionsInScope.map((collection) => collection.id));
    }
    setConfirmDeleteAll(false);
  }

  return (
    <div
      className="space-y-6"
      aria-busy={deleteCollections.isPending}
      inert={deleteCollections.isPending ? true : undefined}
    >
      <ConfirmDialog
        open={confirmDeleteCollection !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteCollection(null);
        }}
        title={tr("pages.admin_collections.delete_collection")}
        description={tr(
          "pages.admin_collections.delete_collection_title_this_action_cannot_be_undone",
          {
            title: confirmDeleteCollection?.title,
          },
        )}
        confirmLabel={tr("common.actions.delete")}
        variant="destructive"
        onConfirm={() => {
          if (confirmDeleteCollection) {
            deleteCollection.mutate({
              id: confirmDeleteCollection.id,
              libraryId: selectedLibraryId ?? confirmDeleteCollection.library_id,
            });
          }
          setConfirmDeleteCollection(null);
        }}
      />

      <ConfirmDialog
        open={confirmDeleteSelected}
        onOpenChange={setConfirmDeleteSelected}
        title={tr("pages.admin_collections.delete_selected_collections")}
        description={deleteSelectedDescription}
        confirmLabel={tr("pages.admin_collections.delete_selected")}
        variant="destructive"
        onConfirm={handleDeleteSelected}
      />

      <ConfirmDialog
        open={confirmDeleteAll}
        onOpenChange={setConfirmDeleteAll}
        title={tr("pages.admin_collections.delete_all_collections")}
        description={deleteAllDescription}
        confirmLabel={tr("pages.admin_collections.delete_all")}
        variant="destructive"
        onConfirm={handleDeleteAll}
      />

      <div className="page-header gap-5">
        <div className="space-y-3">
          <h1 className="page-title text-[clamp(2rem,4vw,3rem)]">
            {tr("pages.admin_collections.collections")}
          </h1>
          <p className="page-subtitle text-sm sm:text-base">
            {tr(
              "pages.admin_collections.curate_library_shelves_and_sync_them_from_mdblist_or_tmdb",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <AdminCollectionsLibrarySelect
            libraries={libraries}
            value={selectedLibraryId}
            counts={libraryCounts}
            totalCount={allCollections.data?.length ?? 0}
            onChange={setSelectedLibraryId}
          />
          {!isAllLibraries ? (
            <Button size="sm" variant="outline" onClick={() => setEditingGroup({ mode: "create" })}>
              <Plus className="mr-1 h-4 w-4" /> {tr("pages.admin_collections.new_group")}
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => setGalleryOpen(true)}>
            <Sparkles className="mr-1 h-4 w-4" /> {tr("pages.admin_collections.browse_templates")}
          </Button>
          {selectedCollections.length > 0 ? (
            <>
              <Badge variant="secondary">
                {selectedCollections.length} {tr("pages.admin_collections.selected")}
              </Badge>
              <Button size="sm" variant="ghost" onClick={clearCollectionSelection}>
                {tr("pages.admin_collections.clear")}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={deleteCollections.isPending || activeApplyJob}
                onClick={() => setConfirmDeleteSelected(true)}
              >
                <Trash2 data-icon="inline-start" />{" "}
                {tr("pages.admin_collections.delete_selected_76bf56ab")}
              </Button>
            </>
          ) : null}
          {collectionsInScope.length > 0 ? (
            <Button
              size="sm"
              variant="destructive"
              disabled={deleteCollections.isPending || activeApplyJob}
              onClick={() => setConfirmDeleteAll(true)}
            >
              {deleteCollections.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-4 w-4" />
              )}
              {deleteCollections.isPending
                ? tr("pages.admin_collections.delete_progress_label", {
                    deleteProgressLabel: deleteProgressLabel,
                  })
                : tr("pages.admin_collections.delete_all_97f32d67")}
            </Button>
          ) : null}
          <Button
            size="sm"
            onClick={() => navigate(buildAdminCollectionEditorPath("new", selectedLibraryId))}
          >
            <Plus className="mr-1 h-4 w-4" /> {tr("pages.admin_collections.add_collection")}
          </Button>
        </div>
      </div>

      <CollectionApplyJobBanner job={latestApplyJob} />

      <CollectionTemplateGallery
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        libraries={libraries}
        initialLibraryId={selectedLibraryId}
      />

      {isAllLibraries ? (
        <AllLibraryCollectionsOverview
          libraries={libraries}
          collections={allCollections.data ?? []}
          isLoading={allCollections.isLoading}
          selectedIds={selectedCollectionIds}
          setSelectedIds={setSelectedCollectionIds}
          syncingCollectionID={syncCollection.variables?.id ?? null}
          onEdit={(collection, libraryId) =>
            navigate(buildAdminCollectionEditorPath(collection.id, libraryId))
          }
          onDelete={setConfirmDeleteCollection}
          onSync={(collection, libraryId) =>
            syncCollection.mutate({
              id: collection.id,
              libraryId,
            })
          }
          onCreate={() => navigate(buildAdminCollectionEditorPath("new", null))}
          onOpenTemplates={() => setGalleryOpen(true)}
        />
      ) : null}

      {!isAllLibraries && board.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!isAllLibraries && board.data && !showScopedEmpty && (
        <GroupsBoard
          libraryID={selectedLibraryId}
          groups={board.data.groups}
          ungrouped={board.data.ungrouped}
          ungroupedSortOrder={board.data.ungroupedSortOrder}
          onEditGroup={(id) => setEditingGroup({ mode: "edit", id })}
          onEditCollection={(collection) =>
            navigate(buildAdminCollectionEditorPath(collection.id, selectedLibraryId))
          }
          onDeleteCollection={(collection) => setConfirmDeleteCollection(collection)}
          onSyncCollection={(collection) =>
            syncCollection.mutate({
              id: collection.id,
              libraryId: selectedLibraryId,
            })
          }
          selectedIds={selectedCollectionIds}
          setSelectedIds={setSelectedCollectionIds}
          syncingCollectionID={syncCollection.variables?.id ?? null}
        />
      )}

      {showScopedEmpty && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {tr("pages.admin_collections.no_collections_yet")}
            </p>
            <p className="text-muted-foreground max-w-sm text-xs">
              {tr(
                "pages.admin_collections.create_collections_for_this_library_or_sync_them_from_mdblist",
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setGalleryOpen(true)}>
              <Sparkles className="mr-1 h-4 w-4" />{" "}
              {tr("pages.admin_collections.start_from_a_template")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(buildAdminCollectionEditorPath("new", selectedLibraryId))}
            >
              <Plus className="mr-1 h-4 w-4" /> {tr("pages.admin_collections.create_from_scratch")}
            </Button>
          </div>
        </div>
      )}

      {editingGroup && (
        <GroupEditDialog
          mode={editingGroup.mode}
          group={editingTarget}
          onCancel={() => setEditingGroup(null)}
          onSubmit={async (input) => {
            try {
              if (editingGroup.mode === "create") {
                await createGroup.mutateAsync(input);
              } else if (editingGroup.id) {
                await updateGroup.mutateAsync({ id: editingGroup.id, ...input });
              }
              setEditingGroup(null);
            } catch {
              // toast already shown by mutation onError
            }
          }}
          onDelete={
            editingGroup.mode === "edit" && editingGroup.id
              ? async () => {
                  if (!editingGroup.id) return;
                  try {
                    await deleteGroup.mutateAsync(editingGroup.id);
                    setEditingGroup(null);
                  } catch {
                    // toast already shown by mutation onError
                  }
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function CollectionApplyJobBanner({ job }: { job: AdminJob | null }) {
  useUILanguage();
  if (!job || job.job_type !== "template_bundle_apply") {
    return null;
  }

  const active = isActiveTemplateBundleApplyJob(job);
  const recent = active || isRecentTemplateBundleApplyJob(job);
  if (!recent) {
    return null;
  }

  if (job.status === "failed") {
    return (
      <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border px-4 py-3">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">
              {tr("pages.admin_collections.collection_defaults_apply_failed")}
            </p>
            <p className="text-xs">
              {job.error_message || job.message
                ? tr.remote({ message: job.error_message || job.message || "" })
                : tr("pages.admin_collections.the_job_failed")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (job.status === "completed") {
    return (
      <div className="border-border bg-muted/30 rounded-lg border px-4 py-3">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">
              {tr("pages.admin_collections.collection_defaults_applied")}
            </p>
            <p className="text-muted-foreground text-xs">{templateBundleApplySummary(job)}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-border bg-muted/30 rounded-lg border px-4 py-3">
      <div className="flex items-start gap-3">
        <Loader2 className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0 animate-spin" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {tr("pages.admin_collections.applying_collection_defaults")}
            </p>
            <p className="text-muted-foreground text-xs">
              {job.message
                ? tr.remote({ message: job.message })
                : tr("pages.admin_collections.working")}
            </p>
          </div>
          <div className="progress-bar">
            <div className="progress-fill animate-pulse" style={{ width: "40%" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function isActiveTemplateBundleApplyJob(job: AdminJob) {
  return job.status === "queued" || job.status === "running";
}

function isRecentTemplateBundleApplyJob(job: AdminJob) {
  const timestamp = job.completed_at ?? job.requested_at;
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return false;
  }
  return Date.now() - parsed < 10 * 60_000;
}

function templateBundleApplySummary(job: AdminJob) {
  const payload = job.result_payload as Record<string, unknown> | undefined;
  const created = resultArrayLength(payload, "created");
  const skipped = resultArrayLength(payload, "skipped");
  const failed = resultArrayLength(payload, "failed");
  const syncQueued = resultArrayLength(payload, "sync_queued");
  const featured = resultArrayLength(payload, "featured");
  const parts = [
    `Created ${created}`,
    `skipped ${skipped}`,
    failed > 0 ? `failed ${failed}` : "",
    syncQueued > 0 ? `queued ${syncQueued} initial syncs` : "",
    featured > 0 ? `featured ${featured}` : "",
  ].filter(Boolean);
  return parts.join("; ");
}

function resultArrayLength(payload: Record<string, unknown> | undefined, key: string) {
  const value = payload?.[key];
  return Array.isArray(value) ? value.length : 0;
}

function AdminCollectionsLibrarySelect({
  libraries,
  value,
  counts,
  totalCount,
  onChange,
}: {
  libraries: Library[];
  value: number | null;
  counts: Map<number, number>;
  totalCount: number;
  onChange: (libraryId: number | null) => void;
}) {
  useUILanguage();
  return (
    <Select
      value={value ? String(value) : "all"}
      onValueChange={(next) => onChange(next === "all" ? null : Number(next))}
    >
      <SelectTrigger className="w-full sm:w-[240px]">
        <SelectValue placeholder={tr("pages.admin_collections.choose_library")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">
          {tr("pages.admin_collections.all_libraries")}
          {totalCount})
        </SelectItem>
        {libraries.map((library) => (
          <SelectItem key={library.id} value={String(library.id)}>
            {library.name} ({counts.get(library.id) ?? 0})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AllLibraryCollectionsOverview({
  libraries,
  collections,
  isLoading,
  selectedIds,
  setSelectedIds,
  syncingCollectionID,
  onEdit,
  onDelete,
  onSync,
  onCreate,
  onOpenTemplates,
}: {
  libraries: Library[];
  collections: LibraryCollection[];
  isLoading: boolean;
  selectedIds: Set<string>;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  syncingCollectionID: string | null;
  onEdit: (collection: LibraryCollection, libraryId: number) => void;
  onDelete: (collection: LibraryCollection) => void;
  onSync: (collection: LibraryCollection, libraryId: number) => void;
  onCreate: () => void;
  onOpenTemplates: () => void;
}) {
  useUILanguage();
  const sections = useMemo(
    () => buildAllLibrarySections(libraries, collections),
    [libraries, collections],
  );
  const selectionRows = useMemo(
    () =>
      sections.flatMap((section) =>
        section.collections.map((collection) => ({
          rowId: `${section.library.id}:${collection.id}`,
          collectionId: collection.id,
        })),
      ),
    [sections],
  );
  const selectionOrder = useMemo(() => selectionRows.map((row) => row.rowId), [selectionRows]);
  const collectionIdByRow = useMemo(
    () => new Map(selectionRows.map((row) => [row.rowId, row.collectionId])),
    [selectionRows],
  );
  const selectionAnchorRef = useRef<string | null>(null);

  const updateSelection = (rowId: string, checked: boolean, extendRange: boolean) => {
    const anchorId = extendRange && selectedIds.size > 0 ? selectionAnchorRef.current : null;
    setSelectedIds((previous) =>
      updateCheckboxSelection(
        previous,
        selectionOrder,
        anchorId,
        rowId,
        checked,
        extendRange,
        (selectedRowId) => collectionIdByRow.get(selectedRowId) ?? selectedRowId,
      ),
    );
    if (anchorId === null || !selectionOrder.includes(anchorId)) {
      selectionAnchorRef.current = rowId;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (collections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <LibraryIcon className="text-muted-foreground h-9 w-9" />
        <div className="space-y-1">
          <p className="text-sm font-medium">{tr("pages.admin_collections.no_collections_yet")}</p>
          <p className="text-muted-foreground max-w-sm text-xs">
            {tr(
              "pages.admin_collections.create_collections_to_curate_library_shelves_or_sync_them_from",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={onOpenTemplates}>
            <Sparkles className="mr-1 h-4 w-4" />{" "}
            {tr("pages.admin_collections.start_from_a_template")}
          </Button>
          <Button variant="ghost" size="sm" onClick={onCreate}>
            <Plus className="mr-1 h-4 w-4" /> {tr("pages.admin_collections.create_from_scratch")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <section key={section.library.id} className="bg-background rounded-lg border">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <h2 className="text-base font-semibold">{section.library.name}</h2>
            <Badge variant="outline">
              {section.collections.length} {tr("pages.admin_collections.collection")}
              {section.collections.length === 1 ? "" : tr("pages.admin_collections.s")}
            </Badge>
          </div>
          <div className="divide-y">
            {section.collections.map((collection) => {
              const rowId = `${section.library.id}:${collection.id}`;
              return (
                <AllLibraryCollectionRow
                  key={rowId}
                  collection={collection}
                  libraries={libraries}
                  libraryId={section.library.id}
                  selected={selectedIds.has(collection.id)}
                  isSyncing={syncingCollectionID === collection.id}
                  onSelectionChange={(checked, extendRange) =>
                    updateSelection(rowId, checked, extendRange)
                  }
                  onEdit={() => onEdit(collection, section.library.id)}
                  onDelete={() => onDelete(collection)}
                  onSync={() => onSync(collection, section.library.id)}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function AllLibraryCollectionRow({
  collection,
  libraries,
  libraryId,
  selected,
  isSyncing,
  onSelectionChange,
  onEdit,
  onDelete,
  onSync,
}: {
  collection: LibraryCollection;
  libraries: Library[];
  libraryId: number;
  selected: boolean;
  isSyncing: boolean;
  onSelectionChange: (checked: boolean, extendRange: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onSync: () => void;
}) {
  useUILanguage();
  const syncable = collection.collection_type !== "manual";
  const collectionLibraries = collectionLibraryIDs(collection)
    .map((id) => libraries.find((library) => library.id === id)?.name ?? `Library ${id}`)
    .join(", ");
  const rowLibraryName =
    libraries.find((library) => library.id === libraryId)?.name ?? `library ${libraryId}`;

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <BulkSelectionCheckbox
        label={tr("pages.admin_collections.select_title_in_row_library_name", {
          title: collection.title,
          rowLibraryName: rowLibraryName,
        })}
        selected={selected}
        onSelectionChange={onSelectionChange}
      />
      {collection.poster_url ? (
        <img src={collection.poster_url} alt="" className="h-12 w-8 rounded object-cover" />
      ) : (
        <div className="bg-muted h-12 w-8 rounded" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-medium">{collection.title}</p>
          {collection.featured ? (
            <Badge variant="secondary">{tr("pages.admin_collections.featured")}</Badge>
          ) : null}
          {collection.visibility === "hidden" ? (
            <Badge variant="outline">{tr("pages.admin_collections.hidden")}</Badge>
          ) : null}
        </div>
        <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-xs">
          <span>
            {collection.item_count} {tr("pages.admin_collections.items")}
          </span>
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            {collection.collection_type}
          </Badge>
          <span>{collectionLibraries}</span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {syncable ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={tr("pages.admin_collections.sync_title", { title: collection.title })}
            disabled={isSyncing}
            onClick={onSync}
          >
            <RefreshCw className={isSyncing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={tr("pages.admin_collections.edit_title", { title: collection.title })}
          onClick={onEdit}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 w-8"
          aria-label={tr("pages.admin_collections.delete_title", { title: collection.title })}
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <span className="sr-only">
        {tr("pages.admin_collections.shown_under_library")} {libraryId}
      </span>
    </div>
  );
}

function countCollectionsByLibrary(
  libraries: Library[],
  collections: LibraryCollection[],
): Map<number, number> {
  const counts = new Map(libraries.map((library) => [library.id, 0]));
  for (const collection of collections) {
    for (const libraryId of collectionLibraryIDs(collection)) {
      counts.set(libraryId, (counts.get(libraryId) ?? 0) + 1);
    }
  }
  return counts;
}

function buildAllLibrarySections(libraries: Library[], collections: LibraryCollection[]) {
  return libraries
    .map((library) => ({
      library,
      collections: collections
        .filter((collection) => collectionLibraryIDs(collection).includes(library.id))
        .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title)),
    }))
    .filter((section) => section.collections.length > 0);
}

function collectionLibraryIDs(collection: LibraryCollection): number[] {
  return collection.library_ids.length > 0 ? collection.library_ids : [collection.library_id];
}
