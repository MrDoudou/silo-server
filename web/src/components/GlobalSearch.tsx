import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useImageLoaded } from "@/hooks/useImageLoaded";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "radix-ui";
import { useViewTransitionNavigate } from "@/hooks/useViewTransition";
import { useDebounce } from "@/hooks/useDebounce";
import { buildQueryCatalogHref } from "@/pages/catalogSearchParams";
import { useSidebarItemNavigation } from "@/components/sidebarItemNavigationContext";
import { createEmptyQueryDefinition, type BrowseItem } from "@/api/types";
import { createCatalogSearchState, fetchCatalogPage } from "@/hooks/queries/catalog";
import { useSearchMediaScope } from "@/hooks/useSearchMediaScope";
import { useRequestSearch } from "@/hooks/queries/useRequests";
import { useCanRequest } from "@/hooks/useCanRequest";
import { catalogKeys } from "@/hooks/queries/keys";
import { decodeThumbhash } from "@/lib/thumbhash";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import { RequestToAddSection } from "./RequestToAddSection";
import CardPlayOverlay from "./CardPlayOverlay";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

const PREVIEW_LIMIT = 8;
const DEBOUNCE_MS = 200;
const TMDB_DEBOUNCE_MS = 400;
const INTERACTIVE_SEARCH_GC_TIME_MS = 30_000;

function typeLabel(type: BrowseItem["type"]): string {
  switch (type) {
    case "movie":
      return "Movie";
    case "series":
      return "Series";
    case "season":
      return "Season";
    case "episode":
      return "Episode";
    case "ebook":
      return "Ebook";
    case "audiobook":
      return "Audiobook";
    case "manga":
      return "Manga";
    default:
      return type;
  }
}

// Shared by the option row and the play-overlay layer stacked on top of it, so
// the overlay always lands on the poster even if the row's spacing changes.
const ROW_LAYOUT_CLASSES = "flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left";
const ROW_POSTER_CLASSES = "relative h-14 w-10 shrink-0";

function GlobalSearchResultRow({
  item,
  index,
  isSelected,
  onPick,
  onPlay,
}: {
  item: BrowseItem;
  index: number;
  isSelected: boolean;
  onPick: (contentId: string) => void;
  onPlay: () => void;
}) {
  useUILanguage();
  const { loaded, onLoad } = useImageLoaded(item.poster_url);
  const thumbhashUrl = item.poster_thumbhash ? decodeThumbhash(item.poster_thumbhash) : "";

  // Virtual focus: keyboard focus stays in the search input and the option is
  // pointed at by aria-activedescendant, so the row is not a tab stop.
  //
  // The play link is a SIBLING of the option, not a child. role="option" is
  // "Children Presentational: True", so a link inside it would be stripped of
  // its role and name in the accessibility tree and become undiscoverable to
  // screen-reader users. The overlay layer instead repeats the row's own flex
  // layout (same gap/padding/poster box) so it tracks the poster without
  // hard-coded offsets, and is pointer-events-none so row clicks pass through.
  return (
    <div className="group/media hover:bg-muted/80 data-[selected]:bg-accent relative rounded-md transition-colors">
      <div
        id={"search-result-" + index}
        role="option"
        aria-selected={isSelected}
        aria-label={[item.title, item.year > 0 ? String(item.year) : null, typeLabel(item.type)]
          .filter(Boolean)
          .join(", ")}
        data-selected={isSelected || undefined}
        onClick={() => onPick(item.content_id)}
        className={ROW_LAYOUT_CLASSES}
      >
        <div
          className={"bg-muted overflow-hidden rounded-md " + ROW_POSTER_CLASSES}
          style={
            thumbhashUrl
              ? {
                  backgroundImage: `url(${thumbhashUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        >
          {item.poster_url ? (
            <img
              src={item.poster_url}
              alt=""
              className={"h-full w-full object-cover " + (loaded ? "opacity-100" : "opacity-0")}
              loading="lazy"
              onLoad={onLoad}
            />
          ) : (
            <div className="text-muted-foreground flex h-full items-center justify-center px-1 text-center text-[10px] leading-tight">
              {item.title.slice(0, 24)}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{item.title}</div>
          <div className="text-muted-foreground text-xs">
            {item.year > 0 ? tr("components.global_search.year", { year: item.year }) : ""}
            {typeLabel(item.type)}
          </div>
        </div>
      </div>
      {item.play_content_id ? (
        <div className={"pointer-events-none absolute inset-0 " + ROW_LAYOUT_CLASSES}>
          <div className={ROW_POSTER_CLASSES}>
            <CardPlayOverlay
              contentId={item.play_content_id}
              title={item.title}
              type={item.type === "movie" ? "movie" : "episode"}
              size="compact"
              onPlaybackStart={onPlay}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function GlobalSearch({
  defaultOpen = false,
  initialQuery = "",
}: { defaultOpen?: boolean; initialQuery?: string } = {}) {
  useUILanguage();
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState(initialQuery);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const navigate = useViewTransitionNavigate();
  const beginSidebarItemNavigation = useSidebarItemNavigation();
  const debouncedQuery = useDebounce(query.trim(), DEBOUNCE_MS);
  const tmdbDebouncedQuery = useDebounce(query.trim(), TMDB_DEBOUNCE_MS);
  const canRequest = useCanRequest();
  const tmdbQuery = useRequestSearch("all", tmdbDebouncedQuery, 1, {
    enabled: canRequest.discoveryEnabled,
    requireProfile: true,
    staleTime: 5 * 60 * 1000,
    gcTime: INTERACTIVE_SEARCH_GC_TIME_MS,
    retry: false,
  });
  const tmdbMissingCount =
    tmdbQuery.data?.results?.filter((result) => result.availability !== "available").length ?? 0;
  // Cap at DIALOG_LIMIT (4) — RequestToAddSection slices results to that many rows.
  const tmdbVisibleCount = Math.min(tmdbMissingCount, 4);
  const tmdbStillLoading =
    canRequest.discoveryEnabled && tmdbDebouncedQuery.length > 1 && tmdbQuery.isLoading;
  const tmdbWillRender = canRequest.discoveryEnabled && tmdbMissingCount > 0;
  // Hide empty state while the TMDB debounce trails the library debounce; otherwise
  // the user sees "No matches" flash between t=200ms and t=400ms after typing.
  const tmdbDebounceCatchingUp =
    canRequest.discoveryEnabled && tmdbDebouncedQuery !== debouncedQuery;

  // Preview results follow the user's preferred search scope (Media vs
  // Audiobooks vs All); the full results page applies the same default.
  const { scope: searchScope } = useSearchMediaScope();
  const searchState = useMemo(
    () =>
      createCatalogSearchState("query", {
        q: debouncedQuery || undefined,
        query_definition: {
          ...createEmptyQueryDefinition(),
          media_scope: searchScope === "all" ? undefined : searchScope,
        },
      }),
    [debouncedQuery, searchScope],
  );

  const previewQuery = useQuery({
    queryKey: catalogKeys.list({
      source: searchState.source,
      q: searchState.q,
      title: searchState.title,
      scope: searchState.scope,
      section_id: searchState.section_id,
      library_id: searchState.library_id,
      collection_id: searchState.collection_id,
      person_id: searchState.person_id,
      query_fingerprint: JSON.stringify(searchState.query_definition),
      include_total: false,
      limit: PREVIEW_LIMIT,
      offset: 0,
    }),
    queryFn: ({ signal }) => fetchCatalogPage(searchState, PREVIEW_LIMIT, 0, { signal }, false),
    enabled: open && debouncedQuery.length > 0,
    staleTime: 60 * 1000,
    gcTime: INTERACTIVE_SEARCH_GC_TIME_MS,
    retry: false,
  });

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (query.trim()) {
        navigate(buildQueryCatalogHref(query.trim()));
        setOpen(false);
        setQuery("");
      }
    },
    [navigate, query],
  );

  const handlePickItem = useCallback(
    (contentId: string) => {
      const href = `/item/${encodeURIComponent(contentId)}`;
      if (!beginSidebarItemNavigation?.({ href })) navigate(href);
      setOpen(false);
      setQuery("");
    },
    [beginSidebarItemNavigation, navigate],
  );

  // Reset selectedIndex when query changes
  useEffect(() => {
    setSelectedIndex(-1);
  }, [query]);

  // Auto-scroll the selected result into view. DOM focus deliberately stays in
  // the input; aria-activedescendant carries the selection.
  useEffect(() => {
    if (selectedIndex >= 0) {
      document.getElementById(`search-result-${selectedIndex}`)?.scrollIntoView?.({
        block: "nearest",
      });
    }
  }, [selectedIndex]);

  const showResultsPanel = query.trim().length > 0;
  const items = previewQuery.data?.items ?? [];
  const hasMore = previewQuery.data?.has_more ?? false;
  const showLoading = previewQuery.isFetching && items.length === 0;
  const showEmpty =
    !previewQuery.isFetching &&
    debouncedQuery.length > 0 &&
    items.length === 0 &&
    !previewQuery.isError &&
    !tmdbStillLoading &&
    !tmdbWillRender &&
    !canRequest.isResolving &&
    !tmdbDebounceCatchingUp;
  const showError = previewQuery.isError;
  const moveResultFocus = useCallback(
    (nextIndex: number) => {
      if (items.length === 0) {
        setSelectedIndex(-1);
        searchInputRef.current?.focus();
        return;
      }
      setSelectedIndex(((nextIndex % items.length) + items.length) % items.length);
    },
    [items.length],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQuery("");
      }}
    >
      <DialogContent
        className="top-[20%] max-h-[min(32rem,calc(100dvh-6rem))] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg"
        showCloseButton={false}
      >
        <VisuallyHidden.Root>
          <DialogTitle>{tr("common.actions.search")}</DialogTitle>
        </VisuallyHidden.Root>
        <form onSubmit={handleSubmit}>
          <div className={cn("flex items-center px-5 sm:px-6", showResultsPanel && "border-b")}>
            <Search className="text-muted-foreground mr-2 h-4 w-4 shrink-0" />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr("components.global_search.search_library")}
              className="placeholder:text-muted-foreground flex h-12 w-full bg-transparent text-sm outline-none"
              autoFocus
              aria-label={tr("common.actions.search")}
              role="combobox"
              aria-expanded={showResultsPanel}
              aria-autocomplete="list"
              aria-controls="global-search-library-results"
              aria-activedescendant={
                selectedIndex >= 0 ? `search-result-${selectedIndex}` : undefined
              }
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  moveResultFocus(selectedIndex + 1);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  moveResultFocus(selectedIndex < 0 ? items.length - 1 : selectedIndex - 1);
                } else if (e.key === "Enter" && selectedIndex >= 0 && items[selectedIndex]) {
                  e.preventDefault();
                  handlePickItem(items[selectedIndex].content_id);
                } else if (e.key === "Escape") {
                  setOpen(false);
                }
              }}
            />
            <kbd className="bg-muted text-muted-foreground pointer-events-none ml-2 hidden rounded border px-1.5 py-0.5 text-[10px] font-medium select-none sm:inline-flex">
              {tr("components.global_search.esc")}
            </kbd>
          </div>
        </form>
        {showResultsPanel && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="max-h-[min(22rem,55vh)] overflow-y-auto overscroll-contain px-2 py-2">
              <div
                id="global-search-library-results"
                role="listbox"
                aria-label={tr("components.global_search.library_search_results")}
              >
                {showLoading && (
                  <div className="text-muted-foreground px-3 py-6 text-center text-sm">
                    {tr("components.global_search.searching")}
                  </div>
                )}
                {showError && (
                  <div className="text-destructive px-3 py-4 text-center text-sm">
                    {tr(
                      "components.global_search.could_not_load_results_press_enter_to_open_the_search",
                    )}
                  </div>
                )}
                {showEmpty && (
                  <div className="text-muted-foreground px-3 py-6 text-center text-sm">
                    {tr("components.global_search.no_matches")}
                  </div>
                )}
                {items.map((item, i) => (
                  <GlobalSearchResultRow
                    key={item.content_id}
                    item={item}
                    index={i}
                    isSelected={i === selectedIndex}
                    onPick={handlePickItem}
                    onPlay={() => setOpen(false)}
                  />
                ))}
              </div>
              {tmdbDebouncedQuery.length > 1 && canRequest.discoveryEnabled && (
                <RequestToAddSection
                  variant="dialog"
                  query={tmdbDebouncedQuery}
                  libraryHadHits={items.length > 0}
                  libraryResultsKnown={!previewQuery.isFetching && !previewQuery.isError}
                />
              )}
            </div>
            <div role="status" aria-live="polite" className="sr-only">
              {tmdbVisibleCount > 0
                ? tr(
                    "components.global_search.length_library_results_tmdb_visible_count_request_suggestions",
                    {
                      length: items.length,
                      tmdbVisibleCount: tmdbVisibleCount,
                    },
                  )
                : tr("components.global_search.length_results_found", { length: items.length })}
            </div>
            <div className="text-muted-foreground border-t px-3 py-2 text-center text-xs">
              {hasMore ? (
                <p>
                  {tr("components.global_search.showing_top_results_press_enter_for_all_results")}
                </p>
              ) : (
                <p>{tr("components.global_search.press_enter_to_open_the_full_search_page")}</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
