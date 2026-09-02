import { X, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { SeekBar, formatTime } from "@/player/components/SeekBar";
import { ChaptersMenu } from "@/player/components/ChaptersMenu";
import { CircleButton } from "@/player/components/CircleButton";
import { SleepTimerMenu } from "@/player/components/SleepTimerMenu";
import { VolumeControl } from "@/player/components/VolumeControl";
import { CoverExpandTile } from "./CoverExpandTile";
import { PlayerSettingsMenu } from "./PlayerSettingsMenu";
import { SkipIcon } from "./SkipIcon";
import { SpeedControl } from "./SpeedControl";
import type { AudiobookPlayback } from "./useAudiobookPlayback";
import type { AudiobookPrefs } from "./useAudiobookPrefs";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

interface MiniBarProps {
  contentId: string;
  title?: string;
  posterUrl?: string;
  playback: AudiobookPlayback;
  prefs: AudiobookPrefs;
  onClose?: () => void;
  onExpand?: () => void;
}

export function MiniBar({
  contentId,
  title,
  posterUrl,
  playback,
  prefs,
  onClose,
  onExpand,
}: MiniBarProps) {
  useUILanguage();
  const hasChapters = playback.chapters.length > 0;
  const hasNextChapter =
    playback.currentChapter != null && playback.currentChapter.index + 1 < playback.chapters.length;

  return (
    <div
      className="bg-background fixed right-0 bottom-0 z-40 border-t px-3 pt-2 pb-2 shadow-lg sm:px-6"
      style={{ left: "var(--app-sidebar-offset, 0px)" }}
    >
      <SeekBar
        currentTime={playback.currentTime}
        duration={playback.duration}
        buffered={playback.buffered}
        chapters={playback.chapters}
        onSeek={playback.seekTo}
      />

      <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-5">
        <div className="flex min-w-0 items-center gap-3">
          <CoverExpandTile
            contentId={contentId}
            posterUrl={posterUrl}
            title={title}
            onExpand={onExpand}
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            {title ? (
              <div
                className="truncate text-[14px] leading-tight font-semibold tracking-tight sm:text-[15px]"
                title={title}
              >
                {title}
              </div>
            ) : null}
            {playback.currentChapter ? (
              <div
                data-testid="minibar-chapter-title"
                className="text-muted-foreground truncate text-[11px] leading-tight"
                title={playback.currentChapter.title}
              >
                {playback.currentChapter.title}
              </div>
            ) : null}
            <div className="text-muted-foreground flex items-center gap-2 text-[10px] leading-tight uppercase">
              <span className="font-mono text-[11px] tracking-[0.12em] normal-case tabular-nums">
                {formatTime(playback.currentTime)}
                <span className="mx-1 opacity-50">/</span>
                {formatTime(playback.duration)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 sm:gap-3">
          {hasChapters && (
            <span className="hidden sm:contents">
              <CircleButton
                size="sm"
                variant="secondary"
                ariaLabel={tr("pages.audiobooks.player.mini_bar.previous_chapter")}
                title={tr("pages.audiobooks.player.mini_bar.previous_chapter_p")}
                onClick={playback.prevChapter}
                disabled={!playback.hasFile}
              >
                <SkipBack className="h-4 w-4" strokeWidth={0} fill="currentColor" />
              </CircleButton>
            </span>
          )}

          <CircleButton
            size="sm"
            variant="secondary"
            ariaLabel={tr("pages.audiobooks.player.mini_bar.back_value1_seconds", {
              value1: prefs.skipBack,
            })}
            title={tr("pages.audiobooks.player.mini_bar.back_skip_back_seconds", {
              skipBack: prefs.skipBack,
            })}
            className="group"
            onClick={() => playback.skip(-prefs.skipBack)}
            disabled={!playback.hasFile}
          >
            <SkipIcon direction="back" seconds={prefs.skipBack} />
          </CircleButton>

          <CircleButton
            size="md"
            variant="primary"
            ariaLabel={tr(playback.playing ? "common.actions.pause" : "common.actions.play")}
            title={
              playback.playing
                ? tr("pages.audiobooks.player.mini_bar.pause_space")
                : tr("pages.audiobooks.player.mini_bar.play_space")
            }
            onClick={playback.togglePlay}
            disabled={!playback.hasFile}
            data-paused={!playback.playing}
          >
            {playback.playing ? (
              <Pause className="h-5 w-5" strokeWidth={0} fill="currentColor" />
            ) : (
              <Play className="ml-[2px] h-5 w-5" strokeWidth={0} fill="currentColor" />
            )}
          </CircleButton>

          <CircleButton
            size="sm"
            variant="secondary"
            ariaLabel={tr("pages.audiobooks.player.mini_bar.forward_value1_seconds", {
              value1: prefs.skipForward,
            })}
            title={tr("pages.audiobooks.player.mini_bar.forward_skip_forward_seconds", {
              skipForward: prefs.skipForward,
            })}
            className="group"
            onClick={() => playback.skip(prefs.skipForward)}
            disabled={!playback.hasFile}
          >
            <SkipIcon direction="forward" seconds={prefs.skipForward} />
          </CircleButton>

          {hasChapters && (
            <span className="hidden sm:contents">
              <CircleButton
                size="sm"
                variant="secondary"
                ariaLabel={tr("pages.audiobooks.player.mini_bar.next_chapter")}
                title={tr("pages.audiobooks.player.mini_bar.next_chapter_n")}
                onClick={playback.nextChapter}
                disabled={!playback.hasFile || !hasNextChapter}
              >
                <SkipForward className="h-4 w-4" strokeWidth={0} fill="currentColor" />
              </CircleButton>
            </span>
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          <div className="hidden md:block">
            <VolumeControl
              tone="surface"
              volume={playback.volume}
              muted={playback.muted}
              onVolumeChange={playback.setVolume}
              onMutedChange={playback.setMuted}
            />
          </div>
          <SleepTimerMenu
            setting={playback.sleep.setting}
            remainingMs={playback.sleep.remainingMs}
            onChange={playback.setSleep}
          />
          {hasChapters && (
            <ChaptersMenu
              chapters={playback.chapters}
              currentTime={playback.currentTime}
              onSeek={playback.seekTo}
            />
          )}
          <SpeedControl value={playback.rate} onChange={playback.setRate} />
          <PlayerSettingsMenu prefs={prefs} />
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={tr("pages.audiobooks.player.mini_bar.close_player")}
              className="text-muted-foreground hover:text-foreground rounded p-1.5"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
