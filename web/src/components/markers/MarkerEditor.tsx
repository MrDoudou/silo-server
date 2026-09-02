import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  FileMarkersResponse,
  MarkerEditAuditEntry,
  MarkerKind,
  MarkerSegment,
  SetMarkersRequest,
} from "@/api/types";
import { MARKER_KINDS, MARKER_LABELS, formatClock, parseClock } from "@/lib/markers";
import { useItemMarkerHistory, useItemMarkers, useSetItemMarkers } from "@/hooks/queries/markers";
import { useIsActingAdmin } from "@/hooks/useIsActingAdmin";
import { formatTime, preferredDateLocale } from "@/lib/datetime";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

interface MarkerEditorProps {
  itemId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FieldState = Record<MarkerKind, { start: string; end: string }>;

function fieldsFromResponse(data: FileMarkersResponse): FieldState {
  return {
    intro: { start: formatClock(data.intro.start), end: formatClock(data.intro.end) },
    recap: { start: formatClock(data.recap.start), end: formatClock(data.recap.end) },
    credits: { start: formatClock(data.credits.start), end: formatClock(data.credits.end) },
    preview: { start: formatClock(data.preview.start), end: formatClock(data.preview.end) },
  };
}

/**
 * Curator dialog for editing a catalog item's intro/recap/credits/preview
 * markers by typing timecodes. Edits save as source="manual" via the
 * authenticated markers API.
 */
export function MarkerEditor({ itemId, open, onOpenChange }: MarkerEditorProps) {
  useUILanguage();
  const isAdmin = useIsActingAdmin();
  const { data, isLoading, isError } = useItemMarkers(itemId, { enabled: open });
  const history = useItemMarkerHistory(itemId, { enabled: open && isAdmin, limit: 25 });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{tr("components.markers.marker_editor.edit_markers")}</DialogTitle>
          <DialogDescription>
            {tr(
              "components.markers.marker_editor.set_intro_recap_credits_and_preview_times_use_m_ss",
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="text-muted-foreground flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : isError || !data ? (
          <p className="text-destructive py-6 text-center text-sm">
            {tr("components.markers.marker_editor.failed_to_load_markers")}
          </p>
        ) : (
          // Keyed by file id so the form re-initializes from fresh data without
          // a state-syncing effect.
          <MarkerEditorForm
            key={data.file_id}
            itemId={itemId}
            data={data}
            history={isAdmin ? (history.data ?? []) : []}
            historyLoading={isAdmin && history.isLoading}
            showHistory={isAdmin}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MarkerEditorForm({
  itemId,
  data,
  history,
  historyLoading,
  showHistory,
  onClose,
}: {
  itemId: string;
  data: FileMarkersResponse;
  history: MarkerEditAuditEntry[];
  historyLoading: boolean;
  showHistory: boolean;
  onClose: () => void;
}) {
  useUILanguage();
  const setMarkers = useSetItemMarkers(itemId);
  const [fields, setFields] = useState<FieldState>(() => fieldsFromResponse(data));
  const [error, setError] = useState<string | null>(null);

  const setField = (kind: MarkerKind, edge: "start" | "end", value: string) => {
    setFields((prev) => ({ ...prev, [kind]: { ...prev[kind], [edge]: value } }));
    setError(null);
  };

  const clearKind = (kind: MarkerKind) => {
    setFields((prev) => ({ ...prev, [kind]: { start: "", end: "" } }));
    setError(null);
  };

  const handleSave = () => {
    const body: SetMarkersRequest = {};
    for (const kind of MARKER_KINDS) {
      const { start: startStr, end: endStr } = fields[kind];
      const original = data[kind];
      const hadValue = original.start != null || original.end != null;

      if (startStr.trim() === "" && endStr.trim() === "") {
        if (hadValue) body[kind] = null; // explicit clear
        continue;
      }

      const start = parseClock(startStr);
      const end = parseClock(endStr);
      if (start == null || end == null || Number.isNaN(start) || Number.isNaN(end)) {
        setError(
          tr("components.markers.marker_editor.value1_enter_both_start_and_end_e_g_1_30", {
            value1: MARKER_LABELS[kind],
          }),
        );
        return;
      }
      if (end <= start) {
        setError(
          tr("components.markers.marker_editor.value1_end_must_be_after_start", {
            value1: MARKER_LABELS[kind],
          }),
        );
        return;
      }
      // Inputs carry whole-second precision; round the (possibly fractional)
      // stored values before comparing so an untouched marker isn't resaved
      // as "manual" with a rounded timestamp.
      const origStart = original.start == null ? null : Math.round(original.start);
      const origEnd = original.end == null ? null : Math.round(original.end);
      if (origStart === start && origEnd === end) continue; // unchanged
      body[kind] = { start, end };
    }

    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    setMarkers.mutate(body, { onSuccess: () => onClose() });
  };

  return (
    <>
      <div className="grid gap-3 py-1">
        {MARKER_KINDS.map((kind) => (
          <div key={kind} className="grid grid-cols-[5.5rem_1fr_1fr_auto] items-center gap-2">
            <span className="text-sm font-medium">{MARKER_LABELS[kind]}</span>
            <Input
              aria-label={tr("components.markers.marker_editor.value_start", {
                value: MARKER_LABELS[kind],
              })}
              placeholder={tr("components.markers.marker_editor.start")}
              value={fields[kind].start}
              onChange={(e) => setField(kind, "start", e.target.value)}
            />
            <Input
              aria-label={tr("components.markers.marker_editor.value_end", {
                value: MARKER_LABELS[kind],
              })}
              placeholder={tr("components.markers.marker_editor.end")}
              value={fields[kind].end}
              onChange={(e) => setField(kind, "end", e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={tr("components.markers.marker_editor.clear_value", {
                value: MARKER_LABELS[kind],
              })}
              onClick={() => clearKind(kind)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {showHistory && <MarkerHistory rows={history} isLoading={historyLoading} />}

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {tr("common.actions.cancel")}
        </Button>
        <Button onClick={handleSave} disabled={setMarkers.isPending}>
          {setMarkers.isPending && <Loader2 className="size-4 animate-spin" />}
          {tr("common.actions.save")}
        </Button>
      </DialogFooter>
    </>
  );
}

function MarkerHistory({ rows, isLoading }: { rows: MarkerEditAuditEntry[]; isLoading: boolean }) {
  useUILanguage();
  return (
    <div className="border-border mt-2 border-t pt-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium">
          {tr("components.markers.marker_editor.recent_changes")}
        </h3>
        {isLoading && <Loader2 className="text-muted-foreground size-4 animate-spin" />}
      </div>
      {rows.length === 0 && !isLoading ? (
        <p className="text-muted-foreground text-sm">
          {tr("components.markers.marker_editor.no_marker_edits_recorded")}
        </p>
      ) : (
        <div className="max-h-48 overflow-y-auto">
          {rows.map((row) => (
            <div
              key={row.id}
              className="border-border grid gap-1 border-b py-2 last:border-b-0 sm:grid-cols-[8rem_1fr]"
            >
              <div className="text-muted-foreground text-xs">
                <div>{formatHistoryDate(row.created_at)}</div>
                <div>{row.username ?? tr("components.markers.marker_editor.unknown_user")}</div>
              </div>
              <div className="text-sm">
                <div className="font-medium">
                  {row.action === "clear"
                    ? tr("components.markers.marker_editor.cleared")
                    : tr("components.markers.marker_editor.set")}{" "}
                  {MARKER_LABELS[row.segment]}
                </div>
                <div className="text-muted-foreground font-mono text-xs">
                  {formatHistoryRange(row.before)}
                  {" -> "}
                  {formatHistoryRange(row.after)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatHistoryRange(marker: MarkerSegment | null): string {
  if (!marker || marker.start == null || marker.end == null) return "none";
  return `${formatClock(marker.start)}-${formatClock(marker.end)}`;
}

function formatHistoryDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = date.toLocaleDateString(preferredDateLocale(), { month: "short", day: "numeric" });
  return `${day}, ${formatTime(date)}`;
}
