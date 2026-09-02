import { CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

export function WatchedCheckIndicator({ className }: { className?: string }) {
  useUILanguage();
  return (
    <span
      role="img"
      aria-label={tr("components.card_watched_badge.watched")}
      data-watched-indicator="icon-only"
      className={cn("text-muted-foreground inline-flex shrink-0 items-center", className)}
    >
      <CircleCheck aria-hidden="true" className="size-4" />
    </span>
  );
}
