import type { AdminSession } from "@/api/types";

import { tr } from "@/i18n/translate";

export type AdminSessionActionName = "pause" | "resume";

export function isSessionPaused(session: AdminSession): boolean {
  return Boolean(session.is_paused);
}

export function getPrimaryPlaybackAction(session: AdminSession): {
  action: AdminSessionActionName;
  label: string;
} {
  if (isSessionPaused(session)) {
    return { action: "resume", label: tr("components.admin_session_action_model.resume") };
  }
  return { action: "pause", label: tr("common.actions.pause") };
}
