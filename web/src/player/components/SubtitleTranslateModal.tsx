import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { toast } from "@/i18n/toast";
import type { PlayerConfig } from "../context/PlayerConfigContext";
import type { PlayerAudioTrack, PlayerSubtitleInfo } from "../types";
import { playerFetch, PlayerFetchError } from "../player-fetch";
import { LANGUAGES, getLanguageName } from "../utils/languageNames";
import {
  buildSubtitleTranslateRequest,
  isTranslatableSource,
  type SubtitleTranslateMode,
} from "./subtitleTranslateRequest";
import { QUOTA_PERIOD_WINDOW_LABELS } from "@/lib/quotaPeriods";
import { useUILanguage } from "@/i18n/uiText";

import { tr } from "@/i18n/translate";

interface SubtitleTranslateModalProps {
  mediaFileId: number;
  playerConfig: PlayerConfig;
  tracks: PlayerSubtitleInfo[];
  audioTracks?: PlayerAudioTrack[];
  translateEnabled?: boolean;
  transcribeEnabled?: boolean;
  isOpen: boolean;
  sessionId?: string;
  getStartPosition?: () => number;
  onClose: () => void;
}

function sourceLabel(track: PlayerSubtitleInfo): string {
  const lang = getLanguageName(track.language) || track.language || "Unknown";
  const origin = track.source ? ` · ${track.source}` : "";
  return `${lang}${origin}`;
}

function audioLabel(track: PlayerAudioTrack, i: number): string {
  const lang = getLanguageName(track.language ?? "") || track.language || `Track ${i + 1}`;
  const layout = track.layout ? ` · ${track.layout}` : "";
  return `${lang}${layout}${track.default ? " · default" : ""}`;
}

// Per-user transcription quota as reported by GET /subtitles/ai/quota.
// `limited` is false when no quota applies to the caller.
interface TranscribeQuota {
  limited: boolean;
  limit: number;
  used: number;
  remaining: number;
  period: string;
}

export function SubtitleTranslateModal({
  mediaFileId,
  playerConfig,
  tracks,
  audioTracks,
  translateEnabled = true,
  transcribeEnabled = false,
  isOpen,
  sessionId,
  getStartPosition,
  onClose,
}: SubtitleTranslateModalProps) {
  useUILanguage();
  // Only offer sources the server can actually translate (excludes live tracks,
  // bitmap embedded tracks, and ASS/non-text external/downloaded tracks).
  const sourceTracks = useMemo(() => tracks.filter(isTranslatableSource), [tracks]);
  const canTranslate = translateEnabled && sourceTracks.length > 0;
  const canTranscribe = transcribeEnabled && (audioTracks?.length ?? 0) > 0;
  // Subtitle translation is the default; generating from audio takes over when
  // it's the only possible path (e.g. bitmap-only files).
  const [mode, setMode] = useState<SubtitleTranslateMode>(canTranslate ? "subtitles" : "audio");
  const [sourceIndex, setSourceIndex] = useState<number | null>(null);
  const [audioIndex, setAudioIndex] = useState(0);
  const [targetLang, setTargetLang] = useState("en");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<TranscribeQuota | null>(null);

  const effectiveSourceIndex = sourceIndex ?? sourceTracks[0]?.index ?? null;
  const quotaExhausted = quota !== null && quota.remaining <= 0;
  const quotaPeriodLabel = quota ? (QUOTA_PERIOD_WINDOW_LABELS[quota.period] ?? quota.period) : "";

  // Best-effort: a failed lookup just hides the counter — the server still
  // enforces the quota.
  const refreshQuota = useCallback(() => {
    playerFetch<TranscribeQuota>(playerConfig, "/subtitles/ai/quota")
      .then((q) => setQuota(q?.limited ? q : null))
      .catch(() => setQuota(null));
  }, [playerConfig]);

  // Refresh the transcription quota each time the modal opens, so the user
  // sees how many jobs they have left before starting one.
  useEffect(() => {
    if (!isOpen || !canTranscribe) return;
    refreshQuota();
  }, [isOpen, canTranscribe, refreshQuota]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const handleTranslate = useCallback(async () => {
    const fromAudio = mode === "audio";
    if (!fromAudio && effectiveSourceIndex === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const body = buildSubtitleTranslateRequest({
        mode,
        mediaFileId,
        sourceTracks,
        effectiveSourceIndex,
        audioTracks,
        audioIndex,
        targetLang,
        sessionId,
        startPosition: getStartPosition?.() ?? 0,
      });
      const res = await playerFetch<{ job?: { status?: string } }>(
        playerConfig,
        "/subtitles/ai/translate",
        { method: "POST", body: JSON.stringify(body) },
      );
      // A request that collapses onto an already-running job (e.g. after a
      // reload, or a second viewer) won't get its own live stream — tell the
      // user it's underway; it'll appear via the subtitle-ready refresh.
      if (res?.job?.status === "running") {
        toast.info(
          "feedback.player.components.subtitle_translate_modal.a_job_for_this_track_is_already_in_progress_it",
        );
      }
      // Otherwise the player takes over: it pauses, streams cues in as they're
      // generated, then resumes once your position is covered.
      onClose();
    } catch (err) {
      // A quota rejection means the cached counter was stale (e.g. another
      // device used the last slot) — refresh it so the banner and the
      // disabled Generate button match the error we're about to show.
      if (err instanceof PlayerFetchError && err.code === "quota_exceeded") {
        refreshQuota();
      }
      setError(
        tr.error(
          mode === "audio"
            ? "errors.player.components.subtitle_translate_modal.couldn_t_start_subtitle_generation"
            : "errors.player.components.subtitle_translate_modal.couldn_t_start_translation",
          err,
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    mode,
    effectiveSourceIndex,
    sourceTracks,
    audioTracks,
    audioIndex,
    mediaFileId,
    targetLang,
    sessionId,
    getStartPosition,
    playerConfig,
    onClose,
    refreshQuota,
  ]);

  if (!isOpen) return null;

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={tr("player.components.subtitle_translate_modal.translate_subtitles_with_ai")}
    >
      <div
        className="w-full max-w-[440px] rounded-lg bg-neutral-900 text-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold">
            {mode === "audio"
              ? tr("player.components.subtitle_translate_modal.generate_subtitles_with_ai")
              : tr("player.components.subtitle_translate_modal.translate_subtitles_with_ai")}
          </h2>
          <button
            type="button"
            className="rounded text-white/60 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
            onClick={onClose}
            aria-label={tr("common.actions.close")}
          >
            ✕
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          {canTranslate && canTranscribe && (
            <div className="flex gap-1 rounded bg-neutral-800 p-1" role="tablist">
              {(
                [
                  ["subtitles", "From subtitles"],
                  ["audio", "From audio"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={mode === value}
                  className={
                    "flex-1 rounded px-2 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none " +
                    (mode === value
                      ? "bg-white/15 text-white"
                      : "text-white/50 hover:text-white/80")
                  }
                  onClick={() => setMode(value)}
                  disabled={submitting}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {!canTranslate && !canTranscribe ? (
            <p className="py-4 text-center text-xs text-white/50">
              {tr(
                "player.components.subtitle_translate_modal.no_text_subtitle_track_is_available_to_translate_add_or",
              )}
            </p>
          ) : (
            <>
              {mode === "subtitles" ? (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-white/60">
                    {tr("player.components.subtitle_translate_modal.translate_from")}
                  </span>
                  <select
                    className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm text-white focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none disabled:opacity-50"
                    value={effectiveSourceIndex ?? ""}
                    onChange={(e) => setSourceIndex(Number(e.target.value))}
                    disabled={submitting}
                  >
                    {sourceTracks.map((track) => (
                      <option key={track.index} value={track.index}>
                        {sourceLabel(track)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-white/60">
                    {tr("player.components.subtitle_translate_modal.audio_track")}
                  </span>
                  <select
                    className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm text-white focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none disabled:opacity-50"
                    value={audioIndex}
                    onChange={(e) => setAudioIndex(Number(e.target.value))}
                    disabled={submitting}
                  >
                    {(audioTracks ?? []).map((track, i) => (
                      <option key={i} value={i}>
                        {audioLabel(track, i)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-white/60">
                  {mode === "audio"
                    ? tr("player.components.subtitle_translate_modal.subtitle_language")
                    : tr("player.components.subtitle_translate_modal.translate_to")}
                </span>
                <select
                  className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm text-white focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none disabled:opacity-50"
                  value={targetLang}
                  onChange={(e) => setTargetLang(e.target.value)}
                  disabled={submitting}
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </label>

              {mode === "audio" && quota && (
                <p
                  className={
                    "text-[11px] leading-relaxed " +
                    (quotaExhausted ? "text-amber-300/90" : "text-white/35")
                  }
                >
                  {quotaExhausted
                    ? tr(
                        "player.components.subtitle_translate_modal.you_ve_used_all_limit_transcriptions_for_the_last_quota",
                        { limit: quota.limit, quotaPeriodLabel: quotaPeriodLabel },
                      )
                    : tr(
                        "player.components.subtitle_translate_modal.remaining_of_limit_transcriptions_left_for_the_last_quota_period",
                        {
                          remaining: quota.remaining,
                          limit: quota.limit,
                          quotaPeriodLabel: quotaPeriodLabel,
                        },
                      )}
                </p>
              )}

              {error && (
                <div role="alert" className="rounded bg-red-900/40 px-3 py-2 text-xs text-red-300">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  className="rounded px-3 py-1.5 text-sm text-white/60 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
                  onClick={onClose}
                >
                  {tr("common.actions.cancel")}
                </button>
                <button
                  type="button"
                  className="rounded bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none disabled:opacity-50"
                  onClick={handleTranslate}
                  disabled={
                    submitting ||
                    (mode === "subtitles" && effectiveSourceIndex === null) ||
                    (mode === "audio" && quotaExhausted)
                  }
                >
                  {submitting
                    ? tr("player.components.subtitle_translate_modal.starting")
                    : mode === "audio"
                      ? tr("player.components.subtitle_translate_modal.generate")
                      : tr("player.components.subtitle_translate_modal.translate")}
                </button>
              </div>

              <p className="text-[11px] leading-relaxed text-white/35">
                {mode === "audio"
                  ? tr(
                      "player.components.subtitle_translate_modal.the_audio_is_transcribed_on_the_server_and_translated_if",
                    )
                  : tr(
                      "player.components.subtitle_translate_modal.playback_pauses_while_the_first_lines_are_translated_then_resumes",
                    )}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
