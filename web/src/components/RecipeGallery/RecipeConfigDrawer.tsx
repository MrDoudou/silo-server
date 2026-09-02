import { useState } from "react";
import BulkApplyDialog from "./BulkApplyDialog";
import RecipeParamFields from "./RecipeParamFields";
import type { RecipeDefinition, GalleryPreset } from "@/lib/recipes";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

export interface AddPayload {
  section_type: string;
  title: string;
  item_limit: number;
  featured: boolean;
  enabled: boolean;
  config: Record<string, unknown>;
  apply_to_all_libraries?: boolean;
  library_ids?: number[];
}

interface Props {
  def: RecipeDefinition;
  preset: GalleryPreset;
  /** Close the drawer without saving. Used by the bottom Cancel button. */
  onCancel: () => void;
  /**
   * Return to the gallery from the header link. When omitted, the link
   * falls back to onCancel (closes the drawer entirely).
   */
  onBackToGallery?: () => void;
  onAdd: (payload: AddPayload) => void | Promise<void>;
  showBulkApply?: boolean;
  showEnabled?: boolean;
}

export default function RecipeConfigDrawer({
  def,
  preset,
  onCancel,
  onBackToGallery,
  onAdd,
  showBulkApply = true,
  showEnabled = true,
}: Props) {
  useUILanguage();
  const [title, setTitle] = useState(preset.display_name);
  const [params, setParams] = useState<Record<string, unknown>>({ ...preset.default_params });
  const [limit, setLimit] = useState<number>(20);
  const [featured, setFeatured] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [applyAll, setApplyAll] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const libraryCollectionID =
    typeof params.library_collection_id === "string" ? params.library_collection_id : "";
  const userCollectionID =
    typeof params.user_collection_id === "string" ? params.user_collection_id : "";
  const collectionID = libraryCollectionID || userCollectionID;
  const isAutoBackedTraktPreset =
    def.type === "collection" &&
    params.source_provider === "trakt" &&
    (params.source_preset === "trending" || params.source_preset === "popular");
  const collectionMissing =
    def.type === "collection" && collectionID.trim() === "" && !isAutoBackedTraktPreset;
  const curatedListEmpty =
    def.type === "admin_curated_list" &&
    (!Array.isArray(params.item_ids) || params.item_ids.length === 0);

  const handleAdd = () => {
    if (collectionMissing || curatedListEmpty) {
      return;
    }
    const payload = {
      section_type: def.type,
      title,
      item_limit: limit,
      featured,
      enabled,
      config: params,
      apply_to_all_libraries: false,
    };
    if (showBulkApply && applyAll) {
      setBulkOpen(true);
      return;
    }
    void Promise.resolve(onAdd(payload)).catch(() => {
      // The owner reports the failure and keeps the drawer mounted for retry.
    });
  };

  return (
    <div className="max-w-[540px] rounded-xl border border-white/10 bg-zinc-900 p-6">
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <h3 className="text-base font-semibold">
          {preset.icon} {preset.display_name}
        </h3>
        <button
          type="button"
          onClick={onBackToGallery ?? onCancel}
          className="text-xs text-white/60"
        >
          {tr("components.recipe_gallery.recipe_config_drawer.back_to_gallery")}
        </button>
      </div>

      <div className="mt-4 rounded border-l-2 border-indigo-500 bg-indigo-500/10 px-3 py-2 text-sm">
        {preset.description_long ?? preset.description_short}
      </div>

      <div className="mt-4">
        <label htmlFor="rcd-title" className="mb-1 block text-xs text-white/70">
          {tr("components.recipe_gallery.recipe_config_drawer.title")}
        </label>
        <input
          id="rcd-title"
          className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="mt-4">
        <RecipeParamFields def={def} params={params} onChange={setParams} />
      </div>

      {collectionMissing ? (
        <p className="mt-2 text-xs text-amber-300">
          {tr(
            "components.recipe_gallery.recipe_config_drawer.choose_a_synced_collection_before_adding_this_section",
          )}
        </p>
      ) : null}

      {curatedListEmpty ? (
        <p className="mt-2 text-xs text-amber-300">
          {tr(
            "components.recipe_gallery.recipe_config_drawer.add_at_least_one_title_to_the_curated_list",
          )}
        </p>
      ) : null}

      <div className="mt-4">
        <label className="mb-1 block text-xs text-white/70">
          {tr("components.recipe_gallery.recipe_config_drawer.item_limit")}
        </label>
        <input
          type="number"
          min={1}
          max={100}
          className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm"
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value) || 20)}
        />
      </div>

      <label className="mt-3 flex items-center justify-between text-sm">
        <span>{tr("components.recipe_gallery.recipe_config_drawer.show_as_featured_hero")}</span>
        <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
      </label>

      {showBulkApply ? (
        <label className="mt-2 flex items-center justify-between text-sm">
          <span>{tr("components.recipe_gallery.recipe_config_drawer.apply_to_all_libraries")}</span>
          <input
            type="checkbox"
            checked={applyAll}
            onChange={(e) => setApplyAll(e.target.checked)}
          />
        </label>
      ) : null}

      {showEnabled ? (
        <label className="mt-2 flex items-center justify-between text-sm">
          <span>{tr("components.recipe_gallery.recipe_config_drawer.enabled")}</span>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        </label>
      ) : null}

      <div className="mt-5 flex justify-end gap-2 border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-white/15 px-3 py-1 text-sm"
        >
          {tr("common.actions.cancel")}
        </button>
        <button
          type="button"
          onClick={handleAdd}
          disabled={collectionMissing || curatedListEmpty}
          className="rounded bg-indigo-600 px-3 py-1 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {tr("components.recipe_gallery.recipe_config_drawer.add_section")}
        </button>
      </div>

      {showBulkApply ? (
        <BulkApplyDialog
          open={bulkOpen}
          onClose={() => setBulkOpen(false)}
          onConfirm={(libraryIDs) =>
            onAdd({
              section_type: def.type,
              title,
              item_limit: limit,
              featured,
              enabled,
              config: params,
              apply_to_all_libraries: true,
              library_ids: libraryIDs,
            })
          }
        />
      ) : null}
    </div>
  );
}
