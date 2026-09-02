import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import {
  AUDIOBOOK_RATE_MAX,
  AUDIOBOOK_RATE_MIN,
  AUDIOBOOK_RATE_PRESETS,
  AUDIOBOOK_RATE_STEP,
  clampAudiobookRate,
} from "./useAudiobookPrefs";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

const HOLD_DELAY_MS = 250;
const HOLD_REPEAT_MS = 80;

export function formatRate(rate: number): string {
  return `${rate}×`;
}

interface SpeedControlProps {
  value: number;
  onChange: (rate: number) => void;
}

/**
 * Audiobook playback speed popover: fine ±0.05 stepper (press-and-hold to
 * repeat) plus quick presets. The chosen rate is remembered per book by the
 * playback engine.
 */
export function SpeedControl({ value, onChange }: SpeedControlProps) {
  useUILanguage();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  const holdTimerRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  valueRef.current = value;

  const handleBlur = useCallback((e: React.FocusEvent) => {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const step = useCallback(
    (direction: 1 | -1) => {
      onChange(clampAudiobookRate(valueRef.current + direction * AUDIOBOOK_RATE_STEP));
    },
    [onChange],
  );

  const stopHold = useCallback(() => {
    if (holdTimerRef.current != null) window.clearTimeout(holdTimerRef.current);
    if (holdIntervalRef.current != null) window.clearInterval(holdIntervalRef.current);
    holdTimerRef.current = null;
    holdIntervalRef.current = null;
  }, []);

  const startHold = useCallback(
    (direction: 1 | -1) => {
      step(direction);
      stopHold();
      holdTimerRef.current = window.setTimeout(() => {
        holdIntervalRef.current = window.setInterval(() => step(direction), HOLD_REPEAT_MS);
      }, HOLD_DELAY_MS);
    },
    [step, stopHold],
  );

  useEffect(() => stopHold, [stopHold]);

  const handlePopoverKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      }
    },
    [step],
  );

  return (
    <div ref={containerRef} className="relative" onBlur={handleBlur}>
      <button
        type="button"
        className="player-utility-btn min-w-[3.25rem] px-2 text-xs tabular-nums"
        onClick={() => setOpen((v) => !v)}
        aria-label={tr("pages.audiobooks.player.speed_control.playback_speed")}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={tr("pages.audiobooks.player.speed_control.playback_speed_shift_shift")}
      >
        {formatRate(value)}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={tr("pages.audiobooks.player.speed_control.playback_speed")}
          className="absolute right-0 bottom-full mb-2 flex w-[230px] flex-col gap-3 rounded-lg bg-black/90 px-4 py-3 shadow-xl backdrop-blur-sm"
          onKeyDown={handlePopoverKeyDown}
        >
          <div className="flex items-center justify-between">
            <StepperButton
              direction={-1}
              disabled={value <= AUDIOBOOK_RATE_MIN}
              onHoldStart={startHold}
              onHoldStop={stopHold}
            />
            <span className="min-w-[4.5rem] text-center font-mono text-lg text-white tabular-nums">
              {formatRate(value)}
            </span>
            <StepperButton
              direction={1}
              disabled={value >= AUDIOBOOK_RATE_MAX}
              onHoldStart={startHold}
              onHoldStop={stopHold}
            />
          </div>

          <div className="flex flex-wrap justify-center gap-1.5">
            {AUDIOBOOK_RATE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                data-active={preset === value ? "true" : undefined}
                className={
                  "rounded-full px-2.5 py-1 text-xs tabular-nums transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none " +
                  (preset === value ? "bg-white/15 text-white" : "text-white/60")
                }
                onClick={() => onChange(preset)}
              >
                {formatRate(preset)}
              </button>
            ))}
          </div>

          <p className="text-center text-[11px] text-white/40">
            {tr("pages.audiobooks.player.speed_control.remembered_for_this_book")}
          </p>
        </div>
      )}
    </div>
  );
}

function StepperButton({
  direction,
  disabled,
  onHoldStart,
  onHoldStop,
}: {
  direction: 1 | -1;
  disabled: boolean;
  onHoldStart: (direction: 1 | -1) => void;
  onHoldStop: () => void;
}) {
  useUILanguage();
  const Icon = direction === 1 ? Plus : Minus;
  return (
    <button
      type="button"
      aria-label={
        direction === 1
          ? tr("pages.audiobooks.player.speed_control.faster")
          : tr("pages.audiobooks.player.speed_control.slower")
      }
      disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded-full text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
      onPointerDown={(e) => {
        // Keep focus behavior; only pointer presses start the hold-repeat.
        if (e.button === 0 || e.pointerType !== "mouse") onHoldStart(direction);
      }}
      onPointerUp={onHoldStop}
      onPointerLeave={onHoldStop}
      onPointerCancel={onHoldStop}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onHoldStart(direction);
        }
      }}
      onKeyUp={onHoldStop}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
