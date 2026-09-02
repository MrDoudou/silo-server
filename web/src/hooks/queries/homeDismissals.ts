import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/i18n/toast";

import { api } from "@/api/client";
import {
  invalidateMediaSurfaceQueries,
  removeItemFromHomeSectionCaches,
} from "./mediaSurfaceRefresh";
import { bumpHomeRefreshSignal } from "@/pages/homeSurfaceRefresh";

import { tr } from "@/i18n/translate";

export type HomeDismissalSurface = "continue_watching" | "next_up";

export interface DismissHomeItemVariables {
  itemId: string;
  surface: HomeDismissalSurface;
  mediaType?: string;
  seriesId?: string;
  progressUpdatedAt?: string;
}

function dismissalPath({ itemId, surface }: DismissHomeItemVariables) {
  return `/home/dismissals/${surface}/${encodeURIComponent(itemId)}`;
}

function dismissalBody({ progressUpdatedAt, seriesId, surface }: DismissHomeItemVariables) {
  return surface === "continue_watching"
    ? { progress_updated_at: progressUpdatedAt }
    : { series_id: seriesId };
}

function dismissalSuccessLabel({ mediaType, surface }: DismissHomeItemVariables) {
  if (surface === "next_up") return tr("feedback.queries.home_dismissals.removed_from_next_up");
  if (mediaType === "audiobook")
    return tr("feedback.queries.home_dismissals.removed_from_continue_listening");
  if (mediaType === "ebook")
    return tr("feedback.queries.home_dismissals.removed_from_continue_reading");
  return tr("feedback.queries.home_dismissals.removed_from_continue_watching");
}

export function useDismissHomeItem() {
  const queryClient = useQueryClient();

  const undoMutation = useMutation({
    mutationFn: (variables: DismissHomeItemVariables) =>
      api(dismissalPath(variables), {
        method: "DELETE",
      }),
    onError: (error) => {
      toast.error("errors.queries.home_dismissals.failed_to_undo_removal", { error: error });
    },
    onSuccess: async (_data, variables) => {
      await invalidateMediaSurfaceQueries(queryClient, { itemId: variables.itemId });
      bumpHomeRefreshSignal(queryClient);
    },
  });

  return useMutation({
    mutationFn: (variables: DismissHomeItemVariables) =>
      api(dismissalPath(variables), {
        method: "PUT",
        body: JSON.stringify(dismissalBody(variables)),
      }),
    onError: (error) => {
      toast.error("errors.queries.home_dismissals.failed_to_remove_item", { error: error });
    },
    onSuccess: async (_data, variables) => {
      removeItemFromHomeSectionCaches(queryClient, variables.itemId, variables.surface);
      await invalidateMediaSurfaceQueries(queryClient, { itemId: variables.itemId });
      bumpHomeRefreshSignal(queryClient);
      toast.success("feedback.queries.home_dismissals.reported_message", {
        values: { message: dismissalSuccessLabel(variables) },
        action: {
          label: "hooks.queries.home_dismissals.undo",
          onClick: () => undoMutation.mutate(variables),
        },
      });
    },
  });
}
