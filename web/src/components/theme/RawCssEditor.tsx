import { cn } from "@/lib/utils";
import { MAX_CSS_SIZE } from "@/lib/themeExport";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

interface RawCssEditorProps {
  value: string;
  onChange: (css: string) => void;
}

export function RawCssEditor({ value, onChange }: RawCssEditorProps) {
  useUILanguage();
  const bytes = new TextEncoder().encode(value).length;
  const pct = Math.min(100, (bytes / MAX_CSS_SIZE) * 100);
  const isNearLimit = pct > 90;
  const isOverLimit = bytes > MAX_CSS_SIZE;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          {tr(
            "components.theme.raw_css_editor.write_custom_css_that_is_injected_after_all_theme_variables",
          )}{" "}
          <code className="bg-muted rounded px-1 py-0.5 text-xs">
            {tr("components.theme.raw_css_editor.root")}
          </code>{" "}
          {tr("components.theme.raw_css_editor.to_override_css_custom_properties_directly")}
        </p>
      </div>

      <textarea
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          if (new TextEncoder().encode(next).length <= MAX_CSS_SIZE) {
            onChange(next);
          }
        }}
        placeholder={tr(
          "components.theme.raw_css_editor.example_override_the_primary_color_root_primary_ff6b6b_example_custom",
        )}
        spellCheck={false}
        className={cn(
          "border-border bg-background text-foreground placeholder:text-muted-foreground/50 min-h-[240px] w-full resize-y rounded-xl border p-3 font-mono text-[13px] leading-relaxed focus:ring-2 focus:outline-none",
          isOverLimit ? "focus:ring-destructive" : "focus:ring-ring",
        )}
      />

      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-[11px]">
          {tr(
            "components.theme.raw_css_editor.preview_updates_as_you_type_saved_automatically_after_you_pause",
          )}
        </p>
        <span
          className={cn(
            "font-mono text-[11px]",
            isOverLimit
              ? "text-destructive"
              : isNearLimit
                ? "text-warning"
                : "text-muted-foreground",
          )}
        >
          {(bytes / 1024).toFixed(1)} / {MAX_CSS_SIZE / 1024}{" "}
          {tr("components.theme.raw_css_editor.kb")}
        </span>
      </div>
    </div>
  );
}
