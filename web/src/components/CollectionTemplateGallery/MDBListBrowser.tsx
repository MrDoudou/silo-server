import { useState } from "react";

import type { MDBListListSummary } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebounce } from "@/hooks/useDebounce";
import { useMDBListSearch, useMDBListTop } from "@/hooks/queries/userCollectionImports";
import { useUILanguage } from "@/i18n/uiText";

import { tr } from "@/i18n/translate";

interface Props {
  onPick: (list: MDBListListSummary, jsonURL: string) => void;
}

export function MDBListBrowser({ onPick }: Props) {
  useUILanguage();
  const [query, setQuery] = useState("");
  const [showTop, setShowTop] = useState(false);

  // 300ms keeps typing responsive while bounding hits against the shared
  // 1000/day MDBList free-tier quota.
  const debouncedQuery = useDebounce(query, 300);
  const search = useMDBListSearch(debouncedQuery, debouncedQuery.length > 0);
  const top = useMDBListTop(showTop);

  const configured = (search.data ?? top.data)?.configured ?? null;

  if (configured === false) {
    return (
      <div className="border-border bg-muted/30 rounded-md border border-dashed px-3 py-2 text-xs">
        <p className="text-muted-foreground">
          {tr(
            "components.collection_template_gallery.mdblist_browser.mdblist_list_search_isn_rsquo_t_available_an_admin_needs",
          )}{" "}
          <span className="font-medium">
            {tr(
              "components.collection_template_gallery.mdblist_browser.settings_subtitles_metadata",
            )}
          </span>
          {tr(
            "components.collection_template_gallery.mdblist_browser.you_can_still_paste_a_list_url_below",
          )}
        </p>
      </div>
    );
  }

  const showingResults = debouncedQuery.length > 0;
  const lists = showingResults ? search.data?.lists : top.data?.lists;
  const isLoading = showingResults ? search.isLoading : showTop && top.isLoading;
  const error = showingResults ? search.error : top.error;

  return (
    <div className="space-y-2">
      <Label htmlFor="mdblist-search">
        {tr("components.collection_template_gallery.mdblist_browser.search_mdblist")}
      </Label>
      <div className="flex gap-2">
        <Input
          id="mdblist-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={tr(
            "components.collection_template_gallery.mdblist_browser.e_g_horror_oscar_winners_netflix",
          )}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setQuery("");
            setShowTop(true);
          }}
        >
          {tr("components.collection_template_gallery.mdblist_browser.top_lists")}
        </Button>
      </div>

      {error ? (
        <p className="text-destructive text-xs">
          {tr.error("errors.collection_template_gallery.mdblist_browser.search_failed", error)}
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-muted-foreground text-xs">
          {tr("components.collection_template_gallery.mdblist_browser.searching")}
        </p>
      ) : lists && lists.length > 0 ? (
        <ul className="border-border divide-border/60 max-h-72 divide-y overflow-y-auto rounded-md border">
          {lists.map((list) => {
            const jsonURL = list.url ? `${list.url}/json` : "";
            return (
              <li key={list.id}>
                <button
                  type="button"
                  onClick={() => onPick(list, jsonURL)}
                  className="hover:bg-muted/60 focus-visible:bg-muted flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm font-medium">{list.name}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {tr("components.collection_template_gallery.mdblist_browser.by")}{" "}
                      {list.user_name} ·{" "}
                      {list.mediatype === "show"
                        ? tr("components.collection_template_gallery.mdblist_browser.tv")
                        : list.mediatype}{" "}
                      · {list.items.toLocaleString()}{" "}
                      {tr("components.collection_template_gallery.mdblist_browser.item")}
                      {list.items === 1
                        ? ""
                        : tr("components.collection_template_gallery.mdblist_browser.s")}
                      {list.likes > 0
                        ? tr("components.collection_template_gallery.mdblist_browser.value", {
                            value: list.likes.toLocaleString(),
                          })
                        : ""}
                    </p>
                    {list.description ? (
                      <p className="text-muted-foreground line-clamp-2 text-xs">
                        {list.description}
                      </p>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : showingResults && search.data ? (
        <p className="text-muted-foreground text-xs">
          {tr(
            "components.collection_template_gallery.mdblist_browser.no_public_lists_matched_ldquo",
          )}
          {debouncedQuery}
          {tr("components.collection_template_gallery.mdblist_browser.rdquo")}
        </p>
      ) : null}
    </div>
  );
}
