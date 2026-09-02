import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "@/i18n/toast";
import type { FileVersion } from "@/api/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatFileSize } from "@/lib/mediaFormat";
import { buildDirectDownloadUrl } from "@/hooks/queries/downloads";
import { buildQualitySummary, sortByResolution } from "@/pages/ItemDetail/components/VersionFlyout";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

interface DownloadVersionPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versions: FileVersion[];
  title?: string;
  summaryBuilder?: (version: FileVersion) => string;
}

export default function DownloadVersionPicker({
  open,
  onOpenChange,
  versions,
  title,
  summaryBuilder,
}: DownloadVersionPickerProps) {
  useUILanguage();
  const sorted = sortByResolution(versions);
  const [downloading, setDownloading] = useState<number | null>(null);

  const handleDownload = async (version: FileVersion) => {
    const url = buildDirectDownloadUrl(version.file_id);
    setDownloading(version.file_id);
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (!res.ok) {
        if (res.status === 403)
          toast.error("errors.download_version_picker.you_are_not_allowed_to_download_this_file");
        else if (res.status === 429)
          toast.error("errors.download_version_picker.download_limit_reached_try_again_later");
        else toast.error("errors.download_version_picker.download_failed_try_again_later");
        return;
      }
      const a = document.createElement("a");
      a.href = url;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      onOpenChange(false);
    } catch {
      toast.error(
        "errors.download_version_picker.network_error_check_your_connection_and_try_again",
      );
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {tr("common.actions.download")}
            {title ? tr("components.download_version_picker.title", { title: title }) : ""}
          </DialogTitle>
          <DialogDescription>
            {tr(
              "components.download_version_picker.choose_a_file_to_download_make_sure_you_have_enough",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {sorted.map((version) => {
            const quality = summaryBuilder?.(version) || buildQualitySummary(version);
            const size = summaryBuilder ? "" : formatFileSize(version.file_size);

            return (
              <button
                key={version.file_id}
                type="button"
                onClick={() => handleDownload(version)}
                disabled={downloading !== null}
                className="border-border/50 bg-accent/30 hover:bg-accent/60 flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-50"
              >
                <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full">
                  {downloading === version.file_id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-foreground block text-sm font-medium">{quality}</span>
                  {size && <span className="text-muted-foreground block text-xs">{size}</span>}
                </span>
              </button>
            );
          })}
        </div>

        {sorted.length > 1 && (
          <p className="text-muted-foreground text-xs">
            {tr("components.download_version_picker.larger_files_require_more_storage_space")}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
