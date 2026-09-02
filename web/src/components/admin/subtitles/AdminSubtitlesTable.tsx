import { useState } from "react";
import { Link } from "react-router";
import type { AdminDownloadedSubtitle } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { downloadAdminSubtitle } from "@/hooks/queries/admin/subtitles";
import { getLanguageName } from "@/player/utils/languageNames";
import { cn } from "@/lib/utils";
import { Download, Ear, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "@/i18n/toast";
import AdminSubtitleEditSheet from "./AdminSubtitleEditSheet";
import {
  basenameFromPath,
  formatChipClass,
  languageChipClass,
  providerBadgeClass,
  providerLabel,
  staggerRowClass,
} from "./subtitleAdminStyles";
import { formatRelativeTime } from "@/lib/date";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

interface AdminSubtitlesTableProps {
  subtitles: AdminDownloadedSubtitle[];
  hasActiveFilters: boolean;
  onResetFilters: () => void;
  onDelete: (subtitle: AdminDownloadedSubtitle) => void;
  isDeleting: boolean;
}

function formatRelative(value: string): string {
  return formatRelativeTime(value, { rounding: "floor", absoluteAfterDays: 30 }) ?? value;
}

export default function AdminSubtitlesTable({
  subtitles,
  hasActiveFilters,
  onResetFilters,
  onDelete,
  isDeleting,
}: AdminSubtitlesTableProps) {
  useUILanguage();
  const [editTarget, setEditTarget] = useState<AdminDownloadedSubtitle | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminDownloadedSubtitle | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  async function handleDownload(subtitle: AdminDownloadedSubtitle) {
    setDownloadingId(subtitle.id);
    try {
      await downloadAdminSubtitle(subtitle);
      toast.success("feedback.admin.subtitles.admin_subtitles_table.subtitle_downloaded");
    } catch (err) {
      toast.error("errors.admin.subtitles.admin_subtitles_table.failed_to_download_subtitle", {
        error: err,
      });
    } finally {
      setDownloadingId(null);
    }
  }

  if (subtitles.length === 0) {
    return (
      <div className="surface-panel rounded-2xl border-0 px-6 py-16 text-center">
        <div className="caption-empty-state mx-auto mb-5 max-w-md space-y-1.5">
          <span />
          <span />
          <span />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">
          {hasActiveFilters
            ? tr(
                "components.admin.subtitles.admin_subtitles_table.no_subtitles_match_these_filters",
              )
            : tr("components.admin.subtitles.admin_subtitles_table.no_stored_subtitles_yet")}
        </h2>
        <p className="text-muted-foreground mx-auto mt-2 max-w-lg text-sm leading-relaxed">
          {hasActiveFilters
            ? tr(
                "components.admin.subtitles.admin_subtitles_table.try_widening_the_provider_language_or_uploader_filters_to_see",
              )
            : tr(
                "components.admin.subtitles.admin_subtitles_table.user_uploads_and_provider_downloads_will_appear_here_once_subtitles",
              )}
        </p>
        {hasActiveFilters && (
          <Button type="button" variant="outline" className="mt-5" onClick={onResetFilters}>
            {tr("components.admin.subtitles.admin_subtitles_table.reset_filters")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="surface-panel overflow-x-auto rounded-2xl border-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("components.admin.subtitles.admin_subtitles_table.media")}</TableHead>
              <TableHead>{tr("components.admin.subtitles.admin_subtitles_table.file")}</TableHead>
              <TableHead>
                {tr("components.admin.subtitles.admin_subtitles_table.language")}
              </TableHead>
              <TableHead>
                {tr("components.admin.subtitles.admin_subtitles_table.provider")}
              </TableHead>
              <TableHead>
                {tr("components.admin.subtitles.admin_subtitles_table.release")}
              </TableHead>
              <TableHead>{tr("components.admin.subtitles.admin_subtitles_table.format")}</TableHead>
              <TableHead className="w-10">
                {tr("components.admin.subtitles.admin_subtitles_table.hi")}
              </TableHead>
              <TableHead>
                {tr("components.admin.subtitles.admin_subtitles_table.uploader")}
              </TableHead>
              <TableHead>{tr("components.admin.subtitles.admin_subtitles_table.added")}</TableHead>
              <TableHead className="w-[120px] text-right">
                {tr("components.admin.subtitles.admin_subtitles_table.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subtitles.map((subtitle, index) => (
              <TableRow key={subtitle.id} className={cn("group", staggerRowClass(index))}>
                <TableCell className="max-w-[220px]">
                  <div className="space-y-1">
                    {subtitle.media_content_id ? (
                      <Link
                        to={"/item/" + encodeURIComponent(subtitle.media_content_id)}
                        className="hover:text-primary line-clamp-2 font-semibold transition-colors hover:underline"
                      >
                        {subtitle.media_title || subtitle.media_content_id}
                      </Link>
                    ) : (
                      <div className="line-clamp-2 font-semibold">
                        {subtitle.media_title ||
                          tr("components.admin.subtitles.admin_subtitles_table.unknown_media")}
                      </div>
                    )}
                    {subtitle.media_type === "episode" && (
                      <Badge variant="outline" className="text-[10px] tracking-[0.12em] uppercase">
                        {tr("components.admin.subtitles.admin_subtitles_table.episode")}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell
                  className="text-muted-foreground max-w-[180px] truncate font-mono text-xs"
                  title={subtitle.file_path}
                >
                  {basenameFromPath(subtitle.file_path)}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                      languageChipClass(),
                    )}
                  >
                    <span className="font-semibold tracking-[0.08em] uppercase">
                      {subtitle.language}
                    </span>
                    <span className="text-muted-foreground hidden sm:inline">
                      {getLanguageName(subtitle.language)}
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                      providerBadgeClass(subtitle.provider),
                    )}
                  >
                    {providerLabel(subtitle.provider)}
                  </span>
                </TableCell>
                <TableCell
                  className="max-w-[200px] truncate font-mono text-xs"
                  title={subtitle.release_name}
                >
                  {subtitle.release_name || "—"}
                </TableCell>
                <TableCell>
                  <span className={cn("inline-flex rounded px-2 py-0.5", formatChipClass())}>
                    .{subtitle.format}
                  </span>
                </TableCell>
                <TableCell>
                  {subtitle.hearing_impaired ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-200">
                      <Ear className="h-3.5 w-3.5" aria-hidden="true" />
                      {tr("components.admin.subtitles.admin_subtitles_table.hi")}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-sm">{subtitle.uploader_username || "—"}</TableCell>
                <TableCell className="text-muted-foreground text-sm" title={subtitle.created_at}>
                  {formatRelative(subtitle.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={tr(
                        "components.admin.subtitles.admin_subtitles_table.edit_subtitle_id",
                        { id: subtitle.id },
                      )}
                      onClick={() => setEditTarget(subtitle)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={tr(
                        "components.admin.subtitles.admin_subtitles_table.download_subtitle_id",
                        { id: subtitle.id },
                      )}
                      disabled={downloadingId === subtitle.id}
                      onClick={() => void handleDownload(subtitle)}
                    >
                      {downloadingId === subtitle.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive h-8 w-8"
                      aria-label={tr(
                        "components.admin.subtitles.admin_subtitles_table.delete_subtitle_id",
                        { id: subtitle.id },
                      )}
                      onClick={() => setDeleteTarget(subtitle)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AdminSubtitleEditSheet
        subtitle={editTarget}
        open={editTarget != null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
      />

      <ConfirmDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={tr("components.admin.subtitles.admin_subtitles_table.delete_subtitle")}
        description={
          deleteTarget
            ? tr(
                "components.admin.subtitles.admin_subtitles_table.remove_value_value2_subtitles_for_value3_this_deletes_the_stored",
                {
                  value: providerLabel(deleteTarget.provider),
                  value2: deleteTarget.language.toUpperCase(),
                  value3: deleteTarget.media_title || "this media",
                },
              )
            : ""
        }
        confirmLabel={tr("common.actions.delete")}
        variant="destructive"
        isPending={isDeleting}
        onConfirm={() => {
          if (deleteTarget) {
            onDelete(deleteTarget);
            setDeleteTarget(null);
          }
        }}
      />
    </>
  );
}
