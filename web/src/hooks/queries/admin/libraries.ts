import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, getAccessToken } from "@/api/client";
import type {
  AdminJob,
  AdminJobsResponse,
  ApiError,
  CatalogSeedExportRequest,
  CatalogSeedImportRequest,
  CatalogSeedImportResponse,
  CatalogSeedImportSourcesResponse,
  CatalogSeedImportSource,
  CreateLibraryRequest,
  DeleteLibraryRootOverrideRequest,
  Library,
  LibraryMetadataMatchQueueActionResponse,
  LibraryMetadataMatchQueueDetail,
  LibraryMetadataMatchQueueStatus,
  LibraryMountCheckResponse,
  LibraryRoot,
  LibraryRootsResponse,
  LibrarySkippedRoot,
  StaleMediaID,
  LibraryProviderChainResponse,
  ScanResponse,
  SetLibraryChainRequest,
  UnmatchedLibraryItemsResponse,
  UpsertLibraryRootOverrideRequest,
  FilesystemBrowseResponse,
} from "@/api/types";
import { adminKeys, libraryKeys } from "../keys";
import { toast } from "@/i18n/toast";

import type { LibraryReorderEntry } from "@/pages/adminLibraryOrder";
import { usePageActivity } from "@/hooks/usePageActivity";
import { tr } from "@/i18n/translate";

const ADMIN_STALE_TIME = 30_000;

class AdminJobRequestError extends Error {
  status?: number;
  unmatchedRoots?: string[];
  activeJobId?: string;
  activeJob?: AdminJob;

  constructor(
    message: string,
    status?: number,
    unmatchedRoots?: string[],
    activeJobId?: string,
    activeJob?: AdminJob,
  ) {
    super(message);
    this.name = "AdminJobRequestError";
    this.status = status;
    this.unmatchedRoots = unmatchedRoots;
    this.activeJobId = activeJobId;
    this.activeJob = activeJob;
  }
}

function buildAdminHeaders() {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function parseAdminJobError(res: Response): Promise<never> {
  let apiErr: ApiError = { error: "unknown", message: res.statusText };
  try {
    apiErr = (await res.json()) as ApiError;
  } catch {
    // Ignore JSON parse failures for non-JSON error bodies.
  }
  throw new AdminJobRequestError(
    apiErr.message || "Admin job request failed",
    res.status,
    apiErr.unmatched_roots,
    apiErr.active_job_id,
    apiErr.active_job,
  );
}

async function createCatalogExportJob(body?: CatalogSeedExportRequest): Promise<AdminJob> {
  const res = await fetch("/api/v1/admin/catalog/export-jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAdminHeaders(),
    },
    body: JSON.stringify(body ?? {}),
  });

  if (!res.ok) {
    await parseAdminJobError(res);
  }

  return (await res.json()) as AdminJob;
}

async function createCatalogImportJob(body: CatalogSeedImportRequest): Promise<AdminJob> {
  const form = new FormData();
  if (body.source === "local_path" && body.local_path) {
    form.append("local_path", body.local_path);
  }
  if (body.source === "export_job" && body.export_job_id) {
    form.append("export_job_id", body.export_job_id);
  }
  if (body.source === "bucket_artifact" && body.artifact_key) {
    form.append("artifact_key", body.artifact_key);
  }
  if (body.source === "remote_url" && body.remote_url) {
    form.append("remote_url", body.remote_url);
  }
  form.append("conflict_mode", body.conflict_mode);
  form.append("path_rewrites", JSON.stringify(body.path_rewrites));

  const res = await fetch("/api/v1/admin/catalog/import-jobs", {
    method: "POST",
    headers: buildAdminHeaders(),
    body: form,
  });

  if (!res.ok) {
    await parseAdminJobError(res);
  }

  return (await res.json()) as AdminJob;
}

async function importCatalogSeed(
  body: CatalogSeedImportRequest,
): Promise<CatalogSeedImportResponse> {
  const form = new FormData();
  if (body.source === "local_path" && body.local_path) {
    form.append("local_path", body.local_path);
  }
  if (body.source === "export_job" && body.export_job_id) {
    form.append("export_job_id", body.export_job_id);
  }
  if (body.source === "bucket_artifact" && body.artifact_key) {
    form.append("artifact_key", body.artifact_key);
  }
  if (body.source === "remote_url" && body.remote_url) {
    form.append("remote_url", body.remote_url);
  }
  form.append("conflict_mode", body.conflict_mode);
  form.append("path_rewrites", JSON.stringify(body.path_rewrites));

  const res = await fetch("/api/v1/admin/catalog/import", {
    method: "POST",
    headers: buildAdminHeaders(),
    body: form,
  });

  if (!res.ok) {
    await parseAdminJobError(res);
  }

  return (await res.json()) as CatalogSeedImportResponse;
}

async function listCatalogImportSources(): Promise<CatalogSeedImportSource[]> {
  return api<CatalogSeedImportSourcesResponse>("/admin/catalog/import-sources").then(
    (data) => data.sources ?? [],
  );
}

async function listLocalImportSources(): Promise<CatalogSeedImportSource[]> {
  return api<CatalogSeedImportSourcesResponse>("/admin/catalog/local-import-sources").then(
    (data) => data.sources ?? [],
  );
}

async function publishCatalogExportJob(id: string): Promise<AdminJob> {
  const res = await fetch(`/api/v1/admin/catalog/export-jobs/${encodeURIComponent(id)}/publish`, {
    method: "POST",
    headers: buildAdminHeaders(),
  });

  if (!res.ok) {
    await parseAdminJobError(res);
  }

  return (await res.json()) as AdminJob;
}

export function useAdminLibraries() {
  return useQuery({
    queryKey: adminKeys.libraries(),
    queryFn: () => api<Library[]>("/libraries").then((d) => d ?? []),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useReorderLibraries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entries: LibraryReorderEntry[]) =>
      api<void>("/libraries/reorder", {
        method: "PUT",
        body: JSON.stringify({ entries }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.libraries() });
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.libraries.failed_to_reorder_libraries", { error: err });
    },
  });
}

export function useSkippedLibraryRoots() {
  return useQuery({
    queryKey: adminKeys.librarySkippedRoots(),
    queryFn: () => api<LibrarySkippedRoot[]>("/libraries/skipped-roots").then((d) => d ?? []),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useLibraryRoots(libraryId?: number, state?: string) {
  return useQuery({
    queryKey: adminKeys.libraryRoots(libraryId, state),
    queryFn: () => {
      if (!libraryId) return Promise.resolve([] as LibraryRoot[]);
      const params = new URLSearchParams({ library_id: String(libraryId) });
      if (state) params.set("state", state);
      return api<LibraryRootsResponse>(`/libraries/roots?${params.toString()}`).then(
        (d) => d.items ?? [],
      );
    },
    enabled: !!libraryId,
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useUpsertLibraryRootOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpsertLibraryRootOverrideRequest) =>
      api<void>("/libraries/roots/override", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: adminKeys.libraryRoots(variables.library_id) });
      toast.success("feedback.queries.admin.libraries.root_override_saved");
    },
    onError: (err) => {
      toast.error("errors.queries.admin.libraries.failed_to_save_root_override", { error: err });
    },
  });
}

export function useDeleteLibraryRootOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: DeleteLibraryRootOverrideRequest) =>
      api<void>("/libraries/roots/override", {
        method: "DELETE",
        body: JSON.stringify(body),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: adminKeys.libraryRoots(variables.library_id) });
      toast.success("feedback.queries.admin.libraries.root_override_removed");
    },
    onError: (err) => {
      toast.error("errors.queries.admin.libraries.failed_to_remove_root_override", { error: err });
    },
  });
}

export function useStaleMediaIDs() {
  return useQuery({
    queryKey: adminKeys.staleMediaIDs(),
    queryFn: () => api<StaleMediaID[]>("/libraries/stale-ids").then((d) => d ?? []),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useRematchStaleMediaID() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (contentId: string) =>
      api(`/libraries/stale-ids/${contentId}/rematch`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.staleMediaIDs() });
      toast.success("feedback.queries.admin.libraries.re_match_started");
    },
    onError: (err) => {
      toast.error("errors.queries.admin.libraries.re_match_failed", { error: err });
    },
  });
}

export function useCreateLibrary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateLibraryRequest) =>
      api<Library>("/libraries", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success("feedback.queries.admin.libraries.library_created");
      queryClient.invalidateQueries({ queryKey: adminKeys.libraries() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.libraries.failed_to_save", { error: err });
    },
  });
}

export function useUpdateLibrary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<CreateLibraryRequest> }) =>
      api(`/libraries/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success("feedback.queries.admin.libraries.library_updated");
      queryClient.invalidateQueries({ queryKey: adminKeys.libraries() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.libraries.failed_to_save", { error: err });
    },
  });
}

export function useDeleteLibrary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<AdminJob>(`/libraries/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("feedback.queries.admin.libraries.library_deletion_started");
      queryClient.invalidateQueries({ queryKey: adminKeys.libraries() });
      queryClient.invalidateQueries({ queryKey: adminKeys.jobs("delete_library") });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.libraries.failed_to_delete", { error: err });
    },
  });
}

export function useScanLibrary() {
  return useMutation({
    mutationFn: (id: number) =>
      api<ScanResponse>("/scan", {
        method: "POST",
        body: JSON.stringify({ library_id: id }),
      }),
    onSuccess: () => {
      toast.success("feedback.queries.admin.libraries.full_ingest_scan_started");
    },
    onError: (err) => {
      toast.error("errors.queries.admin.libraries.scan_failed", { error: err });
    },
  });
}

export function useCheckLibraryMount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api<LibraryMountCheckResponse>(`/libraries/${id}/check-mount`, { method: "POST" }),
    onSuccess: (data) => {
      toast.success("feedback.queries.admin.libraries.reported_message", {
        values: {
          message: data.healthy ? "Mount check passed" : "Mount check found unreachable roots",
        },
      });
      queryClient.invalidateQueries({ queryKey: adminKeys.libraries() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.libraries.mount_check_failed", { error: err });
    },
  });
}

export function useScanAllLibraries() {
  return useMutation({
    mutationFn: () =>
      api<{ status: string }>("/admin/tasks/scan_libraries/run", {
        method: "POST",
      }),
    onSuccess: () => {
      toast.success("feedback.queries.admin.libraries.full_ingest_scan_started_for_all_libraries");
    },
    onError: (err) => {
      toast.error("errors.queries.admin.libraries.scan_failed", { error: err });
    },
  });
}

export function useCancelLibraryScans() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api<{ cancelled: number; library_id: number }>("/scan/cancel", {
        method: "POST",
        body: JSON.stringify({ library_id: id }),
      }),
    onSuccess: () => {
      toast.success("feedback.queries.admin.libraries.scan_cancellation_requested");
      queryClient.invalidateQueries({ queryKey: adminKeys.libraryMatchQueueStatuses() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.libraries.failed_to_cancel_scans", { error: err });
    },
  });
}

export function useLibraryMetadataMatchQueues() {
  const pageActivity = usePageActivity();

  return useQuery({
    queryKey: adminKeys.libraryMatchQueueStatuses(),
    queryFn: () =>
      api<LibraryMetadataMatchQueueStatus[]>("/libraries/metadata-match-queue").then(
        (data) => data ?? [],
      ),
    staleTime: 0,
    refetchInterval: pageActivity.canApplyRealtimeUpdates ? 10_000 : false,
  });
}

const METADATA_MATCH_QUEUE_PAGE_SIZE = 10;

export function useLibraryMetadataMatchQueueDetail(libraryId: number | null, offset = 0) {
  const pageActivity = usePageActivity();

  return useQuery({
    queryKey: [...adminKeys.libraryMatchQueueDetail(libraryId ?? 0), offset],
    queryFn: () =>
      api<LibraryMetadataMatchQueueDetail>(
        `/libraries/${encodeURIComponent(String(libraryId))}/metadata-match-queue?limit=${METADATA_MATCH_QUEUE_PAGE_SIZE}&offset=${offset}`,
      ),
    enabled: libraryId !== null,
    staleTime: 0,
    refetchInterval: pageActivity.canApplyRealtimeUpdates ? 10_000 : false,
  });
}

export function useRetryLibraryMetadataMatchQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api<LibraryMetadataMatchQueueActionResponse>(`/libraries/${id}/metadata-match-queue/retry`, {
        method: "POST",
      }),
    onSuccess: (_data, id) => {
      toast.success("feedback.queries.admin.libraries.metadata_matcher_backlog_queued");
      queryClient.invalidateQueries({ queryKey: adminKeys.libraryMatchQueueStatuses() });
      queryClient.invalidateQueries({ queryKey: adminKeys.libraryMatchQueueDetail(id) });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.libraries.failed_to_rebuild_metadata_matcher_backlog", {
        error: err,
      });
    },
  });
}

export function useCancelLibraryMetadataMatchQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api<LibraryMetadataMatchQueueActionResponse>(`/libraries/${id}/metadata-match-queue/cancel`, {
        method: "POST",
      }),
    onSuccess: (_data, id) => {
      toast.success("feedback.queries.admin.libraries.metadata_matcher_backlog_cancelled");
      queryClient.invalidateQueries({ queryKey: adminKeys.libraryMatchQueueStatuses() });
      queryClient.invalidateQueries({ queryKey: adminKeys.libraryMatchQueueDetail(id) });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.libraries.failed_to_cancel_metadata_matcher_backlog", {
        error: err,
      });
    },
  });
}

export function useLibraryProviders(libraryId: number | null) {
  return useQuery({
    queryKey: adminKeys.libraryProviders(libraryId ?? 0),
    queryFn: () =>
      api<LibraryProviderChainResponse>(`/libraries/${libraryId}/providers`).then(
        (d) => d ?? { levels: {} },
      ),
    enabled: libraryId !== null,
    staleTime: ADMIN_STALE_TIME,
  });
}

// useLibraryProviderDefaults fetches the provider chain the server would seed
// for a new library of the given type — the single source of truth the create
// form renders instead of re-deriving defaults from plugin manifests.
export function useLibraryProviderDefaults(libraryType: string) {
  return useQuery({
    queryKey: adminKeys.libraryProviderDefaults(libraryType),
    queryFn: () =>
      api<LibraryProviderChainResponse>(
        `/libraries/provider-defaults?library_type=${encodeURIComponent(libraryType)}`,
      ).then((d) => d ?? { levels: {} }),
    enabled: libraryType !== "",
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useSetLibraryProviders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: SetLibraryChainRequest }) =>
      api(`/libraries/${id}/providers`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: (_data, variables) => {
      toast.success("feedback.queries.admin.libraries.provider_chain_updated");
      queryClient.invalidateQueries({
        queryKey: adminKeys.libraryProviders(variables.id),
      });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.libraries.failed_to_update_provider_chain", { error: err });
    },
  });
}

export function useUploadLibraryPoster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      const form = new FormData();
      form.append("poster", file);
      const res = await fetch(`/api/v1/libraries/${id}/poster`, {
        method: "PUT",
        headers: buildAdminHeaders(),
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || "Failed to upload poster");
      }
      return (await res.json()) as Library;
    },
    onSuccess: () => {
      toast.success("feedback.queries.admin.libraries.library_poster_updated");
      queryClient.invalidateQueries({ queryKey: adminKeys.libraries() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.libraries.failed_to_upload_poster", { error: err });
    },
  });
}

export function useDeleteLibraryPoster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api(`/libraries/${id}/poster`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("feedback.queries.admin.libraries.library_poster_removed");
      queryClient.invalidateQueries({ queryKey: adminKeys.libraries() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.libraries.failed_to_remove_poster", { error: err });
    },
  });
}

export function useRefreshLibraryMetadata() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/v1/libraries/${id}/refresh-metadata`, {
        method: "POST",
        headers: buildAdminHeaders(),
      });

      if (!res.ok) {
        await parseAdminJobError(res);
      }

      return (await res.json()) as AdminJob;
    },
    onSuccess: () => {
      toast.success("feedback.queries.admin.libraries.metadata_refresh_queued");
      queryClient.invalidateQueries({ queryKey: adminKeys.jobs("library_refresh") });
      queryClient.invalidateQueries({ queryKey: adminKeys.jobs("__all") });
    },
    onError: (err) => {
      if (err instanceof AdminJobRequestError && err.activeJobId) {
        toast.error("errors.common.request_failed", { error: err });
        queryClient.invalidateQueries({ queryKey: adminKeys.jobs("library_refresh") });
        queryClient.invalidateQueries({ queryKey: adminKeys.jobs("__all") });
        return;
      }
      toast.error("errors.queries.admin.libraries.refresh_failed", { error: err });
    },
  });
}

export function useCancelAdminJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<AdminJob>(`/admin/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
    onSuccess: () => {
      toast.success("feedback.queries.admin.libraries.cancellation_requested");
      queryClient.invalidateQueries({ queryKey: adminKeys.jobs("library_refresh") });
      queryClient.invalidateQueries({ queryKey: adminKeys.jobs("__all") });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.libraries.failed_to_cancel_job", { error: err });
    },
  });
}

const UNMATCHED_PAGE_SIZE = 10;

export function useUnmatchedLibraryItems(page = 0, search = "") {
  const offset = page * UNMATCHED_PAGE_SIZE;
  const trimmed = search.trim();
  return useQuery({
    queryKey: adminKeys.unmatchedItems(page, trimmed),
    queryFn: () =>
      api<UnmatchedLibraryItemsResponse>(
        `/libraries/unmatched-items?limit=${UNMATCHED_PAGE_SIZE}&offset=${offset}${
          trimmed ? `&q=${encodeURIComponent(trimmed)}` : ""
        }`,
      ).then((d) => d ?? { items: [], total: 0 }),
    staleTime: ADMIN_STALE_TIME,
    placeholderData: (prev) => prev,
  });
}

export { UNMATCHED_PAGE_SIZE };

export function useConfirmEmptyRootCleanup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api(`/libraries/${id}/confirm-empty-root-cleanup`, { method: "POST" }),
    onSuccess: () => {
      toast.success(
        "feedback.queries.admin.libraries.deletion_confirmed_for_the_next_empty_root_scan",
      );
      queryClient.invalidateQueries({ queryKey: adminKeys.libraries() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.libraries.failed_to_confirm_cleanup", { error: err });
    },
  });
}

export function useCatalogExportJobs(jobType = "catalog_export") {
  return useQuery({
    queryKey: adminKeys.jobs(jobType),
    queryFn: () =>
      api<AdminJobsResponse>(`/admin/jobs?job_type=${encodeURIComponent(jobType)}&limit=10`).then(
        (data) => data.jobs ?? [],
      ),
    staleTime: 0,
  });
}

export function useCatalogImportJobs(jobType = "catalog_import") {
  return useQuery({
    queryKey: adminKeys.jobs(jobType),
    queryFn: () =>
      api<AdminJobsResponse>(`/admin/jobs?job_type=${encodeURIComponent(jobType)}&limit=10`).then(
        (data) => data.jobs ?? [],
      ),
    staleTime: 0,
  });
}

export function useLibraryDeleteJobs(jobType = "delete_library") {
  return useQuery({
    queryKey: adminKeys.jobs(jobType),
    queryFn: () =>
      api<AdminJobsResponse>(`/admin/jobs?job_type=${encodeURIComponent(jobType)}&limit=20`).then(
        (data) => data.jobs ?? [],
      ),
    staleTime: 0,
  });
}

export function useLibraryRefreshJobs(jobType = "library_refresh") {
  return useQuery({
    queryKey: adminKeys.jobs(jobType),
    queryFn: () =>
      api<AdminJobsResponse>(`/admin/jobs?job_type=${encodeURIComponent(jobType)}&limit=50`).then(
        (data) => data.jobs ?? [],
      ),
    staleTime: 0,
  });
}

export function useAllAdminJobs(limit = 30) {
  return useQuery({
    queryKey: adminKeys.jobs("__all"),
    queryFn: () =>
      api<AdminJobsResponse>(`/admin/jobs?limit=${limit}`).then((data) => data.jobs ?? []),
    staleTime: 0,
  });
}

export function useCatalogImportSources() {
  return useQuery({
    queryKey: adminKeys.catalogImportSources(),
    queryFn: listCatalogImportSources,
    staleTime: 0,
    refetchInterval: 30_000,
  });
}

export function useLocalImportSources() {
  return useQuery({
    queryKey: adminKeys.localImportSources(),
    queryFn: listLocalImportSources,
    staleTime: 0,
    refetchInterval: 30_000,
  });
}

export function useCreateCatalogExportJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: CatalogSeedExportRequest) => createCatalogExportJob(body),
    onSuccess: () => {
      toast.success("feedback.queries.admin.libraries.catalog_export_queued");
      queryClient.invalidateQueries({ queryKey: adminKeys.jobs("catalog_export") });
    },
    onError: (err) => {
      if (err instanceof AdminJobRequestError && err.activeJobId) {
        toast.error("errors.common.request_failed", { error: err });
        queryClient.invalidateQueries({ queryKey: adminKeys.jobs("catalog_export") });
        return;
      }
      toast.error("errors.queries.admin.libraries.failed_to_queue_catalog_export", { error: err });
    },
  });
}

export function usePublishCatalogExportJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => publishCatalogExportJob(id),
    onSuccess: () => {
      toast.success("feedback.queries.admin.libraries.catalog_export_published");
      queryClient.invalidateQueries({ queryKey: adminKeys.jobs("catalog_export") });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.libraries.failed_to_publish_catalog_export", {
        error: err,
      });
    },
  });
}

export function useImportCatalogSeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CatalogSeedImportRequest) => {
      try {
        const job = await createCatalogImportJob(body);
        return { mode: "job" as const, job };
      } catch (err) {
        if (
          err instanceof AdminJobRequestError &&
          (err.status === 404 ||
            (body.source !== "export_job" && err.message === "Job repository is not configured"))
        ) {
          const result = await importCatalogSeed(body);
          return { mode: "sync" as const, result };
        }
        throw err;
      }
    },
    onSuccess: (payload) => {
      if (payload.mode === "job") {
        toast.success("feedback.queries.admin.libraries.catalog_import_queued");
        queryClient.invalidateQueries({ queryKey: adminKeys.jobs("catalog_import") });
        return;
      }
      toast.success("feedback.queries.admin.libraries.catalog_imported_items_items_files_files", {
        values: {
          items: payload.result.items_created,
          files: payload.result.files_created,
        },
      });
      queryClient.invalidateQueries({ queryKey: adminKeys.libraries() });
    },
    onError: (err) => {
      if (err instanceof AdminJobRequestError && err.unmatchedRoots?.length) {
        toast.error("errors.queries.admin.libraries.message_roots_suffix", {
          values: {
            message: tr.remote({ message: err.message }),
            roots: err.unmatchedRoots.slice(0, 2).join(", "),
            suffix: err.unmatchedRoots.length > 2 ? "…" : "",
          },
        });
        return;
      }
      toast.error("errors.queries.admin.libraries.failed_to_import_catalog_seed", { error: err });
    },
  });
}

export function useFilesystemBrowse(path: string) {
  return useFilesystemBrowseWhen(path, true);
}

export function useFilesystemBrowseWhen(path: string, enabled: boolean) {
  return useQuery({
    queryKey: adminKeys.filesystemBrowse(path),
    queryFn: () => fetchFilesystemBrowse(path),
    staleTime: 60_000,
    enabled: enabled && path.trim().length > 0,
  });
}

export function fetchFilesystemBrowse(path: string) {
  return api<FilesystemBrowseResponse>(`/admin/filesystem/browse?path=${encodeURIComponent(path)}`);
}
