import { useNavigate, useParams } from "react-router";

import type { Collection, UserCollectionType } from "@/api/types";
import PageBack from "@/components/PageBack";
import { Card, CardHeader, CardDescription, CardTitle } from "@/components/ui/card";
import { useCollections } from "@/hooks/queries/collections";

import { ImportedCollectionEditor } from "./ImportedCollectionEditor";
import SmartCollectionWizard from "./SmartCollectionWizard";
import { UserCollectionForm } from "./userCollectionsShared";
import { ManualCollectionItemsEditor } from "@/components/collections/ManualCollectionItemsEditor";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

type ImportedType = Extract<UserCollectionType, "mdblist" | "tmdb" | "trakt">;
const IMPORTED_TYPES = new Set<ImportedType>(["mdblist", "tmdb", "trakt"]);

function isImportedCollection(
  collection: Collection,
): collection is Collection & { collection_type: ImportedType } {
  return IMPORTED_TYPES.has(collection.collection_type as ImportedType);
}

export default function CollectionEditor() {
  useUILanguage();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: collections = [], isLoading } = useCollections();
  const collection = id ? (collections.find((entry) => entry.id === id) ?? null) : null;

  if (isLoading && id) {
    return (
      <div className="page-shell py-8">
        {tr("pages.collection_editor.loading_collection_editor")}
      </div>
    );
  }

  if (id && !collection && !isLoading) {
    return (
      <div className="page-shell relative space-y-4 py-4 sm:py-6">
        <PageBack to="/collections" up />
        <Card className="surface-panel mt-10 rounded-[1.7rem] border-0 shadow-none sm:mt-12">
          <CardHeader>
            <CardTitle>{tr("pages.collection_editor.collection_not_found")}</CardTitle>
            <CardDescription>
              {tr("pages.collection_editor.the_selected_collection_could_not_be_loaded")}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (collection && isImportedCollection(collection)) {
    return (
      <div className="page-shell relative space-y-6 py-4 sm:py-6">
        <PageBack to="/collections" up />
        <div className="mt-10 sm:mt-12">
          <h1 className="page-title text-[clamp(2rem,4vw,3rem)]">{collection.name}</h1>
          <p className="page-subtitle mt-1 text-sm sm:text-base">
            {tr(
              "pages.collection_editor.edit_what_s_local_name_libraries_sharing_source_managed_details",
            )}
          </p>
        </div>
        <ImportedCollectionEditor
          key={collection.id}
          collection={collection}
          onClose={() => navigate("/collections")}
        />
      </div>
    );
  }

  // Legacy manual collections keep the long-form editor; smart and new go to
  // the wizard so users can see the live card preview while tuning filters.
  if (collection && collection.collection_type === "manual") {
    return (
      <div className="page-shell relative space-y-6 py-4 sm:py-6">
        <PageBack to="/collections" up />
        <div className="mt-10 sm:mt-12">
          <h1 className="page-title text-[clamp(2rem,4vw,3rem)]">
            {tr("common.actions.edit")} {collection.name}
          </h1>
          <p className="page-subtitle mt-1 text-sm sm:text-base">
            {tr("pages.collection_editor.manual_collections_are_curated_by_adding_titles_directly")}
          </p>
        </div>
        <UserCollectionForm collection={collection} onClose={() => navigate("/collections")} />
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{tr("pages.collection_editor.items")}</h2>
          <p className="text-muted-foreground text-sm">
            {tr("pages.collection_editor.drag_the_handle_to_reorder_the_saved_order_is_what")}
          </p>
          <ManualCollectionItemsEditor collectionId={collection.id} />
        </section>
      </div>
    );
  }

  return (
    <SmartCollectionWizard
      mode="user"
      collection={collection}
      onClose={() => navigate("/collections")}
    />
  );
}
