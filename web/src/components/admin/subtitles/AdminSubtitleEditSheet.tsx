import { useState } from "react";
import type { AdminDownloadedSubtitle } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useAdminUpdateDownloadedSubtitle } from "@/hooks/queries/admin/subtitles";
import { LANGUAGES, getLanguageName } from "@/player/utils/languageNames";
import { cn } from "@/lib/utils";
import { languageChipClass, providerBadgeClass, providerLabel } from "./subtitleAdminStyles";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

interface AdminSubtitleEditSheetProps {
  subtitle: AdminDownloadedSubtitle | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AdminSubtitleEditSheet({
  subtitle,
  open,
  onOpenChange,
}: AdminSubtitleEditSheetProps) {
  useUILanguage();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        {subtitle ? (
          <AdminSubtitleEditForm
            key={subtitle.id}
            subtitle={subtitle}
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>
                {tr("components.admin.subtitles.admin_subtitle_edit_sheet.edit_subtitle")}
              </SheetTitle>
            </SheetHeader>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function AdminSubtitleEditForm({
  subtitle,
  onClose,
}: {
  subtitle: AdminDownloadedSubtitle;
  onClose: () => void;
}) {
  useUILanguage();
  const updateMutation = useAdminUpdateDownloadedSubtitle();
  const [language, setLanguage] = useState(subtitle.language);
  const [releaseName, setReleaseName] = useState(subtitle.release_name);
  const [hearingImpaired, setHearingImpaired] = useState(subtitle.hearing_impaired);

  const languageChanged = language !== subtitle.language;

  async function handleSave() {
    await updateMutation.mutateAsync({
      id: subtitle.id,
      patch: {
        language,
        release_name: releaseName,
        hearing_impaired: hearingImpaired,
      },
    });
    onClose();
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>
          {tr("components.admin.subtitles.admin_subtitle_edit_sheet.edit_subtitle")}
        </SheetTitle>
        <SheetDescription>
          {tr(
            "components.admin.subtitles.admin_subtitle_edit_sheet.update_stored_metadata_for_this_subtitle_record_file_content_is",
          )}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-6 px-1 py-2">
        <div className="surface-panel-subtle space-y-3 rounded-xl px-4 py-4">
          <div className="text-sm font-semibold">
            {subtitle.media_title ||
              tr("components.admin.subtitles.admin_subtitle_edit_sheet.unknown_media")}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                languageChipClass(),
              )}
            >
              {subtitle.language.toUpperCase()} · {getLanguageName(subtitle.language)}
            </span>
            <span
              className={cn(
                "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                providerBadgeClass(subtitle.provider),
              )}
            >
              {providerLabel(subtitle.provider)}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="subtitle-language">
            {tr("components.admin.subtitles.admin_subtitle_edit_sheet.language")}
          </Label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger id="subtitle-language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.code.toUpperCase()} · {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {languageChanged && (
            <p className="text-muted-foreground text-xs leading-relaxed">
              {tr(
                "components.admin.subtitles.admin_subtitle_edit_sheet.updates_stored_language_label_file_content_unchanged",
              )}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="subtitle-release-name">
            {tr("components.admin.subtitles.admin_subtitle_edit_sheet.release_name")}
          </Label>
          <Input
            id="subtitle-release-name"
            value={releaseName}
            onChange={(event) => setReleaseName(event.target.value)}
            className="font-mono text-xs"
          />
        </div>

        <div className="border-border/60 flex items-center justify-between rounded-xl border px-4 py-3">
          <div className="space-y-1">
            <Label htmlFor="subtitle-hearing-impaired">
              {tr("components.admin.subtitles.admin_subtitle_edit_sheet.hearing_impaired")}
            </Label>
            <p className="text-muted-foreground text-xs">
              {tr(
                "components.admin.subtitles.admin_subtitle_edit_sheet.marks_this_track_as_sdh_cc",
              )}
            </p>
          </div>
          <Switch
            id="subtitle-hearing-impaired"
            checked={hearingImpaired}
            onCheckedChange={setHearingImpaired}
          />
        </div>
      </div>

      <SheetFooter className="mt-auto gap-2 sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          {tr("common.actions.cancel")}
        </Button>
        <Button type="button" disabled={updateMutation.isPending} onClick={() => void handleSave()}>
          {tr("components.admin.subtitles.admin_subtitle_edit_sheet.save_changes")}
        </Button>
      </SheetFooter>
    </>
  );
}
