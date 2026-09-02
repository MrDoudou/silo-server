import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

/** Shared confirmation for ending a watch party (lobby page + in-player panel). */
export function EndWatchPartyDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending?: boolean;
}) {
  useUILanguage();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={tr("components.watchtogether.end_watch_party_dialog.end_watch_party")}
      description={tr(
        "components.watchtogether.end_watch_party_dialog.end_the_watch_party_for_everyone",
      )}
      confirmLabel={tr("components.watchtogether.end_watch_party_dialog.end_party")}
      variant="destructive"
      onConfirm={onConfirm}
      isPending={isPending}
    />
  );
}
