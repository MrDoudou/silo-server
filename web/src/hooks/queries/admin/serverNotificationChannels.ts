import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type {
  NotificationWebhookTestResult,
  ServerNotificationChannel,
  ServerNotificationChannelInput,
} from "@/api/types";
import { adminKeys } from "../keys";
import { toast } from "@/i18n/toast";

export function useServerNotificationChannels() {
  return useQuery({
    queryKey: adminKeys.serverNotificationChannels(),
    queryFn: () =>
      api<{ channels: ServerNotificationChannel[] }>("/admin/notifications/server-channels").then(
        (d) => d.channels ?? [],
      ),
  });
}

export function useCreateServerNotificationChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ServerNotificationChannelInput) =>
      api<ServerNotificationChannel>("/admin/notifications/server-channels", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.serverNotificationChannels() });
    },
  });
}

export function useUpdateServerNotificationChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: ServerNotificationChannelInput & { id: string }) =>
      api<ServerNotificationChannel>(`/admin/notifications/server-channels/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.serverNotificationChannels() });
    },
    onError: (error) => {
      toast.error("errors.queries.admin.server_notification_channels.failed_to_update_channel", {
        error: error,
      });
    },
  });
}

export function useDeleteServerNotificationChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/admin/notifications/server-channels/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("feedback.queries.admin.server_notification_channels.channel_deleted");
      void queryClient.invalidateQueries({ queryKey: adminKeys.serverNotificationChannels() });
    },
    onError: () => {
      toast.error("errors.queries.admin.server_notification_channels.failed_to_delete_channel");
    },
  });
}

export function useTestServerNotificationChannel() {
  return useMutation({
    mutationFn: (id: string) =>
      api<NotificationWebhookTestResult>(`/admin/notifications/server-channels/${id}/test`, {
        method: "POST",
      }),
  });
}

export function useRotateServerNotificationChannelSecret() {
  return useMutation({
    mutationFn: (id: string) =>
      api<{ signing_secret: string }>(`/admin/notifications/server-channels/${id}/rotate-secret`, {
        method: "POST",
      }),
    onError: (error) => {
      toast.error(
        "errors.queries.admin.server_notification_channels.failed_to_rotate_signing_secret",
        { error: error },
      );
    },
  });
}
