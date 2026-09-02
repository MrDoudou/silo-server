import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { BrowseItem, HistoryRemovalTargetRequest, RemoveHistoryRequest } from "@/api/types";
import { toast } from "@/i18n/toast";
import { historyKeys } from "./keys";
import { invalidateMediaSurfaceQueries } from "./mediaSurfaceRefresh";
import { bumpHomeRefreshSignal } from "@/pages/homeSurfaceRefresh";

export function useHistory() {
  return useQuery({
    queryKey: historyKeys.list(),
    queryFn: () => api<{ items: BrowseItem[] }>("/history").then((d) => d.items ?? []),
  });
}

export function useRemoveHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (targets: HistoryRemovalTargetRequest[]) =>
      api<void>("/history/remove", {
        method: "POST",
        body: JSON.stringify({ targets } satisfies RemoveHistoryRequest),
      }),
    onSuccess: async (_data, targets) => {
      toast.success("feedback.queries.history.reported_message", {
        values: {
          message:
            targets.length === 1
              ? "Removed watch data"
              : `Removed watch data for ${targets.length} items`,
        },
      });
      await invalidateMediaSurfaceQueries(queryClient);
      bumpHomeRefreshSignal(queryClient);
    },
    onError: (err) => {
      toast.error("errors.queries.history.failed_to_remove_history", { error: err });
    },
  });
}
