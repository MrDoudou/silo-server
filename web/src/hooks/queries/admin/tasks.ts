import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/i18n/toast";
import { api, ApiClientError } from "@/api/client";
import type { ExecutionResult, TaskInfo, TriggerConfig } from "@/api/types";
import { adminKeys } from "@/hooks/queries/keys";
import { usePageActivity } from "@/hooks/usePageActivity";

export interface MetadataRefreshReasonCount {
  reason: string;
  count: number;
}

export interface MetadataRefreshAttemptBucket {
  label: string;
  count: number;
}

export interface MetadataRefreshDebtSample {
  content_id: string;
  title: string;
  type: string;
  reason_mask: number;
  next_refresh_at: string;
  last_attempt_at?: string | null;
  attempt_count: number;
  last_error: string;
}

export interface MetadataRefreshMetrics {
  total: number;
  due: number;
  leased: number;
  oldest_due_at?: string | null;
  oldest_lease_expires_at?: string | null;
  reason_counts: MetadataRefreshReasonCount[];
  attempt_buckets: MetadataRefreshAttemptBucket[];
  due_samples: MetadataRefreshDebtSample[];
  recent_errors: MetadataRefreshDebtSample[];
}

export function useTasks() {
  return useQuery({
    queryKey: adminKeys.tasks(),
    queryFn: () => api<TaskInfo[]>("/admin/tasks"),
    staleTime: 0,
  });
}

export function useTask(key: string) {
  return useQuery({
    queryKey: adminKeys.task(key),
    queryFn: () => api<TaskInfo>(`/admin/tasks/${encodeURIComponent(key)}`),
    staleTime: 0,
  });
}

export function useTaskHistory(key: string) {
  return useQuery({
    queryKey: adminKeys.taskHistory(key),
    queryFn: () =>
      api<ExecutionResult[]>(`/admin/tasks/${encodeURIComponent(key)}/history?limit=20`),
    staleTime: 0,
  });
}

export function useTaskMetrics(key: string) {
  const pageActivity = usePageActivity();

  return useQuery({
    queryKey: adminKeys.taskMetrics(key),
    queryFn: () => api<MetadataRefreshMetrics>(`/admin/tasks/${encodeURIComponent(key)}/metrics`),
    enabled: key === "refresh_metadata",
    staleTime: 0,
    refetchInterval: pageActivity.canApplyRealtimeUpdates ? 30_000 : false,
  });
}

export function useRunTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      api<{ status: string }>(`/admin/tasks/${encodeURIComponent(key)}/run`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.tasks() });
      queryClient.invalidateQueries({ queryKey: adminKeys.taskMetrics("refresh_metadata") });
      toast.success("feedback.queries.admin.tasks.task_started");
    },
    onError: (error: Error) => {
      if (error instanceof ApiClientError && error.status === 409) {
        toast.error("errors.queries.admin.tasks.task_is_already_running");
      } else {
        toast.error("errors.queries.admin.tasks.failed_to_start_task");
      }
    },
  });
}

export function useCancelTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      api<{ status: string }>(`/admin/tasks/${encodeURIComponent(key)}/cancel`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.tasks() });
      queryClient.invalidateQueries({ queryKey: adminKeys.taskMetrics("refresh_metadata") });
      toast.success("feedback.queries.admin.tasks.cancellation_requested");
    },
    onError: () => {
      toast.error("errors.queries.admin.tasks.failed_to_cancel_task");
    },
  });
}

export function useUpdateTriggers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, triggers }: { key: string; triggers: TriggerConfig[] }) =>
      api<TaskInfo>(`/admin/tasks/${encodeURIComponent(key)}/triggers`, {
        method: "PUT",
        body: JSON.stringify(triggers),
      }),
    onSuccess: (_data, { key }) => {
      queryClient.invalidateQueries({ queryKey: adminKeys.task(key) });
      queryClient.invalidateQueries({ queryKey: adminKeys.tasks() });
      queryClient.invalidateQueries({ queryKey: adminKeys.taskMetrics(key) });
      toast.success("feedback.queries.admin.tasks.schedule_updated");
    },
    onError: () => {
      toast.error("errors.queries.admin.tasks.failed_to_update_schedule");
    },
  });
}
