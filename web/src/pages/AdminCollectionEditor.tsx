import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CollectionTemplateGallery } from "@/components/CollectionTemplateGallery";
import { useAdminLibraries } from "@/hooks/queries/admin/libraries";
import { useAdminCollections } from "@/hooks/queries/admin/collections";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

import {
  buildAdminCollectionsReturnPath,
  CollectionEditForm,
  CollectionForm,
  MDBListImportForm,
  SourceTypeSelector,
  TMDBPresetForm,
  TraktPresetForm,
  type CollectionSourceType,
} from "./adminCollectionsShared";
import SmartCollectionWizard from "./SmartCollectionWizard";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

function inferCollectionSourceType(collectionType?: string): CollectionSourceType {
  if (collectionType === "mdblist") return "mdblist";
  if (collectionType === "tmdb") return "tmdb";
  if (collectionType === "trakt") return "trakt";
  return "manual";
}

function isImportedAdminCollectionType(collectionType?: string): boolean {
  return collectionType === "mdblist" || collectionType === "tmdb" || collectionType === "trakt";
}

export default function AdminCollectionEditor() {
  useUILanguage();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const initialLibraryId = Number(searchParams.get("libraryId")) || null;
  const returnPath = buildAdminCollectionsReturnPath(initialLibraryId);
  const isCreate = !id;
  const { data: libraries = [] } = useAdminLibraries();
  const { data: collections = [], isLoading } = useAdminCollections();
  const collection = useMemo(
    () => collections.find((entry) => entry.id === id) ?? null,
    [collections, id],
  );
  const [sourceType, setSourceType] = useState<CollectionSourceType | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const activeSourceType = collection
    ? inferCollectionSourceType(collection.collection_type)
    : sourceType;

  const sourceTypeTitles: Record<CollectionSourceType, string> = {
    manual: "pages.admin_collection_editor.new_manual_collection",
    mdblist: "pages.admin_collection_editor.import_mdblist_collection",
    tmdb: "pages.admin_collection_editor.import_tmdb_collection",
    trakt: "pages.admin_collection_editor.import_trakt_collection",
  };
  const title = collection
    ? tr("pages.admin_collection_editor.edit_title", { title: collection.title })
    : tr(
        (activeSourceType && sourceTypeTitles[activeSourceType]) ||
          "pages.admin_collection_editor.add_collection",
      );

  const description = tr(
    collection
      ? "pages.admin_collection_editor.collections_now_open_in_a_dedicated_workspace_so_rules_artwork"
      : activeSourceType === null
        ? "pages.admin_collection_editor.choose_how_this_collection_should_be_created"
        : "pages.admin_collection_editor.build_the_collection_in_a_full_page_editor_instead_of",
  );

  useDocumentTitle(title);

  if (isLoading && libraries.length === 0) {
    return (
      <div className="page-shell py-8">
        {tr("pages.admin_collection_editor.loading_collection_editor")}
      </div>
    );
  }

  if (!isCreate && !collection && !isLoading) {
    return (
      <div className="page-shell space-y-4 py-4 sm:py-6">
        <Button asChild variant="ghost" className="w-fit px-0">
          <Link to={returnPath}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {tr("pages.admin_collection_editor.back_to_collections")}
          </Link>
        </Button>
        <Card className="surface-panel rounded-2xl border-0 shadow-none">
          <CardHeader>
            <CardTitle>{tr("pages.admin_collection_editor.collection_not_found")}</CardTitle>
            <CardDescription>
              {tr("pages.admin_collection_editor.the_selected_collection_could_not_be_loaded")}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // The wizard owns its own page chrome (back button, title, step indicator).
  // Short-circuit the legacy editor shell so we don't render nested headers.
  const useWizard =
    (collection && collection.collection_type === "smart") ||
    (!collection && activeSourceType === "manual");
  if (useWizard) {
    return (
      <SmartCollectionWizard
        mode="admin"
        collection={collection}
        libraries={libraries}
        initialLibraryId={initialLibraryId}
        onClose={() => navigate(returnPath)}
      />
    );
  }

  return (
    <div className="page-shell space-y-6 py-4 sm:py-6">
      <div className="page-header gap-5">
        <div className="space-y-3">
          <Button asChild variant="ghost" className="w-fit px-0">
            <Link to={returnPath}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {tr("pages.admin_collection_editor.back_to_collections")}
            </Link>
          </Button>
          <div>
            <h1 className="page-title text-[clamp(2rem,4vw,3rem)]">{title}</h1>
            <p className="page-subtitle mt-1 text-sm sm:text-base">{description}</p>
          </div>
        </div>

        {!collection && activeSourceType !== null ? (
          <Button variant="outline" onClick={() => setSourceType(null)}>
            {tr("pages.admin_collection_editor.change_source_type")}
          </Button>
        ) : null}
      </div>

      {!collection && activeSourceType === null ? (
        <Card className="surface-panel rounded-2xl border-0 shadow-none">
          <CardHeader>
            <CardTitle>{tr("pages.admin_collection_editor.choose_a_collection_type")}</CardTitle>
            <CardDescription>
              {tr(
                "pages.admin_collection_editor.smart_manual_collections_open_the_full_query_builder_imports_keep",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SourceTypeSelector
              showTemplates
              onSelect={(type) => {
                if (type === "templates") {
                  setGalleryOpen(true);
                } else {
                  setSourceType(type);
                }
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      <CollectionTemplateGallery
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        libraries={libraries}
        initialLibraryId={initialLibraryId}
        onCreated={() => {
          if (isCreate) navigate(returnPath);
        }}
      />

      {collection ? (
        // Smart admin collections route to the wizard above; here we only see
        // imported (mdblist/tmdb/trakt) or legacy manual collections.
        isImportedAdminCollectionType(collection.collection_type) ? (
          <CollectionEditForm
            libraries={libraries}
            collection={collection}
            initialLibraryId={initialLibraryId}
            onClose={() => navigate(returnPath)}
          />
        ) : (
          <CollectionForm
            libraries={libraries}
            collection={collection}
            initialLibraryId={initialLibraryId}
            onClose={() => navigate(returnPath)}
          />
        )
      ) : null}

      {!collection && activeSourceType === "mdblist" ? (
        <MDBListImportForm
          libraries={libraries}
          initialLibraryId={initialLibraryId}
          onClose={() => navigate(returnPath)}
        />
      ) : null}

      {!collection && activeSourceType === "tmdb" ? (
        <TMDBPresetForm
          libraries={libraries}
          initialLibraryId={initialLibraryId}
          onClose={() => navigate(returnPath)}
        />
      ) : null}

      {!collection && activeSourceType === "trakt" ? (
        <TraktPresetForm
          libraries={libraries}
          initialLibraryId={initialLibraryId}
          onClose={() => navigate(returnPath)}
        />
      ) : null}
    </div>
  );
}
