import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/i18n/toast";

import { api } from "@/api/client";
import type { GroupSortMode, LibraryCollection, LibraryCollectionGroup } from "@/api/types";
import { adminKeys } from "../keys";
import { tr } from "@/i18n/translate";

const ADMIN_STALE_TIME = 30_000;

// ----- Queries -----

interface GroupListResponse {
  groups: LibraryCollectionGroup[];
  ungrouped_sort_order: number;
}

export function useCollectionGroups(libraryId: number | undefined) {
  return useQuery({
    queryKey:
      libraryId !== undefined
        ? adminKeys.collectionGroups(libraryId)
        : ["admin", "collection-groups-board", "none"],
    queryFn: async () => {
      const res = await api<GroupListResponse>(`/admin/libraries/${libraryId}/collection-groups`);
      return res.groups;
    },
    staleTime: ADMIN_STALE_TIME,
    enabled: typeof libraryId === "number" && libraryId > 0,
  });
}

/**
 * Combined board: groups + their collections (resolved client-side from
 * /admin/collections?library_id=N filtered by group_id) + the ungrouped bucket.
 * The backend currently doesn't return collections nested under groups in the
 * admin list; we fetch both and merge here.
 */
export function useAdminCollectionsBoard(libraryId: number | undefined) {
  return useQuery({
    queryKey:
      libraryId !== undefined
        ? [...adminKeys.collectionGroups(libraryId), "with-collections"]
        : ["admin", "collection-groups-board", "none"],
    queryFn: async () => {
      const [groupsResp, collectionsResp] = await Promise.all([
        api<GroupListResponse>(`/admin/libraries/${libraryId}/collection-groups`),
        api<{ collections: LibraryCollection[] }>(`/admin/collections?library_id=${libraryId}`),
      ]);
      const collections = collectionsResp.collections;
      const groups = groupsResp.groups
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
        .map((g) => ({
          ...g,
          collections: collections
            .filter((c) => c.group_id === g.id)
            .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title)),
        }));
      const ungrouped = collections
        .filter((c) => !c.group_id)
        .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));
      const ungroupedSortOrder: number = groupsResp.ungrouped_sort_order ?? 9999;
      return { groups, ungrouped, ungroupedSortOrder };
    },
    staleTime: ADMIN_STALE_TIME,
    enabled: typeof libraryId === "number" && libraryId > 0,
  });
}

// ----- Mutations -----

interface CreateGroupInput {
  name: string;
  slug?: string;
  default_sort_mode?: GroupSortMode;
}

export function useCreateCollectionGroup(libraryId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGroupInput) =>
      api<LibraryCollectionGroup>(`/admin/libraries/${libraryId}/collection-groups`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: adminKeys.collectionGroups(libraryId),
      });
      toast.success("feedback.queries.admin.collection_groups.group_created");
    },
    onError: (e) =>
      toast.error("errors.queries.admin.collection_groups.failed_to_create_group_message", {
        values: {
          message: tr.error("errors.common.request_failed", e),
        },
      }),
  });
}

interface UpdateGroupInput {
  id: string;
  name?: string;
  slug?: string;
  default_sort_mode?: GroupSortMode;
}

export function useUpdateCollectionGroup(libraryId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateGroupInput) =>
      api<LibraryCollectionGroup>(`/admin/collection-groups/${id}`, {
        method: "PUT",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: adminKeys.collectionGroups(libraryId),
      });
    },
    onError: (e) =>
      toast.error("errors.queries.admin.collection_groups.failed_to_update_group_message", {
        values: {
          message: tr.error("errors.common.request_failed", e),
        },
      }),
  });
}

export function useDeleteCollectionGroup(libraryId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/admin/collection-groups/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: adminKeys.collectionGroups(libraryId),
      });
      toast.success("feedback.queries.admin.collection_groups.group_deleted");
    },
    onError: (e) =>
      toast.error("errors.queries.admin.collection_groups.failed_to_delete_group_message", {
        values: {
          message: tr.error("errors.common.request_failed", e),
        },
      }),
  });
}

export function useReorderCollectionGroups(libraryId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderedIDs: string[]) =>
      api<void>(`/admin/libraries/${libraryId}/collection-groups/reorder`, {
        method: "PUT",
        body: JSON.stringify({ ids: orderedIDs }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: adminKeys.collectionGroups(libraryId),
      });
    },
    onError: (e) =>
      toast.error("errors.queries.admin.collection_groups.failed_to_reorder_groups_message", {
        values: {
          message: tr.error("errors.common.request_failed", e),
        },
      }),
  });
}

interface ReorderCollectionsInput {
  groupID: string; // pass "ungrouped" for the NULL bucket
  orderedIDs: string[];
  moveOmitted?: "ungrouped";
  libraryId?: number; // required when groupID === "ungrouped"
}

export function useReorderCollectionsInGroup(libraryId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      groupID,
      orderedIDs,
      moveOmitted,
      libraryId: libIDArg,
    }: ReorderCollectionsInput) => {
      const params = new URLSearchParams();
      if (moveOmitted) params.set("move_omitted", moveOmitted);
      if (groupID === "ungrouped") {
        const lid = libIDArg ?? libraryId;
        params.set("library_id", String(lid));
      }
      const qs = params.toString() ? `?${params.toString()}` : "";
      return api<void>(`/admin/collection-groups/${groupID}/collections/reorder${qs}`, {
        method: "PUT",
        body: JSON.stringify({ ids: orderedIDs }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: adminKeys.collectionGroups(libraryId),
      });
    },
    onError: (e) =>
      toast.error("errors.queries.admin.collection_groups.failed_to_reorder_collections_message", {
        values: {
          message: tr.error("errors.common.request_failed", e),
        },
      }),
  });
}
