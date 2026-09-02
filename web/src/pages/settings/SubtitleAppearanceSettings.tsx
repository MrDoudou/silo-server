import { useId, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { SettingsGroup } from "@/components/settings/SettingsGroup";
import { LanguageSelect } from "@/components/settings/LanguageSelect";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSubtitleAppearanceSetting } from "@/hooks/queries/subtitleAppearance";
import { useEffectiveSettings } from "@/hooks/queries/settingValues";
import { useProfileDefaultWriter } from "@/hooks/queries/profileDefaults";
import { SETTING_KEYS, type SettingKey } from "@/lib/settingsContract";
import { optionsFor } from "@/lib/settingsDisplay";
import { namedLanguageOptionsFor } from "@/lib/languageOptions";
import { SETTING_DEFINITIONS } from "@/lib/settingsContract";
import {
  BACKGROUND_STYLE_OPTIONS,
  BG_COLOR_PALETTE,
  computeSubtitleStyles,
  FONT_COLOR_PALETTE,
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_OPTIONS,
  POSITION_OPTIONS,
} from "@/lib/subtitleAppearance";
import type { SubtitleAppearance } from "@/lib/subtitleAppearance";
import { toast } from "@/i18n/toast";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

/* Subtitle behavior is a profile preference; a device tunes only appearance. */
/**
 * The behavior modes come from the contract rather than a literal list, so a
 * member added to the manifest appears here without a matching edit.
 */
const SUBTITLE_MODES = optionsFor(SETTING_DEFINITIONS[SETTING_KEYS.PLAYBACK_SUBTITLE_MODE]);

const BEHAVIOR_KEYS: SettingKey[] = [
  SETTING_KEYS.PLAYBACK_SUBTITLE_LANGUAGE,
  SETTING_KEYS.PLAYBACK_SUBTITLE_MODE,
  SETTING_KEYS.PLAYBACK_SHOW_FORCED_SUBTITLES,
];

interface ColorPaletteProps {
  colors: { hex: string; label: string }[];
  selected: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
  labelId?: string;
  descriptionId?: string;
}

function ColorPalette({
  colors,
  selected,
  onChange,
  disabled,
  labelId,
  descriptionId,
}: ColorPaletteProps) {
  useUILanguage();
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
      className={"flex flex-wrap gap-2 " + (disabled ? "opacity-40" : "")}
    >
      {colors.map((color) => (
        <button
          key={color.hex}
          type="button"
          title={color.label}
          aria-label={color.label}
          onClick={() => onChange(color.hex)}
          disabled={disabled}
          className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
          style={{
            backgroundColor: color.hex,
            borderColor: selected === color.hex ? "var(--primary)" : "transparent",
            boxShadow:
              color.hex === "#000000" ? "inset 0 0 0 1px rgba(255,255,255,0.2)" : undefined,
          }}
        />
      ))}
    </div>
  );
}

interface SettingRowProps {
  label: string;
  description?: string;
  labelForControl?: boolean;
  children: (props: { id: string; labelId: string; descriptionId: string }) => ReactNode;
}

function SettingRow({ label, description, labelForControl = true, children }: SettingRowProps) {
  useUILanguage();
  const controlId = useId();
  const labelId = useId();
  const descriptionId = useId();

  return (
    <div className="border-border/50 grid gap-3 border-t pt-4 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0 space-y-0.5">
        <Label
          id={labelId}
          htmlFor={labelForControl ? controlId : undefined}
          className="text-sm font-medium"
        >
          {label}
        </Label>
        {description ? (
          <p id={descriptionId} className="text-muted-foreground text-[13px] leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex md:justify-end">
        {children({ id: controlId, labelId, descriptionId })}
      </div>
    </div>
  );
}

export default function SubtitleAppearanceSettings() {
  useUILanguage();
  const {
    appearance: effectiveSettings,
    hasDeviceOverride,
    save: saveAppearance,
    reset: resetAppearance,
    isSaving,
    isResetting,
  } = useSubtitleAppearanceSetting();
  const { data: behavior } = useEffectiveSettings({ keys: BEHAVIOR_KEYS });
  const { save: saveProfileDefault, isSaving: behaviorSaving } = useProfileDefaultWriter(behavior);

  // The effective endpoint resolves an unset key to the contract default, so a
  // control can read its value straight off the answer without a local literal.
  const subtitleLanguage =
    (behavior?.[SETTING_KEYS.PLAYBACK_SUBTITLE_LANGUAGE]?.value as string | null | undefined) ?? "";
  const subtitleLanguageOptions = namedLanguageOptionsFor(
    SETTING_KEYS.PLAYBACK_SUBTITLE_LANGUAGE,
    subtitleLanguage,
    behavior?.[SETTING_KEYS.PLAYBACK_SUBTITLE_LANGUAGE]?.suggested_values,
  );
  const subtitleMode =
    (behavior?.[SETTING_KEYS.PLAYBACK_SUBTITLE_MODE]?.value as string | undefined) ?? "auto";
  const showForcedSubtitles =
    (behavior?.[SETTING_KEYS.PLAYBACK_SHOW_FORCED_SUBTITLES]?.value as boolean | undefined) ?? true;

  const [draftState, setDraftState] = useState<{
    key: string;
    settings: SubtitleAppearance;
  }>({
    key: JSON.stringify(effectiveSettings),
    settings: effectiveSettings,
  });

  const baselineKey = JSON.stringify(effectiveSettings);
  const settings = draftState.key === baselineKey ? draftState.settings : effectiveSettings;

  function update<K extends keyof SubtitleAppearance>(key: K, value: SubtitleAppearance[K]) {
    setDraftState((prev) => ({
      key: baselineKey,
      settings: {
        ...(prev.key === baselineKey ? prev.settings : effectiveSettings),
        [key]: value,
      },
    }));
  }

  function discardLocalChanges() {
    setDraftState({
      key: baselineKey,
      settings: effectiveSettings,
    });
  }

  async function handleSave() {
    try {
      await saveAppearance(settings);
      toast.success("feedback.settings.subtitle_appearance_settings.subtitle_appearance_saved");
    } catch {
      toast.error(
        "errors.settings.subtitle_appearance_settings.failed_to_save_subtitle_appearance",
      );
    }
  }

  async function handleUseFallback() {
    try {
      await resetAppearance();
      toast.success("feedback.settings.subtitle_appearance_settings.subtitle_appearance_reset");
    } catch {
      toast.error(
        "errors.settings.subtitle_appearance_settings.failed_to_reset_subtitle_appearance",
      );
    }
  }

  /**
   * Subtitle behavior writes at profile scope: it is the household member's
   * choice, not the screen's. A device override would otherwise keep shadowing
   * the write and snap the control back, so the shared writer clears one when
   * the resolved value came from this device. A library or series override
   * still ranks above the profile row, but those are edited where the content
   * is and stay deliberately untouched here.
   */
  function saveBehavior(key: SettingKey, value: unknown) {
    saveProfileDefault(key, value).catch(() =>
      toast.error("errors.settings.subtitle_appearance_settings.failed_to_save_subtitle_setting"),
    );
  }

  const hasUnsavedChanges = JSON.stringify(settings) !== JSON.stringify(effectiveSettings);
  const behaviorPending = behaviorSaving;
  const usesTextOutline = settings.textOutline || settings.backgroundStyle === "outline";
  const isBoxStyle = settings.backgroundStyle === "box";
  const { containerStyle, cueStyle } = computeSubtitleStyles(settings);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {tr("pages.settings.subtitle_appearance_settings.subtitles")}
          </h2>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
            {tr(
              "pages.settings.subtitle_appearance_settings.choose_when_subtitles_appear_and_how_they_look_during_playback",
            )}
          </p>
        </div>
      </div>

      <SettingsGroup
        title={tr("pages.settings.subtitle_appearance_settings.behavior")}
        description={tr(
          "pages.settings.subtitle_appearance_settings.these_preferences_decide_which_subtitles_silo_chooses_by_default",
        )}
      >
        <SettingRow
          label={tr("pages.settings.subtitle_appearance_settings.subtitle_language")}
          description={tr(
            "pages.settings.subtitle_appearance_settings.pick_a_subtitle_language_or_leave_subtitles_off_by_default",
          )}
        >
          {({ id, descriptionId }) => (
            <div className="w-full sm:w-[220px]">
              <LanguageSelect
                id={id}
                aria-describedby={descriptionId}
                value={subtitleLanguage || "none"}
                options={subtitleLanguageOptions}
                disabled={behaviorPending}
                placeholder={tr("pages.settings.subtitle_appearance_settings.none")}
                className="w-full"
                onValueChange={(value) =>
                  // The contract spells "no preference" as null, not the empty
                  // string the legacy profile column used.
                  saveBehavior(
                    SETTING_KEYS.PLAYBACK_SUBTITLE_LANGUAGE,
                    value === "none" ? null : value,
                  )
                }
              >
                <SelectItem value="none">
                  {tr("pages.settings.subtitle_appearance_settings.none")}
                </SelectItem>
              </LanguageSelect>
            </div>
          )}
        </SettingRow>

        <SettingRow
          label={tr("pages.settings.subtitle_appearance_settings.subtitle_behavior")}
          description={tr(
            "pages.settings.subtitle_appearance_settings.decide_when_subtitles_should_appear",
          )}
        >
          {({ id, descriptionId }) => (
            <Select
              value={subtitleMode}
              onValueChange={(value) => saveBehavior(SETTING_KEYS.PLAYBACK_SUBTITLE_MODE, value)}
            >
              <SelectTrigger
                id={id}
                aria-describedby={descriptionId}
                className="w-full sm:w-[220px]"
                disabled={behaviorPending}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUBTITLE_MODES.map((mode) => (
                  <SelectItem key={mode.value} value={mode.value}>
                    {mode.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </SettingRow>

        <SettingRow
          label={tr("pages.settings.subtitle_appearance_settings.show_forced_subtitles")}
          description={tr(
            "pages.settings.subtitle_appearance_settings.display_forced_subtitles_for_foreign_language_dialogue",
          )}
        >
          {({ id, descriptionId }) => (
            <Switch
              id={id}
              aria-describedby={descriptionId}
              checked={showForcedSubtitles}
              disabled={behaviorPending}
              onCheckedChange={(checked) =>
                saveBehavior(SETTING_KEYS.PLAYBACK_SHOW_FORCED_SUBTITLES, checked)
              }
            />
          )}
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title={tr("pages.settings.subtitle_appearance_settings.preview")}
        description={tr(
          "pages.settings.subtitle_appearance_settings.this_sample_reflects_the_current_subtitle_appearance",
        )}
      >
        <div
          className="surface-panel-subtle relative overflow-hidden rounded-[1.3rem]"
          style={{ aspectRatio: "16 / 9", background: "linear-gradient(135deg, #0f0f1a, #1a1a3e)" }}
        >
          <div
            className="absolute inset-x-0 z-10 flex flex-col items-center gap-1"
            style={containerStyle}
          >
            <span
              className="inline-block rounded px-3 py-1 text-center leading-snug"
              style={{ ...cueStyle, whiteSpace: "pre-line" }}
            >
              {tr("pages.settings.subtitle_appearance_settings.sample_subtitle_text")}
            </span>
            <span
              className="inline-block rounded px-3 py-1 text-center leading-snug"
              style={{ ...cueStyle, whiteSpace: "pre-line" }}
            >
              {tr("pages.settings.subtitle_appearance_settings.tuned_for_readability")}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={!hasUnsavedChanges || isSaving}>
            {tr("pages.settings.subtitle_appearance_settings.save_appearance")}
          </Button>
          <Button
            variant="outline"
            onClick={discardLocalChanges}
            disabled={!hasUnsavedChanges || isSaving}
          >
            {tr("pages.settings.subtitle_appearance_settings.discard_changes")}
          </Button>
          {hasDeviceOverride ? (
            <Button variant="ghost" onClick={handleUseFallback} disabled={isResetting}>
              <RotateCcw className="mr-2 h-4 w-4" />
              {tr("pages.settings.subtitle_appearance_settings.reset_appearance")}
            </Button>
          ) : null}
        </div>
      </SettingsGroup>

      <SettingsGroup
        title={tr("pages.settings.subtitle_appearance_settings.text_c3328c39")}
        description={tr(
          "pages.settings.subtitle_appearance_settings.adjust_the_look_and_readability_of_subtitle_text",
        )}
      >
        <SettingRow label={tr("pages.settings.subtitle_appearance_settings.font_size")}>
          {({ id, descriptionId }) => (
            <Select
              value={settings.fontSize}
              onValueChange={(value) => update("fontSize", value as SubtitleAppearance["fontSize"])}
            >
              <SelectTrigger id={id} aria-describedby={descriptionId} className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_SIZE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </SettingRow>

        <SettingRow label={tr("pages.settings.subtitle_appearance_settings.font_family")}>
          {({ id, descriptionId }) => (
            <Select
              value={settings.fontFamily}
              onValueChange={(value) =>
                update("fontFamily", value as SubtitleAppearance["fontFamily"])
              }
            >
              <SelectTrigger id={id} aria-describedby={descriptionId} className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_FAMILY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </SettingRow>

        <SettingRow
          label={tr("pages.settings.subtitle_appearance_settings.font_color")}
          labelForControl={false}
        >
          {({ labelId, descriptionId }) => (
            <ColorPalette
              colors={FONT_COLOR_PALETTE}
              selected={settings.fontColor}
              onChange={(hex) => update("fontColor", hex)}
              labelId={labelId}
              descriptionId={descriptionId}
            />
          )}
        </SettingRow>

        <SettingRow label={tr("pages.settings.subtitle_appearance_settings.text_outline")}>
          {({ id, descriptionId }) => (
            <Switch
              id={id}
              aria-describedby={descriptionId}
              checked={settings.textOutline}
              onCheckedChange={(checked) => update("textOutline", checked)}
            />
          )}
        </SettingRow>

        <SettingRow
          label={tr("pages.settings.subtitle_appearance_settings.outline_color")}
          labelForControl={false}
          description={tr(
            "pages.settings.subtitle_appearance_settings.only_used_when_text_outline_is_enabled",
          )}
        >
          {({ labelId, descriptionId }) => (
            <ColorPalette
              colors={FONT_COLOR_PALETTE}
              selected={settings.textOutlineColor}
              onChange={(hex) => update("textOutlineColor", hex)}
              disabled={!usesTextOutline}
              labelId={labelId}
              descriptionId={descriptionId}
            />
          )}
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title={tr("pages.settings.subtitle_appearance_settings.background_position")}
        description={tr(
          "pages.settings.subtitle_appearance_settings.tune_subtitle_placement_and_contrast",
        )}
      >
        <SettingRow label={tr("pages.settings.subtitle_appearance_settings.background_style")}>
          {({ id, descriptionId }) => (
            <Select
              value={settings.backgroundStyle}
              onValueChange={(value) =>
                update("backgroundStyle", value as SubtitleAppearance["backgroundStyle"])
              }
            >
              <SelectTrigger id={id} aria-describedby={descriptionId} className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BACKGROUND_STYLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </SettingRow>

        <SettingRow
          label={tr("pages.settings.subtitle_appearance_settings.background_opacity")}
          description={tr(
            "pages.settings.subtitle_appearance_settings.only_used_for_boxed_subtitles",
          )}
        >
          {({ descriptionId }) => (
            <div className="flex w-full max-w-[240px] items-center gap-3">
              <Slider
                aria-describedby={descriptionId}
                value={[settings.backgroundOpacity]}
                min={0}
                max={100}
                step={5}
                disabled={!isBoxStyle}
                onValueChange={(values) =>
                  update("backgroundOpacity", values[0] ?? settings.backgroundOpacity)
                }
              />
              <span className="text-muted-foreground min-w-10 text-right text-xs font-medium">
                {settings.backgroundOpacity}%
              </span>
            </div>
          )}
        </SettingRow>

        <SettingRow
          label={tr("pages.settings.subtitle_appearance_settings.background_color")}
          labelForControl={false}
        >
          {({ labelId, descriptionId }) => (
            <ColorPalette
              colors={BG_COLOR_PALETTE}
              selected={settings.backgroundColor}
              onChange={(hex) => update("backgroundColor", hex)}
              disabled={!isBoxStyle}
              labelId={labelId}
              descriptionId={descriptionId}
            />
          )}
        </SettingRow>

        <SettingRow label={tr("pages.settings.subtitle_appearance_settings.subtitle_position")}>
          {({ id, descriptionId }) => (
            <Select
              value={settings.position}
              onValueChange={(value) => update("position", value as SubtitleAppearance["position"])}
            >
              <SelectTrigger id={id} aria-describedby={descriptionId} className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POSITION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </SettingRow>
      </SettingsGroup>
    </div>
  );
}
