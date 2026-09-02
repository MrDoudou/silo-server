import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Folder, Search, Scissors } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ItemFile,
  ItemMatchSearchRequest,
  ItemSplitRequest,
  ItemSplitResponse,
  MatchCandidate,
  SplitHistoryMode,
} from "@/api/types";
import { useItemFiles, useSearchItemMatchCandidates, useSplitItem } from "@/hooks/queries/items";
import { cn } from "@/lib/utils";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

interface SplittableItem {
  content_id: string;
  title: string;
  year?: number;
  type: string;
  library_id?: number;
}

interface SplitItemDialogProps {
  item: SplittableItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const HISTORY_MODE_LABELS: Record<SplitHistoryMode, string> = {
  evidence: "components.split_item_dialog.follow_play_evidence_recommended",
  keep: "components.split_item_dialog.keep_all_history_on_this_item",
  move_all: "components.split_item_dialog.move_everything_to_the_new_item",
};

/**
 * Repairs a wrong merge: moves selected files (usually one folder) of this
 * item to a different — possibly new — item, previews the watch-state
 * reattribution via a dry run, and persists identity overrides so rescans
 * keep the corrected assignment.
 */
export default function SplitItemDialog({ item, open, onOpenChange }: SplitItemDialogProps) {
  useUILanguage();
  const { data: filesData, isLoading: filesLoading } = useItemFiles(
    open ? item.content_id : undefined,
  );
  const files = useMemo(() => filesData?.files ?? [], [filesData]);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [imdbId, setImdbId] = useState("");
  const [tmdbId, setTmdbId] = useState("");
  const [tvdbId, setTvdbId] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState<MatchCandidate | null>(null);
  const [detachUnmatched, setDetachUnmatched] = useState(false);
  const [historyMode, setHistoryMode] = useState<SplitHistoryMode>("evidence");
  const [preview, setPreview] = useState<ItemSplitResponse | null>(null);

  const searchMutation = useSearchItemMatchCandidates(item.content_id);
  const splitMutation = useSplitItem();
  const candidates = searchMutation.data?.candidates ?? [];

  // Monotonic token so a slow dry-run response for an outdated plan can't
  // overwrite the preview of the current one.
  const previewToken = useRef(0);

  const filesByRoot = useMemo(() => {
    const groups = new Map<string, ItemFile[]>();
    for (const file of files) {
      const group = groups.get(file.observed_root_path) ?? [];
      group.push(file);
      groups.set(file.observed_root_path, group);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [files]);

  const toggleFile = useCallback((id: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleRoot = useCallback((rootFiles: ItemFile[]) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      const allSelected = rootFiles.every((file) => next.has(file.id));
      for (const file of rootFiles) {
        if (allSelected) {
          next.delete(file.id);
        } else {
          next.add(file.id);
        }
      }
      return next;
    });
  }, []);

  const handleSearch = useCallback(() => {
    setSelectedCandidate(null);
    setDetachUnmatched(false);
    const parsedYear = Number.parseInt(year.trim(), 10);
    const request: ItemMatchSearchRequest = {
      title: title || undefined,
      year: Number.isFinite(parsedYear) ? parsedYear : undefined,
      imdb_id: imdbId || undefined,
      tmdb_id: tmdbId || undefined,
      tvdb_id: tvdbId || undefined,
      library_id: item.library_id,
    };
    searchMutation.mutate(request);
  }, [title, year, imdbId, tmdbId, tvdbId, item.library_id, searchMutation]);

  const targetChosen = detachUnmatched || selectedCandidate !== null;
  const selectionValid = selectedIds.size > 0 && selectedIds.size < files.length;
  const planValid = selectionValid && targetChosen;

  const buildRequest = useCallback(
    (dryRun: boolean): ItemSplitRequest => ({
      file_ids: [...selectedIds],
      target: detachUnmatched
        ? { unmatched: true }
        : {
            provider_ids: selectedCandidate?.provider_ids,
            title: selectedCandidate?.title,
            year: selectedCandidate?.year || undefined,
          },
      history_mode: historyMode,
      dry_run: dryRun,
    }),
    [selectedIds, detachUnmatched, selectedCandidate, historyMode],
  );

  // react-query guarantees `mutate` is referentially stable, so the effect
  // below only re-runs when the plan itself changes.
  const { mutate: runSplit } = splitMutation;

  // Any change to the plan invalidates the previous preview; once the plan is
  // valid, a debounced dry run fetches a fresh one automatically.
  useEffect(() => {
    previewToken.current += 1;
    setPreview(null);
    if (!open || !planValid) return;
    const token = previewToken.current;
    const timer = setTimeout(() => {
      runSplit(
        { contentId: item.content_id, request: buildRequest(true) },
        {
          onSuccess: (result) => {
            if (token === previewToken.current) setPreview(result);
          },
        },
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [open, planValid, buildRequest, runSplit, item.content_id]);

  const confirmSplit = useCallback(() => {
    runSplit(
      { contentId: item.content_id, request: buildRequest(false) },
      { onSuccess: () => onOpenChange(false) },
    );
  }, [runSplit, item.content_id, buildRequest, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{tr("components.split_item_dialog.split_versions")}</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          <div className="bg-muted/50 shrink-0 rounded-lg px-3 py-2 text-sm">
            <span className="font-medium">{item.title}</span>
            {item.year ? <span className="text-muted-foreground ml-2">({item.year})</span> : null}
            <Badge variant="secondary" className="ml-2 text-[10px]">
              {item.type}
            </Badge>
          </div>

          {/* Step 1: pick the files that belong to a different title */}
          <section className="space-y-2">
            <Label>{tr("components.split_item_dialog.files_to_move")}</Label>
            {filesLoading ? (
              <div className="text-muted-foreground bg-muted/30 rounded-lg border px-3 py-2 text-sm">
                {tr("components.split_item_dialog.loading_files")}
              </div>
            ) : files.length < 2 ? (
              <div className="text-muted-foreground bg-muted/30 rounded-lg border px-3 py-2 text-sm">
                {tr(
                  "components.split_item_dialog.this_item_has_only_one_file_splitting_needs_at_least",
                )}
              </div>
            ) : (
              <div className="bg-background/70 divide-border/50 divide-y rounded-lg border">
                {filesByRoot.map(([root, rootFiles]) => {
                  const allSelected = rootFiles.every((file) => selectedIds.has(file.id));
                  return (
                    <div key={root} className="px-3 py-2">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() => toggleRoot(rootFiles)}
                          aria-label={tr("components.split_item_dialog.select_all_files_in_root", {
                            root: root,
                          })}
                        />
                        <Folder className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={root}>
                          {root}
                        </span>
                      </label>
                      <div className="mt-1 space-y-1 pl-6">
                        {rootFiles.map((file) => (
                          <label
                            key={file.id}
                            className="flex cursor-pointer items-center gap-2 text-xs"
                          >
                            <input
                              type="checkbox"
                              checked={selectedIds.has(file.id)}
                              onChange={() => toggleFile(file.id)}
                              aria-label={tr("components.split_item_dialog.select_file_path", {
                                file_path: file.file_path,
                              })}
                            />
                            <span
                              className="text-muted-foreground min-w-0 flex-1 truncate font-mono"
                              title={file.file_path}
                            >
                              {file.file_path.split("/").pop()}
                            </span>
                            {file.season_number && file.episode_number ? (
                              <Badge variant="outline" className="text-[10px]">
                                {tr("components.split_item_dialog.s")}
                                {file.season_number}
                                {tr("components.split_item_dialog.e")}
                                {file.episode_number}
                              </Badge>
                            ) : null}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {selectedIds.size > 0 && selectedIds.size === files.length && (
              <p className="text-destructive text-xs">
                {tr("components.split_item_dialog.all_files_are_selected_that_is_a_re_match_not")}
              </p>
            )}
          </section>

          {/* Step 2: what the moved files actually are */}
          <section className="space-y-3">
            <Label>{tr("components.split_item_dialog.correct_identity_for_the_moved_files")}</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={tr("components.split_item_dialog.title")}
                  aria-label={tr("components.split_item_dialog.search_title")}
                />
              </div>
              <Input
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder={tr("components.split_item_dialog.year")}
                type="number"
                aria-label={tr("components.split_item_dialog.search_year")}
              />
              <Input
                value={tmdbId}
                onChange={(e) => setTmdbId(e.target.value)}
                placeholder={tr("components.split_item_dialog.tmdb_id")}
                aria-label={tr("components.split_item_dialog.tmdb_id")}
              />
              <Input
                value={imdbId}
                onChange={(e) => setImdbId(e.target.value)}
                placeholder={tr("components.split_item_dialog.imdb_id_tt")}
                aria-label={tr("components.split_item_dialog.imdb_id")}
              />
              <Input
                value={tvdbId}
                onChange={(e) => setTvdbId(e.target.value)}
                placeholder={tr("components.split_item_dialog.tvdb_id")}
                aria-label={tr("components.split_item_dialog.tvdb_id")}
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={searchMutation.isPending}
              variant="secondary"
              className="w-full gap-2"
            >
              <Search className={cn("h-4 w-4", searchMutation.isPending && "animate-spin")} />
              {tr("common.actions.search")}
            </Button>

            {candidates.length > 0 && (
              <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {candidates.map((candidate, index) => {
                  const key = Object.entries(candidate.provider_ids)
                    .map(([k, v]) => `${k}-${v}`)
                    .join("_");
                  return (
                    <button
                      key={`${key}-${index}`}
                      type="button"
                      className={cn(
                        "flex w-full min-w-0 items-center gap-3 rounded-lg border p-2 text-left transition-colors",
                        selectedCandidate === candidate
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50",
                      )}
                      onClick={() => {
                        setSelectedCandidate(candidate);
                        setDetachUnmatched(false);
                      }}
                      data-testid="split-candidate"
                    >
                      {candidate.image_url ? (
                        <img
                          src={candidate.image_url}
                          alt=""
                          className="h-14 w-10 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="bg-muted h-14 w-10 shrink-0 rounded" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{candidate.title}</div>
                        <div className="text-muted-foreground text-xs">{candidate.year || ""}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {searchMutation.isSuccess && candidates.length === 0 && (
              <p className="text-muted-foreground text-center text-sm">
                {tr("components.split_item_dialog.no_candidates_found")}
              </p>
            )}

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={detachUnmatched}
                onChange={(e) => {
                  setDetachUnmatched(e.target.checked);
                  if (e.target.checked) setSelectedCandidate(null);
                }}
              />
              {tr("components.split_item_dialog.detach_as_unmatched_identify_later")}
            </label>
          </section>

          {/* Step 3: watch-state handling */}
          <section className="space-y-2">
            <Label>{tr("components.split_item_dialog.watch_history_handling")}</Label>
            <Select
              value={historyMode}
              onValueChange={(value) => setHistoryMode(value as SplitHistoryMode)}
            >
              <SelectTrigger aria-label={tr("components.split_item_dialog.watch_history_handling")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(HISTORY_MODE_LABELS) as SplitHistoryMode[]).map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {tr(HISTORY_MODE_LABELS[mode])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {tr(
                "components.split_item_dialog.resume_points_and_downloads_tied_to_the_moved_files_always",
              )}
            </p>
          </section>

          {planValid && !preview && (
            <section className="bg-muted/30 text-muted-foreground rounded-lg border px-3 py-2 text-sm">
              {tr("components.split_item_dialog.previewing")}
            </section>
          )}
          {preview && (
            <section className="bg-muted/30 space-y-1 rounded-lg border px-3 py-2 text-sm">
              <div className="font-medium">
                {tr("components.split_item_dialog.preview")} {preview.files_moved}{" "}
                {tr("components.split_item_dialog.file")}
                {preview.files_moved === 1
                  ? ""
                  : tr("components.split_item_dialog.s_a0f1490a")} →{" "}
                <span className="font-mono text-xs">{preview.target_content_id}</span>
                {preview.target_created ? (
                  <Badge variant="secondary" className="ml-2 text-[10px]">
                    {tr("components.split_item_dialog.new_item")}
                  </Badge>
                ) : null}
              </div>
              <ul className="text-muted-foreground list-inside list-disc text-xs">
                <li>
                  {preview.reattribution.progress_moved}{" "}
                  {tr("components.split_item_dialog.resume_points_move")}
                </li>
                <li>
                  {preview.reattribution.history_moved}{" "}
                  {tr("components.split_item_dialog.history_entries_move")}{" "}
                  {preview.reattribution.history_ambiguous}{" "}
                  {tr("components.split_item_dialog.stay_for_lack_of_evidence")}
                </li>
                <li>
                  {preview.reattribution.downloads}{" "}
                  {tr("components.split_item_dialog.downloads_move")}
                </li>
                {preview.episode_pairs > 0 && (
                  <li>
                    {preview.episode_pairs}{" "}
                    {tr("components.split_item_dialog.episodes_re_anchored")}
                  </li>
                )}
                {(preview.root_overrides?.length ?? 0) + (preview.file_overrides?.length ?? 0) >
                  0 && (
                  <li>
                    {preview.root_overrides?.length ?? 0}{" "}
                    {tr("components.split_item_dialog.folder")}{" "}
                    {preview.file_overrides?.length ?? 0}{" "}
                    {tr("components.split_item_dialog.file_identity_override")}
                    {tr("components.split_item_dialog.s_aef8e615")}{" "}
                    {tr("components.split_item_dialog.pinned_for_future_scans")}
                  </li>
                )}
              </ul>
            </section>
          )}
        </div>

        <div className="border-border/50 flex shrink-0 border-t pt-4">
          <Button
            className="flex-1 gap-2"
            onClick={confirmSplit}
            disabled={!planValid || !preview || splitMutation.isPending}
            data-testid="confirm-split"
          >
            <Scissors className="h-4 w-4" />
            {splitMutation.isPending && preview
              ? tr("components.split_item_dialog.splitting")
              : tr("components.split_item_dialog.split")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
