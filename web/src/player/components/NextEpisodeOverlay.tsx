import type { EpisodeRef } from "../types";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

interface NextEpisodeOverlayProps {
  episode: EpisodeRef;
  secondsRemaining: number;
  onSkip: () => void;
  onCancel: () => void;
}

/**
 * Overlay shown during the credits region with a countdown to the next episode.
 */
export function NextEpisodeOverlay({
  episode,
  secondsRemaining,
  onSkip,
  onCancel,
}: NextEpisodeOverlayProps) {
  useUILanguage();
  return (
    <div className="absolute right-6 bottom-24 z-50 flex min-w-[260px] flex-col gap-2 rounded-lg bg-black/80 p-4 text-white">
      <div className="text-xs tracking-wider text-white/60 uppercase">
        {tr("player.components.next_episode_overlay.up_next_in")} {secondsRemaining}
        {tr("player.components.next_episode_overlay.s")}
      </div>
      <div className="text-sm font-medium">
        {tr("player.components.next_episode_overlay.s_02aa629c")}
        {episode.seasonNumber}
        {tr("player.components.next_episode_overlay.e")}
        {episode.episodeNumber} — {episode.title}
      </div>
      <div className="mt-1 flex gap-2">
        <button
          onClick={onSkip}
          type="button"
          className="flex-1 rounded bg-white px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-white/90"
        >
          {tr("player.components.next_episode_overlay.play_now")}
        </button>
        <button
          onClick={onCancel}
          type="button"
          className="rounded border border-white/30 px-3 py-1.5 text-sm transition-colors hover:bg-white/10"
        >
          {tr("common.actions.cancel")}
        </button>
      </div>
    </div>
  );
}
