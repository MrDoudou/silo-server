import { Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RefreshItemMetadataMode } from "@/hooks/queries/items";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

interface RefreshMetadataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (mode: RefreshItemMetadataMode) => void;
  isPending?: boolean;
}

export default function RefreshMetadataDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending = false,
}: RefreshMetadataDialogProps) {
  useUILanguage();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tr("components.refresh_metadata_dialog.refresh_metadata")}</DialogTitle>
          <DialogDescription>
            {tr(
              "components.refresh_metadata_dialog.choose_whether_to_refresh_the_existing_item_or_rebuild_it",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <button
            type="button"
            disabled={isPending}
            onClick={() => onConfirm("quick")}
            className="border-border bg-surface hover:bg-surface/80 flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? (
              <Loader2 className="text-muted-foreground mt-0.5 size-5 animate-spin" />
            ) : (
              <RefreshCw className="text-muted-foreground mt-0.5 size-5" />
            )}
            <div className="space-y-1">
              <div className="text-sm font-semibold">
                {tr("components.refresh_metadata_dialog.quick_refresh")}
              </div>
              <div className="text-muted-foreground text-sm">
                {tr(
                  "components.refresh_metadata_dialog.keep_the_current_item_and_refresh_metadata_using_the_existing",
                )}
              </div>
            </div>
          </button>

          <button
            type="button"
            disabled={isPending}
            onClick={() => onConfirm("complete")}
            className="border-border bg-surface hover:bg-surface/80 flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? (
              <Loader2 className="text-muted-foreground mt-0.5 size-5 animate-spin" />
            ) : (
              <RotateCcw className="text-muted-foreground mt-0.5 size-5" />
            )}
            <div className="space-y-1">
              <div className="text-sm font-semibold">
                {tr("components.refresh_metadata_dialog.complete_refresh")}
              </div>
              <div className="text-muted-foreground text-sm">
                {tr(
                  "components.refresh_metadata_dialog.clear_the_current_match_re_scan_and_rebuild_the_item",
                )}
              </div>
            </div>
          </button>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {tr("common.actions.cancel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
