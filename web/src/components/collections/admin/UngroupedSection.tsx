import { useDroppable } from "@dnd-kit/core";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { LibraryCollection } from "@/api/types";
import { CollectionRow } from "./CollectionRow";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

export interface UngroupedSectionProps {
  collections: LibraryCollection[];
  onEditCollection: (collection: LibraryCollection) => void;
  onDeleteCollection: (collection: LibraryCollection) => void;
  onSyncCollection: (collection: LibraryCollection) => void;
  syncingCollectionID?: string | null;
  collapsed?: boolean;
}

export function UngroupedSection({
  collections,
  onEditCollection,
  onDeleteCollection,
  onSyncCollection,
  syncingCollectionID = null,
  collapsed = false,
}: UngroupedSectionProps) {
  useUILanguage();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: "ungrouped",
    data: { kind: "group", id: "ungrouped" },
  });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `group-body:ungrouped`,
    data: { kind: "group-body", groupID: "ungrouped" },
  });

  const sortableIds = collections.map((c) => `col:${c.id}`);

  return (
    <div ref={setNodeRef} style={style} className="bg-background rounded-lg border border-dashed">
      <div className="flex items-center gap-2 border-b border-dashed p-3">
        <button
          {...attributes}
          {...listeners}
          className="text-muted-foreground hover:text-foreground cursor-grab"
          aria-label={tr("components.collections.admin.ungrouped_section.drag_ungrouped_section")}
          type="button"
        >
          ⋮⋮
        </button>
        <h4 className="text-muted-foreground flex-1 text-sm font-medium">
          {tr("components.collections.admin.ungrouped_section.ungrouped")}
        </h4>
      </div>
      {!collapsed && (
        <div ref={setDroppableRef} className={"p-3 " + (isOver ? "bg-muted/40" : "")}>
          {collections.length === 0 ? (
            <div className="text-muted-foreground rounded border border-dashed p-4 text-center text-sm">
              {tr(
                "components.collections.admin.ungrouped_section.drop_collections_here_to_remove_them_from_any_group_they",
              )}
            </div>
          ) : (
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {collections.map((c) => (
                  <CollectionRow
                    key={c.id}
                    collection={c}
                    parentGroupID="ungrouped"
                    parentCollectionIDs={collections.map((x) => x.id)}
                    isInUserCollectionsGroup={false}
                    onEdit={() => onEditCollection(c)}
                    onDelete={() => onDeleteCollection(c)}
                    onSync={() => onSyncCollection(c)}
                    isSyncing={syncingCollectionID === c.id}
                  />
                ))}
              </div>
            </SortableContext>
          )}
        </div>
      )}
    </div>
  );
}
