import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { CollectionSearchableSelect } from "@/components/CollectionSearchableSelect";
import LibraryMultiSelect from "@/components/LibraryMultiSelect";
import { useAllUserCollections } from "@/hooks/queries/useAllUserCollections";
import { useAvailableUserLibraries } from "@/hooks/queries/libraries";
import { createCatalogSearchState, fetchCatalogPage } from "@/hooks/queries/catalog";
import { fetchWatchDetail } from "@/hooks/queries/items";
import { catalogKeys, itemKeys } from "@/hooks/queries/keys";
import { useDebounce } from "@/hooks/useDebounce";
import type { BrowseItem } from "@/api/types";
import type { RecipeDefinition } from "@/lib/recipes";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

export interface RecipeParamFieldsProps {
  def: RecipeDefinition;
  params: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

export default function RecipeParamFields({ def, params, onChange }: RecipeParamFieldsProps) {
  useUILanguage();
  if (def.type === "collection") {
    return <CollectionParamField params={params} onChange={onChange} />;
  }
  if (def.type === "continue_watching") {
    return <ContinueTypeParamField params={params} onChange={onChange} />;
  }
  if (def.type === "watchlist" || def.type === "favorites") {
    return <PersonalListFilterFields params={params} onChange={onChange} />;
  }
  if (def.type === "seasonal_themed") {
    return <SeasonalParamField params={params} onChange={onChange} />;
  }
  if (def.type === "admin_curated_list") {
    return <CuratedItemsParamField params={params} onChange={onChange} />;
  }
  if (def.type === "returning_shows") {
    return (
      <NumberParamField
        params={params}
        onChange={onChange}
        paramKey="lookback_days"
        label={tr("components.recipe_gallery.recipe_param_fields.lookback_window_days")}
        placeholder={tr("components.recipe_gallery.recipe_param_fields.value_30")}
        hint={tr(
          "components.recipe_gallery.recipe_param_fields.how_far_back_a_new_season_counts_as_just_arrived",
        )}
      />
    );
  }
  if (def.type === "short_watches") {
    return (
      <NumberParamField
        params={params}
        onChange={onChange}
        paramKey="max_minutes"
        label={tr("components.recipe_gallery.recipe_param_fields.maximum_runtime_minutes")}
        placeholder={tr("components.recipe_gallery.recipe_param_fields.value_95")}
        hint={tr(
          "components.recipe_gallery.recipe_param_fields.movies_at_or_under_this_runtime_qualify",
        )}
      />
    );
  }
  if (def.type === "anniversaries") {
    return (
      <NumberParamField
        params={params}
        onChange={onChange}
        paramKey="milestone_years"
        label={tr("components.recipe_gallery.recipe_param_fields.milestone_years")}
        placeholder={tr("components.recipe_gallery.recipe_param_fields.value_5")}
        hint={tr(
          "components.recipe_gallery.recipe_param_fields.only_anniversaries_that_are_a_multiple_of_this_many_years",
        )}
      />
    );
  }
  if (def.type === "editorial_spotlight") {
    const subjectType = (params.subject_type as string) ?? "director";
    // A preset that ships a pinned subject (e.g. "The 80s") without an
    // explicit auto_rotate is a pinned config — mirroring the backend's Go
    // zero-value. Defaulting the toggle to ON here would hide the subject
    // field and misrepresent what gets saved.
    const autoRotate = (params.auto_rotate as boolean) ?? !params.subject;
    const cadence = (params.rotation_cadence as string) ?? "weekly";
    const subject = (params.subject as string) ?? "";
    return (
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-white/70">
            {tr("components.recipe_gallery.recipe_param_fields.subject_type")}
          </span>
          <select
            value={subjectType}
            onChange={(e) => onChange({ ...params, subject_type: e.target.value })}
            className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm"
          >
            <option value="director">
              {tr("components.recipe_gallery.recipe_param_fields.director")}
            </option>
            <option value="studio">
              {tr("components.recipe_gallery.recipe_param_fields.studio")}
            </option>
            <option value="actor">
              {tr("components.recipe_gallery.recipe_param_fields.actor")}
            </option>
            <option value="era">{tr("components.recipe_gallery.recipe_param_fields.era")}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoRotate}
            onChange={(e) => onChange({ ...params, auto_rotate: e.target.checked })}
          />
          {tr("components.recipe_gallery.recipe_param_fields.auto_rotate")}
        </label>
        {autoRotate ? (
          <label className="block">
            <span className="mb-1 block text-xs text-white/70">
              {tr("components.recipe_gallery.recipe_param_fields.rotation_cadence")}
            </span>
            <select
              value={cadence}
              onChange={(e) => onChange({ ...params, rotation_cadence: e.target.value })}
              className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm"
            >
              <option value="daily">
                {tr("components.recipe_gallery.recipe_param_fields.daily")}
              </option>
              <option value="weekly">
                {tr("components.recipe_gallery.recipe_param_fields.weekly_default")}
              </option>
              <option value="monthly">
                {tr("components.recipe_gallery.recipe_param_fields.monthly")}
              </option>
            </select>
          </label>
        ) : (
          <label className="block">
            <span className="mb-1 block text-xs text-white/70">
              {tr("components.recipe_gallery.recipe_param_fields.subject")}
            </span>
            <input
              value={subject}
              onChange={(e) => onChange({ ...params, subject: e.target.value })}
              className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm"
              placeholder={tr(
                "components.recipe_gallery.recipe_param_fields.e_g_christopher_nolan",
              )}
            />
          </label>
        )}
      </div>
    );
  }
  if (def.type === "because_you_watched") {
    const anchor = (params.anchor_item_id as string) ?? "";
    return (
      <div>
        <label className="mb-1 block text-xs text-white/70">
          {tr("components.recipe_gallery.recipe_param_fields.anchor_item")}
        </label>
        <input
          className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm"
          placeholder={tr(
            "components.recipe_gallery.recipe_param_fields.auto_pick_latest_watched_leave_blank",
          )}
          value={anchor}
          onChange={(e) => onChange({ ...params, anchor_item_id: e.target.value })}
        />
        <div className="mt-1 text-[11px] text-white/50">
          {tr(
            "components.recipe_gallery.recipe_param_fields.leave_blank_to_auto_pick_the_most_recent_watch",
          )}
        </div>
      </div>
    );
  }
  if (def.type === "taste_match") {
    const genre = (params.genre as string) ?? "";
    return (
      <div>
        <label className="mb-1 block text-xs text-white/70">
          {tr("components.recipe_gallery.recipe_param_fields.genre_optional")}
        </label>
        <input
          className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm"
          placeholder={tr(
            "components.recipe_gallery.recipe_param_fields.auto_pick_your_strongest_genre_leave_blank",
          )}
          value={genre}
          onChange={(e) => onChange({ ...params, genre: e.target.value })}
        />
        <div className="mt-1 text-[11px] text-white/50">
          {tr(
            "components.recipe_gallery.recipe_param_fields.leave_blank_to_follow_the_profile_s_strongest_taste_automatically",
          )}
        </div>
      </div>
    );
  }
  return null;
}

interface ParamFieldProps {
  params: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

// Sort choices for watchlist/favorites sections. The empty value keeps the
// list's stored order (provider sync order, then newest-added first).
const PERSONAL_LIST_SORT_OPTIONS = [
  {
    value: "",
    get label() {
      return tr("components.recipe_gallery.recipe_param_fields.list_order_default");
    },
  },
  {
    value: "added_at:desc",
    get label() {
      return tr("components.recipe_gallery.recipe_param_fields.date_added_newest_first");
    },
  },
  {
    value: "added_at:asc",
    get label() {
      return tr("components.recipe_gallery.recipe_param_fields.date_added_oldest_first");
    },
  },
  {
    value: "title:asc",
    get label() {
      return tr("components.recipe_gallery.recipe_param_fields.title_a_z");
    },
  },
  {
    value: "title:desc",
    get label() {
      return tr("components.recipe_gallery.recipe_param_fields.title_z_a");
    },
  },
  {
    value: "release_date:desc",
    get label() {
      return tr("components.recipe_gallery.recipe_param_fields.release_date_newest_first");
    },
  },
  {
    value: "release_date:asc",
    get label() {
      return tr("components.recipe_gallery.recipe_param_fields.release_date_oldest_first");
    },
  },
  {
    value: "rating_imdb:desc",
    get label() {
      return tr("components.recipe_gallery.recipe_param_fields.imdb_rating_highest_first");
    },
  },
];

// PersonalListFilterFields edits the optional filter_type / filter_library_ids
// filters and sort for watchlist and favorites sections, e.g. a "Movies
// watchlist" rail sorted by release date.
function PersonalListFilterFields({ params, onChange }: ParamFieldProps) {
  useUILanguage();
  const { data: libraries } = useAvailableUserLibraries();
  const filterType = typeof params.filter_type === "string" ? params.filter_type : "";
  const libraryIds = Array.isArray(params.filter_library_ids)
    ? params.filter_library_ids.filter((id): id is number => typeof id === "number")
    : [];
  const sortField = typeof params.sort === "string" ? params.sort : "";
  const sortOrder =
    typeof params.order === "string" && params.order
      ? params.order
      : sortField === "title"
        ? "asc" // mirror the backend's per-field default order
        : "desc";
  const sortValue = sortField ? `${sortField}:${sortOrder}` : "";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="block">
        <span className="mb-1 block text-xs text-white/70">
          {tr("components.recipe_gallery.recipe_param_fields.media_type")}
        </span>
        <select
          value={filterType || "all"}
          onChange={(e) =>
            onChange({
              ...params,
              filter_type: e.target.value === "all" ? undefined : e.target.value,
            })
          }
          className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm"
        >
          <option value="all">
            {tr("components.recipe_gallery.recipe_param_fields.all_media")}
          </option>
          <option value="movie">
            {tr("components.recipe_gallery.recipe_param_fields.movies")}
          </option>
          <option value="series">
            {tr("components.recipe_gallery.recipe_param_fields.tv_shows")}
          </option>
          <option value="audiobook">
            {tr("components.recipe_gallery.recipe_param_fields.audiobooks")}
          </option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-white/70">
          {tr("components.recipe_gallery.recipe_param_fields.libraries")}
        </span>
        <LibraryMultiSelect
          libraries={libraries ?? []}
          value={libraryIds}
          onChange={(next) =>
            onChange({ ...params, filter_library_ids: next.length > 0 ? next : undefined })
          }
        />
      </label>
      <label className="block md:col-span-2">
        <span className="mb-1 block text-xs text-white/70">
          {tr("components.recipe_gallery.recipe_param_fields.sort")}
        </span>
        <select
          value={PERSONAL_LIST_SORT_OPTIONS.some((o) => o.value === sortValue) ? sortValue : ""}
          onChange={(e) => {
            const [sort, order] = e.target.value.split(":");
            onChange({ ...params, sort: sort || undefined, order: order || undefined });
          }}
          className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm"
        >
          {PERSONAL_LIST_SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function ContinueTypeParamField({ params, onChange }: ParamFieldProps) {
  useUILanguage();
  const continueType = params.continue_type === "listening" ? "listening" : "watching";

  return (
    <label className="block">
      <span className="mb-1 block text-xs text-white/70">
        {tr("components.recipe_gallery.recipe_param_fields.continue_type")}
      </span>
      <select
        value={continueType}
        onChange={(event) => onChange({ ...params, continue_type: event.target.value })}
        className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm"
      >
        <option value="watching">
          {tr("components.recipe_gallery.recipe_param_fields.watching")}
        </option>
        <option value="listening">
          {tr("components.recipe_gallery.recipe_param_fields.listening")}
        </option>
      </select>
    </label>
  );
}

// Order matches SeasonalThemeOrder in the backend. Higher entries take
// priority when multiple enabled themes match the current date.
const SEASONAL_THEMES: Array<{ key: string; label: string; window: string; icon: string }> = [
  {
    key: "valentines",
    get label() {
      return tr("components.recipe_gallery.recipe_param_fields.valentine_s_day");
    },
    window: "Feb 7–14",
    icon: "💝",
  },
  {
    key: "st_patricks",
    get label() {
      return tr("components.recipe_gallery.recipe_param_fields.st_patrick_s_day");
    },
    window: "Mar 15–17",
    icon: "🍀",
  },
  {
    key: "thanksgiving",
    get label() {
      return tr("components.recipe_gallery.recipe_param_fields.thanksgiving");
    },
    window: "Nov 22–30",
    icon: "🦃",
  },
  {
    key: "christmas",
    get label() {
      return tr("components.recipe_gallery.recipe_param_fields.christmas");
    },
    window: "Dec 1–31",
    icon: "🎄",
  },
  {
    key: "halloween",
    get label() {
      return tr("components.recipe_gallery.recipe_param_fields.halloween");
    },
    window: "All October",
    icon: "🎃",
  },
  {
    key: "saturday_morning",
    get label() {
      return tr("components.recipe_gallery.recipe_param_fields.saturday_morning_cartoons");
    },
    window: "Saturday before 1pm",
    icon: "📺",
  },
  {
    key: "family_movie_night",
    get label() {
      return tr("components.recipe_gallery.recipe_param_fields.family_movie_night");
    },
    window: "Fri & Sat from 5pm",
    icon: "🍿",
  },
  {
    key: "summer_blockbuster",
    get label() {
      return tr("components.recipe_gallery.recipe_param_fields.summer_blockbusters");
    },
    window: "June – August",
    icon: "🌴",
  },
];

function SeasonalParamField({ params, onChange }: ParamFieldProps) {
  useUILanguage();
  // Resolve the current enabled set, falling back to the legacy single-theme
  // shape when the section was saved before EnabledThemes existed.
  const rawEnabled = params.enabled_themes;
  const enabled = new Set<string>(
    Array.isArray(rawEnabled)
      ? rawEnabled.filter((v): v is string => typeof v === "string")
      : typeof params.theme === "string" && params.theme
        ? [params.theme]
        : [],
  );

  // theme_titles is an optional map of theme key → custom display name.
  const rawTitles = params.theme_titles;
  const themeTitles: Record<string, string> = {};
  if (rawTitles && typeof rawTitles === "object" && !Array.isArray(rawTitles)) {
    for (const [k, v] of Object.entries(rawTitles)) {
      if (typeof v === "string") themeTitles[k] = v;
    }
  }

  function commit(nextEnabled: Set<string>, nextTitles: Record<string, string>) {
    // Drop empty/whitespace-only titles and titles for disabled themes so the
    // saved config stays tidy.
    const cleanedTitles: Record<string, string> = {};
    for (const [k, v] of Object.entries(nextTitles)) {
      if (!nextEnabled.has(k)) continue;
      const trimmed = v.trim();
      if (trimmed) cleanedTitles[k] = trimmed;
    }
    onChange({
      ...params,
      enabled_themes: Array.from(nextEnabled),
      theme_titles: Object.keys(cleanedTitles).length > 0 ? cleanedTitles : undefined,
      // Clear legacy fields so they don't shadow multi-theme resolution.
      theme: "",
      mode: "",
    });
  }

  function toggle(key: string, on: boolean) {
    const next = new Set(enabled);
    if (on) next.add(key);
    else next.delete(key);
    commit(next, themeTitles);
  }

  function setTitle(key: string, value: string) {
    commit(enabled, { ...themeTitles, [key]: value });
  }

  return (
    <div className="space-y-2">
      <span className="block text-xs text-white/70">
        {tr("components.recipe_gallery.recipe_param_fields.holidays_to_celebrate")}
      </span>
      <div className="space-y-2 rounded border border-white/10 bg-white/5 px-3 py-2">
        {SEASONAL_THEMES.map((t) => {
          const isOn = enabled.has(t.key);
          return (
            <div key={t.key} className="space-y-1">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2">
                  <span aria-hidden>{t.icon}</span>
                  <span>{t.label}</span>
                  <span className="text-[10px] text-white/40">{t.window}</span>
                </span>
                <input
                  type="checkbox"
                  checked={isOn}
                  onChange={(e) => toggle(t.key, e.target.checked)}
                />
              </label>
              {isOn && (
                <input
                  type="text"
                  value={themeTitles[t.key] ?? ""}
                  onChange={(e) => setTitle(t.key, e.target.value)}
                  placeholder={tr(
                    "components.recipe_gallery.recipe_param_fields.section_title_in_season_defaults_to_label",
                    {
                      label: t.label,
                    },
                  )}
                  className="ml-7 w-[calc(100%-1.75rem)] rounded border border-white/10 bg-white/5 px-2 py-1 text-xs"
                />
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-white/50">
        {tr(
          "components.recipe_gallery.recipe_param_fields.the_section_auto_cycles_it_shows_whichever_enabled_holiday_is",
        )}
      </p>
    </div>
  );
}

// NumberParamField edits a single optional integer param (e.g. lookback_days).
// Clearing the input removes the key so the backend default applies.
function NumberParamField({
  params,
  onChange,
  paramKey,
  label,
  placeholder,
  hint,
}: ParamFieldProps & {
  paramKey: string;
  label: string;
  placeholder: string;
  hint?: string;
}) {
  useUILanguage();
  const raw = params[paramKey];
  const value = typeof raw === "number" && Number.isFinite(raw) ? String(raw) : "";
  return (
    <div>
      <label className="mb-1 block text-xs text-white/70">{label}</label>
      <input
        type="number"
        min={1}
        step={1}
        className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          const parsed = Number(e.target.value);
          // All numeric recipe params are Go ints server-side; storing a
          // fractional value would fail JSON unmarshalling at save time.
          onChange({
            ...params,
            [paramKey]:
              e.target.value && Number.isInteger(parsed) && parsed > 0 ? parsed : undefined,
          });
        }}
      />
      {hint ? <div className="mt-1 text-[11px] text-white/50">{hint}</div> : null}
    </div>
  );
}

const CURATED_SEARCH_LIMIT = 10;
const CURATED_SEARCH_DEBOUNCE_MS = 250;

function curatedItemLabel(title: string, year?: number): string {
  return year ? `${title} (${year})` : title;
}

// CuratedItemsParamField builds the ordered item_ids list for
// admin_curated_list sections: catalog search on top, the picked (ordered)
// list below. Titles for freshly added items come from the search result;
// items persisted before this drawer opened are hydrated from the item
// detail endpoint, falling back to the raw id while loading.
function CuratedItemsParamField({ params, onChange }: ParamFieldProps) {
  useUILanguage();
  const [query, setQuery] = useState("");
  const [labels, setLabels] = useState<Record<string, string>>({});
  const debounced = useDebounce(query.trim(), CURATED_SEARCH_DEBOUNCE_MS);

  const itemIDs = Array.isArray(params.item_ids)
    ? params.item_ids.filter((id): id is string => typeof id === "string")
    : [];
  const picked = new Set(itemIDs);

  // Hydrate display titles for ids we have no label for (pre-existing config
  // being edited). Cached under the same key as the watch-detail hook.
  const unlabeled = itemIDs.filter((id) => !(id in labels));
  const detailQueries = useQueries({
    queries: unlabeled.map((id) => ({
      queryKey: itemKeys.watchDetail(id),
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        fetchWatchDetail(id, undefined, undefined, { signal }),
      staleTime: 5 * 60 * 1000,
      retry: false,
    })),
  });
  const hydratedLabels: Record<string, string> = {};
  unlabeled.forEach((id, i) => {
    const detail = detailQueries[i]?.data;
    if (detail) hydratedLabels[id] = curatedItemLabel(detail.title, detail.year);
  });

  const searchState = useMemo(
    () => createCatalogSearchState("query", { q: debounced || undefined }),
    [debounced],
  );
  const results = useQuery({
    queryKey: [
      "curatedListPicker",
      catalogKeys.list({
        source: searchState.source,
        q: searchState.q,
        limit: CURATED_SEARCH_LIMIT,
        offset: 0,
      }),
    ],
    queryFn: ({ signal }) => fetchCatalogPage(searchState, CURATED_SEARCH_LIMIT, 0, { signal }),
    enabled: debounced.length > 0,
    staleTime: 30 * 1000,
  });
  const found: BrowseItem[] = results.data?.items ?? [];

  function add(item: BrowseItem) {
    if (picked.has(item.content_id)) return;
    setLabels((prev) => ({
      ...prev,
      [item.content_id]: curatedItemLabel(item.title, item.year),
    }));
    onChange({ ...params, item_ids: [...itemIDs, item.content_id] });
  }

  function remove(id: string) {
    onChange({ ...params, item_ids: itemIDs.filter((existing) => existing !== id) });
  }

  function move(id: string, delta: number) {
    const idx = itemIDs.indexOf(id);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= itemIDs.length) return;
    const next = [...itemIDs];
    next.splice(idx, 1);
    next.splice(target, 0, id);
    onChange({ ...params, item_ids: next });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-white/70">
          {tr("components.recipe_gallery.recipe_param_fields.add_titles")}
        </label>
        <input
          className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm"
          placeholder={tr("components.recipe_gallery.recipe_param_fields.search_your_catalog")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
        {debounced.length === 0 ? null : results.isLoading ? (
          <div className="mt-2 text-xs text-white/50">
            {tr("components.recipe_gallery.recipe_param_fields.searching")}
          </div>
        ) : results.isError ? (
          <div className="mt-2 text-xs text-amber-300">
            {tr("components.recipe_gallery.recipe_param_fields.search_failed_try_again")}
          </div>
        ) : found.length === 0 ? (
          <div className="mt-2 text-xs text-white/50">
            {tr("components.recipe_gallery.recipe_param_fields.no_matches")}
          </div>
        ) : (
          <ul className="mt-2 max-h-52 divide-y divide-white/10 overflow-y-auto rounded border border-white/10">
            {found.map((item) => {
              const already = picked.has(item.content_id);
              return (
                <li key={item.content_id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {item.title}
                    <span className="ml-1 text-xs text-white/40">
                      {item.year
                        ? tr("components.recipe_gallery.recipe_param_fields.year", {
                            year: item.year,
                          })
                        : ""}
                      {item.type}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={already}
                    onClick={() => add(item)}
                    className="rounded border border-white/15 px-2 py-0.5 text-xs disabled:opacity-40"
                  >
                    {already
                      ? tr("components.recipe_gallery.recipe_param_fields.added")
                      : tr("common.actions.add")}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <span className="mb-1 block text-xs text-white/70">
          {tr("components.recipe_gallery.recipe_param_fields.curated_list")}
          {itemIDs.length}{" "}
          {itemIDs.length === 1
            ? tr("components.recipe_gallery.recipe_param_fields.title")
            : tr("components.recipe_gallery.recipe_param_fields.titles")}
          {tr("components.recipe_gallery.recipe_param_fields.shown_in_this_order")}
        </span>
        {itemIDs.length === 0 ? (
          <div className="rounded border border-dashed border-white/15 px-3 py-3 text-xs text-white/50">
            {tr(
              "components.recipe_gallery.recipe_param_fields.search_above_and_add_at_least_one_title",
            )}
          </div>
        ) : (
          <ul className="divide-y divide-white/10 rounded border border-white/10">
            {itemIDs.map((id, idx) => (
              <li key={id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {labels[id] ?? hydratedLabels[id] ?? id}
                </span>
                <button
                  type="button"
                  onClick={() => move(id, -1)}
                  disabled={idx === 0}
                  aria-label={tr("components.recipe_gallery.recipe_param_fields.move_up")}
                  className="rounded border border-white/15 px-2 py-0.5 text-xs disabled:opacity-40"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(id, 1)}
                  disabled={idx === itemIDs.length - 1}
                  aria-label={tr("components.recipe_gallery.recipe_param_fields.move_down")}
                  className="rounded border border-white/15 px-2 py-0.5 text-xs disabled:opacity-40"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => remove(id)}
                  aria-label={tr("common.actions.remove")}
                  className="rounded border border-white/15 px-2 py-0.5 text-xs text-red-300"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CollectionParamField({ params, onChange }: ParamFieldProps) {
  useUILanguage();
  const { collections, isLoading } = useAllUserCollections();
  const libraryID = (params.library_collection_id as string) ?? "";
  const userID = (params.user_collection_id as string) ?? "";
  const value = userID || libraryID;
  const sourceProvider = typeof params.source_provider === "string" ? params.source_provider : "";
  const sourcePreset = typeof params.source_preset === "string" ? params.source_preset : "";
  const mediaType = typeof params.media_type === "string" ? params.media_type : "";
  const isTraktPreset = sourceProvider === "trakt";
  const isAutoBackedTraktPreset =
    isTraktPreset && (sourcePreset === "trending" || sourcePreset === "popular");
  const collectionOptions = isTraktPreset
    ? collections.filter((collection) => {
        if (collection.source !== "library" || collection.collection_type !== "trakt") {
          return false;
        }
        const sourceConfig = collection.source_config;
        if (!sourceConfig || typeof sourceConfig !== "object" || Array.isArray(sourceConfig)) {
          return false;
        }
        return sourceConfig.preset === sourcePreset && sourceConfig.media_type === mediaType;
      })
    : collections;

  if (isAutoBackedTraktPreset && !value) {
    return (
      <p className="text-xs text-white/50">
        {tr("components.recipe_gallery.recipe_param_fields.a_synced_trakt")} {sourcePreset}{" "}
        {mediaType === "tv"
          ? tr("components.recipe_gallery.recipe_param_fields.shows")
          : tr("components.recipe_gallery.recipe_param_fields.movies_98311619")}{" "}
        {tr(
          "components.recipe_gallery.recipe_param_fields.collection_will_be_created_automatically",
        )}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <span className="block text-xs text-white/70">
        {tr("components.recipe_gallery.recipe_param_fields.collection")}
      </span>
      <CollectionSearchableSelect
        options={collectionOptions}
        value={value}
        onChange={(next) => {
          // Pick the right param key based on the chosen collection's source.
          // Clearing the selection wipes both fields.
          if (!next) {
            onChange({ ...params, library_collection_id: "", user_collection_id: "" });
            return;
          }
          const picked = collectionOptions.find((c) => c.id === next);
          if (picked?.source === "user") {
            onChange({ ...params, library_collection_id: "", user_collection_id: next });
          } else {
            onChange({ ...params, library_collection_id: next, user_collection_id: "" });
          }
        }}
        disabled={isLoading}
        isLoading={isLoading}
      />
      {isTraktPreset && !isLoading && collectionOptions.length === 0 ? (
        <p className="text-xs text-amber-300">
          {tr("components.recipe_gallery.recipe_param_fields.no_synced_trakt")} {sourcePreset}{" "}
          {mediaType === "tv"
            ? tr("components.recipe_gallery.recipe_param_fields.shows")
            : tr("components.recipe_gallery.recipe_param_fields.movies_98311619")}{" "}
          {tr(
            "components.recipe_gallery.recipe_param_fields.collection_was_found_create_and_sync_one_from_admin_collections",
          )}
        </p>
      ) : null}
    </div>
  );
}
