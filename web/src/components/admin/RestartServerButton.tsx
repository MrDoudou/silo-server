import { useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { api } from "@/api/client";
import { RotateCcw } from "lucide-react";
import { toast } from "@/i18n/toast";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

export interface RestartServerButtonProps {
  label?: string;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
  className?: string;
}

export function RestartServerButton({
  label = "Restart Server",
  variant = "outline",
  size = "sm",
  className,
}: RestartServerButtonProps = {}) {
  useUILanguage();
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleRestart() {
    try {
      await api("/admin/server/restart", { method: "POST" });
      toast.success("feedback.admin.restart_server_button.server_is_restarting");
    } catch {
      toast.error(
        "errors.admin.restart_server_button.could_not_restart_server_please_restart_manually",
      );
    }
    setShowConfirm(false);
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setShowConfirm(true)}
      >
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
        {label}
      </Button>
      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title={tr("components.admin.restart_server_button.restart_server")}
        description={tr(
          "components.admin.restart_server_button.the_server_will_restart_to_apply_configuration_changes_active_streams",
        )}
        confirmLabel={tr("components.admin.restart_server_button.restart")}
        variant="destructive"
        onConfirm={handleRestart}
      />
    </>
  );
}
