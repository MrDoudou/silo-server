import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

import type {
  Collection,
  CreateCollectionRequest,
  CreateLibraryCollectionRequest,
  Library,
  LibraryCollection,
  QueryDefinition,
  UpdateCollectionRequest,
} from "@/api/types";
import { normalizeQueryDefinition } from "@/api/types";
import CatalogFiltersPanel from "@/components/catalog/CatalogFiltersPanel";
import { ImageUploadField } from "@/components/ImageUploadField";
import ItemGrid from "@/components/ItemGrid";
import PageBack from "@/components/PageBack";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createCollectionBuilderValue,
  SmartCollectionLimitField,
  type CollectionBuilderValue,
} from "@/components/collections/CollectionBuilder";
import { withSmartCollectionLimit } from "@/components/collections/smartCollectionLimits";
import CollectionAccessEditor from "@/components/collections/CollectionAccessEditor";
import { useCatalogWindow } from "@/hooks/queries/catalog";
import {
  useCreateCollection,
  useDeleteUserCollectionImage,
  useUpdateCollection,
} from "@/hooks/queries/collections";
import {
  useCreateAdminCollection,
  useDeleteCollectionImage,
  useUpdateAdminCollection,
} from "@/hooks/queries/admin/collections";
import { useUserLibraries } from "@/hooks/queries/libraries";
import { useProfiles } from "@/hooks/queries/profiles";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import {
  isCollectionReadOnly,
  toCreateCollectionBody,
  toUpdateCollectionBody,
  toUserCollectionBuilderValue,
} from "./userCollectionsShared";
import { toAdminCollectionBuilderValue, toAdminCollectionRequest } from "./adminCollectionsShared";
import type { CatalogSearchState } from "./catalogSearchParams";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

type WizardStep = 1 | 2;

type UserModeProps = {
  mode: "user";
  collection: Collection | null;
  onClose: () => void;
};

type AdminModeProps = {
  mode: "admin";
  collection: LibraryCollection | null;
  libraries: Library[];
  initialLibraryId: number | null;
  onClose: () => void;
};

export type SmartCollectionWizardProps = UserModeProps | AdminModeProps;

const PAGE_LIMIT = 60;

export default function SmartCollectionWizard(wizard: SmartCollectionWizardProps) {
  useUILanguage();
  const isEdit = wizard.collection !== null;
  const adminLibraryId = wizard.mode === "admin" ? wizard.initialLibraryId : null;

  const initialDraft = useMemo(
    () => {
      if (wizard.mode === "user") {
        return smartUserDraft(wizard.collection);
      }
      return toAdminCollectionBuilderValue(wizard.collection, wizard.initialLibraryId);
    },
    // Seed once per mounted collection. For admin's create flow (no
    // collection.id), initialLibraryId is the only seed signal — re-seed when
    // it changes so library_ids reflects the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wizard.collection?.id ?? null, adminLibraryId],
  );

  const [draft, setDraft] = useState<CollectionBuilderValue>(initialDraft);
  // Poster state lives at the wizard level so it survives Step1 ↔ Step2 jumps.
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterSourceUrl, setPosterSourceUrl] = useState("");
  // Admin-only state still lives here so it survives step jumps too.
  const [backdropFile, setBackdropFile] = useState<File | null>(null);
  const [backdropSourceUrl, setBackdropSourceUrl] = useState("");
  const [step, setStep] = useState<WizardStep>(1);

  useEffect(() => {
    setDraft(initialDraft);
    setPosterFile(null);
    setPosterSourceUrl("");
    setBackdropFile(null);
    setBackdropSourceUrl("");
    setStep(1);
  }, [initialDraft]);

  useDocumentTitle(
    isEdit
      ? tr("pages.smart_collection_wizard.edit_value", { value: draft.title || "Collection" })
      : tr("pages.smart_collection_wizard.new_collection"),
  );

  const handleQueryDefinitionChange = useCallback((next: QueryDefinition) => {
    setDraft((current) => ({ ...current, query_definition: withSmartCollectionLimit(next) }));
  }, []);

  const headerTitle = isEdit ? draft.title || "Edit Collection" : "New Collection";
  const backTarget = wizard.mode === "user" ? "/collections" : adminBackHref(wizard);
  const adminLibraries = wizard.mode === "admin" ? wizard.libraries : [];

  return (
    <div className="page-shell-wide relative space-y-6 py-4 sm:py-6">
      <PageBack to={backTarget} up />
      <WizardHeader title={headerTitle} step={step} isEdit={isEdit} />

      {step === 1 ? (
        <Step1FiltersAndPreview
          mode={wizard.mode}
          draft={draft}
          onQueryDefinitionChange={handleQueryDefinitionChange}
          adminLibraries={adminLibraries}
          onContinue={() => setStep(2)}
        />
      ) : wizard.mode === "user" ? (
        <Step2UserMetadata
          wizard={wizard}
          draft={draft}
          onDraftChange={setDraft}
          posterFile={posterFile}
          onPosterFileChange={setPosterFile}
          posterSourceUrl={posterSourceUrl}
          onPosterSourceUrlChange={setPosterSourceUrl}
          onBack={() => setStep(1)}
        />
      ) : (
        <Step2AdminMetadata
          wizard={wizard}
          draft={draft}
          onDraftChange={setDraft}
          posterFile={posterFile}
          onPosterFileChange={setPosterFile}
          posterSourceUrl={posterSourceUrl}
          onPosterSourceUrlChange={setPosterSourceUrl}
          backdropFile={backdropFile}
          onBackdropFileChange={setBackdropFile}
          backdropSourceUrl={backdropSourceUrl}
          onBackdropSourceUrlChange={setBackdropSourceUrl}
          onBack={() => setStep(1)}
        />
      )}
    </div>
  );
}

function smartUserDraft(collection: Collection | null): CollectionBuilderValue {
  const value = toUserCollectionBuilderValue(collection);
  return value.collection_type === "smart"
    ? value
    : createCollectionBuilderValue({ ...value, collection_type: "smart" });
}

function adminBackHref(props: AdminModeProps): string {
  return props.initialLibraryId
    ? `/admin/collections?libraryId=${props.initialLibraryId}`
    : "/admin/collections";
}

function WizardHeader({
  title,
  step,
  isEdit,
}: {
  title: string;
  step: WizardStep;
  isEdit: boolean;
}) {
  useUILanguage();
  return (
    <div className="mt-10 flex flex-wrap items-end justify-between gap-4 sm:mt-12">
      <div>
        <h1 className="page-title text-[clamp(1.75rem,3vw,2.5rem)]">{title}</h1>
        <p className="page-subtitle mt-1 text-sm">
          {step === 1
            ? tr(
                "pages.smart_collection_wizard.tune_the_filters_until_the_cards_below_show_the_collection",
              )
            : isEdit
              ? tr(
                  "pages.smart_collection_wizard.update_naming_artwork_and_sharing_for_this_collection",
                )
              : tr(
                  "pages.smart_collection_wizard.give_your_new_collection_a_name_artwork_and_sharing_rules",
                )}
        </p>
      </div>
      <StepIndicator step={step} />
    </div>
  );
}

function StepIndicator({ step }: { step: WizardStep }) {
  useUILanguage();
  return (
    <ol className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
      <StepBadge
        index={1}
        label={tr("pages.smart_collection_wizard.filters")}
        active={step === 1}
        done={step > 1}
      />
      <span aria-hidden="true" className="bg-border h-px w-6" />
      <StepBadge
        index={2}
        label={tr("pages.smart_collection_wizard.details")}
        active={step === 2}
        done={false}
      />
    </ol>
  );
}

function StepBadge({
  index,
  label,
  active,
  done,
}: {
  index: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  useUILanguage();
  return (
    <li className="flex items-center gap-2">
      <span
        className={
          active
            ? "border-primary bg-primary text-primary-foreground flex h-6 w-6 items-center justify-center rounded-full border text-[11px]"
            : done
              ? "border-primary text-primary flex h-6 w-6 items-center justify-center rounded-full border text-[11px]"
              : "border-border text-muted-foreground flex h-6 w-6 items-center justify-center rounded-full border text-[11px]"
        }
      >
        {done ? <Check className="h-3 w-3" /> : index}
      </span>
      <span className={active ? "text-foreground" : ""}>{label}</span>
    </li>
  );
}

function Step1FiltersAndPreview({
  mode,
  draft,
  onQueryDefinitionChange,
  adminLibraries,
  onContinue,
}: {
  mode: "user" | "admin";
  draft: CollectionBuilderValue;
  onQueryDefinitionChange: (next: QueryDefinition) => void;
  adminLibraries: Library[];
  onContinue: () => void;
}) {
  useUILanguage();
  const queryDefinition = useMemo(
    () => normalizeQueryDefinition(draft.query_definition),
    [draft.query_definition],
  );
  const filtersKey = useMemo(() => JSON.stringify(queryDefinition), [queryDefinition]);

  const [visibleRangeState, setVisibleRangeState] = useState<{
    key: string;
    range: [number, number];
  }>({ key: filtersKey, range: [0, PAGE_LIMIT - 1] });

  const visibleRange =
    visibleRangeState.key === filtersKey
      ? visibleRangeState.range
      : ([0, PAGE_LIMIT - 1] as [number, number]);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleVisibleRangeChange = useCallback(
    (start: number, end: number) => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setVisibleRangeState({ key: filtersKey, range: [start, end] });
      }, 50);
    },
    [filtersKey],
  );
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const catalogState: CatalogSearchState = useMemo(
    () => ({
      source: "query",
      query_definition: queryDefinition,
    }),
    [queryDefinition],
  );

  const catalogQuery = useCatalogWindow(catalogState, {
    limit: PAGE_LIMIT,
    includeTotal: true,
    visibleRange,
  });
  const totalItems = catalogQuery.data?.totalItems ?? 0;
  const pages = catalogQuery.data?.pages ?? new Map();
  const isLoading = catalogQuery.isLoading;

  const itemCountLabel = `${totalItems.toLocaleString()} item${totalItems === 1 ? "" : "s"}`;
  const adminMissingLibrary = mode === "admin" && draft.query_definition.library_ids.length === 0;

  const { data: userLibraries = [] } = useUserLibraries();
  const filterLibraries = useMemo(
    () =>
      mode === "admin"
        ? adminLibraries.map((l) => ({ id: l.id, name: l.name }))
        : userLibraries.map((l) => ({ id: l.id, name: l.name })),
    [mode, adminLibraries, userLibraries],
  );

  return (
    <div className="space-y-5 pb-24">
      <CatalogFiltersPanel
        state={catalogState}
        onStateChange={(nextState) => onQueryDefinitionChange(nextState.query_definition)}
        libraries={filterLibraries}
        allowLibrarySelection
        showMediaScopeSelector
        allowPersonalizedFilters={mode === "user"}
        allowPersonalizedSorts={mode === "user"}
        resultCountLabel={itemCountLabel}
        resultCountLoading={isLoading}
      />

      <SmartCollectionLimitField query={queryDefinition} onQueryChange={onQueryDefinitionChange} />

      {totalItems === 0 && !isLoading ? (
        <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed py-16 text-center">
          <p className="text-sm font-medium">
            {tr("pages.smart_collection_wizard.no_titles_match_these_filters_yet")}
          </p>
          <p className="text-xs">
            {tr(
              "pages.smart_collection_wizard.loosen_the_filters_above_to_see_what_your_collection_would",
            )}
          </p>
        </div>
      ) : (
        <ItemGrid
          totalItems={totalItems}
          pages={pages}
          pageSize={PAGE_LIMIT}
          loading={isLoading}
          onVisibleRangeChange={handleVisibleRangeChange}
          sortField={queryDefinition.sort.field}
        />
      )}

      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/70 fixed right-4 bottom-4 z-40 flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-xl backdrop-blur sm:right-6 lg:right-10 xl:right-12">
        <span className="text-muted-foreground hidden text-xs sm:inline">
          {adminMissingLibrary
            ? tr("pages.smart_collection_wizard.pick_at_least_one_library_to_continue")
            : totalItems > 0
              ? tr("pages.smart_collection_wizard.item_count_label_match_these_filters", {
                  itemCountLabel: itemCountLabel,
                })
              : tr("pages.smart_collection_wizard.choose_filters_to_preview_matching_titles")}
        </span>
        <Button
          type="button"
          onClick={onContinue}
          disabled={adminMissingLibrary || (!isLoading && totalItems === 0)}
        >
          {tr("pages.smart_collection_wizard.next_details")}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

interface Step2BaseProps {
  draft: CollectionBuilderValue;
  onDraftChange: (next: CollectionBuilderValue) => void;
  posterFile: File | null;
  onPosterFileChange: (file: File | null) => void;
  posterSourceUrl: string;
  onPosterSourceUrlChange: (url: string) => void;
  onBack: () => void;
}

function Step2UserMetadata({
  wizard,
  draft,
  onDraftChange,
  posterFile,
  onPosterFileChange,
  posterSourceUrl,
  onPosterSourceUrlChange,
  onBack,
}: Step2BaseProps & { wizard: UserModeProps }) {
  useUILanguage();
  const { profile } = useCurrentProfile();
  const { data: profiles = [] } = useProfiles();
  const createMutation = useCreateCollection();
  const updateMutation = useUpdateCollection();
  const deletePosterMutation = useDeleteUserCollectionImage();
  const isPending = createMutation.isPending || updateMutation.isPending;
  const readOnly = isCollectionReadOnly(wizard.collection, profile?.id);
  const collection = wizard.collection;
  const canSave = !readOnly && draft.title.trim().length > 0;

  function handleSave() {
    const trimmedSource = posterSourceUrl.trim();
    if (collection) {
      const body: UpdateCollectionRequest = {
        ...toUpdateCollectionBody(draft),
        poster_source_url: trimmedSource || undefined,
      };
      updateMutation.mutate(
        { id: collection.id, body, poster: posterFile },
        { onSuccess: wizard.onClose },
      );
    } else {
      const body: CreateCollectionRequest = {
        ...toCreateCollectionBody(draft),
        poster_source_url: trimmedSource || undefined,
      };
      createMutation.mutate({ body, poster: posterFile }, { onSuccess: wizard.onClose });
    }
  }

  return (
    <Step2Shell onBack={onBack} onSubmit={handleSave}>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-5">
          <Field
            id="collection-name"
            label={tr("pages.smart_collection_wizard.name")}
            required
            value={draft.title}
            disabled={readOnly}
            onChange={(value) => onDraftChange({ ...draft, title: value })}
            placeholder={tr("pages.smart_collection_wizard.e_g_saturday_night_movies")}
          />

          <section className="space-y-3">
            <h2 className="text-base font-semibold">
              {tr("pages.smart_collection_wizard.sharing")}
            </h2>
            <CollectionAccessEditor
              value={draft.access}
              onChange={(access) => onDraftChange({ ...draft, access })}
              profiles={profiles.map((p) => ({ id: p.id, name: p.name }))}
              readOnly={readOnly}
              creatorProfileId={collection?.creator_profile_id ?? null}
            />
          </section>

          <ToggleRow
            title={tr("pages.smart_collection_wizard.show_in_my_library_collections_tab")}
            description={tr(
              "pages.smart_collection_wizard.pin_this_collection_to_your_library_s_collections_tab_alongside",
            )}
            checked={draft.include_in_server_collections}
            disabled={readOnly}
            onCheckedChange={(checked) =>
              onDraftChange({ ...draft, include_in_server_collections: checked })
            }
          />
        </div>

        <div className="space-y-3">
          <h2 className="text-base font-semibold">{tr("pages.smart_collection_wizard.poster")}</h2>
          <ImageUploadField
            label={tr("pages.smart_collection_wizard.poster")}
            currentUrl={collection?.poster_url}
            file={posterFile}
            onFileChange={onPosterFileChange}
            sourceUrl={posterSourceUrl}
            onSourceUrlChange={onPosterSourceUrlChange}
            onDelete={
              collection?.poster_url
                ? () => deletePosterMutation.mutate({ id: collection.id, type: "poster" })
                : undefined
            }
          />
        </div>
      </div>

      <SaveBar
        onBack={onBack}
        canSave={canSave}
        isPending={isPending}
        saveLabel={collection ? "Save Collection" : "Create Collection"}
      />
    </Step2Shell>
  );
}

interface Step2AdminMetadataProps extends Step2BaseProps {
  wizard: AdminModeProps;
  backdropFile: File | null;
  onBackdropFileChange: (file: File | null) => void;
  backdropSourceUrl: string;
  onBackdropSourceUrlChange: (url: string) => void;
}

function Step2AdminMetadata({
  wizard,
  draft,
  onDraftChange,
  posterFile,
  onPosterFileChange,
  posterSourceUrl,
  onPosterSourceUrlChange,
  backdropFile,
  onBackdropFileChange,
  backdropSourceUrl,
  onBackdropSourceUrlChange,
  onBack,
}: Step2AdminMetadataProps) {
  useUILanguage();
  const createMutation = useCreateAdminCollection();
  const updateMutation = useUpdateAdminCollection();
  const deleteImage = useDeleteCollectionImage();
  const isPending = createMutation.isPending || updateMutation.isPending;
  const collection = wizard.collection;
  const hasLibrary = draft.query_definition.library_ids.length > 0;
  const canSave = draft.title.trim().length > 0 && hasLibrary;

  function handleSave() {
    const baseBody = toAdminCollectionRequest(draft);
    const body: CreateLibraryCollectionRequest = {
      ...baseBody,
      poster_source_url: posterSourceUrl.trim() || undefined,
      backdrop_source_url: backdropSourceUrl.trim() || undefined,
    };
    if (collection) {
      updateMutation.mutate(
        { id: collection.id, body, poster: posterFile, backdrop: backdropFile },
        { onSuccess: wizard.onClose },
      );
    } else {
      createMutation.mutate(
        { body, poster: posterFile, backdrop: backdropFile },
        { onSuccess: wizard.onClose },
      );
    }
  }

  return (
    <Step2Shell onBack={onBack} onSubmit={handleSave}>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <Field
            id="admin-collection-title"
            label={tr("pages.smart_collection_wizard.title")}
            required
            value={draft.title}
            onChange={(value) => onDraftChange({ ...draft, title: value })}
            placeholder={tr("pages.smart_collection_wizard.e_g_critically_acclaimed")}
          />

          <div className="space-y-2">
            <Label htmlFor="admin-collection-description">
              {tr("pages.smart_collection_wizard.description")}
            </Label>
            <textarea
              id="admin-collection-description"
              rows={3}
              value={draft.description}
              onChange={(event) => onDraftChange({ ...draft, description: event.target.value })}
              className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex min-h-[88px] w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
              placeholder={tr(
                "pages.smart_collection_wizard.optional_context_shown_alongside_the_collection",
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{tr("pages.smart_collection_wizard.visibility")}</Label>
              <Select
                value={draft.visibility}
                onValueChange={(value) =>
                  onDraftChange({ ...draft, visibility: value as "visible" | "hidden" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="visible">
                    {tr("pages.smart_collection_wizard.visible")}
                  </SelectItem>
                  <SelectItem value="hidden">
                    {tr("pages.smart_collection_wizard.hidden")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <ToggleRow
              title={tr("pages.smart_collection_wizard.featured")}
              description={tr("pages.smart_collection_wizard.surface_near_the_top_of_the_library")}
              checked={draft.featured}
              onCheckedChange={(checked) => onDraftChange({ ...draft, featured: checked })}
            />
          </div>

          {!hasLibrary ? (
            <p className="text-destructive text-xs">
              {tr(
                "pages.smart_collection_wizard.pick_at_least_one_library_in_the_filters_step_before",
              )}
            </p>
          ) : null}
        </div>

        <div className="space-y-4">
          <ImageUploadField
            label={tr("pages.smart_collection_wizard.poster")}
            currentUrl={collection?.poster_url}
            file={posterFile}
            onFileChange={onPosterFileChange}
            sourceUrl={posterSourceUrl}
            onSourceUrlChange={onPosterSourceUrlChange}
            onDelete={
              collection
                ? () =>
                    deleteImage.mutate({
                      id: collection.id,
                      type: "poster",
                      libraryId: collection.library_id,
                    })
                : undefined
            }
          />
          <ImageUploadField
            label={tr("pages.smart_collection_wizard.backdrop")}
            currentUrl={collection?.backdrop_url}
            file={backdropFile}
            onFileChange={onBackdropFileChange}
            sourceUrl={backdropSourceUrl}
            onSourceUrlChange={onBackdropSourceUrlChange}
            onDelete={
              collection
                ? () =>
                    deleteImage.mutate({
                      id: collection.id,
                      type: "backdrop",
                      libraryId: collection.library_id,
                    })
                : undefined
            }
          />
        </div>
      </div>

      <SaveBar
        onBack={onBack}
        canSave={canSave}
        isPending={isPending}
        saveLabel={collection ? "Save Collection" : "Create Collection"}
      />
    </Step2Shell>
  );
}

function Step2Shell({
  children,
  onBack,
  onSubmit,
}: {
  children: React.ReactNode;
  onBack: () => void;
  onSubmit: () => void;
}) {
  useUILanguage();
  return (
    <form
      className="space-y-6 pb-24"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Button type="button" variant="ghost" size="sm" className="w-fit px-0" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        {tr("pages.smart_collection_wizard.back_to_filters")}
      </Button>
      {children}
    </form>
  );
}

function SaveBar({
  onBack,
  canSave,
  isPending,
  saveLabel,
}: {
  onBack: () => void;
  canSave: boolean;
  isPending: boolean;
  saveLabel: string;
}) {
  useUILanguage();
  return (
    <div className="bg-background/95 supports-[backdrop-filter]:bg-background/70 fixed right-4 bottom-4 z-40 flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-xl backdrop-blur sm:right-6 lg:right-10 xl:right-12">
      <Button type="button" variant="outline" size="sm" onClick={onBack} disabled={isPending}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        {tr("common.actions.back")}
      </Button>
      <Button type="submit" disabled={!canSave || isPending}>
        {isPending ? tr("pages.smart_collection_wizard.saving") : saveLabel}
      </Button>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  required,
  placeholder,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  useUILanguage();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        required={required}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  useUILanguage();
  return (
    <div className="border-border flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
      <div className="pr-2">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}
