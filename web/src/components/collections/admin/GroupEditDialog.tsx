import { useState } from "react";
import type { GroupSortMode, LibraryCollectionGroup } from "@/api/types";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

export interface GroupEditDialogProps {
  group: LibraryCollectionGroup | null; // null = create new
  mode: "create" | "edit";
  onSubmit: (input: { name: string; default_sort_mode: GroupSortMode }) => void;
  onDelete?: () => void;
  onCancel: () => void;
}

export function GroupEditDialog({
  group,
  mode,
  onSubmit,
  onDelete,
  onCancel,
}: GroupEditDialogProps) {
  useUILanguage();
  const [name, setName] = useState(group?.name ?? "");
  const [sortMode, setSortMode] = useState<GroupSortMode>(group?.default_sort_mode ?? "manual");
  const isUserKind = group?.kind === "user_collections";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background w-full max-w-md rounded-lg p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">
          {mode === "create"
            ? tr("components.collections.admin.group_edit_dialog.new_group")
            : tr("components.collections.admin.group_edit_dialog.edit_group")}
        </h2>

        <label className="block text-sm font-medium">
          {tr("components.collections.admin.group_edit_dialog.name")}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border-input bg-background text-foreground mt-1 w-full rounded-md border px-2 py-1.5"
            autoFocus
          />
        </label>

        <label className="mt-3 block text-sm font-medium">
          {tr("components.collections.admin.group_edit_dialog.default_sort_end_user_view")}
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as GroupSortMode)}
            className="border-input bg-background text-foreground mt-1 w-full rounded-md border px-2 py-1.5"
          >
            <option value="manual">
              {tr("components.collections.admin.group_edit_dialog.manual_drag_drop_order")}
            </option>
            <option value="name_asc">
              {tr("components.collections.admin.group_edit_dialog.name_a_z")}
            </option>
            <option value="name_desc">
              {tr("components.collections.admin.group_edit_dialog.name_z_a")}
            </option>
            <option value="recent">
              {tr("components.collections.admin.group_edit_dialog.recently_updated")}
            </option>
            <option value="most_items">
              {tr("components.collections.admin.group_edit_dialog.most_items")}
            </option>
          </select>
        </label>

        <div className="mt-6 flex items-center gap-2">
          {mode === "edit" && !isUserKind && onDelete && (
            <button
              onClick={onDelete}
              className="text-destructive text-sm hover:underline"
              type="button"
            >
              {tr("components.collections.admin.group_edit_dialog.delete_group")}
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onCancel} className="rounded border px-3 py-1.5 text-sm" type="button">
            {tr("common.actions.cancel")}
          </button>
          <button
            onClick={() => onSubmit({ name, default_sort_mode: sortMode })}
            disabled={!name.trim()}
            className="bg-primary text-primary-foreground rounded px-3 py-1.5 text-sm disabled:opacity-50"
            type="button"
          >
            {mode === "create" ? tr("common.actions.create") : tr("common.actions.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
