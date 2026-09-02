import type { CollectionPreviewResponse } from "@/api/types";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

interface CollectionPreviewPaneProps {
  preview?: CollectionPreviewResponse;
  enabled: boolean;
  isLoading?: boolean;
}

export default function CollectionPreviewPane({
  preview,
  enabled,
  isLoading = false,
}: CollectionPreviewPaneProps) {
  useUILanguage();
  if (!enabled) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-5 text-sm">
        {tr(
          "components.collections.collection_preview_pane.switch_this_collection_to_smart_mode_to_preview_matching_titles",
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-muted-foreground rounded-lg border px-4 py-5 text-sm">
        {tr("components.collections.collection_preview_pane.loading_preview")}
      </div>
    );
  }

  const items = preview?.items ?? [];
  const total = preview?.total ?? 0;

  return (
    <div className="space-y-3 rounded-lg border px-4 py-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">
            {tr("components.collections.collection_preview_pane.preview")}
          </p>
          <p className="text-muted-foreground text-xs">
            {tr(
              "components.collections.collection_preview_pane.matching_items_update_as_the_rules_change",
            )}
          </p>
        </div>
        <div className="text-sm font-medium">{total}</div>
      </div>

      {items.length === 0 ? (
        <div className="text-muted-foreground text-sm">
          {tr("components.collections.collection_preview_pane.no_titles_match_the_current_query")}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.content_id} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate">{item.title}</span>
              <span className="text-muted-foreground uppercase">{item.type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
