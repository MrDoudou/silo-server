import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type {
  CreateWebhookSyncConnectionRequest,
  CreateWebhookSyncConnectionResponse,
  RotateWebhookSyncWebhookResponse,
  UpdateWebhookSyncConnectionRequest,
  UpdateWebhookSyncProfileMappingsRequest,
  WebhookSyncConnection,
  WebhookSyncEventLog,
  WebhookSyncProfileMappingsResponse,
} from "@/api/types";
import { webhookSyncKeys } from "./keys";
import { toast } from "@/i18n/toast";

export function useWebhookSyncConnections() {
  return useQuery({
    queryKey: webhookSyncKeys.connections(),
    queryFn: () => api<WebhookSyncConnection[]>("/webhook-sync/connections").then((d) => d ?? []),
    staleTime: 15_000,
  });
}

export function useCreateWebhookSyncConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateWebhookSyncConnectionRequest) =>
      api<CreateWebhookSyncConnectionResponse>("/webhook-sync/connections", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (result) => {
      toast.success("feedback.queries.webhook_sync.webhook_connection_created");
      queryClient.invalidateQueries({ queryKey: webhookSyncKeys.connections() });
      queryClient.invalidateQueries({
        queryKey: webhookSyncKeys.profileMappings(result.connection.id),
      });
    },
    onError: (err) => {
      toast.error("errors.queries.webhook_sync.failed_to_create_webhook_connection", {
        error: err,
      });
    },
  });
}

export function useUpdateWebhookSyncConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      connectionId,
      body,
    }: {
      connectionId: string;
      body: UpdateWebhookSyncConnectionRequest;
    }) =>
      api<WebhookSyncConnection>(`/webhook-sync/connections/${connectionId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: (_, variables) => {
      toast.success("feedback.queries.webhook_sync.webhook_connection_updated");
      queryClient.invalidateQueries({ queryKey: webhookSyncKeys.connections() });
      queryClient.invalidateQueries({
        queryKey: webhookSyncKeys.connection(variables.connectionId),
      });
    },
    onError: (err) => {
      toast.error("errors.queries.webhook_sync.failed_to_update_webhook_connection", {
        error: err,
      });
    },
  });
}

export function useDeleteWebhookSyncConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) =>
      api(`/webhook-sync/connections/${connectionId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      toast.success("feedback.queries.webhook_sync.webhook_connection_deleted");
      queryClient.invalidateQueries({ queryKey: webhookSyncKeys.connections() });
    },
    onError: (err) => {
      toast.error("errors.queries.webhook_sync.failed_to_delete_webhook_connection", {
        error: err,
      });
    },
  });
}

export function useRotateWebhookSyncWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) =>
      api<RotateWebhookSyncWebhookResponse>(
        `/webhook-sync/connections/${connectionId}/webhook/rotate`,
        {
          method: "POST",
        },
      ),
    onSuccess: (_, connectionId) => {
      toast.success("feedback.queries.webhook_sync.webhook_url_rotated");
      queryClient.invalidateQueries({ queryKey: webhookSyncKeys.connections() });
      queryClient.invalidateQueries({ queryKey: webhookSyncKeys.connection(connectionId) });
    },
    onError: (err) => {
      toast.error("errors.queries.webhook_sync.failed_to_rotate_webhook_url", { error: err });
    },
  });
}

export function useWebhookSyncProfileMappings(connectionId?: string) {
  return useQuery({
    queryKey: webhookSyncKeys.profileMappings(connectionId),
    queryFn: () =>
      api<WebhookSyncProfileMappingsResponse>(
        `/webhook-sync/connections/${connectionId}/profile-mappings`,
      ).then((d) => ({
        mappings: d?.mappings ?? [],
        discovered_users: d?.discovered_users ?? [],
        account_discovery_available: d?.account_discovery_available ?? false,
      })),
    enabled: !!connectionId,
    staleTime: 10_000,
  });
}

export function useWebhookSyncEvents(connectionId?: string) {
  return useQuery({
    queryKey: webhookSyncKeys.events(connectionId),
    queryFn: () =>
      api<WebhookSyncEventLog[]>(`/webhook-sync/connections/${connectionId}/events?limit=200`).then(
        (d) => d ?? [],
      ),
    enabled: !!connectionId,
    staleTime: 5_000,
    refetchInterval: connectionId ? 15_000 : false,
  });
}

export function useUpdateWebhookSyncProfileMappings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      connectionId,
      body,
    }: {
      connectionId: string;
      body: UpdateWebhookSyncProfileMappingsRequest;
    }) =>
      api(`/webhook-sync/connections/${connectionId}/profile-mappings`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: (_, variables) => {
      toast.success("feedback.queries.webhook_sync.profile_mappings_saved");
      queryClient.invalidateQueries({
        queryKey: webhookSyncKeys.profileMappings(variables.connectionId),
      });
      queryClient.invalidateQueries({ queryKey: webhookSyncKeys.connections() });
    },
    onError: (err) => {
      toast.error("errors.queries.webhook_sync.failed_to_save_profile_mappings", { error: err });
    },
  });
}
