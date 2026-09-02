import { useParams, useSearchParams } from "react-router";
import PageBack from "@/components/PageBack";
import RequestPosterCard from "@/components/RequestPosterCard";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useCreateMediaRequest, useRequestBrowse } from "@/hooks/queries/useRequests";
import { requestInputFromMediaResult } from "@/lib/mediaRequests";
import type {
  DiscoverBrowseKind,
  DiscoverBrowseResponse,
  RequestMediaResult,
  RequestMediaType,
} from "@/api/types";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

type BrowseSort = "popularity" | "vote_average" | "release_date";

const SORT_OPTIONS: { value: BrowseSort; label: string }[] = [
  {
    value: "popularity",
    get label() {
      return tr("pages.request_browse.popularity");
    },
  },
  {
    value: "vote_average",
    get label() {
      return tr("pages.request_browse.rating");
    },
  },
  {
    value: "release_date",
    get label() {
      return tr("pages.request_browse.release_date");
    },
  },
];

interface RequestBrowseProps {
  kind: DiscoverBrowseKind;
}

export default function RequestBrowse({ kind }: RequestBrowseProps) {
  useUILanguage();
  const { slug = "" } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const sort = normalizeSort(searchParams.get("sort"));
  const rawPage = Number(searchParams.get("page") ?? "1");
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const mediaTypeFromQuery = normalizeMediaType(searchParams.get("media_type"));
  const mediaType: RequestMediaType | undefined =
    kind === "studio" ? "movie" : kind === "network" ? "series" : (mediaTypeFromQuery ?? "movie");

  const browse = useRequestBrowse({ kind, slug, mediaType, sort, page });
  const createRequest = useCreateMediaRequest();
  const pendingRequestKey = createRequest.variables
    ? mediaRequestKey(createRequest.variables.media_type, createRequest.variables.tmdb_id)
    : undefined;

  const title = browse.data?.display_name ?? humanizeSlug(slug);
  useDocumentTitle(
    title
      ? tr("pages.request_browse.title_requests", { title: title })
      : tr("pages.request_browse.requests"),
  );

  function updateSort(next: string) {
    const params = new URLSearchParams(searchParams);
    params.set("sort", next);
    params.set("page", "1");
    setSearchParams(params, { replace: true });
  }

  function updateMediaType(next: RequestMediaType) {
    const params = new URLSearchParams(searchParams);
    params.set("media_type", next);
    params.set("page", "1");
    setSearchParams(params, { replace: true });
  }

  function goToPage(next: number) {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(next));
    setSearchParams(params, { replace: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function submitRequest(item: RequestMediaResult) {
    createRequest.mutate(requestInputFromMediaResult(item));
  }

  const totalPages = browse.data?.total_pages ?? 0;
  const results = browse.data?.results ?? [];

  if (browse.isError && (browse.error as { status?: number }).status === 404) {
    return (
      <div className="relative space-y-4 py-10 text-center">
        <PageBack to="/requests" up />
        <p className="text-foreground mt-10 text-lg font-semibold sm:mt-12">
          {kind === "studio"
            ? tr("pages.request_browse.studio")
            : kind === "network"
              ? tr("pages.request_browse.network")
              : tr("pages.request_browse.genre")}{" "}
          {tr("pages.request_browse.not_found")}
        </p>
      </div>
    );
  }

  return (
    <div className="relative space-y-6 py-6 sm:py-8">
      <PageBack to="/requests" up />
      <div className="mt-10 space-y-4 px-4 sm:mt-12 sm:px-6 lg:px-10 xl:px-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <BrowseHeaderTile browse={browse.data} kind={kind} fallback={title} />
            <div className="min-w-0">
              <h1 className="text-foreground truncate text-2xl font-semibold">{title}</h1>
              <p className="text-muted-foreground text-sm">
                {browse.isLoading
                  ? tr("pages.request_browse.loading")
                  : results.length > 0
                    ? tr("pages.request_browse.page_page_of_total_pages", {
                        page: page,
                        totalPages: totalPages,
                      })
                    : tr("pages.request_browse.no_results")}
              </p>
            </div>
          </div>
          <Select value={sort} onValueChange={updateSort}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={tr("pages.request_browse.sort")} />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {kind === "genre" ? (
          <Tabs
            value={mediaType ?? "movie"}
            onValueChange={(value) => updateMediaType(value as RequestMediaType)}
          >
            <TabsList>
              <TabsTrigger value="movie">{tr("pages.request_browse.movies")}</TabsTrigger>
              <TabsTrigger value="series">{tr("pages.request_browse.series")}</TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}
      </div>

      <div className="px-4 sm:px-6 lg:px-10 xl:px-12">
        {browse.isLoading ? (
          <BrowseGridSkeleton />
        ) : browse.isError ? (
          <p className="text-muted-foreground text-sm">
            {tr("pages.request_browse.could_not_load_this_browse_page_try_a_different_sort")}
          </p>
        ) : results.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {tr("pages.request_browse.nothing_matched_try_a_different_sort")}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
            {results.map((item) => (
              <RequestPosterCard
                key={`${item.media_type}-${item.tmdb_id}`}
                variant="discover"
                item={item}
                onRequest={() => submitRequest(item)}
                isSubmitting={
                  createRequest.isPending &&
                  pendingRequestKey === mediaRequestKey(item.media_type, item.tmdb_id)
                }
                fluid
              />
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-center gap-3 px-4">
          <Button variant="outline" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
            {tr("pages.request_browse.prev")}
          </Button>
          <span className="text-muted-foreground text-sm tabular-nums">
            {tr("pages.request_browse.page")} {page} {tr("pages.request_browse.of")} {totalPages}
          </span>
          <Button
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => goToPage(page + 1)}
          >
            {tr("common.actions.next")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function BrowseHeaderTile({
  browse,
  kind,
  fallback,
}: {
  browse: DiscoverBrowseResponse | undefined;
  kind: DiscoverBrowseKind;
  fallback: string;
}) {
  useUILanguage();
  if (!browse) {
    return <div className="bg-muted h-16 w-28 rounded-md" aria-hidden />;
  }
  if (kind === "genre") {
    return (
      <div className="bg-muted text-foreground flex h-16 w-28 items-center justify-center rounded-md px-2 text-center text-sm font-semibold">
        {browse.display_name || fallback}
      </div>
    );
  }
  return (
    <div className="flex h-16 w-28 items-center justify-center overflow-hidden rounded-md bg-gray-800 ring-1 ring-gray-700">
      {browse.logo_url ? (
        <img
          src={browse.logo_url}
          alt={browse.display_name}
          className="h-full w-full object-contain p-2"
        />
      ) : (
        <span className="px-2 text-center text-xs font-semibold text-white">
          {browse.display_name || fallback}
        </span>
      )}
    </div>
  );
}

function BrowseGridSkeleton() {
  useUILanguage();
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
      {Array.from({ length: 16 }).map((_, idx) => (
        <Skeleton key={idx} className="aspect-[2/3] w-full rounded-lg" />
      ))}
    </div>
  );
}

function normalizeSort(value: string | null): BrowseSort {
  return SORT_OPTIONS.some((option) => option.value === value)
    ? (value as BrowseSort)
    : "popularity";
}

function normalizeMediaType(value: string | null): RequestMediaType | undefined {
  return value === "movie" || value === "series" ? value : undefined;
}

function mediaRequestKey(mediaType: RequestMediaType, tmdbID: number): string {
  return `${mediaType}-${tmdbID}`;
}

function humanizeSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
