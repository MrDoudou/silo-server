import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/i18n/toast";

import { ApiClientError, api } from "@/api/client";
import type {
  CreateLibraryCollectionRequest,
  ImportMDBListCollectionRequest,
  ImportMDBListCollectionResponse,
  ImportTMDBCollectionRequest,
  ImportTMDBCollectionResponse,
  ImportTraktCollectionRequest,
  ImportTraktCollectionResponse,
  LibraryCollection,
  LibraryCollectionGroup,
  LibraryCollectionSyncRun,
  LibraryCollectionsListResponse,
  UpdateLibraryCollectionRequest,
  AdminJob,
  AdminJobsResponse,
} from "@/api/types";
import type {
  ApplyCollectionTemplateBundleJobRequest,
  ApplyCollectionTemplateBundleRequest,
  ApplyCollectionTemplateBundleResponse,
} from "@/lib/collectionTemplates";
import { adminKeys, sectionKeys } from "../keys";
import { invalidateAdminCollectionQueries } from "../collectionSurfaceRefresh";
import { runBulkDelete, type BulkDeleteProgress } from "../bulkDelete";
import { tr } from "@/i18n/translate";

const ADMIN_STALE_TIME = 30_000;

function isLikelyRequestTimeout(error: unknown): boolean {
  if (error instanceof ApiClientError) {
    return (
      error.status === 408 || error.status === 502 || error.status === 503 || error.status === 504
    );
  }
  return error instanceof TypeError;
}

function applyTemplateBundleErrorMessage(error: unknown): string {
  if (isLikelyRequestTimeout(error)) {
    return tr(
      "feedback.queries.admin.collections.the_apply_request_timed_out_silo_may_still_be_creating",
    );
  }
  return error instanceof Error
    ? tr.error("errors.common.request_failed", error)
    : tr("feedback.queries.admin.collections.failed_to_apply_defaults");
}

function buildCollectionFormData(
  data: Record<string, unknown>,
  poster?: File | null,
  backdrop?: File | null,
): FormData | string {
  if (!poster && !backdrop) {
    return JSON.stringify(data);
  }
  const formData = new FormData();
  formData.append("data", JSON.stringify(data));
  if (poster) formData.append("poster", poster);
  if (backdrop) formData.append("backdrop", backdrop);
  return formData;
}

function fetchAdminCollections(libraryId?: number): Promise<LibraryCollectionsListResponse> {
  const query = libraryId ? `?library_id=${libraryId}` : "";
  return api<LibraryCollectionsListResponse>(`/admin/collections${query}`).then((data) => ({
    collections: data.collections ?? [],
    groups: data.groups ?? [],
  }));
}

export function useAdminCollections(libraryId?: number) {
  return useQuery({
    queryKey: adminKeys.collections(libraryId),
    queryFn: () => fetchAdminCollections(libraryId),
    select: (data) => data.collections,
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useAdminCollectionGroups(libraryId?: number) {
  return useQuery({
    queryKey: adminKeys.collectionGroups(libraryId),
    queryFn: () =>
      api<{ groups: LibraryCollectionGroup[]; ungrouped_sort_order: number }>(
        `/admin/libraries/${libraryId}/collection-groups`,
      ).then((data) => data.groups ?? []),
    staleTime: ADMIN_STALE_TIME,
    enabled: libraryId !== undefined,
  });
}

export function useCreateAdminCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      body,
      poster,
      backdrop,
    }: {
      body: CreateLibraryCollectionRequest;
      poster?: File | null;
      backdrop?: File | null;
    }) => {
      const payload = buildCollectionFormData(
        body as unknown as Record<string, unknown>,
        poster,
        backdrop,
      );
      return api<LibraryCollection>("/admin/collections", {
        method: "POST",
        body: payload,
      });
    },
    onSuccess: (_collection) => {
      toast.success("feedback.queries.admin.collections.collection_created");
      void invalidateAdminCollectionQueries(queryClient);
    },
    onError: (error) => {
      toast.error("errors.queries.admin.collections.failed_to_save", { error: error });
    },
  });
}

export function useApplyCollectionTemplateBundle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      bundleId,
      body,
    }: {
      bundleId: string;
      body: ApplyCollectionTemplateBundleRequest;
    }) =>
      api<ApplyCollectionTemplateBundleResponse>(
        `/admin/collections/template-bundles/${encodeURIComponent(bundleId)}/apply`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      ),
    onSuccess: (result) => {
      if (!result.dry_run) {
        const created = result.created.length;
        const deleted = result.deleted?.length ?? 0;
        const syncQueued = result.sync_queued?.length ?? 0;
        const failed = result.failed.length;
        const deleteFailed = result.delete_failed?.length ?? 0;
        const failureCount = failed + deleteFailed;
        if (created > 0 || deleted > 0 || syncQueued > 0) {
          toast.success(
            "feedback.queries.admin.collections.collection_changes_created_created_deleted_deleted_queued_syncs_queued_failed",
            { values: { created, deleted, queued: syncQueued, failed: failureCount } },
          );
        }
        void invalidateAdminCollectionQueries(queryClient);
        void queryClient.invalidateQueries({ queryKey: sectionKeys.all });
      }
    },
    onError: (error) => {
      toast.error("errors.queries.admin.collections.reported_message", {
        values: { message: applyTemplateBundleErrorMessage(error) },
      });
    },
  });
}

export function useQueueCollectionTemplateBundleApply() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      bundleId,
      body,
    }: {
      bundleId: string;
      body: ApplyCollectionTemplateBundleJobRequest;
    }) =>
      api<AdminJob>(
        `/admin/collections/template-bundles/${encodeURIComponent(bundleId)}/apply-job`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.jobs("template_bundle_apply") });
      void queryClient.invalidateQueries({ queryKey: adminKeys.jobs("__all") });
      toast.success(
        "feedback.queries.admin.collections.applying_collection_defaults_in_the_background",
      );
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.status === 409) {
        toast.error(
          "errors.queries.admin.collections.a_collection_defaults_apply_is_already_running",
        );
        return;
      }
      toast.error("errors.queries.admin.collections.failed_to_queue_collection_defaults", {
        error: error,
      });
    },
  });
}

export function useTemplateBundleApplyJobs() {
  return useQuery({
    queryKey: adminKeys.jobs("template_bundle_apply"),
    queryFn: () =>
      api<AdminJobsResponse>("/admin/jobs?job_type=template_bundle_apply&limit=10").then(
        (data) => data.jobs ?? [],
      ),
    staleTime: 0,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });
}

export function useUpdateAdminCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      body,
      poster,
      backdrop,
    }: {
      id: string;
      body: UpdateLibraryCollectionRequest;
      poster?: File | null;
      backdrop?: File | null;
    }) => {
      const payload = buildCollectionFormData(
        body as unknown as Record<string, unknown>,
        poster,
        backdrop,
      );
      return api<LibraryCollection>(`/admin/collections/${id}`, {
        method: "PUT",
        body: payload,
      });
    },
    onSuccess: (_collection) => {
      toast.success("feedback.queries.admin.collections.collection_updated");
      void invalidateAdminCollectionQueries(queryClient);
    },
    onError: (error) => {
      toast.error("errors.queries.admin.collections.failed_to_save", { error: error });
    },
  });
}

export function useDeleteAdminCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, libraryId }: { id: string; libraryId: number }) =>
      api<void>(`/admin/collections/${id}`, {
        method: "DELETE",
      }).then(() => libraryId),
    onSuccess: (_libraryId) => {
      toast.success("feedback.queries.admin.collections.collection_deleted");
      void invalidateAdminCollectionQueries(queryClient);
    },
    onError: (error) => {
      toast.error("errors.queries.admin.collections.failed_to_delete", { error: error });
    },
  });
}

export function useDeleteAdminCollections() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<BulkDeleteProgress | null>(null);

  const mutation = useMutation({
    onMutate: (ids) => {
      setProgress({ completed: 0, total: new Set(ids).size });
    },
    mutationFn: (ids: string[]) =>
      runBulkDelete(
        ids,
        (id) =>
          api<void>(`/admin/collections/${encodeURIComponent(id)}`, {
            method: "DELETE",
          }),
        (error) => {
          if (error instanceof ApiClientError && error.status === 404) {
            return "deleted";
          }
          if (
            error instanceof ApiClientError &&
            error.status === 409 &&
            error.code === "collection_in_use"
          ) {
            return "kept";
          }
          return "failed";
        },
        setProgress,
      ),
    onSuccess: async ({ requested, deleted, kept, failed, firstError }) => {
      const keptDescription = tr(
        kept === 1
          ? "feedback.queries.admin.collections.kept_count_collection_in_use_by_home_or_library_sections"
          : "feedback.queries.admin.collections.kept_count_collections_in_use_by_home_or_library_sections",
        { count: kept },
      );

      if (failed === 0 && kept === 0) {
        toast.success("feedback.queries.admin.collections.deleted_count_collections", {
          values: { count: deleted },
        });
      } else if (failed === 0) {
        toast.warning("feedback.queries.admin.collections.deleted_count_collections", {
          values: { count: deleted },
          resolvedDescription: keptDescription,
        });
      } else if (deleted > 0 || kept > 0) {
        toast.warning(
          "feedback.queries.admin.collections.deleted_deleted_of_requested_collections",
          {
            values: {
              deleted,
              requested,
            },
            resolvedDescription: [
              kept > 0 ? keptDescription : "",
              firstError ? tr.remote({ message: firstError }) : "",
            ]
              .filter(Boolean)
              .join(". "),
          },
        );
      } else {
        toast.error("errors.queries.admin.collections.collections_not_deleted_count", {
          values: { count: failed },
          resolvedDescription: firstError ? tr.remote({ message: firstError }) : undefined,
        });
      }
      await invalidateAdminCollectionQueries(queryClient);
    },
    onSettled: () => {
      setProgress(null);
    },
  });

  return { ...mutation, progress };
}

export interface ReorderAdminCollectionsArgs {
  libraryId: number;
  orderedIds: string[];
  groupId?: string | null;
}

export function useReorderAdminCollections() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ libraryId, orderedIds, groupId }: ReorderAdminCollectionsArgs) =>
      api<void>("/admin/collections/order", {
        method: "PUT",
        body: JSON.stringify({
          library_id: libraryId,
          ordered_ids: orderedIds,
          ...(groupId !== undefined ? { group_id: groupId } : {}),
        }),
      }),
    onMutate: async ({ libraryId, orderedIds, groupId }) => {
      const key = adminKeys.collections(libraryId);
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<LibraryCollectionsListResponse>(key);
      if (snapshot) {
        const inScope = (c: LibraryCollection) =>
          groupId === undefined ? true : (c.group_id ?? null) === groupId;
        // Clone before stamping sort_order so the rollback snapshot retains
        // the pre-mutation values; in-place mutation on shared object refs
        // would corrupt onError's restore.
        const reordered = (() => {
          const byId = new Map(snapshot.collections.filter(inScope).map((c) => [c.id, c]));
          const out: LibraryCollection[] = [];
          for (const id of orderedIds) {
            const c = byId.get(id);
            if (c) out.push({ ...c, sort_order: out.length });
          }
          return out;
        })();
        const next = [...snapshot.collections];
        let cursor = 0;
        for (let i = 0; i < next.length; i++) {
          const current = next[i];
          if (current && inScope(current)) {
            next[i] = reordered[cursor++] ?? current;
          }
        }
        queryClient.setQueryData<LibraryCollectionsListResponse>(key, {
          ...snapshot,
          collections: next,
        });
      }
      return { snapshot, libraryId };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.snapshot) {
        queryClient.setQueryData(adminKeys.collections(ctx.libraryId), ctx.snapshot);
      }
      toast.error("errors.queries.admin.collections.failed_to_reorder", { error: error });
    },
    onSettled: () => invalidateAdminCollectionQueries(queryClient),
  });
}

export function useCreateAdminCollectionGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      libraryId,
      name,
      slug,
      defaultSortMode,
    }: {
      libraryId: number;
      name: string;
      slug?: string;
      defaultSortMode?: string;
    }) =>
      api<LibraryCollectionGroup>(`/admin/libraries/${libraryId}/collection-groups`, {
        method: "POST",
        body: JSON.stringify({ name, slug, default_sort_mode: defaultSortMode }),
      }),
    onSuccess: () => invalidateAdminCollectionQueries(queryClient),
    onError: (err) =>
      toast.error("errors.queries.admin.collections.failed_to_add_group", { error: err }),
  });
}

export function useUpdateAdminCollectionGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      name,
      defaultSortMode,
    }: {
      id: string;
      name?: string;
      defaultSortMode?: string;
    }) =>
      api<LibraryCollectionGroup>(`/admin/collection-groups/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify({ name, default_sort_mode: defaultSortMode }),
      }),
    onSuccess: () => invalidateAdminCollectionQueries(queryClient),
    onError: (err) =>
      toast.error("errors.queries.admin.collections.failed_to_rename_group", { error: err }),
  });
}

export function useDeleteAdminCollectionGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { libraryId: number; id: string }) =>
      api<void>(`/admin/collection-groups/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    onSuccess: () => invalidateAdminCollectionQueries(queryClient),
    onError: (err) =>
      toast.error("errors.queries.admin.collections.failed_to_delete_group", { error: err }),
  });
}

export function useReorderAdminCollectionGroups() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ libraryId, orderedIds }: { libraryId: number; orderedIds: string[] }) =>
      api<void>(`/admin/libraries/${libraryId}/collection-groups/reorder`, {
        method: "PUT",
        body: JSON.stringify({ ids: orderedIds }),
      }),
    onMutate: async ({ libraryId, orderedIds }) => {
      const key = adminKeys.collectionGroups(libraryId);
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<LibraryCollectionGroup[]>(key);
      if (snapshot) {
        const byId = new Map(snapshot.map((g) => [g.id, g]));
        const reordered: LibraryCollectionGroup[] = [];
        for (const id of orderedIds) {
          const g = byId.get(id);
          if (g) reordered.push({ ...g, sort_order: reordered.length });
        }
        queryClient.setQueryData<LibraryCollectionGroup[]>(key, reordered);
      }
      return { snapshot, libraryId };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.snapshot) {
        queryClient.setQueryData(adminKeys.collectionGroups(ctx.libraryId), ctx.snapshot);
      }
      toast.error("errors.queries.admin.collections.failed_to_reorder_groups", { error: err });
    },
    onSettled: () => invalidateAdminCollectionQueries(queryClient),
  });
}

export function useReorderAdminCollectionItems(collectionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      api<void>(`/admin/collections/${collectionId}/items/order`, {
        method: "PUT",
        body: JSON.stringify({ ordered_ids: orderedIds }),
      }),
    onError: (error) => {
      toast.error("errors.queries.admin.collections.failed_to_reorder_items", { error: error });
    },
    onSettled: () => invalidateAdminCollectionQueries(queryClient),
  });
}

export function useDeleteCollectionImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      type,
      libraryId,
    }: {
      id: string;
      type: "poster" | "backdrop";
      libraryId: number;
    }) =>
      api<void>(`/admin/collections/${id}/image?type=${type}`, {
        method: "DELETE",
      }).then(() => libraryId),
    onSuccess: (_libraryId) => {
      toast.success("feedback.queries.admin.collections.image_removed");
      void invalidateAdminCollectionQueries(queryClient);
    },
    onError: (error) => {
      toast.error("errors.queries.admin.collections.failed_to_remove_image", { error: error });
    },
  });
}

export function useSyncAdminCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, libraryId }: { id: string; libraryId: number }) =>
      api<LibraryCollectionSyncRun>(`/admin/collections/${id}/sync`, {
        method: "POST",
      }).then((data) => ({ data, libraryId })),
    onSuccess: ({ data, libraryId: _libraryId }) => {
      toast.success("feedback.queries.admin.collections.reported_message", {
        values: {
          message:
            data.status === "warning" ? "Collection synced with warnings" : "Collection synced",
        },
      });
      void invalidateAdminCollectionQueries(queryClient);
    },
    onError: (error) => {
      toast.error("errors.queries.admin.collections.sync_failed", { error: error });
    },
  });
}

export function useImportMDBListCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      body,
      poster,
      backdrop,
    }: {
      body: ImportMDBListCollectionRequest;
      poster?: File | null;
      backdrop?: File | null;
    }) => {
      const payload = buildCollectionFormData(
        body as unknown as Record<string, unknown>,
        poster,
        backdrop,
      );
      return api<ImportMDBListCollectionResponse>("/admin/collections/import/mdblist", {
        method: "POST",
        body: payload,
      });
    },
    onSuccess: (result) => {
      toast.success("feedback.queries.admin.collections.reported_message", {
        values: {
          message:
            result.sync_run?.status === "warning"
              ? "MDBList imported with warnings"
              : "MDBList imported",
        },
      });
      void invalidateAdminCollectionQueries(queryClient);
    },
    onError: (error) => {
      toast.error("errors.queries.admin.collections.import_failed", { error: error });
    },
  });
}

export function useImportTMDBCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      body,
      poster,
      backdrop,
    }: {
      body: ImportTMDBCollectionRequest;
      poster?: File | null;
      backdrop?: File | null;
    }) => {
      const payload = buildCollectionFormData(
        body as unknown as Record<string, unknown>,
        poster,
        backdrop,
      );
      return api<ImportTMDBCollectionResponse>("/admin/collections/import/tmdb", {
        method: "POST",
        body: payload,
      });
    },
    onSuccess: (result) => {
      toast.success("feedback.queries.admin.collections.reported_message", {
        values: {
          message:
            result.sync_run?.status === "warning"
              ? "TMDB collection imported with warnings"
              : "TMDB collection imported",
        },
      });
      void invalidateAdminCollectionQueries(queryClient);
    },
    onError: (error) => {
      toast.error("errors.queries.admin.collections.import_failed", { error: error });
    },
  });
}

export function useImportTraktCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      body,
      poster,
      backdrop,
    }: {
      body: ImportTraktCollectionRequest;
      poster?: File | null;
      backdrop?: File | null;
    }) => {
      const payload = buildCollectionFormData(
        body as unknown as Record<string, unknown>,
        poster,
        backdrop,
      );
      return api<ImportTraktCollectionResponse>("/admin/collections/import/trakt", {
        method: "POST",
        body: payload,
      });
    },
    onSuccess: (result) => {
      const statusMessages: Record<string, string> = {
        warning: "Trakt collection imported with warnings",
        failed: "Trakt collection imported but sync failed",
      };
      const status = result.sync_run?.status ?? "";
      toast.success("feedback.queries.admin.collections.reported_message", {
        values: { message: statusMessages[status] ?? "Trakt collection imported" },
      });
      void invalidateAdminCollectionQueries(queryClient);
    },
    onError: (error) => {
      toast.error("errors.queries.admin.collections.import_failed", { error: error });
    },
  });
}
