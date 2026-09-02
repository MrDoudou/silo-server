import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useRealtimeEvents } from "@/components/realtimeEventsContext";
import type {
  AdminJob,
  ApplyItemImageRequest,
  ApplyItemImageResponse,
  ItemDetail,
  ItemFilesResponse,
  ItemImagesResponse,
  ItemMatchSearchRequest,
  ItemMatchSearchResponse,
  ItemSplitRequest,
  ItemSplitResponse,
  WatchDetail,
} from "@/api/types";
import { adminKeys, catalogKeys, episodeKeys, itemKeys, sectionKeys } from "./keys";
import { toast } from "@/i18n/toast";
import { tr } from "@/i18n/translate";

import {
  getCachedWatchedInvalidationKeys,
  getWatchedToastMessage,
} from "@/pages/ItemDetail/watchedState";
import {
  cancelItemDetailQueries,
  invalidateMediaSurfaceQueries,
  scheduleMediaSurfaceInvalidation,
  updateCatalogItemDetail,
} from "./mediaSurfaceRefresh";
import { bumpHomeRefreshSignal } from "@/pages/homeSurfaceRefresh";
function itemPathID(id: string): string {
  return encodeURIComponent(id);
}

export async function fetchWatchDetail(
  id: string,
  fileId?: number,
  libraryId?: number,
  options?: RequestInit,
): Promise<WatchDetail> {
  const searchParams = new URLSearchParams();
  if (fileId != null) searchParams.set("fileId", String(fileId));
  if (libraryId != null) searchParams.set("library_id", String(libraryId));
  const query = searchParams.toString();
  return api<WatchDetail>(`/watch/${itemPathID(id)}${query ? `?${query}` : ""}`, options);
}

export function useWatchDetail(id: string | undefined, fileId?: number, libraryId?: number) {
  return useQuery({
    queryKey: itemKeys.watchDetail(id!, fileId, libraryId),
    queryFn: () => fetchWatchDetail(id!, fileId, libraryId),
    enabled: !!id,
    staleTime: 0,
  });
}

type RefreshMutationItem = Pick<ItemDetail, "content_id" | "type" | "series_id" | "season_number">;
export type RefreshItemMetadataMode = "quick" | "complete";

interface RefreshItemMetadataVariables {
  item: RefreshMutationItem;
  mode: RefreshItemMetadataMode;
  onReplaced?: (contentID: string) => void | Promise<void>;
}

interface ItemRefreshJobResult {
  requested_content_id?: string;
  refresh_content_id?: string;
  detail_content_id?: string;
  scan_path?: string;
  matched_files?: number;
  // Set when the metadata refresh committed but its artwork did not finish
  // caching. The refresh itself succeeded, so this is a warning, not an error.
  artwork_cache_warning?: string;
  scan_result?: {
    new?: number;
  };
}

interface RefreshItemMetadataContext {
  toastID: string | number;
}

export function useRefreshItemMetadata() {
  const queryClient = useQueryClient();
  const { awaitAdminJob } = useRealtimeEvents();
  return useMutation({
    onMutate: ({ mode }: RefreshItemMetadataVariables): RefreshItemMetadataContext => ({
      toastID: toast.loading("feedback.queries.items.reported_message", {
        values: {
          message:
            mode === "complete"
              ? "Complete metadata refresh running…"
              : "Quick metadata refresh running…",
        },
      }),
    }),
    mutationFn: async ({ item, mode }: RefreshItemMetadataVariables) => {
      const job = await api<AdminJob>(
        `/admin/items/${itemPathID(item.content_id)}/refresh-metadata`,
        {
          method: "POST",
          body: JSON.stringify({ mode }),
        },
      );
      const completed = await awaitAdminJob(job.id);
      return { job: completed };
    },
    onSuccess: async ({ job }, { item, mode, onReplaced }, context) => {
      const result = (job.result_payload ?? {}) as ItemRefreshJobResult;
      const refreshContentID = result.refresh_content_id;
      const detailContentID = result.detail_content_id;
      const newFiles = result.scan_result?.new ?? 0;
      const artworkWarning = result.artwork_cache_warning;

      if (artworkWarning) {
        toast.warning(
          "feedback.queries.items.metadata_refreshed_but_artwork_caching_did_not_finish",
          {
            id: context?.toastID,
            resolvedDescription: tr.remote({ message: artworkWarning }),
          },
        );
      } else if (mode === "complete") {
        toast.success("feedback.queries.items.complete_refresh_finished", { id: context?.toastID });
      } else if (newFiles > 0) {
        toast.success("feedback.queries.items.metadata_refreshed_new_file_versions_found_count", {
          values: {
            count: newFiles,
          },
          id: context?.toastID,
        });
      } else {
        toast.success("feedback.queries.items.metadata_refreshed", { id: context?.toastID });
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["items", "detail", item.content_id] }),
        queryClient.invalidateQueries({
          queryKey: ["catalog", "items", item.content_id, "detail"],
        }),
        queryClient.invalidateQueries({ queryKey: ["items", "watchDetail", item.content_id] }),
      ]);

      if (refreshContentID && refreshContentID !== item.content_id) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["items", "detail", refreshContentID] }),
          queryClient.invalidateQueries({
            queryKey: ["catalog", "items", refreshContentID, "detail"],
          }),
        ]);
      }
      if (
        detailContentID &&
        detailContentID !== item.content_id &&
        detailContentID !== refreshContentID
      ) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["items", "detail", detailContentID] }),
          queryClient.invalidateQueries({
            queryKey: ["catalog", "items", detailContentID, "detail"],
          }),
        ]);
      }

      if (item.type === "series") {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: episodeKeys.seasons(item.content_id) }),
          queryClient.invalidateQueries({
            queryKey: ["catalog", "series", item.content_id, "seasons"],
          }),
          queryClient.invalidateQueries({ queryKey: episodeKeys.all }),
        ]);
      } else if ((item.type === "season" || item.type === "episode") && item.series_id) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["items", "detail", item.series_id] }),
          queryClient.invalidateQueries({
            queryKey: ["catalog", "items", item.series_id, "detail"],
          }),
          queryClient.invalidateQueries({ queryKey: episodeKeys.seasons(item.series_id) }),
          queryClient.invalidateQueries({
            queryKey: ["catalog", "series", item.series_id, "seasons"],
          }),
          queryClient.invalidateQueries({ queryKey: episodeKeys.all }),
        ]);
        if (item.season_number != null) {
          await queryClient.invalidateQueries({
            queryKey: episodeKeys.bySeason(item.series_id, item.season_number),
          });
          await queryClient.invalidateQueries({
            queryKey: episodeKeys.seasonDetail(item.series_id, item.season_number),
          });
          await queryClient.invalidateQueries({
            queryKey: catalogKeys.seasonEpisodes(item.series_id, item.season_number),
          });
          await queryClient.invalidateQueries({
            queryKey: catalogKeys.seasonDetail(item.series_id, item.season_number),
          });
        }
      }

      if (detailContentID && detailContentID !== item.content_id && onReplaced) {
        await onReplaced(detailContentID);
      }
    },
    onError: (err, _variables, context) => {
      toast.error("errors.queries.items.refresh_failed", { error: err, id: context?.toastID });
    },
  });
}

export interface RedetectEpisodeIntroResponse {
  status: string;
}

export async function redetectEpisodeIntro(
  episodeId: string,
): Promise<RedetectEpisodeIntroResponse> {
  return api<RedetectEpisodeIntroResponse>(`/admin/items/${itemPathID(episodeId)}/redetect-intro`, {
    method: "POST",
  });
}

export function useRedetectEpisodeIntro() {
  return useMutation({
    mutationFn: redetectEpisodeIntro,
    onSuccess: (response) => {
      toast.success("feedback.queries.items.reported_message", {
        values: {
          message:
            response.status === "already_running"
              ? "Re-detection already running"
              : "Re-detection started",
        },
      });
    },
    onError: (error) => {
      toast.error("errors.queries.items.failed_to_start_re_detection", { error: error });
    },
  });
}

export interface UpdateItemMetadataRequest {
  title?: string;
  sort_title?: string;
  original_title?: string;
  overview?: string;
  tagline?: string;
  content_rating?: string;
  year?: number;
  runtime?: number;
  genres?: string[];
  studios?: string[];
  networks?: string[];
  countries?: string[];
  release_date?: string | null;
  first_air_date?: string | null;
  last_air_date?: string | null;
  air_time?: string | null;
  air_timezone?: string | null;
  air_date?: string | null;
  status?: string;
  rating_imdb?: number | null;
  rating_tmdb?: number | null;
  rating_rt_critic?: number | null;
  rating_rt_audience?: number | null;
  imdb_id?: string;
  tmdb_id?: string;
  tvdb_id?: string;
  season_number?: number;
  episode_number?: number;
  locked_fields?: number[];
}

export function useUpdateItemMetadata(contentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateItemMetadataRequest) =>
      api<ItemDetail>(`/admin/items/${itemPathID(contentId)}/metadata`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void invalidateMediaSurfaceQueries(queryClient, { itemId: contentId }).then(() => {
        bumpHomeRefreshSignal(queryClient);
      });
      toast.success("feedback.queries.items.metadata_saved");
    },
    onError: (err) => {
      toast.error("errors.queries.items.failed_to_save_metadata", { error: err });
    },
  });
}

type WatchedMutationItem = Pick<
  ItemDetail,
  "content_id" | "type" | "series_id" | "season_number" | "user_data"
>;

export function useWatchedStateMutation(item: WatchedMutationItem) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (nextPlayed: boolean) =>
      api(`/watched/${itemPathID(item.content_id)}`, {
        method: nextPlayed ? "POST" : "DELETE",
        // Marking a series expands to every episode server-side. keepalive
        // lets the browser finish the request after a navigation or tab close,
        // so a large series no longer depends on the user staying on the page.
        // The server applies the mark in one transaction, so a request that
        // never arrives leaves nothing marked rather than a partial subset.
        keepalive: true,
      }),
    onMutate: async (nextPlayed: boolean) => {
      await cancelItemDetailQueries(queryClient, item.content_id);
      updateCatalogItemDetail(queryClient, item.content_id, (detail) => ({
        ...detail,
        user_data: { ...detail.user_data, played: nextPlayed },
        user_state: {
          played: nextPlayed,
          is_favorite: detail.user_state?.is_favorite ?? false,
          in_watchlist: detail.user_state?.in_watchlist ?? false,
        },
      }));
    },
    // Revert only this mutation's own field. Restoring a whole snapshot would
    // discard a concurrent favorite/watchlist toggle's optimistic state.
    onError: (err, nextPlayed) => {
      updateCatalogItemDetail(queryClient, item.content_id, (detail) => ({
        ...detail,
        user_data: { ...detail.user_data, played: !nextPlayed },
        user_state: {
          played: !nextPlayed,
          is_favorite: detail.user_state?.is_favorite ?? false,
          in_watchlist: detail.user_state?.in_watchlist ?? false,
        },
      }));
      toast.error("errors.queries.items.failed_to_update_watched_state", { error: err });
    },
    onSuccess: (_data, nextPlayed) => {
      toast.success("feedback.queries.items.reported_message", {
        values: { message: getWatchedToastMessage(item, nextPlayed) },
      });
    },
    onSettled: () => {
      // The detail query has to be refreshed: marking watched also zeroes
      // `position_seconds` and moves season/series counts server-side, and the
      // optimistic patch above only carries `played`.
      scheduleMediaSurfaceInvalidation(queryClient, {
        itemId: item.content_id,
        watchedKeys: getCachedWatchedInvalidationKeys(queryClient, item),
        skipSimilarItems: true,
      });
    },
  });
}

export function useSearchItemMatchCandidates(contentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: ItemMatchSearchRequest) =>
      api<ItemMatchSearchResponse>(`/admin/items/${itemPathID(contentId)}/match/search`, {
        method: "POST",
        body: JSON.stringify(params),
      }),
    onError: (err) => {
      toast.error("errors.queries.items.match_search_failed", { error: err });
    },
    meta: { queryClient },
  });
}

type ApplyMatchItem = Pick<ItemDetail, "content_id" | "series_id" | "season_number"> & {
  type: string;
  library_id?: number;
};

export function useApplyItemMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      item,
      providerIds,
    }: {
      item: ApplyMatchItem;
      providerIds: Record<string, string>;
    }) => {
      return api(`/admin/items/${itemPathID(item.content_id)}/match/apply`, {
        method: "POST",
        body: JSON.stringify({
          provider_ids: providerIds,
          library_id: item.library_id,
        }),
      });
    },
    onSuccess: async (_, { item }) => {
      toast.success("feedback.queries.items.match_applied_successfully");

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["items", "detail", item.content_id] }),
        queryClient.invalidateQueries({
          queryKey: ["catalog", "items", item.content_id, "detail"],
        }),
        queryClient.invalidateQueries({ queryKey: ["items", "watchDetail", item.content_id] }),
        queryClient.invalidateQueries({ queryKey: adminKeys.staleMediaIDs() }),
        queryClient.invalidateQueries({ queryKey: adminKeys.unmatchedItems() }),
      ]);

      if (item.type === "series") {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: episodeKeys.seasons(item.content_id) }),
          queryClient.invalidateQueries({
            queryKey: ["catalog", "series", item.content_id, "seasons"],
          }),
          queryClient.invalidateQueries({ queryKey: episodeKeys.all }),
        ]);
      } else if ((item.type === "season" || item.type === "episode") && item.series_id) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["items", "detail", item.series_id] }),
          queryClient.invalidateQueries({
            queryKey: ["catalog", "items", item.series_id, "detail"],
          }),
          queryClient.invalidateQueries({ queryKey: episodeKeys.seasons(item.series_id) }),
          queryClient.invalidateQueries({
            queryKey: ["catalog", "series", item.series_id, "seasons"],
          }),
          queryClient.invalidateQueries({ queryKey: episodeKeys.all }),
        ]);
        if (item.season_number != null) {
          await queryClient.invalidateQueries({
            queryKey: episodeKeys.bySeason(item.series_id, item.season_number),
          });
          await queryClient.invalidateQueries({
            queryKey: episodeKeys.seasonDetail(item.series_id, item.season_number),
          });
          await queryClient.invalidateQueries({
            queryKey: catalogKeys.seasonEpisodes(item.series_id, item.season_number),
          });
          await queryClient.invalidateQueries({
            queryKey: catalogKeys.seasonDetail(item.series_id, item.season_number),
          });
        }
      }
    },
    onError: (err) => {
      toast.error("errors.queries.items.failed_to_apply_match", { error: err });
    },
  });
}

// --- Split/merge hooks ---

export function useItemFiles(contentId: string | undefined) {
  return useQuery({
    queryKey: ["items", "files", contentId],
    queryFn: () => api<ItemFilesResponse>(`/admin/items/${itemPathID(contentId ?? "")}/files`),
    enabled: Boolean(contentId),
    staleTime: 30_000,
  });
}

export function useSplitItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ contentId, request }: { contentId: string; request: ItemSplitRequest }) =>
      api<ItemSplitResponse>(`/admin/items/${itemPathID(contentId)}/split`, {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: async (result, { contentId }) => {
      if (result.dry_run) return;
      toast.success("feedback.queries.items.files_moved_to_a_separate_item_count", {
        values: {
          count: result.files_moved,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["items", "detail", contentId] }),
        queryClient.invalidateQueries({ queryKey: ["catalog", "items", contentId, "detail"] }),
        queryClient.invalidateQueries({ queryKey: ["items", "watchDetail", contentId] }),
        queryClient.invalidateQueries({ queryKey: ["items", "files", contentId] }),
        queryClient.invalidateQueries({ queryKey: adminKeys.unmatchedItems() }),
      ]);
    },
    onError: (err) => {
      toast.error("errors.queries.items.failed_to_split_item", { error: err });
    },
  });
}

// --- Image selector hooks ---

export function useItemImages(contentId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: adminKeys.itemImages(contentId!),
    queryFn: () => api<ItemImagesResponse>(`/admin/items/${itemPathID(contentId!)}/images`),
    enabled: !!contentId && enabled,
    staleTime: 5 * 60_000,
  });
}

type ApplyImageItem = Pick<ItemDetail, "content_id" | "type" | "series_id" | "season_number">;

export function useApplyItemImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      item,
      request,
    }: {
      item: ApplyImageItem;
      request: ApplyItemImageRequest;
    }) =>
      api<ApplyItemImageResponse>(`/admin/items/${itemPathID(item.content_id)}/images/apply`, {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: async (_, { item }) => {
      toast.success("feedback.queries.items.image_applied_successfully");

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminKeys.itemImages(item.content_id) }),
        queryClient.invalidateQueries({ queryKey: ["items", "detail", item.content_id] }),
        queryClient.invalidateQueries({
          queryKey: ["catalog", "items", item.content_id, "detail"],
        }),
        queryClient.invalidateQueries({ queryKey: ["items", "watchDetail", item.content_id] }),
        queryClient.invalidateQueries({ queryKey: catalogKeys.all }),
        queryClient.invalidateQueries({ queryKey: sectionKeys.all }),
      ]);

      // Cascade for seasons/episodes to parent series.
      if ((item.type === "season" || item.type === "episode") && item.series_id) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["items", "detail", item.series_id] }),
          queryClient.invalidateQueries({
            queryKey: ["catalog", "items", item.series_id, "detail"],
          }),
          queryClient.invalidateQueries({ queryKey: episodeKeys.seasons(item.series_id) }),
          queryClient.invalidateQueries({
            queryKey: ["catalog", "series", item.series_id, "seasons"],
          }),
        ]);
      }
    },
    onError: (err) => {
      toast.error("errors.queries.items.failed_to_apply_image", { error: err });
    },
  });
}

// ---------------------------------------------------------------------------
// Metadata AI translation (descriptions into the localization tables)
// ---------------------------------------------------------------------------

export interface MetadataTranslationJob {
  id: number;
  target_kind: string;
  content_id: string;
  include_children: boolean;
  source_language: string;
  target_language: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  progress_message: string;
  fields_done: number;
  fields_total: number;
  force: boolean;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

/** Whether the server has metadata AI translation configured, and the
 * viewer-facing on-view mode. */
export function useMetadataAIStatus(enabled = true) {
  return useQuery({
    queryKey: ["metadata-ai", "status"],
    queryFn: () =>
      api<{ enabled: boolean; on_view?: "off" | "button" | "auto" }>("/metadata/ai/status"),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

export interface TranslateItemMetadataRequest {
  target_language: string;
  include_children?: boolean;
  force?: boolean;
}

export function useTranslateItemMetadata(contentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TranslateItemMetadataRequest) =>
      api<{ job: MetadataTranslationJob }>(
        `/admin/items/${itemPathID(contentId)}/metadata-translation`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["metadata-translation-jobs", contentId],
      });
    },
    onError: (err) => {
      toast.error("errors.queries.items.failed_to_start_translation", { error: err });
    },
  });
}

/**
 * Recent translation jobs for an item. Polls while a job is active so the
 * metadata editor can show live progress without a websocket.
 */
export function useMetadataTranslationJobs(contentId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["metadata-translation-jobs", contentId],
    queryFn: () =>
      api<{ jobs: MetadataTranslationJob[] }>(
        `/admin/items/${itemPathID(contentId)}/metadata-translation/jobs`,
      ),
    enabled,
    refetchInterval: (query) => {
      const jobs = query.state.data?.jobs ?? [];
      return jobs.some((j) => j.status === "pending" || j.status === "running") ? 1500 : false;
    },
  });
}
