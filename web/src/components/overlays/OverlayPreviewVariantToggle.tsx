import { cn } from "@/lib/utils";
import type { OverlayPreviewVariant } from "./OverlayPreviewCard";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

interface OverlayPreviewVariantToggleProps {
  value: OverlayPreviewVariant;
  onChange: (value: OverlayPreviewVariant) => void;
  className?: string;
}

const VARIANTS: readonly OverlayPreviewVariant[] = ["movie", "show"];

/**
 * Pill pair that picks which sample data <OverlayPreviewCard /> renders. Shared
 * by the user Card Overlays page and the admin defaults editor so both can
 * preview show-only overlays (network, show status) while editing. The choice
 * is local view state on both surfaces and is deliberately never persisted.
 */
export function OverlayPreviewVariantToggle({
  value,
  onChange,
  className,
}: OverlayPreviewVariantToggleProps) {
  useUILanguage();
  return (
    <div
      className={cn("flex gap-1.5", className)}
      role="group"
      aria-label={tr("components.overlays.overlay_preview_variant_toggle.preview_sample")}
    >
      {VARIANTS.map((variant) => (
        <button
          key={variant}
          type="button"
          onClick={() => onChange(variant)}
          aria-pressed={value === variant}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors",
            value === variant
              ? "border-primary bg-primary/10 text-primary"
              : "border-border/60 hover:border-border text-muted-foreground",
          )}
        >
          {variant}
        </button>
      ))}
    </div>
  );
}
