import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { Invitation, CreateInvitationRequest, SendInvitationResponse } from "@/api/types";
import { adminKeys } from "../keys";
import { toast } from "@/i18n/toast";

const ADMIN_STALE_TIME = 30_000;

export function useAdminInvitations() {
  return useQuery({
    queryKey: adminKeys.invitations(),
    queryFn: () => api<Invitation[]>("/admin/invitations").then((d) => d ?? []),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useCreateInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateInvitationRequest) =>
      api<SendInvitationResponse>("/admin/invitations", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.invitations() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.invitations.failed_to_send_invitation", { error: err });
    },
  });
}

export function useResendInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api<SendInvitationResponse>(`/admin/invitations/${id}/resend`, { method: "POST" }),
    onSuccess: (data) => {
      if (data.email_sent) {
        toast.success(
          "feedback.queries.admin.invitations.invitation_resent_the_old_link_no_longer_works",
        );
      }
      queryClient.invalidateQueries({ queryKey: adminKeys.invitations() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.invitations.failed_to_resend_invitation", { error: err });
    },
  });
}

export function useRevokeInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api(`/admin/invitations/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("feedback.queries.admin.invitations.invitation_revoked");
      queryClient.invalidateQueries({ queryKey: adminKeys.invitations() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.invitations.failed_to_revoke_invitation", { error: err });
    },
  });
}
