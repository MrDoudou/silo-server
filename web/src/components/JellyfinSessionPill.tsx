import type { AdminSession } from "@/api/types";
import { isJellyfinSession } from "@/pages/adminActivityPresentation";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

/**
 * Purple "JF" pill marking a session served through the Jellyfin compatibility
 * surface (server-identified via is_jellyfin_client). Renders nothing for
 * native sessions, so callers can drop it into any badge row unconditionally.
 */
export function JellyfinSessionPill({ session }: { session: AdminSession }) {
  useUILanguage();
  if (!isJellyfinSession(session)) {
    return null;
  }
  return (
    <span
      className="inline-flex flex-shrink-0 rounded border border-[#AA5CC3]/30 bg-[#AA5CC3]/15 px-1.5 py-0.5 text-[9px] font-semibold text-[#AA5CC3]"
      title={tr("components.jellyfin_session_pill.jellyfin_client")}
    >
      {tr("components.jellyfin_session_pill.jf")}
    </span>
  );
}
