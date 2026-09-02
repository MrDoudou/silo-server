import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

/**
 * One-time reveal of a webhook signing secret (profile webhooks and admin
 * server channels). Open while `secret` is non-null.
 */
export function SigningSecretDialog({
  secret,
  onClose,
}: {
  secret: string | null;
  onClose: () => void;
}) {
  useUILanguage();
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open={secret != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {tr("components.signing_secret_dialog.save_your_signing_secret")}
          </DialogTitle>
          <DialogDescription>
            {tr(
              "components.signing_secret_dialog.silo_signs_every_delivery_with_this_secret_so_your_receiver",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="bg-muted flex items-center gap-2 rounded-lg p-3 font-mono text-xs break-all">
          <span className="min-w-0 flex-1">{secret}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => {
              if (secret) {
                void navigator.clipboard.writeText(secret);
                setCopied(true);
              }
            }}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>{tr("components.signing_secret_dialog.i_ve_saved_it")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
