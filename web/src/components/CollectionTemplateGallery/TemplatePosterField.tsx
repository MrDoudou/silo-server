import { Check } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { CollectionTemplate } from "@/lib/collectionTemplates";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

export type TemplatePosterMode = "default" | "custom";

interface TemplatePosterFieldProps {
  template: CollectionTemplate;
  mode: TemplatePosterMode;
  onModeChange: (mode: TemplatePosterMode) => void;
  customUrl: string;
  onCustomUrlChange: (value: string) => void;
  inputId: string;
}

export function TemplatePosterField({
  template,
  mode,
  onModeChange,
  customUrl,
  onCustomUrlChange,
  inputId,
}: TemplatePosterFieldProps) {
  useUILanguage();
  const hasDefaultPoster = Boolean(template.poster_path);

  return (
    <div className="space-y-2">
      <Label>{tr("components.collection_template_gallery.template_poster_field.poster")}</Label>
      <div className="border-border space-y-3 rounded-md border p-3">
        {hasDefaultPoster ? (
          <div
            role="radiogroup"
            aria-label={tr(
              "components.collection_template_gallery.template_poster_field.poster_source",
            )}
            className="grid gap-2 sm:grid-cols-2"
          >
            <PosterChoiceButton
              label={tr(
                "components.collection_template_gallery.template_poster_field.server_default",
              )}
              active={mode === "default"}
              onClick={() => onModeChange("default")}
            />
            <PosterChoiceButton
              label={tr("components.collection_template_gallery.template_poster_field.custom_url")}
              active={mode === "custom"}
              onClick={() => onModeChange("custom")}
            />
          </div>
        ) : null}

        {mode === "default" && template.poster_path ? (
          <div className="flex items-center gap-3">
            <img
              src={template.poster_path}
              alt=""
              loading="lazy"
              className="border-border bg-muted h-20 w-14 shrink-0 rounded-md border object-cover"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {tr("components.collection_template_gallery.template_poster_field.server_default")}
              </p>
              <p className="text-muted-foreground truncate text-xs">{template.poster_path}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Input
              id={inputId}
              type="url"
              value={customUrl}
              onChange={(event) => onCustomUrlChange(event.target.value)}
              placeholder={tr(
                "components.collection_template_gallery.template_poster_field.https_example_com_poster_jpg",
              )}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PosterChoiceButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  useUILanguage();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "border-border hover:bg-accent flex h-9 items-center justify-between rounded-md border px-3 text-sm transition-colors",
        active && "border-primary bg-primary/10 text-primary",
      )}
    >
      <span>{label}</span>
      {active ? <Check className="h-4 w-4" aria-hidden /> : null}
    </button>
  );
}
