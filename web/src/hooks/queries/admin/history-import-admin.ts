import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type {
  AdminHistoryImportBulkRunResult,
  CreateHistoryImportMappingRequest,
  HistoryImportRun,
  HistoryImportUserMapping,
  UpdateHistoryImportMappingRequest,
} from "@/api/types";
import { adminKeys } from "../keys";
import { toast } from "@/i18n/toast";

// --- Mappings ---

export function useAdminHistoryImportMappings(
  sourceId: number | undefined,
  hasActiveRuns?: boolean,
) {
  return useQuery({
    queryKey: adminKeys.historyImportMappings(sourceId),
    queryFn: () =>
      api<HistoryImportUserMapping[]>(`/admin/history-imports/mappings?source_id=${sourceId}`).then(
        (d) => d ?? [],
      ),
    enabled: sourceId != null && sourceId > 0,
    staleTime: hasActiveRuns ? 5_000 : 30_000,
  });
}

export function useCreateAdminMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateHistoryImportMappingRequest) =>
      api<HistoryImportUserMapping>("/admin/history-imports/mappings", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (_data, variables) => {
      toast.success("feedback.queries.admin.history_import_admin.user_mapping_created");
      queryClient.invalidateQueries({
        queryKey: adminKeys.historyImportMappings(variables.source_id),
      });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.history_import_admin.failed_to_create_mapping", {
        error: err,
      });
    },
  });
}

export function useUpdateAdminMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateHistoryImportMappingRequest }) =>
      api<HistoryImportUserMapping>(`/admin/history-imports/mappings/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success("feedback.queries.admin.history_import_admin.mapping_updated");
      queryClient.invalidateQueries({ queryKey: ["admin", "historyImportMappings"] });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.history_import_admin.failed_to_update_mapping", {
        error: err,
      });
    },
  });
}

export function useDeleteAdminMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api(`/admin/history-imports/mappings/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("feedback.queries.admin.history_import_admin.mapping_deleted");
      queryClient.invalidateQueries({ queryKey: ["admin", "historyImportMappings"] });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.history_import_admin.failed_to_delete_mapping", {
        error: err,
      });
    },
  });
}

// --- Runs ---

export function useCreateAdminRunForMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mappingId: number) =>
      api<HistoryImportRun>(`/admin/history-imports/mappings/${mappingId}/run`, {
        method: "POST",
      }),
    onSuccess: () => {
      toast.success("feedback.queries.admin.history_import_admin.import_started");
      queryClient.invalidateQueries({ queryKey: ["admin", "historyImportAdminRuns"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "historyImportMappings"] });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.history_import_admin.failed_to_start_import", {
        error: err,
      });
    },
  });
}

export function useAdminBulkRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: number) =>
      api<AdminHistoryImportBulkRunResult>(`/admin/history-imports/sources/${sourceId}/bulk-run`, {
        method: "POST",
      }),
    onSuccess: (data) => {
      const count = data?.runs?.length ?? 0;
      toast.success("feedback.queries.admin.history_import_admin.imports_started_count", {
        values: { count },
      });
      queryClient.invalidateQueries({ queryKey: ["admin", "historyImportAdminRuns"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "historyImportMappings"] });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.history_import_admin.failed_to_start_bulk_import", {
        error: err,
      });
    },
  });
}

export function useAdminHistoryImportRuns(sourceId?: number) {
  const params = sourceId != null ? { source_id: sourceId } : {};
  const url =
    sourceId != null
      ? `/admin/history-imports/runs?source_id=${sourceId}`
      : `/admin/history-imports/runs`;
  return useQuery({
    queryKey: adminKeys.historyImportAdminRuns(params),
    queryFn: () => api<HistoryImportRun[]>(url).then((d) => d ?? []),
    staleTime: 5_000,
  });
}

export function useAdminHistoryImportRun(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.historyImportAdminRun(id),
    queryFn: () => api<HistoryImportRun>(`/admin/history-imports/runs/${id}`),
    enabled: id != null,
  });
}

export function useCancelAdminRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) =>
      api(`/admin/history-imports/runs/${runId}/cancel`, { method: "POST" }),
    onSuccess: () => {
      toast.success("feedback.queries.admin.history_import_admin.run_cancelled");
      queryClient.invalidateQueries({ queryKey: ["admin", "historyImportAdminRuns"] });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.history_import_admin.failed_to_cancel_run", { error: err });
    },
  });
}
