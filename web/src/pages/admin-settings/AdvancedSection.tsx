import { useId, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export const ADVANCED_SETTINGS_DESCRIPTION =
  "These keep their defaults unless you change them. Most installs can leave this closed.";

interface AdvancedSectionProps {
  title?: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** panel matches FieldGroup; flush sits in a page that already provides the surface. */
  variant?: "panel" | "flush";
  contentClassName?: string;
}

export function AdvancedSection({
  title = "Advanced",
  description = ADVANCED_SETTINGS_DESCRIPTION,
  children,
  defaultOpen = false,
  variant = "panel",
  contentClassName,
}: AdvancedSectionProps) {
  const labelId = useId();
  const contentId = useId();

  return (
    <details
      className={cn(
        "group",
        variant === "panel" && "surface-panel rounded-2xl border-0 p-4 sm:p-5",
      )}
      defaultOpen={defaultOpen}
    >
      <summary
        aria-controls={contentId}
        className="focus-visible:ring-ring flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg focus-visible:ring-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden"
      >
        <div className="min-w-0">
          <div
            id={labelId}
            className="text-muted-foreground text-xs font-semibold tracking-[0.22em] uppercase"
          >
            {title}
          </div>
          {description ? (
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{description}</p>
          ) : null}
        </div>
        <ChevronDown
          className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div
        id={contentId}
        role="group"
        aria-labelledby={labelId}
        className={cn("divide-border mt-3 divide-y border-t pt-1", contentClassName)}
      >
        {children}
      </div>
    </details>
  );
}
