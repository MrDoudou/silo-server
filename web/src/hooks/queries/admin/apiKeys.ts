import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { AdminAPIKey, AdminCreateAPIKeyRequest } from "@/api/types";
import { adminKeys } from "../keys";
import { toast } from "@/i18n/toast";

const ADMIN_STALE_TIME = 30_000;

export function useAdminApiKeys() {
  return useQuery({
    queryKey: adminKeys.apiKeys(),
    queryFn: () => api<AdminAPIKey[]>("/admin/api-keys").then((d) => d ?? []),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useAdminCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AdminCreateAPIKeyRequest) =>
      api<AdminAPIKey>("/admin/api-keys", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.apiKeys() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.api_keys.failed_to_create_api_key", { error: err });
    },
  });
}

export function useAdminDeleteApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api(`/admin/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("feedback.queries.admin.api_keys.api_key_revoked");
      queryClient.invalidateQueries({ queryKey: adminKeys.apiKeys() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.api_keys.failed_to_revoke_api_key", { error: err });
    },
  });
}

export function useAdminUpdateApiKeyTier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tier }: { id: number; tier: string }) =>
      api(`/admin/api-keys/${id}/tier`, {
        method: "PUT",
        body: JSON.stringify({ tier }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.apiKeys() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.api_keys.failed_to_update_tier", { error: err });
    },
  });
}
