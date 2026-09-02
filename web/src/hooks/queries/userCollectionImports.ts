import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/i18n/toast";

import { api } from "@/api/client";
import type {
  ImportUserCollectionResponse,
  ImportUserMDBListCollectionRequest,
  ImportUserTMDBCollectionRequest,
  ImportUserTraktCollectionRequest,
  MDBListDiscoveryResponse,
  UserCollectionSyncResult,
} from "@/api/types";
import { TEMPLATE_STALE_TIME, type CollectionTemplateCatalog } from "@/lib/collectionTemplates";
import { invalidateUserCollectionQueries } from "./collectionSurfaceRefresh";
import { collectionKeys } from "./keys";
import { tr } from "@/i18n/translate";

export function useUserCollectionTemplates(enabled = true) {
  return useQuery({
    queryKey: collectionKeys.templates(),
    queryFn: () => api<CollectionTemplateCatalog>("/collections/templates"),
    enabled,
    staleTime: TEMPLATE_STALE_TIME,
  });
}

export function useMDBListSearch(query: string, enabled = true) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: collectionKeys.mdblistSearch(trimmed),
    queryFn: () =>
      api<MDBListDiscoveryResponse>(
        `/collections/import/mdblist/search?q=${encodeURIComponent(trimmed)}`,
      ),
    enabled: enabled && trimmed.length > 0,
    staleTime: 60_000,
  });
}

export function useMDBListTop(enabled = true) {
  return useQuery({
    queryKey: collectionKeys.mdblistTop(),
    queryFn: () => api<MDBListDiscoveryResponse>("/collections/import/mdblist/top"),
    enabled,
    staleTime: 5 * 60_000,
  });
}

function importToastMessage(label: string, status: string | undefined) {
  if (status === "warning") {
    return tr("feedback.queries.user_collection_imports.collection_imported_with_warnings", {
      collection: label,
    });
  }
  if (status === "failed") {
    return tr("feedback.queries.user_collection_imports.collection_imported_but_sync_failed", {
      collection: label,
    });
  }
  return tr("feedback.queries.user_collection_imports.collection_imported", { collection: label });
}

export function useImportUserMDBListCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ImportUserMDBListCollectionRequest) =>
      api<ImportUserCollectionResponse>("/collections/import/mdblist", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (result) => {
      toast.success("feedback.queries.user_collection_imports.reported_message", {
        values: { message: importToastMessage("MDBList", result.sync?.status) },
      });
      void invalidateUserCollectionQueries(queryClient);
    },
    onError: (error) => {
      toast.error("errors.queries.user_collection_imports.import_failed", { error: error });
    },
  });
}

export function useImportUserTMDBCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ImportUserTMDBCollectionRequest) =>
      api<ImportUserCollectionResponse>("/collections/import/tmdb", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (result) => {
      toast.success("feedback.queries.user_collection_imports.reported_message", {
        values: { message: importToastMessage("TMDB collection", result.sync?.status) },
      });
      void invalidateUserCollectionQueries(queryClient);
    },
    onError: (error) => {
      toast.error("errors.queries.user_collection_imports.import_failed", { error: error });
    },
  });
}

export function useImportUserTraktCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ImportUserTraktCollectionRequest) =>
      api<ImportUserCollectionResponse>("/collections/import/trakt", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (result) => {
      toast.success("feedback.queries.user_collection_imports.reported_message", {
        values: { message: importToastMessage("Trakt collection", result.sync?.status) },
      });
      void invalidateUserCollectionQueries(queryClient);
    },
    onError: (error) => {
      toast.error("errors.queries.user_collection_imports.import_failed", { error: error });
    },
  });
}

export function useSyncUserCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (collectionId: string) =>
      api<UserCollectionSyncResult>(`/collections/${collectionId}/sync`, {
        method: "POST",
      }),
    onSuccess: (result, collectionId) => {
      const message = tr(
        result.status === "warning"
          ? "feedback.queries.user_collection_imports.synced_with_warnings_matched_items_count"
          : "feedback.queries.user_collection_imports.synced_matched_items_count",
        { count: result.items_matched },
      );
      toast.success("feedback.queries.user_collection_imports.reported_message", {
        values: { message: message },
      });
      void invalidateUserCollectionQueries(queryClient, collectionId);
    },
    onError: (error) => {
      toast.error("errors.queries.user_collection_imports.sync_failed", { error: error });
    },
  });
}
