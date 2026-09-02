import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type {
  CreateHistoryImportSourceRequest,
  HistoryImportExternalUser,
  HistoryImportSource,
  SetHistoryImportAdminTokenRequest,
  UpdateHistoryImportSourceRequest,
} from "@/api/types";
import { adminKeys, historyImportKeys } from "../keys";
import { toast } from "@/i18n/toast";

export function useAdminHistoryImportSources() {
  return useQuery({
    queryKey: adminKeys.historyImportSources(),
    queryFn: () => api<HistoryImportSource[]>("/admin/history-import-sources").then((d) => d ?? []),
  });
}

export function useCreateAdminHistoryImportSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateHistoryImportSourceRequest) =>
      api<HistoryImportSource>("/admin/history-import-sources", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success("feedback.queries.admin.history_import_sources.saved_server_created");
      queryClient.invalidateQueries({ queryKey: adminKeys.historyImportSources() });
      queryClient.invalidateQueries({ queryKey: historyImportKeys.sources() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.history_import_sources.failed_to_create_saved_server", {
        error: err,
      });
    },
  });
}

export function useUpdateAdminHistoryImportSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateHistoryImportSourceRequest }) =>
      api<HistoryImportSource>(`/admin/history-import-sources/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success("feedback.queries.admin.history_import_sources.saved_server_updated");
      queryClient.invalidateQueries({ queryKey: adminKeys.historyImportSources() });
      queryClient.invalidateQueries({ queryKey: historyImportKeys.sources() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.history_import_sources.failed_to_update_saved_server", {
        error: err,
      });
    },
  });
}

export function useDeleteAdminHistoryImportSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api(`/admin/history-import-sources/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("feedback.queries.admin.history_import_sources.saved_server_deleted");
      queryClient.invalidateQueries({ queryKey: adminKeys.historyImportSources() });
      queryClient.invalidateQueries({ queryKey: historyImportKeys.sources() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.history_import_sources.failed_to_delete_saved_server", {
        error: err,
      });
    },
  });
}

export function useSetAdminSourceToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: SetHistoryImportAdminTokenRequest }) =>
      api(`/admin/history-imports/sources/${id}/token`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success("feedback.queries.admin.history_import_sources.admin_token_saved");
      queryClient.invalidateQueries({ queryKey: adminKeys.historyImportSources() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.history_import_sources.failed_to_save_admin_token", {
        error: err,
      });
    },
  });
}

export function useClearAdminSourceToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api(`/admin/history-imports/sources/${id}/token`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("feedback.queries.admin.history_import_sources.admin_token_removed");
      queryClient.invalidateQueries({ queryKey: adminKeys.historyImportSources() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.history_import_sources.failed_to_remove_admin_token", {
        error: err,
      });
    },
  });
}

export function useDiscoverExternalUsers(sourceId: number | undefined) {
  return useQuery({
    queryKey: adminKeys.historyImportExternalUsers(sourceId ?? 0),
    queryFn: () =>
      api<HistoryImportExternalUser[]>(`/admin/history-imports/sources/${sourceId}/users`).then(
        (d) => d ?? [],
      ),
    enabled: false, // manually triggered
    retry: false,
  });
}

export function usePlexLogin() {
  return useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      api<{ token: string }>("/admin/history-imports/plex/login", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onError: (err) => {
      toast.error("errors.queries.admin.history_import_sources.plex_login_failed", { error: err });
    },
  });
}
