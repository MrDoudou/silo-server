import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/i18n/toast";

import { api } from "@/api/client";
import type { AccessGroup, AccessGroupInput } from "@/api/types";
import { adminKeys } from "../keys";

const ADMIN_STALE_TIME = 30_000;

export function useAccessGroups() {
  return useQuery({
    queryKey: adminKeys.accessGroups(),
    queryFn: () => api<AccessGroup[]>("/admin/access-groups").then((data) => data ?? []),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function useCreateAccessGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AccessGroupInput) =>
      api<AccessGroup>("/admin/access-groups", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success("feedback.queries.admin.access_groups.access_group_created");
      queryClient.invalidateQueries({ queryKey: adminKeys.accessGroups() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.access_groups.failed_to_create_access_group", {
        error: err,
      });
    },
  });
}

export function useUpdateAccessGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: AccessGroupInput }) =>
      api<AccessGroup>(`/admin/access-groups/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: (_data, variables) => {
      toast.success("feedback.queries.admin.access_groups.access_group_updated");
      queryClient.invalidateQueries({ queryKey: adminKeys.accessGroups() });
      queryClient.invalidateQueries({ queryKey: adminKeys.accessGroup(variables.id) });
      // User views render group-derived data (effective_policy, inherit
      // hints), so a group change must refresh them too.
      queryClient.invalidateQueries({ queryKey: adminKeys.users() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.access_groups.failed_to_update_access_group", {
        error: err,
      });
    },
  });
}

export function useDeleteAccessGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api(`/admin/access-groups/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      toast.success("feedback.queries.admin.access_groups.access_group_deleted");
      queryClient.invalidateQueries({ queryKey: adminKeys.accessGroups() });
      queryClient.invalidateQueries({ queryKey: adminKeys.accessGroup(id) });
      queryClient.invalidateQueries({ queryKey: adminKeys.users() });
    },
    onError: (err) => {
      toast.error("errors.queries.admin.access_groups.failed_to_delete_access_group", {
        error: err,
      });
    },
  });
}
