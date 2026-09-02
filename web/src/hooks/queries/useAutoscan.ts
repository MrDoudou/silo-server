import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/i18n/toast";
import { api } from "@/api/client";
import type {
  AutoscanAvailableSourcesResponse,
  AutoscanConnection,
  AutoscanConnectionInput,
  AutoscanConnectionsResponse,
  AutoscanConnectionTestInput,
  AutoscanConnectionTestResult,
  AutoscanEvent,
  AutoscanEventsResponse,
  AutoscanEventStatus,
  AutoscanScan,
  AutoscanScansResponse,
  AutoscanScanStatus,
  AutoscanRewriteSuggestions,
  AutoscanSettings,
  AutoscanSource,
  AutoscanSourceCreateInput,
  AutoscanSourceInput,
  AutoscanSourcesResponse,
  AutoscanStatus,
} from "@/api/types";
import { adminKeys } from "./keys";

const AUTOSCAN_STALE_TIME = 30_000;
const AUTOSCAN_ACTIVITY_REFRESH_MS = 15_000;

// --- Settings ---

export function useAutoscanSettings() {
  return useQuery({
    queryKey: adminKeys.autoscanSettings(),
    queryFn: () => api<AutoscanSettings>("/admin/autoscan/settings"),
    staleTime: AUTOSCAN_STALE_TIME,
  });
}

export function useUpdateAutoscanSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AutoscanSettings) =>
      api<AutoscanSettings>("/admin/autoscan/settings", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success("feedback.queries.use_autoscan.autoscan_settings_saved");
      queryClient.invalidateQueries({ queryKey: adminKeys.autoscanSettings() });
    },
    onError: (err) => {
      toast.error("errors.queries.use_autoscan.failed_to_save_autoscan_settings", { error: err });
    },
  });
}

// --- Connections ---

export function useAutoscanConnections() {
  return useQuery({
    queryKey: adminKeys.autoscanConnections(),
    queryFn: () =>
      api<AutoscanConnectionsResponse>("/admin/autoscan/connections").then(
        (data) => data.connections ?? [],
      ),
    staleTime: AUTOSCAN_STALE_TIME,
  });
}

export function useCreateAutoscanConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AutoscanConnectionInput) =>
      api<AutoscanConnection>("/admin/autoscan/connections", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success("feedback.queries.use_autoscan.autoscan_connection_created");
      queryClient.invalidateQueries({ queryKey: adminKeys.autoscanConnections() });
    },
    onError: (err) => {
      toast.error("errors.queries.use_autoscan.failed_to_create_autoscan_connection", {
        error: err,
      });
    },
  });
}

export function useUpdateAutoscanConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AutoscanConnectionInput }) =>
      api<AutoscanConnection>(`/admin/autoscan/connections/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success("feedback.queries.use_autoscan.autoscan_connection_updated");
      queryClient.invalidateQueries({ queryKey: adminKeys.autoscanConnections() });
    },
    onError: (err) => {
      toast.error("errors.queries.use_autoscan.failed_to_update_autoscan_connection", {
        error: err,
      });
    },
  });
}

export function useDeleteAutoscanConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/admin/autoscan/connections/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      toast.success("feedback.queries.use_autoscan.autoscan_connection_deleted");
      queryClient.invalidateQueries({ queryKey: adminKeys.autoscanConnections() });
      // Sources may have lost their connection binding; invalidate them too.
      queryClient.invalidateQueries({ queryKey: adminKeys.autoscanSources() });
    },
    onError: (err) => {
      toast.error("errors.queries.use_autoscan.failed_to_delete_autoscan_connection", {
        error: err,
      });
    },
  });
}

// --- Sources ---

export function useAutoscanSources() {
  return useQuery({
    queryKey: adminKeys.autoscanSources(),
    queryFn: () =>
      api<AutoscanSourcesResponse>("/admin/autoscan/sources").then((data) => data.sources ?? []),
    staleTime: AUTOSCAN_STALE_TIME,
  });
}

export function useAvailableScanSources() {
  return useQuery({
    queryKey: adminKeys.autoscanScanSourcePlugins(),
    queryFn: () =>
      api<AutoscanAvailableSourcesResponse>("/admin/autoscan/scan-source-plugins").then(
        (data) => data.plugins ?? [],
      ),
    staleTime: AUTOSCAN_STALE_TIME,
  });
}

export function useCreateAutoscanSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AutoscanSourceCreateInput) =>
      api<AutoscanSource>("/admin/autoscan/sources", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success("feedback.queries.use_autoscan.autoscan_source_created");
      queryClient.invalidateQueries({ queryKey: adminKeys.autoscanSources() });
    },
    onError: (err) => {
      toast.error("errors.queries.use_autoscan.failed_to_create_autoscan_source", { error: err });
    },
  });
}

export function useUpdateAutoscanSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AutoscanSourceInput }) =>
      api<AutoscanSource>(`/admin/autoscan/sources/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success("feedback.queries.use_autoscan.autoscan_source_saved");
      queryClient.invalidateQueries({ queryKey: adminKeys.autoscanSources() });
    },
    onError: (err) => {
      toast.error("errors.queries.use_autoscan.failed_to_save_autoscan_source", { error: err });
    },
  });
}

export function useDeleteAutoscanSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/admin/autoscan/sources/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      toast.success("feedback.queries.use_autoscan.autoscan_source_deleted");
      queryClient.invalidateQueries({ queryKey: adminKeys.autoscanSources() });
    },
    onError: (err) => {
      toast.error("errors.queries.use_autoscan.failed_to_delete_autoscan_source", { error: err });
    },
  });
}

// --- Webhook endpoints ---

export function useCreateAutoscanWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<AutoscanSource>(`/admin/autoscan/sources/${encodeURIComponent(id)}/webhook`, {
        method: "POST",
      }),
    onSuccess: () => {
      toast.success("feedback.queries.use_autoscan.webhook_url_created");
      queryClient.invalidateQueries({ queryKey: adminKeys.autoscanSources() });
    },
    onError: (err) => {
      toast.error("errors.queries.use_autoscan.failed_to_create_webhook_url", { error: err });
    },
  });
}

export function useRotateAutoscanWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<AutoscanSource>(`/admin/autoscan/sources/${encodeURIComponent(id)}/webhook/rotate`, {
        method: "POST",
      }),
    onSuccess: () => {
      toast.success(
        "feedback.queries.use_autoscan.webhook_url_rotated_update_sonarr_radarr_with_the_new_url",
      );
      queryClient.invalidateQueries({ queryKey: adminKeys.autoscanSources() });
    },
    onError: (err) => {
      toast.error("errors.queries.use_autoscan.failed_to_rotate_webhook_url", { error: err });
    },
  });
}

export function useDeleteAutoscanWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/admin/autoscan/sources/${encodeURIComponent(id)}/webhook`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      toast.success("feedback.queries.use_autoscan.webhook_url_deleted");
      queryClient.invalidateQueries({ queryKey: adminKeys.autoscanSources() });
    },
    onError: (err) => {
      toast.error("errors.queries.use_autoscan.failed_to_delete_webhook_url", { error: err });
    },
  });
}

/**
 * Test an arr connection. Accepts either an existing connection id, or raw
 * credentials (base_url + api_key_ref) / a request integration id for an
 * unsaved dialog. Returns the result so the caller can render it inline;
 * errors are surfaced via the returned result, not a toast (advisory only).
 */
export function useTestAutoscanConnection() {
  return useMutation({
    mutationFn: (body: AutoscanConnectionTestInput) =>
      api<AutoscanConnectionTestResult>("/admin/autoscan/connections/test", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}

/**
 * Lazily fetch rewrite suggestions for a single source. Triggered on demand
 * (per source) so it is modelled as a mutation rather than a query. Returns
 * the suggestions; the 400 (no bound connection) surfaces as a toast.
 */
export function useAutoscanRewriteSuggestions() {
  return useMutation({
    mutationFn: (id: string) =>
      api<AutoscanRewriteSuggestions>(
        `/admin/autoscan/sources/${encodeURIComponent(id)}/rewrite-suggestions`,
      ),
    onError: (err) =>
      toast.error("errors.queries.use_autoscan.could_not_sync_rewrites_from_the_arr_instance", {
        error: err,
      }),
  });
}

// --- Status ---

export function useAutoscanStatus() {
  return useQuery({
    queryKey: adminKeys.autoscanStatus(),
    queryFn: () => api<AutoscanStatus>("/admin/autoscan/status"),
    staleTime: AUTOSCAN_STALE_TIME,
    refetchInterval: AUTOSCAN_ACTIVITY_REFRESH_MS,
  });
}

/** A single page of history rows plus the total matching count for pagination. */
export interface AutoscanPage<T> {
  rows: T[];
  total: number;
}

export function useAutoscanEvents(params?: {
  sourceId?: string;
  status?: AutoscanEventStatus;
  query?: string;
  limit?: number;
  offset?: number;
  enabled?: boolean;
}) {
  const queryParams = new URLSearchParams();
  if (params?.sourceId) queryParams.set("source_id", params.sourceId);
  if (params?.status) queryParams.set("status", params.status);
  if (params?.query) queryParams.set("q", params.query);
  if (params?.limit != null) queryParams.set("limit", String(params.limit));
  if (params?.offset != null) queryParams.set("offset", String(params.offset));
  const suffix = queryParams.toString();
  const path = suffix ? `/admin/autoscan/events?${suffix}` : "/admin/autoscan/events";
  return useQuery({
    queryKey: adminKeys.autoscanEvents(params ?? {}),
    queryFn: (): Promise<AutoscanPage<AutoscanEvent>> =>
      api<AutoscanEventsResponse>(path).then((data) => ({
        rows: data.events ?? [],
        total: data.total ?? data.events?.length ?? 0,
      })),
    staleTime: AUTOSCAN_ACTIVITY_REFRESH_MS,
    refetchInterval: AUTOSCAN_ACTIVITY_REFRESH_MS,
    // Hold the prior page on screen while the next one loads so paging through
    // history never flashes an empty/loading state.
    placeholderData: keepPreviousData,
    enabled: params?.enabled ?? true,
  });
}

export function useAutoscanScans(params?: {
  status?: AutoscanScanStatus;
  query?: string;
  limit?: number;
  offset?: number;
  enabled?: boolean;
}) {
  const queryParams = new URLSearchParams();
  if (params?.status) queryParams.set("status", params.status);
  if (params?.query) queryParams.set("q", params.query);
  if (params?.limit != null) queryParams.set("limit", String(params.limit));
  if (params?.offset != null) queryParams.set("offset", String(params.offset));
  const suffix = queryParams.toString();
  const path = suffix ? `/admin/autoscan/scans?${suffix}` : "/admin/autoscan/scans";
  return useQuery({
    queryKey: adminKeys.autoscanScans(params ?? {}),
    queryFn: (): Promise<AutoscanPage<AutoscanScan>> =>
      api<AutoscanScansResponse>(path).then((data) => ({
        rows: data.scans ?? [],
        total: data.total ?? data.scans?.length ?? 0,
      })),
    staleTime: AUTOSCAN_ACTIVITY_REFRESH_MS,
    refetchInterval: AUTOSCAN_ACTIVITY_REFRESH_MS,
    placeholderData: keepPreviousData,
    enabled: params?.enabled ?? true,
  });
}

// --- Trigger ---

export function useTriggerAutoscan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ status: string }>("/admin/autoscan/trigger", {
        method: "POST",
      }),
    onSuccess: () => {
      toast.success("feedback.queries.use_autoscan.autoscan_triggered");
      queryClient.invalidateQueries({ queryKey: adminKeys.autoscanStatus() });
      queryClient.invalidateQueries({ queryKey: ["admin", "autoscan", "events"] });
    },
    onError: (err) => {
      toast.error("errors.queries.use_autoscan.failed_to_trigger_autoscan", { error: err });
    },
  });
}
