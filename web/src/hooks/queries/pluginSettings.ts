import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/api/client";
import type {
  PluginSettingsDetailResponse,
  PluginSettingsListResponse,
  UpdatePluginSettingsRequest,
} from "@/api/types";
import { EMPTY_PLUGIN_CATALOG_TARGETS, usePluginCatalogs } from "@/i18n/pluginCatalogs";
import { settingsKeys } from "./keys";

export function usePluginSettingsList() {
  const query = useQuery({
    queryKey: settingsKeys.plugins(),
    queryFn: () =>
      api<PluginSettingsListResponse>("/settings/plugins").then(
        (data) => data ?? { installations: [] },
      ),
    staleTime: 30_000,
  });
  usePluginCatalogs(query.data?.installations ?? EMPTY_PLUGIN_CATALOG_TARGETS);
  return query;
}

export function usePluginSettingsDetail(installationId: number, enabled = true) {
  const query = useQuery({
    queryKey: settingsKeys.pluginDetail(installationId),
    queryFn: () => api<PluginSettingsDetailResponse>(`/settings/plugins/${installationId}`),
    enabled,
    staleTime: 30_000,
  });
  const catalogTargets = useMemo(
    () => (query.data ? [query.data.installation] : EMPTY_PLUGIN_CATALOG_TARGETS),
    [query.data],
  );
  usePluginCatalogs(catalogTargets);
  return query;
}

export function useUpdatePluginSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdatePluginSettingsRequest }) =>
      api(`/settings/plugins/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.plugins() });
      queryClient.invalidateQueries({ queryKey: settingsKeys.pluginDetail(id) });
    },
  });
}
