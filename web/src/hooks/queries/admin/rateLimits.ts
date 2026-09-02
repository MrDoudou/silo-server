import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { RateLimitConfig, RateLimitUpdateResponse } from "@/api/types";
import { adminKeys } from "../keys";
import { toast } from "@/i18n/toast";

const ADMIN_STALE_TIME = 30_000;

export function useRateLimitConfig() {
  return useQuery({
    queryKey: adminKeys.rateLimitConfig(),
    queryFn: () => api<RateLimitConfig>("/admin/rate-limits/config"),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useUpdateRateLimitConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: RateLimitConfig) =>
      api<RateLimitUpdateResponse>("/admin/rate-limits/config", {
        method: "PUT",
        body: JSON.stringify(config),
      }),
    onSuccess: async (data) => {
      if (data.restart_required) {
        toast.success(
          "feedback.queries.admin.rate_limits.rate_limit_settings_saved_restart_the_server_to_apply_them",
        );
      } else {
        toast.success("feedback.queries.admin.rate_limits.rate_limit_settings_saved");
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminKeys.rateLimitConfig() }),
        queryClient.invalidateQueries({ queryKey: adminKeys.serverStatus() }),
      ]);
    },
    onError: (err) => {
      toast.error("errors.queries.admin.rate_limits.failed_to_save_rate_limit_settings", {
        error: err,
      });
    },
  });
}
