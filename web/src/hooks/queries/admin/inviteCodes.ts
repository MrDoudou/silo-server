import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type {
  InviteCode,
  CreateInviteCodeRequest,
  UpdateInviteCodeRequest,
  TopUpInviteCodeRequest,
} from "@/api/types";
import { adminKeys } from "../keys";
import { toast } from "@/i18n/toast";

const ADMIN_STALE_TIME = 30_000;

export function useAdminInviteCodes() {
  return useQuery({
    queryKey: adminKeys.inviteCodes(),
    queryFn: () => api<InviteCode[]>("/admin/invite-codes").then((d) => d ?? []),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useCreateInviteCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateInviteCodeRequest) =>
      api<InviteCode>("/admin/invite-codes", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success("feedback.queries.admin.invite_codes.invite_code_created");
      queryClient.invalidateQueries({ queryKey: adminKeys.inviteCodes() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.invite_codes.failed_to_create_invite_code", { error: err });
    },
  });
}

export function useUpdateInviteCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateInviteCodeRequest }) =>
      api(`/admin/invite-codes/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.inviteCodes() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.invite_codes.failed_to_update_invite_code", { error: err });
    },
  });
}

export function useTopUpInviteCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: TopUpInviteCodeRequest }) =>
      api<InviteCode>(`/admin/invite-codes/${id}/top-up`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success("feedback.queries.admin.invite_codes.invite_code_topped_up");
      queryClient.invalidateQueries({ queryKey: adminKeys.inviteCodes() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.invite_codes.failed_to_top_up_invite_code", { error: err });
    },
  });
}

export function useDeleteInviteCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api(`/admin/invite-codes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("feedback.queries.admin.invite_codes.invite_code_deleted");
      queryClient.invalidateQueries({ queryKey: adminKeys.inviteCodes() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.invite_codes.failed_to_delete_invite_code", { error: err });
    },
  });
}
