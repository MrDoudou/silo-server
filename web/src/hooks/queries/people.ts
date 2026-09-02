import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/i18n/toast";

import { adminRefreshPerson, adminUpdatePerson, refreshPerson, searchPeople } from "@/api/client";
import type { Person, PersonRefreshQueuedResponse, UpdatePersonRequest } from "@/api/types";

import { personKeys } from "./keys";

export function usePersonSearch(query: string, limit = 20, enabled = true) {
  const normalizedQuery = query.trim();

  return useQuery({
    queryKey: personKeys.search(normalizedQuery, limit),
    queryFn: () => searchPeople(normalizedQuery, limit),
    enabled: enabled && normalizedQuery.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

type RefreshPersonResult =
  | {
      mode: "admin";
      person: Person;
    }
  | {
      mode: "queued";
      response: PersonRefreshQueuedResponse;
    };

export function useRefreshPerson(id: string | undefined, isAdmin: boolean) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<RefreshPersonResult> => {
      if (!id) {
        throw new Error("Person ID is required");
      }

      if (isAdmin) {
        return {
          mode: "admin",
          person: await adminRefreshPerson(id),
        };
      }

      return {
        mode: "queued",
        response: await refreshPerson(id),
      };
    },
    onSuccess: async (result) => {
      if (result.mode === "admin" && id) {
        queryClient.setQueryData(personKeys.detail(id), result.person);
        await queryClient.invalidateQueries({ queryKey: personKeys.detail(id) });
        toast.success("feedback.queries.people.person_metadata_refreshed");
        return;
      }

      toast.success("feedback.queries.people.person_refresh_queued");
    },
    onError: (err) => {
      toast.error("errors.queries.people.refresh_failed", { error: err });
    },
  });
}

export function useUpdatePersonMetadata(id: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdatePersonRequest) => {
      if (!id) {
        throw new Error("Person ID is required");
      }

      return adminUpdatePerson(id, data);
    },
    onSuccess: async (updatedPerson) => {
      if (!id) {
        return;
      }

      queryClient.setQueryData(personKeys.detail(id), updatedPerson);
      await queryClient.invalidateQueries({ queryKey: personKeys.detail(id) });
      toast.success("feedback.queries.people.person_metadata_saved");
    },
    onError: (err) => {
      toast.error("errors.queries.people.failed_to_save_metadata", { error: err });
    },
  });
}
