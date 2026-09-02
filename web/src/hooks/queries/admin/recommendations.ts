import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { adminKeys } from "../keys";
import { toast } from "@/i18n/toast";

interface JobStatus {
  running: boolean;
  count: number;
  total?: number;
}

interface RecommendationsStatusResponse {
  embeddings: JobStatus;
  taste_profiles: JobStatus;
  cowatch: JobStatus;
  recommendations: JobStatus;
}

export function useRecommendationsStatus() {
  return useQuery({
    queryKey: adminKeys.recommendationsStatus(),
    queryFn: () => api<RecommendationsStatusResponse>("/admin/recommendations/status"),
    refetchInterval: 5000,
  });
}

export function useTriggerEmbeddings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api("/admin/recommendations/trigger/embeddings", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.recommendationsStatus() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.recommendations.failed_to_trigger_embeddings", {
        error: err,
      });
    },
  });
}

export function useTriggerTasteProfiles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api("/admin/recommendations/trigger/taste-profiles", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.recommendationsStatus() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.recommendations.failed_to_trigger_taste_profiles", {
        error: err,
      });
    },
  });
}

export function useTriggerCowatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api("/admin/recommendations/trigger/cowatch", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.recommendationsStatus() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.recommendations.failed_to_trigger_co_watch_computation", {
        error: err,
      });
    },
  });
}

export function useTriggerRecommendations() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api("/admin/recommendations/trigger/recommendations", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.recommendationsStatus() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.recommendations.failed_to_trigger_recommendations", {
        error: err,
      });
    },
  });
}
