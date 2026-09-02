import { useId } from "react";
import { SettingsGroup } from "@/components/settings/SettingsGroup";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

export default function AccessibilitySettings() {
  useUILanguage();
  const { textScale, setTextScale, textWeight, setTextWeight, highContrast, setHighContrast } =
    useTheme();

  const textSizeLabelId = useId();
  const textWeightLabelId = useId();
  const contrastLabelId = useId();

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {tr("pages.settings.accessibility_settings.accessibility")}
      </h2>

      <SettingsGroup
        title={tr("pages.settings.accessibility_settings.readability")}
        description={tr(
          "pages.settings.accessibility_settings.increase_text_size_strengthen_type_weight_and_raise_contrast_for",
        )}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <p id={textSizeLabelId} className="text-sm font-medium">
              {tr("pages.settings.accessibility_settings.text_size")}
            </p>
            <div
              role="radiogroup"
              aria-labelledby={textSizeLabelId}
              className="flex flex-wrap gap-2"
            >
              {[
                {
                  value: "default" as const,
                  label: tr("pages.settings.accessibility_settings.default"),
                },
                {
                  value: "large" as const,
                  label: tr("pages.settings.accessibility_settings.large"),
                },
                {
                  value: "x-large" as const,
                  label: tr("pages.settings.accessibility_settings.extra_large"),
                },
              ].map((option) => (
                <Button
                  key={option.value}
                  role="radio"
                  aria-checked={textScale === option.value}
                  variant={textScale === option.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTextScale(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p id={textWeightLabelId} className="text-sm font-medium">
              {tr("pages.settings.accessibility_settings.text_weight")}
            </p>
            <div
              role="radiogroup"
              aria-labelledby={textWeightLabelId}
              className="flex flex-wrap gap-2"
            >
              {[
                {
                  value: "default" as const,
                  label: tr("pages.settings.accessibility_settings.default"),
                },
                {
                  value: "strong" as const,
                  label: tr("pages.settings.accessibility_settings.bolder"),
                },
              ].map((option) => (
                <Button
                  key={option.value}
                  role="radio"
                  aria-checked={textWeight === option.value}
                  variant={textWeight === option.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTextWeight(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p id={contrastLabelId} className="text-sm font-medium">
              {tr("pages.settings.accessibility_settings.contrast")}
            </p>
            <div
              role="radiogroup"
              aria-labelledby={contrastLabelId}
              className="flex flex-wrap gap-2"
            >
              <Button
                role="radio"
                aria-checked={!highContrast}
                variant={!highContrast ? "default" : "outline"}
                size="sm"
                onClick={() => setHighContrast(false)}
              >
                {tr("pages.settings.accessibility_settings.standard")}
              </Button>
              <Button
                role="radio"
                aria-checked={highContrast}
                variant={highContrast ? "default" : "outline"}
                size="sm"
                onClick={() => setHighContrast(true)}
              >
                {tr("pages.settings.accessibility_settings.high_contrast")}
              </Button>
            </div>
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup
        title={tr("pages.settings.accessibility_settings.preview")}
        description={tr(
          "pages.settings.accessibility_settings.see_how_text_looks_with_your_current_readability_settings",
        )}
      >
        <div className="border-border/50 space-y-2 rounded-lg border p-4">
          <p className="text-lg font-semibold">
            {tr(
              "pages.settings.accessibility_settings.the_quick_brown_fox_jumps_over_the_lazy_dog",
            )}
          </p>
          <p className="text-muted-foreground text-sm">
            {tr(
              "pages.settings.accessibility_settings.this_sample_paragraph_reflects_your_current_text_size_weight_and",
            )}
          </p>
          <p className="text-muted-foreground/70 text-xs">
            {tr(
              "pages.settings.accessibility_settings.secondary_text_middot_metadata_middot_captions",
            )}
          </p>
        </div>
      </SettingsGroup>
    </div>
  );
}
