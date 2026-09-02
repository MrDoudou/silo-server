import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { MoreHorizontal, MessageSquare, Pause, Play, Square, OctagonAlert } from "lucide-react";
import { toast } from "@/i18n/toast";
import { api } from "@/api/client";
import type { AdminSession } from "@/api/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getPrimaryPlaybackAction, isSessionPaused } from "./adminSessionActionModel";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

type SessionActionKind = "pause" | "resume" | "stop" | "terminate" | "message";

interface AdminSessionActionsProps {
  session: AdminSession;
  compact?: boolean;
  layout?: "menu" | "inline";
  extraMenuItems?: ReactNode;
  inlinePrefixActions?: ReactNode;
  showInlineTerminate?: boolean;
}

type SessionCommandResponse = {
  command_id: string;
  status: string;
};

const successMessages: Record<Exclude<SessionActionKind, "message">, string> = {
  pause: "Pause command sent",
  resume: "Resume command sent",
  stop: "Stop command sent",
  terminate: "Terminate command sent",
};

const fallbackMessages: Record<Exclude<SessionActionKind, "message">, string> = {
  pause: "Pause could not reach the player directly. Silo will end the session shortly instead.",
  resume: "Resume could not reach the player directly. Silo will end the session shortly instead.",
  stop: "Stop could not reach the player directly. Silo will end the session shortly instead.",
  terminate:
    "Terminate could not reach the player directly. Silo will end the session shortly instead.",
};

const unsupportedPlaybackControlCopy =
  "This session does not support live pause, resume, or messages. Stop and Terminate can still end playback.";

export function AdminSessionActions({
  session,
  compact = false,
  layout = "menu",
  extraMenuItems,
  inlinePrefixActions,
  showInlineTerminate = false,
}: AdminSessionActionsProps) {
  useUILanguage();
  const [pendingAction, setPendingAction] = useState<SessionActionKind | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [optimisticPaused, setOptimisticPaused] = useState<boolean | null>(null);
  const supportsPlaybackControl = session.has_playback_control !== false;

  useEffect(() => {
    setOptimisticPaused(null);
  }, [session.session_id, session.is_paused]);

  useEffect(() => {
    if (!supportsPlaybackControl) {
      setMessageOpen(false);
    }
  }, [supportsPlaybackControl]);

  const paused = optimisticPaused ?? isSessionPaused(session);
  const primaryAction = paused
    ? { action: "resume" as const, label: tr("components.admin_session_actions.resume") }
    : getPrimaryPlaybackAction(session);

  async function runAction(action: Exclude<SessionActionKind, "message">) {
    setPendingAction(action);
    try {
      const response = await api<SessionCommandResponse>(
        `/admin/sessions/${session.session_id}/${action}`,
        {
          method: "POST",
        },
      );
      if (response.status === "dispatched" && action === "pause") {
        setOptimisticPaused(true);
      } else if (response.status === "dispatched" && action === "resume") {
        setOptimisticPaused(false);
      }
      toast.success("feedback.admin_session_actions.reported_message", {
        values: {
          message:
            response.status === "fallback_scheduled"
              ? fallbackMessages[action]
              : successMessages[action],
        },
      });
    } catch (error) {
      toast.error("errors.admin_session_actions.failed_to_send_session_command", { error: error });
    } finally {
      setPendingAction(null);
    }
  }

  async function sendMessage() {
    const trimmed = message.trim();
    if (!trimmed) {
      toast.error("errors.admin_session_actions.message_is_required");
      return;
    }

    setPendingAction("message");
    try {
      await api<SessionCommandResponse>(`/admin/sessions/${session.session_id}/message`, {
        method: "POST",
        body: JSON.stringify({ message: trimmed }),
      });
      toast.success("feedback.admin_session_actions.message_sent");
      setMessage("");
      setMessageOpen(false);
    } catch (error) {
      toast.error("errors.admin_session_actions.failed_to_send_message", { error: error });
    } finally {
      setPendingAction(null);
    }
  }

  const terminateButton = showInlineTerminate ? (
    <Button
      variant="outline"
      size="sm"
      className={
        compact
          ? "border-destructive/40 text-destructive hover:bg-destructive/10 h-7 gap-1.5 px-2 text-[11px]"
          : "border-destructive/40 text-destructive hover:bg-destructive/10"
      }
      onClick={() => void runAction("terminate")}
      disabled={pendingAction !== null}
    >
      <OctagonAlert className="h-3.5 w-3.5" />
      {tr("components.admin_session_actions.terminate")}
    </Button>
  ) : null;

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={compact ? "h-7 w-7" : "h-8 w-8"}
          aria-label={tr("components.admin_session_actions.session_actions")}
          disabled={pendingAction !== null}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {layout === "menu" ? (
          <>
            <DropdownMenuLabel>
              {supportsPlaybackControl
                ? tr("components.admin_session_actions.playback_actions")
                : tr("components.admin_session_actions.limited_playback_actions")}
            </DropdownMenuLabel>
            {supportsPlaybackControl ? (
              <DropdownMenuItem onSelect={() => void runAction(primaryAction.action)}>
                {primaryAction.action === "pause" ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {primaryAction.label}
              </DropdownMenuItem>
            ) : (
              <>
                <div className="text-muted-foreground px-2 py-1.5 text-xs leading-5">
                  {unsupportedPlaybackControlCopy}
                </div>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onSelect={() => void runAction("stop")}>
              <Square className="h-4 w-4" />
              {tr("common.actions.stop")}
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuLabel>
            {tr("components.admin_session_actions.session_actions_66febf73")}
          </DropdownMenuLabel>
        )}
        {extraMenuItems ? (
          <>
            {layout === "menu" ? <DropdownMenuSeparator /> : null}
            {extraMenuItems}
          </>
        ) : null}
        {supportsPlaybackControl ? (
          <DropdownMenuItem onSelect={() => setMessageOpen(true)}>
            <MessageSquare className="h-4 w-4" />
            {tr("components.admin_session_actions.message")}
          </DropdownMenuItem>
        ) : layout === "inline" ? (
          <>
            <div className="text-muted-foreground px-2 py-1.5 text-xs leading-5">
              {unsupportedPlaybackControlCopy}
            </div>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {showInlineTerminate ? null : (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => void runAction("terminate")}>
              <OctagonAlert className="h-4 w-4" />
              {tr("components.admin_session_actions.terminate")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      {layout === "inline" ? (
        <div className="flex items-center justify-end gap-1.5">
          {inlinePrefixActions}
          {terminateButton}
          {menu}
        </div>
      ) : (
        menu
      )}

      <Dialog
        open={supportsPlaybackControl && messageOpen}
        onOpenChange={(nextOpen) => setMessageOpen(supportsPlaybackControl && nextOpen)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tr("components.admin_session_actions.send_message")}</DialogTitle>
            <DialogDescription>
              {tr("components.admin_session_actions.send_a_custom_message_to")}{" "}
              {session.username ||
                tr("components.admin_session_actions.user_user_id", {
                  user_id: session.user_id,
                })}{" "}
              {tr("components.admin_session_actions.during_playback")}
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={4}
            placeholder={tr(
              "components.admin_session_actions.server_restart_in_5_minutes_please_finish_this_episode_soon",
            )}
            className="border-border bg-background text-foreground min-h-24 w-full resize-y rounded-md border px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMessageOpen(false)}
              disabled={pendingAction === "message"}
            >
              {tr("common.actions.cancel")}
            </Button>
            <Button onClick={() => void sendMessage()} disabled={pendingAction === "message"}>
              {tr("components.admin_session_actions.send_message")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
