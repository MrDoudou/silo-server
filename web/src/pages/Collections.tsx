import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  Calendar,
  Film,
  Globe,
  GripVertical,
  Library,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

import { CSS } from "@dnd-kit/utilities";

import type { Collection, ServerCollectionsLibrary, UserCollectionType } from "@/api/types";
import {
  useCollectionGroups,
  useCollections,
  useCreateCollectionGroup,
  useDeleteCollection,
  useDeleteCollectionGroup,
  useReorderCollectionGroups,
  useReorderCollections,
  useServerCollections,
  useUpdateCollection,
  useUpdateCollectionGroup,
} from "@/hooks/queries/collections";
import { CollectionPosterCard } from "@/components/collections/CollectionPosterCard";
import MediaCarousel from "@/components/MediaCarousel";
import { useSyncUserCollection } from "@/hooks/queries/userCollectionImports";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { CollectionTemplateGallery } from "@/components/CollectionTemplateGallery";
import {
  GroupedCollectionsBoard,
  useGroupedCollectionCard,
} from "@/components/collections/GroupedCollectionsBoard";
import { slugifyGroupSlug } from "@/lib/collectionGroups";
import { useUICustomization } from "@/hooks/useUICustomization";
import { carouselCardWidthClasses } from "@/lib/uiCustomization";

import {
  buildUserCollectionCatalogHref,
  buildUserCollectionEditorPath,
} from "./userCollectionsShared";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

type ImportedCollectionType = Extract<UserCollectionType, "mdblist" | "tmdb" | "trakt">;
const SYNCABLE_TYPES = new Set<ImportedCollectionType>(["mdblist", "tmdb", "trakt"]);

function isImportedType(t: UserCollectionType): t is ImportedCollectionType {
  return SYNCABLE_TYPES.has(t as ImportedCollectionType);
}

export default function Collections() {
  return <CollectionList />;
}

function CollectionList() {
  useUILanguage();
  const { data, isLoading } = useCollections();
  const { data: groupsData } = useCollectionGroups();
  const collections = useMemo(() => data ?? [], [data]);
  const groups = useMemo(() => groupsData ?? [], [groupsData]);
  const [confirmDeleteCollection, setConfirmDeleteCollection] = useState<Collection | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const navigate = useNavigate();
  const deleteMutation = useDeleteCollection();
  const syncMutation = useSyncUserCollection();
  const reorderMutation = useReorderCollections();
  const updateMutation = useUpdateCollection();
  const createGroupMutation = useCreateCollectionGroup();
  const renameGroupMutation = useUpdateCollectionGroup();
  const deleteGroupMutation = useDeleteCollectionGroup();
  const reorderGroupsMutation = useReorderCollectionGroups();

  useDocumentTitle(tr("pages.collections.collections"));

  if (isLoading)
    return (
      <div className="page-shell space-y-4 py-4 sm:py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-[1.6rem]" />
          ))}
        </div>
      </div>
    );

  return (
    <div className="page-shell space-y-6 py-4 sm:py-6">
      <ConfirmDialog
        open={confirmDeleteCollection !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteCollection(null);
        }}
        title={tr("pages.collections.delete_collection")}
        description={tr("pages.collections.delete_collection_name_this_action_cannot_be_undone", {
          name: confirmDeleteCollection?.name,
        })}
        confirmLabel={tr("common.actions.delete")}
        variant="destructive"
        onConfirm={() => {
          if (confirmDeleteCollection) deleteMutation.mutate(confirmDeleteCollection.id);
          setConfirmDeleteCollection(null);
        }}
      />

      <CollectionTemplateGallery mode="user" open={galleryOpen} onOpenChange={setGalleryOpen} />

      <div className="page-header">
        <div className="space-y-3">
          <h1 className="page-title text-[clamp(2rem,5vw,3.25rem)]">
            {tr("pages.collections.collections")}
          </h1>
          <p className="page-subtitle text-sm sm:text-base">
            {tr("pages.collections.build_personal_or_shared_shelves_around_moods_series_arcs_or")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setGalleryOpen(true)}>
            <Sparkles className="mr-1 h-4 w-4" /> {tr("pages.collections.browse_templates")}
          </Button>
          <Button size="sm" onClick={() => navigate(buildUserCollectionEditorPath("new"))}>
            <Plus className="mr-1 h-4 w-4" /> {tr("pages.collections.new_collection")}
          </Button>
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {tr("pages.collections.your_collections")}
        </h2>
        {collections.length === 0 ? (
          <div className="surface-panel flex flex-col items-center justify-center gap-3 rounded-[2rem] py-16 text-center">
            <Library className="text-muted-foreground/50 h-10 w-10" />
            <div className="space-y-1">
              <p className="text-sm font-medium">{tr("pages.collections.no_collections_yet")}</p>
              <p className="text-muted-foreground max-w-sm text-xs">
                {tr("pages.collections.start_from_a_curated_tmdb_trakt_or_mdblist_template_or")}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setGalleryOpen(true)}>
                <Sparkles className="mr-1 h-4 w-4" />{" "}
                {tr("pages.collections.start_from_a_template")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(buildUserCollectionEditorPath("new"))}
              >
                <Plus className="mr-1 h-4 w-4" /> {tr("pages.collections.create_from_scratch")}
              </Button>
            </div>
          </div>
        ) : (
          <GroupedCollectionsBoard
            items={collections}
            groups={groups}
            renderItem={(collection) => {
              const syncable = isImportedType(collection.collection_type);
              const isSyncing = syncMutation.isPending && syncMutation.variables === collection.id;
              return (
                <SortableCollectionCard
                  collection={collection}
                  syncable={syncable}
                  isSyncing={isSyncing}
                  onSync={() => syncMutation.mutate(collection.id)}
                  onEdit={() => navigate(buildUserCollectionEditorPath(collection.id))}
                  onDelete={() => setConfirmDeleteCollection(collection)}
                />
              );
            }}
            onReorderInGroup={(groupId, orderedIds) =>
              reorderMutation.mutate({ orderedIds, groupId })
            }
            onMoveItemAcross={(itemId, toGroupId) =>
              updateMutation.mutate({ id: itemId, body: { group_id: toGroupId } })
            }
            onReorderGroups={(orderedIds) => reorderGroupsMutation.mutate(orderedIds)}
            onAddGroup={(title) =>
              createGroupMutation.mutate({ slug: slugifyGroupSlug(title), name: title })
            }
            onRenameGroup={(id, title) => renameGroupMutation.mutate({ id, name: title })}
            onDeleteGroup={(id) => deleteGroupMutation.mutate(id)}
          />
        )}
      </section>

      <ServerCollectionsSection />
    </div>
  );
}

// ServerCollectionsSection renders admin-curated collections aggregated across
// every accessible library, one horizontal teaser row per library. Each row's
// title (and the "Explore all" action when the library has more) links into
// that library's full Collections tab.
function ServerCollectionsSection() {
  useUILanguage();
  const { data, isLoading } = useServerCollections();
  const { cardPresentation } = useUICustomization();
  const posterWidthClasses = carouselCardWidthClasses(cardPresentation.poster_size);
  const libraries = data ?? [];

  if (isLoading) {
    // Mirror the loaded layout (per-library horizontal rows) so data arriving
    // doesn't shift the page from a grid into rows.
    return (
      <section className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {tr("pages.collections.server_collections")}
          </h2>
          <p className="text-muted-foreground text-sm">
            {tr("pages.collections.curated_shelves_from_across_every_library_on_this_server")}
          </p>
        </div>
        <div className="space-y-8">
          {Array.from({ length: 2 }).map((_, row) => (
            <div key={row} className="space-y-5">
              <Skeleton className="h-7 w-40" />
              <div className="flex gap-4 overflow-hidden lg:gap-5">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className={posterWidthClasses}>
                    <Skeleton className="aspect-[2/3] rounded-xl" />
                    <Skeleton className="mt-2.5 h-4 w-3/4" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (libraries.length === 0) return null;

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {tr("pages.collections.server_collections")}
        </h2>
        <p className="text-muted-foreground text-sm">
          {tr("pages.collections.curated_shelves_from_across_every_library_on_this_server")}
        </p>
      </div>
      <div className="space-y-8">
        {libraries.map((library) => (
          <ServerLibraryRow key={library.library_id} library={library} />
        ))}
      </div>
    </section>
  );
}

// One library's teaser row of server collections, rendered with the shared
// MediaCarousel so it matches every other content row in the app (hover scroll
// arrows, edge fades, drag/snap, keyboard nav). edgePadding is off because this
// section sits inside the Collections page's `page-shell`, which already
// supplies horizontal padding — the row title and cards align to that column.
function ServerLibraryRow({ library }: { library: ServerCollectionsLibrary }) {
  useUILanguage();
  const navigate = useNavigate();
  const { cardPresentation } = useUICustomization();
  const posterWidthClasses = carouselCardWidthClasses(cardPresentation.poster_size);
  const collectionsHref = `/library/${library.library_id}?tab=collections`;
  const hasMore = library.total_count > library.collections.length;
  return (
    <MediaCarousel
      title={library.library_name}
      titleHref={collectionsHref}
      onViewAll={hasMore ? () => navigate(collectionsHref) : undefined}
      edgePadding={false}
    >
      {library.collections.map((collection) => (
        <div key={collection.id} className={posterWidthClasses}>
          <CollectionPosterCard
            collection={collection}
            kind="regular"
            libraryId={library.library_id}
          />
        </div>
      ))}
    </MediaCarousel>
  );
}

function SortableCollectionCard({
  collection,
  syncable,
  isSyncing,
  onSync,
  onEdit,
  onDelete,
}: {
  collection: Collection;
  syncable: boolean;
  isSyncing: boolean;
  onSync: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  useUILanguage();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useGroupedCollectionCard(collection.id);
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className="surface-panel hover:border-primary group relative rounded-[1.6rem] border-0 transition-all hover:-translate-y-1"
    >
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            aria-label={tr("pages.collections.drag_name", { name: collection.name })}
            className="hover:bg-surface-hover relative z-10 -ml-1 cursor-grab touch-none rounded-md p-1 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="text-muted-foreground h-4 w-4" />
          </button>
          <div className="min-w-0 space-y-2">
            <CardTitle className="text-base">
              <Link
                to={buildUserCollectionCatalogHref(collection.id, collection.name)}
                className="cursor-pointer after:absolute after:inset-0"
              >
                {collection.name}
              </Link>
            </CardTitle>
            <CollectionBadges collection={collection} />
          </div>
        </div>
        <div className="relative z-10 flex gap-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100">
          {syncable ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              aria-label={tr("pages.collections.sync_collection")}
              disabled={isSyncing}
              onClick={(event) => {
                event.stopPropagation();
                onSync();
              }}
            >
              <RefreshCw className={"h-3 w-3 " + (isSyncing ? "animate-spin" : "")} />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            aria-label={tr("pages.collections.edit_collection")}
            onClick={(event) => {
              event.stopPropagation();
              onEdit();
            }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            aria-label={tr("pages.collections.delete_collection")}
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}

const TYPE_LABELS: Record<UserCollectionType, string> = {
  manual: "pages.collections.manual",
  smart: "pages.collections.smart",
  mdblist: "pages.collections.mdblist",
  tmdb: "pages.collections.tmdb",
  trakt: "pages.collections.trakt",
};

const TYPE_ICONS: Record<UserCollectionType, typeof Film> = {
  manual: Film,
  smart: Sparkles,
  mdblist: Globe,
  tmdb: Globe,
  trakt: Globe,
};

const SYNC_STATUS_BADGES: Partial<
  Record<
    NonNullable<Collection["last_sync_status"]>,
    { variant: "outline" | "destructive"; label: string }
  >
> = {
  warning: {
    variant: "outline",
    get label() {
      return tr("pages.collections.sync_warning");
    },
  },
  failed: {
    variant: "destructive",
    get label() {
      return tr("pages.collections.sync_failed");
    },
  },
};

function CollectionBadges({ collection }: { collection: Collection }) {
  useUILanguage();
  const TypeIcon = TYPE_ICONS[collection.collection_type] ?? Film;
  const typeLabel = tr(TYPE_LABELS[collection.collection_type] ?? collection.collection_type);
  const statusBadge = collection.last_sync_status
    ? SYNC_STATUS_BADGES[collection.last_sync_status]
    : undefined;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary">
        <TypeIcon className="mr-1 h-3 w-3" />
        {typeLabel}
      </Badge>
      {collection.is_shared ? (
        <Badge variant="outline">{tr("pages.collections.shared")}</Badge>
      ) : null}
      {collection.sync_schedule ? (
        <Badge variant="outline">
          <Calendar className="mr-1 h-3 w-3" />
          {collection.sync_schedule}
        </Badge>
      ) : null}
      {statusBadge ? <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge> : null}
    </div>
  );
}
