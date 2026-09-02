import { useState, useCallback, useMemo, useRef } from "react";
import { Copy, Folder, Plus, Search, X } from "lucide-react";
import { toast } from "@/i18n/toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { FileVersion, ItemDetail, ItemMatchSearchRequest, MatchCandidate } from "@/api/types";
import MediaLocations from "@/components/MediaLocations";
import { useSearchItemMatchCandidates, useApplyItemMatch } from "@/hooks/queries/items";
import { useCatalogItemDetail } from "@/hooks/queries/catalogRead";
import { cn } from "@/lib/utils";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

type MatchableItem = Pick<
  ItemDetail,
  "content_id" | "title" | "year" | "series_id" | "season_number"
> & {
  type: string;
  library_id?: number;
  versions?: FileVersion[];
  folder_paths?: string[];
};

type ProviderIDInput = {
  id: number;
  provider: string;
  value: string;
};

interface MatchItemDialogProps {
  item: MatchableItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function isVideoMatchType(type: string): boolean {
  switch (type.trim().toLowerCase()) {
    case "movie":
    case "movies":
    case "series":
    case "show":
    case "shows":
    case "tv":
    case "season":
    case "seasons":
    case "episode":
    case "episodes":
      return true;
    default:
      return false;
  }
}

export default function MatchItemDialog({ item, open, onOpenChange }: MatchItemDialogProps) {
  useUILanguage();
  const [title, setTitle] = useState(item.title);
  const [year, setYear] = useState(item.year ? String(item.year) : "");
  const [imdbId, setImdbId] = useState("");
  const [tmdbId, setTmdbId] = useState("");
  const [tvdbId, setTvdbId] = useState("");
  const [providerIdInputs, setProviderIdInputs] = useState<ProviderIDInput[]>([
    { id: 0, provider: "", value: "" },
  ]);
  const nextProviderIdInputId = useRef(1);
  const [selectedCandidate, setSelectedCandidate] = useState<MatchCandidate | null>(null);
  const isSeries = item.type === "series";
  const showVideoExternalIds = isVideoMatchType(item.type);
  const needsItemDetail = open && item.versions === undefined;
  const { data: enrichedItem, isLoading: enrichedItemLoading } = useCatalogItemDetail(
    needsItemDetail ? item.content_id : undefined,
    needsItemDetail ? item.library_id : undefined,
  );

  const searchMutation = useSearchItemMatchCandidates(item.content_id);
  const applyMutation = useApplyItemMatch();

  const candidates = searchMutation.data?.candidates ?? [];
  const effectiveItem = needsItemDetail ? (enrichedItem ?? item) : item;
  const genericProviderIds = useMemo(() => {
    if (showVideoExternalIds) return {};

    return providerIdInputs.reduce<Record<string, string>>((acc, entry) => {
      const provider = entry.provider.trim().toLowerCase();
      const value = entry.value.trim();
      if (provider && value) {
        acc[provider] = value;
      }
      return acc;
    }, {});
  }, [providerIdInputs, showVideoExternalIds]);

  const handleSearch = useCallback(() => {
    setSelectedCandidate(null);
    const normalizedYear = year.trim();
    const parsedYear = normalizedYear === "" ? undefined : Number.parseInt(normalizedYear, 10);
    const request: ItemMatchSearchRequest = {
      title: title || undefined,
      year: parsedYear !== undefined && Number.isFinite(parsedYear) ? parsedYear : undefined,
      library_id: item.library_id,
    };

    if (showVideoExternalIds) {
      request.imdb_id = imdbId || undefined;
      request.tmdb_id = tmdbId || undefined;
      request.tvdb_id = tvdbId || undefined;
    } else if (Object.keys(genericProviderIds).length > 0) {
      request.provider_ids = genericProviderIds;
    }

    searchMutation.mutate(request);
  }, [
    title,
    year,
    item.library_id,
    showVideoExternalIds,
    imdbId,
    tmdbId,
    tvdbId,
    genericProviderIds,
    searchMutation,
  ]);

  const updateProviderIdInput = useCallback(
    (index: number, field: keyof ProviderIDInput, value: string) => {
      setProviderIdInputs((current) =>
        current.map((entry, entryIndex) =>
          entryIndex === index ? { ...entry, [field]: value } : entry,
        ),
      );
    },
    [],
  );

  const addProviderIdInput = useCallback(() => {
    const id = nextProviderIdInputId.current;
    nextProviderIdInputId.current += 1;
    setProviderIdInputs((current) => [...current, { id, provider: "", value: "" }]);
  }, []);

  const removeProviderIdInput = useCallback((index: number) => {
    setProviderIdInputs((current) => {
      const next = current.filter((_, entryIndex) => entryIndex !== index);
      return next.length > 0 ? next : [{ id: 0, provider: "", value: "" }];
    });
  }, []);

  const handleApply = useCallback(() => {
    if (!selectedCandidate) return;
    applyMutation.mutate(
      { item, providerIds: selectedCandidate.provider_ids },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      },
    );
  }, [selectedCandidate, applyMutation, item, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{tr("components.match_item_dialog.match_item")}</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
          {/* Current item summary */}
          <div className="bg-muted/50 shrink-0 rounded-lg px-3 py-2 text-sm">
            <span className="font-medium">{item.title}</span>
            {item.year ? <span className="text-muted-foreground ml-2">({item.year})</span> : null}
            <Badge variant="secondary" className="ml-2 text-[10px]">
              {item.type}
            </Badge>
          </div>

          {(enrichedItemLoading ||
            (isSeries
              ? effectiveItem.folder_paths !== undefined
              : effectiveItem.versions !== undefined)) &&
            (enrichedItemLoading ? (
              <div className="text-muted-foreground bg-muted/30 shrink-0 rounded-lg border px-3 py-2 text-sm">
                {tr("components.match_item_dialog.loading_local_media")}
              </div>
            ) : isSeries ? (
              <FolderPathsList paths={effectiveItem.folder_paths ?? []} />
            ) : (
              <MediaLocations
                title={tr("components.match_item_dialog.local_media")}
                versions={effectiveItem.versions ?? []}
                className="shrink-0"
                compact
                emptyMessage={tr(
                  "components.match_item_dialog.no_file_paths_are_available_for_this_item",
                )}
              />
            ))}

          {/* Search inputs */}
          <div className="grid shrink-0 grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="match-title">{tr("components.match_item_dialog.title")}</Label>
              <Input
                id="match-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={tr("components.match_item_dialog.title")}
              />
            </div>
            <div>
              <Label htmlFor="match-year">{tr("components.match_item_dialog.year")}</Label>
              <Input
                id="match-year"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder={tr("components.match_item_dialog.year")}
                type="number"
              />
            </div>
            {showVideoExternalIds ? (
              <>
                <div>
                  <Label htmlFor="match-imdb">{tr("components.match_item_dialog.imdb_id")}</Label>
                  <Input
                    id="match-imdb"
                    value={imdbId}
                    onChange={(e) => setImdbId(e.target.value)}
                    placeholder={tr("components.match_item_dialog.tt1234567")}
                  />
                </div>
                <div>
                  <Label htmlFor="match-tmdb">{tr("components.match_item_dialog.tmdb_id")}</Label>
                  <Input
                    id="match-tmdb"
                    value={tmdbId}
                    onChange={(e) => setTmdbId(e.target.value)}
                    placeholder={tr("components.match_item_dialog.value_12345")}
                  />
                </div>
                <div>
                  <Label htmlFor="match-tvdb">{tr("components.match_item_dialog.tvdb_id")}</Label>
                  <Input
                    id="match-tvdb"
                    value={tvdbId}
                    onChange={(e) => setTvdbId(e.target.value)}
                    placeholder={tr("components.match_item_dialog.value_12345")}
                  />
                </div>
              </>
            ) : (
              <div className="col-span-2 space-y-2">
                <Label>{tr("components.match_item_dialog.provider_ids")}</Label>
                {providerIdInputs.map((entry, index) => (
                  <div
                    key={entry.id}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_2rem] gap-2"
                  >
                    <Input
                      value={entry.provider}
                      onChange={(e) => updateProviderIdInput(index, "provider", e.target.value)}
                      placeholder={tr("components.match_item_dialog.isbn")}
                      aria-label={tr("components.match_item_dialog.provider")}
                    />
                    <Input
                      value={entry.value}
                      onChange={(e) => updateProviderIdInput(index, "value", e.target.value)}
                      placeholder={tr("components.match_item_dialog.value_978")}
                      aria-label={tr("components.match_item_dialog.provider_id")}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => removeProviderIdInput(index)}
                      disabled={providerIdInputs.length === 1 && !entry.provider && !entry.value}
                      aria-label={tr("components.match_item_dialog.remove_provider_id")}
                      title={tr("components.match_item_dialog.remove_provider_id")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={addProviderIdInput}
                  aria-label={tr("components.match_item_dialog.add_provider_id")}
                  title={tr("components.match_item_dialog.add_provider_id")}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <Button
            onClick={handleSearch}
            disabled={searchMutation.isPending}
            className="w-full shrink-0 gap-2"
          >
            <Search className={cn("h-4 w-4", searchMutation.isPending && "animate-spin")} />
            {tr("common.actions.search")}
          </Button>

          {/* Candidate list */}
          {candidates.length > 0 && (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden">
              <Label className="shrink-0">{tr("components.match_item_dialog.results")}</Label>
              <TooltipProvider delayDuration={150}>
                <div className="overlay-scroll min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1 pb-1">
                  {candidates.map((candidate, index) => {
                    const candidateKey = Object.entries(candidate.provider_ids)
                      .map(([k, v]) => `${k}-${v}`)
                      .join("_");
                    const matchedFallbackTitle =
                      candidate.title_is_fallback &&
                      candidate.matched_title &&
                      candidate.matched_title !== candidate.title
                        ? candidate.matched_title
                        : undefined;
                    const displayTitle = matchedFallbackTitle ?? candidate.title;
                    return (
                      <button
                        key={`${candidateKey}-${index}`}
                        type="button"
                        className={cn(
                          "flex w-full min-w-0 items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                          selectedCandidate === candidate
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-muted/50",
                        )}
                        onClick={() => setSelectedCandidate(candidate)}
                        data-testid="match-candidate"
                      >
                        {candidate.image_url ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <img
                                src={candidate.image_url}
                                alt=""
                                className="h-24 w-16 shrink-0 cursor-zoom-in rounded object-cover"
                              />
                            </TooltipTrigger>
                            <TooltipContent
                              side="right"
                              className="border-border/60 overflow-hidden border bg-transparent p-0 shadow-xl"
                            >
                              <img
                                src={candidate.image_url}
                                alt={displayTitle}
                                className="h-72 w-48 rounded-md object-cover"
                              />
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <div className="bg-muted h-24 w-16 shrink-0 rounded" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{displayTitle}</div>
                          {matchedFallbackTitle ? (
                            <div className="text-muted-foreground truncate text-xs">
                              {tr("components.match_item_dialog.native_title")} {candidate.title}
                            </div>
                          ) : candidate.original_title &&
                            candidate.original_title !== candidate.title ? (
                            <div className="text-muted-foreground truncate text-xs">
                              {tr("components.match_item_dialog.original")}{" "}
                              {candidate.original_title}
                            </div>
                          ) : null}
                          {!matchedFallbackTitle &&
                          candidate.matched_title &&
                          candidate.matched_title !== candidate.title &&
                          candidate.matched_title !== candidate.original_title ? (
                            <div className="text-muted-foreground truncate text-xs">
                              {tr("components.match_item_dialog.matched_alias")}{" "}
                              {candidate.matched_title}
                            </div>
                          ) : null}
                          <div className="text-muted-foreground text-xs">
                            {candidate.year ? candidate.year : ""}
                          </div>
                          <div className="mt-1 flex min-w-0 flex-wrap gap-1">
                            {candidate.match_score !== undefined ? (
                              <Badge variant="secondary" className="text-[10px] tabular-nums">
                                {tr("components.match_item_dialog.score")}{" "}
                                {candidate.match_score.toFixed(1)}
                              </Badge>
                            ) : null}
                            {candidate.sources.map((source) => (
                              <Badge key={source} variant="outline" className="text-[10px]">
                                {source}
                              </Badge>
                            ))}
                            {candidate.sources.length > 1 && (
                              <Badge variant="secondary" className="text-[10px]">
                                {candidate.sources.length}{" "}
                                {tr("components.match_item_dialog.sources_agree")}
                              </Badge>
                            )}
                          </div>
                          {candidate.match_reasons?.length ? (
                            <div className="text-muted-foreground mt-1 text-xs">
                              {tr("components.match_item_dialog.match_reasons")}{" "}
                              {candidate.match_reasons
                                .map((reason) => reason.replace(/_/g, " "))
                                .join(", ")}
                            </div>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </TooltipProvider>
            </div>
          )}

          {searchMutation.isSuccess && candidates.length === 0 && (
            <p className="text-muted-foreground text-center text-sm">
              {tr("components.match_item_dialog.no_candidates_found")}
            </p>
          )}
        </div>

        {/* Apply button — pinned below scroll area */}
        {selectedCandidate && (
          <div className="border-border/50 shrink-0 border-t pt-4">
            <Button
              onClick={handleApply}
              disabled={applyMutation.isPending}
              className="w-full"
              data-testid="apply-match"
            >
              {applyMutation.isPending
                ? tr("components.match_item_dialog.applying")
                : tr("components.match_item_dialog.apply_match")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function getFolderDisplayName(path: string): string {
  const trimmed = path.trim().replace(/[\\/]+$/, "");
  if (!trimmed) return path;

  const segments = trimmed.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] || trimmed;
}

function computeRootPath(paths: string[]): string {
  if (paths.length === 0) return "";

  const parentSegments = paths.map((path) => {
    const trimmed = path.trim().replace(/[\\/]+$/, "");
    return trimmed.split(/[\\/]/).filter(Boolean).slice(0, -1);
  });
  const first = parentSegments[0] ?? [];
  const minLen = Math.min(...parentSegments.map((segments) => segments.length));

  let sharedLength = 0;
  for (let i = 0; i < minLen; i += 1) {
    if (parentSegments.every((segments) => segments[i] === first[i])) {
      sharedLength = i + 1;
      continue;
    }
    break;
  }

  if (sharedLength === 0) return "";
  return `/${first.slice(0, sharedLength).join("/")}`;
}

function FolderPathsList({ paths }: { paths: string[] }) {
  useUILanguage();
  const folderData = useMemo(() => {
    return {
      folders: paths.map((fullPath) => ({
        fullPath,
        displayName: getFolderDisplayName(fullPath),
      })),
      rootPath: computeRootPath(paths),
    };
  }, [paths]);

  if (paths.length === 0) {
    return (
      <section className="shrink-0 space-y-3">
        <h2 className="text-base font-semibold tracking-tight">
          {tr("components.match_item_dialog.local_media")}
        </h2>
        <div className="text-muted-foreground bg-muted/30 rounded-lg border px-3 py-2 text-sm">
          {tr("components.match_item_dialog.no_folder_paths_are_available_for_this_item")}
        </div>
      </section>
    );
  }

  return (
    <section className="shrink-0 space-y-2">
      <h2 className="text-base font-semibold tracking-tight">
        {tr("components.match_item_dialog.local_media")}
      </h2>
      <div className="bg-background/70 rounded-lg border">
        {folderData.rootPath ? (
          <div className="border-b px-3 py-2">
            <div className="text-muted-foreground mb-1 text-[11px] font-medium tracking-[0.08em] uppercase">
              {tr("components.match_item_dialog.root_path")}
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-xs"
                title={folderData.rootPath}
              >
                {folderData.rootPath}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground h-6 w-6 shrink-0"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(folderData.rootPath);
                    toast.success("feedback.match_item_dialog.copied_root_path");
                  } catch {
                    toast.error("errors.match_item_dialog.failed_to_copy_path");
                  }
                }}
                title={tr("components.match_item_dialog.copy_root_path")}
                aria-label={tr("components.match_item_dialog.copy_root_path_root_path", {
                  rootPath: folderData.rootPath,
                })}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ) : null}
        <div className="divide-border/50 divide-y">
          {folderData.folders.map(({ fullPath, displayName }) => (
            <div key={fullPath} className="group flex items-center gap-2 px-3 py-2">
              <Folder className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
              <span
                className="min-w-0 flex-1 truncate font-mono text-xs font-medium"
                title={fullPath}
              >
                {displayName}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(fullPath);
                    toast.success("feedback.match_item_dialog.copied_folder_path");
                  } catch {
                    toast.error("errors.match_item_dialog.failed_to_copy_path");
                  }
                }}
                title={tr("components.match_item_dialog.copy_full_path")}
                aria-label={tr("components.match_item_dialog.copy_folder_path_full_path", {
                  fullPath: fullPath,
                })}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
