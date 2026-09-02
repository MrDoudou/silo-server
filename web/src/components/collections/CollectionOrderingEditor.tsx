import type { QueryDefinition } from "@/api/types";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getDefaultQuerySortOrder } from "@/lib/querySortOptions";

import { getCollectionSortOptions } from "./collectionBuilderFields";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

interface CollectionOrderingEditorProps {
  query: QueryDefinition;
  sortConfig: Record<string, unknown>;
  onQueryChange: (query: QueryDefinition) => void;
  onSortConfigChange: (sortConfig: Record<string, unknown>) => void;
  allowPersonalizedSorts?: boolean;
  readOnly?: boolean;
}

export default function CollectionOrderingEditor({
  query,
  sortConfig,
  onQueryChange,
  onSortConfigChange,
  allowPersonalizedSorts = false,
  readOnly = false,
}: CollectionOrderingEditorProps) {
  useUILanguage();
  const orderingMode = sortConfig.mode === "manual_pins" ? "manual_pins" : "query_sort";
  const sortOptions = getCollectionSortOptions(allowPersonalizedSorts);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>{tr("components.collections.collection_ordering_editor.sort_by")}</Label>
          <Select
            value={query.sort.field}
            onValueChange={(field) =>
              onQueryChange({
                ...query,
                sort: {
                  ...query.sort,
                  field: field as QueryDefinition["sort"]["field"],
                  order: getDefaultQuerySortOrder(field),
                },
              })
            }
            disabled={readOnly}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{tr("components.collections.collection_ordering_editor.order")}</Label>
          <Select
            value={query.sort.order}
            onValueChange={(order) =>
              onQueryChange({
                ...query,
                sort: {
                  ...query.sort,
                  order: order as "asc" | "desc",
                },
              })
            }
            disabled={readOnly}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">
                {tr("components.collections.collection_ordering_editor.descending")}
              </SelectItem>
              <SelectItem value="asc">
                {tr("components.collections.collection_ordering_editor.ascending")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{tr("components.collections.collection_ordering_editor.manual_pins")}</Label>
          <Select
            value={orderingMode}
            onValueChange={(mode) =>
              onSortConfigChange({
                ...sortConfig,
                mode,
              })
            }
            disabled={readOnly}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="query_sort">
                {tr("components.collections.collection_ordering_editor.follow_query_sort")}
              </SelectItem>
              <SelectItem value="manual_pins">
                {tr("components.collections.collection_ordering_editor.preserve_manual_pins")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        {tr(
          "components.collections.collection_ordering_editor.smart_collections_always_preview_using_the_query_sort_manual_pins",
        )}
      </p>
    </div>
  );
}
