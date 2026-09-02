import { useId, useState, type ReactNode } from "react";
import { Check, ImageIcon, ImageOff, RotateCcw, X } from "lucide-react";
import { toast } from "@/i18n/toast";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SettingsGroup } from "@/components/settings/SettingsGroup";
import {
  OverlayPreviewCard,
  type OverlayPreviewVariant,
} from "@/components/overlays/OverlayPreviewCard";
import { OverlayPreviewVariantToggle } from "@/components/overlays/OverlayPreviewVariantToggle";
import { useOverlayPrefs } from "@/hooks/useOverlayPrefs";
import {
  ACCENT_PALETTE,
  buildDefaultPrefs,
  CATEGORY_GROUPS,
  getOverlayDef,
  isOverlaySuppressed,
  OVERLAY_REGISTRY,
  OVERLAY_PRESETS,
  POSITION_OPTIONS,
  PRESET_IDS,
  getPreset,
  type CardOverlayPrefs,
  type OverlayId,
  type OverlayPosition,
  type PresetId,
} from "@/lib/overlays";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CARD_QUICK_ACTION_OPTIONS, type EnabledCardQuickActionMode } from "@/lib/cardQuickActions";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

interface SettingRowProps {
  label: string;
  description: string;
  hint?: string;
  control: (props: { id: string }) => ReactNode;
}

function SettingRow({ label, description, hint, control }: SettingRowProps) {
  useUILanguage();
  useUILanguage();
  const controlId = useId();
  return (
    <div className="border-border/50 flex flex-col gap-3 border-t pt-4 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-0.5">
        <Label htmlFor={controlId} className="text-sm font-medium">
          {label}
        </Label>
        <p className="text-muted-foreground text-[13px] leading-relaxed">{description}</p>
        {hint && <p className="text-muted-foreground/70 text-xs italic">{hint}</p>}
      </div>
      <div className="w-full sm:w-auto">{control({ id: controlId })}</div>
    </div>
  );
}

interface AccentSwatchProps {
  value: string | undefined;
  defaultValue: string | undefined;
  disabled?: boolean;
  onChange: (next: string | undefined) => void;
}

function AccentSwatch({ value, defaultValue, disabled, onChange }: AccentSwatchProps) {
  useUILanguage();
  useUILanguage();
  const [open, setOpen] = useState(false);
  const display = value ?? defaultValue ?? "#94a3b8";
  const hasOverride = !!value;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="border-border/60 hover:border-border focus:border-border focus-visible:ring-ring relative h-6 w-6 rounded-full border transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: display }}
          aria-label={
            hasOverride
              ? tr("pages.settings.card_overlay_settings.change_accent_color")
              : tr("pages.settings.card_overlay_settings.set_accent_color")
          }
          title={
            hasOverride
              ? tr("pages.settings.card_overlay_settings.accent_display", { display: display })
              : tr("pages.settings.card_overlay_settings.default_accent")
          }
        />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[200px] p-3">
        <div className="space-y-2">
          <div className="text-xs font-medium tracking-wide uppercase">
            {tr("pages.settings.card_overlay_settings.accent_color")}
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {ACCENT_PALETTE.map((color) => (
              <button
                key={color.value}
                type="button"
                onClick={() => {
                  onChange(color.value);
                  setOpen(false);
                }}
                className="border-border/40 hover:border-border focus-visible:ring-ring relative h-7 w-7 rounded-full border focus:outline-none focus-visible:ring-2"
                style={{ background: color.value }}
                title={color.label}
                aria-label={color.label}
              >
                {value === color.value && (
                  <Check
                    size={12}
                    className="absolute inset-0 m-auto"
                    style={{
                      color: color.value === "#ffffff" ? "black" : "white",
                    }}
                  />
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(undefined);
              setOpen(false);
            }}
            className="text-muted-foreground hover:text-foreground flex w-full items-center gap-1.5 text-xs"
          >
            <X size={12} /> {tr("pages.settings.card_overlay_settings.reset_to_default")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface OverlayToggleProps {
  overlayId: OverlayId;
  prefs: CardOverlayPrefs;
  onUpdate: (next: CardOverlayPrefs) => void;
}

function OverlayToggle({ overlayId, prefs, onUpdate }: OverlayToggleProps) {
  useUILanguage();
  useUILanguage();
  const def = getOverlayDef(overlayId);
  if (!def) return null;
  const config = prefs.items[overlayId];
  const preset = getPreset(prefs.preset);
  const resolvedShowIcon = !!def.iconCapable && (config.showIcon ?? preset.preferIcon);
  const suppressed = config.enabled && isOverlaySuppressed(overlayId, prefs);

  return (
    <SettingRow
      label={def.label}
      description={def.description}
      hint={
        suppressed
          ? tr(
              "pages.settings.card_overlay_settings.hidden_while_the_combined_resolution_hdr_badge_is_enabled",
            )
          : def.availabilityNote
      }
      control={({ id }) => (
        <div className="flex items-center gap-2">
          {def.iconCapable && (
            <button
              type="button"
              disabled={!config.enabled}
              onClick={() =>
                onUpdate({
                  ...prefs,
                  items: {
                    ...prefs.items,
                    [overlayId]: { ...config, showIcon: !resolvedShowIcon },
                  },
                })
              }
              className="text-muted-foreground hover:text-foreground disabled:opacity-40"
              title={
                resolvedShowIcon
                  ? tr("pages.settings.card_overlay_settings.hide_icon")
                  : tr("pages.settings.card_overlay_settings.show_icon")
              }
              aria-label={
                resolvedShowIcon
                  ? tr("pages.settings.card_overlay_settings.hide_icon")
                  : tr("pages.settings.card_overlay_settings.show_icon")
              }
            >
              {resolvedShowIcon ? <ImageIcon size={16} /> : <ImageOff size={16} />}
            </button>
          )}
          <AccentSwatch
            value={config.accentColor}
            defaultValue={def.defaultAccent}
            disabled={!config.enabled}
            onChange={(next) =>
              onUpdate({
                ...prefs,
                items: {
                  ...prefs.items,
                  [overlayId]: { ...config, accentColor: next },
                },
              })
            }
          />
          <Select
            value={config.position}
            disabled={!config.enabled}
            onValueChange={(value) =>
              onUpdate({
                ...prefs,
                items: {
                  ...prefs.items,
                  [overlayId]: { ...config, position: value as OverlayPosition },
                },
              })
            }
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POSITION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Switch
            id={id}
            checked={config.enabled}
            onCheckedChange={(checked) =>
              onUpdate({
                ...prefs,
                items: {
                  ...prefs.items,
                  [overlayId]: { ...config, enabled: checked },
                },
              })
            }
          />
        </div>
      )}
    />
  );
}

interface PresetPickerProps {
  value: PresetId;
  onChange: (next: PresetId) => void;
}

function PresetPicker({ value, onChange }: PresetPickerProps) {
  useUILanguage();
  useUILanguage();
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {PRESET_IDS.map((id) => {
        const preset = OVERLAY_PRESETS[id];
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={
              "flex flex-col items-stretch gap-2 rounded-lg border p-3 text-left transition-colors " +
              (active
                ? "border-primary bg-primary/5"
                : "border-border/60 hover:border-border bg-transparent")
            }
          >
            <div className="flex h-12 items-center justify-center rounded-md bg-gradient-to-br from-slate-700 to-slate-900">
              <span
                className={preset.badgeClass}
                style={preset.badgeStyle(preset.id === "vibrant" ? "#f5c518" : undefined)}
              >
                {tr("pages.settings.card_overlay_settings.sample")}
              </span>
            </div>
            <div>
              <div className="text-sm font-medium">{preset.label}</div>
              <div className="text-muted-foreground text-xs leading-snug">{preset.description}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function CardOverlaySettings() {
  useUILanguage();
  useUILanguage();
  const {
    prefs,
    setPrefs,
    quickActionPreference,
    setQuickActionMode,
    quickActionsEnabled,
    setQuickActionsEnabled,
    overlaysEnabled,
    setOverlaysEnabled,
    resetPrefs,
    hasOverride,
    isResetting,
    isLoading,
  } = useOverlayPrefs();
  const [previewVariant, setPreviewVariant] = useState<OverlayPreviewVariant>("movie");
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);

  const handleUpdate = (next: CardOverlayPrefs) => {
    setPrefs(next);
    toast.success("feedback.settings.card_overlay_settings.setting_saved");
  };

  const handleQuickActionModeChange = (next: EnabledCardQuickActionMode) => {
    setQuickActionMode(next);
    toast.success("feedback.settings.card_overlay_settings.setting_saved");
  };

  const handleQuickActionsEnabledChange = (next: boolean) => {
    setQuickActionsEnabled(next);
    toast.success("feedback.settings.card_overlay_settings.setting_saved");
  };

  const handleOverlaysEnabledChange = (next: boolean) => {
    setOverlaysEnabled(next);
    toast.success("feedback.settings.card_overlay_settings.setting_saved");
  };

  // Removing the profile document is what puts this profile back on the
  // server defaults for good: a copy of today's server values would freeze
  // this profile at them and ignore every later change the admin makes.
  const handleRestoreServerDefaults = async () => {
    try {
      await resetPrefs();
      setConfirmRestoreOpen(false);
      toast.success("feedback.settings.card_overlay_settings.restored_the_server_s_default_badges");
    } catch {
      toast.error(
        "errors.settings.card_overlay_settings.failed_to_restore_the_server_s_default_badges",
      );
    }
  };

  if (isLoading) return null;
  const displayPrefs = prefs ?? buildDefaultPrefs();

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {tr("pages.settings.card_overlay_settings.card_overlays")}
        </h2>
        <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
          {tr(
            "pages.settings.card_overlay_settings.choose_the_quick_actions_and_badges_shown_on_media_cards",
          )}
        </p>
      </div>

      <SettingsGroup
        title={tr("pages.settings.card_overlay_settings.general")}
        description={tr(
          "pages.settings.card_overlay_settings.override_the_server_defaults_for_this_profile",
        )}
      >
        <SettingRow
          label={tr("pages.settings.card_overlay_settings.card_quick_actions")}
          description={tr(
            "pages.settings.card_overlay_settings.choose_the_favorite_and_watched_shortcuts_shown_for_this_profile",
          )}
          control={({ id }) => (
            <div className="flex items-center gap-2">
              <Select
                value={quickActionPreference}
                disabled={!quickActionsEnabled}
                onValueChange={(value) =>
                  handleQuickActionModeChange(value as EnabledCardQuickActionMode)
                }
              >
                <SelectTrigger
                  className="w-[190px]"
                  aria-label={tr("pages.settings.card_overlay_settings.card_quick_action_mode")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CARD_QUICK_ACTION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Switch
                id={id}
                checked={quickActionsEnabled}
                onCheckedChange={handleQuickActionsEnabledChange}
                aria-label={tr("pages.settings.card_overlay_settings.enable_card_quick_actions")}
              />
            </div>
          )}
        />
        <SettingRow
          label={tr("pages.settings.card_overlay_settings.card_overlay_badges")}
          description={tr(
            "pages.settings.card_overlay_settings.show_overlay_badges_on_media_cards_for_this_profile",
          )}
          control={({ id }) => (
            <Switch
              id={id}
              checked={overlaysEnabled}
              onCheckedChange={handleOverlaysEnabledChange}
              aria-label={tr("pages.settings.card_overlay_settings.enable_card_overlay_badges")}
            />
          )}
        />
      </SettingsGroup>

      <ConfirmDialog
        open={confirmRestoreOpen}
        onOpenChange={setConfirmRestoreOpen}
        title={tr("pages.settings.card_overlay_settings.restore_default_server_settings")}
        description={tr(
          "pages.settings.card_overlay_settings.discard_your_badge_customizations_and_follow_the_server_defaults_again",
        )}
        confirmLabel={tr("pages.settings.card_overlay_settings.restore")}
        variant="destructive"
        isPending={isResetting}
        onConfirm={() => {
          void handleRestoreServerDefaults();
        }}
      />

      {/* `inert`, not just pointer-events: the controls must also be
          unreachable by keyboard and invisible to assistive tech while card
          overlays are disabled for this profile. */}
      <div
        inert={!overlaysEnabled}
        className={overlaysEnabled ? "" : "pointer-events-none opacity-50"}
      >
        <SettingsGroup
          title={tr("pages.settings.card_overlay_settings.preview")}
          description={tr(
            "pages.settings.card_overlay_settings.live_preview_of_your_current_overlay_configuration",
          )}
          actions={
            hasOverride ? (
              <button
                type="button"
                onClick={() => setConfirmRestoreOpen(true)}
                className="text-muted-foreground hover:text-destructive inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                {tr("pages.settings.card_overlay_settings.restore_default_server_settings")}
              </button>
            ) : (
              <span className="text-muted-foreground text-xs">
                {tr("pages.settings.card_overlay_settings.following_the_server_defaults")}
              </span>
            )
          }
        >
          <div className="flex flex-col items-center gap-4">
            <OverlayPreviewCard prefs={displayPrefs} variant={previewVariant} size="md" />
            <OverlayPreviewVariantToggle value={previewVariant} onChange={setPreviewVariant} />
          </div>
        </SettingsGroup>

        <Tabs defaultValue="overlays" className="mt-6">
          <TabsList>
            <TabsTrigger value="overlays">
              {tr("pages.settings.card_overlay_settings.overlays")}
            </TabsTrigger>
            <TabsTrigger value="style">
              {tr("pages.settings.card_overlay_settings.style")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overlays" className="mt-4 space-y-6">
            {CATEGORY_GROUPS.map(({ category, title, description }) => {
              const overlays = OVERLAY_REGISTRY.filter((d) => d.category === category);
              if (overlays.length === 0) return null;
              return (
                <SettingsGroup key={category} title={title} description={description}>
                  {overlays.map((def) => (
                    <OverlayToggle
                      key={def.id}
                      overlayId={def.id}
                      prefs={displayPrefs}
                      onUpdate={handleUpdate}
                    />
                  ))}
                </SettingsGroup>
              );
            })}
          </TabsContent>

          <TabsContent value="style" className="mt-4 space-y-6">
            <SettingsGroup
              title={tr("pages.settings.card_overlay_settings.preset")}
              description={tr(
                "pages.settings.card_overlay_settings.a_preset_controls_the_base_appearance_of_every_badge_you",
              )}
            >
              <PresetPicker
                value={displayPrefs.preset}
                onChange={(next) => handleUpdate({ ...displayPrefs, preset: next })}
              />
            </SettingsGroup>
            <SettingsGroup
              title={tr("pages.settings.card_overlay_settings.how_styling_works")}
              description={tr("pages.settings.card_overlay_settings.where_to_find_what")}
            >
              <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
                <li>
                  <strong className="text-foreground">
                    {tr("pages.settings.card_overlay_settings.preset")}
                  </strong>{" "}
                  {tr(
                    "pages.settings.card_overlay_settings.sets_the_badge_shape_background_font_and_whether_icons_show",
                  )}
                </li>
                <li>
                  <strong className="text-foreground">
                    {tr("pages.settings.card_overlay_settings.accent_color")}
                  </strong>{" "}
                  {tr(
                    "pages.settings.card_overlay_settings.per_overlay_tints_that_badge_gold_for_imdb_red_for",
                  )}
                </li>
                <li>
                  <strong className="text-foreground">
                    {tr("pages.settings.card_overlay_settings.icon_toggle")}
                  </strong>{" "}
                  {tr(
                    "pages.settings.card_overlay_settings.per_overlay_overrides_the_preset_s_icon_default_for_a",
                  )}
                </li>
                <li>
                  <strong className="text-foreground">
                    {tr("pages.settings.card_overlay_settings.position")}
                  </strong>{" "}
                  {tr(
                    "pages.settings.card_overlay_settings.picks_which_corner_the_badge_sits_in_multiple_badges_in",
                  )}
                </li>
              </ul>
            </SettingsGroup>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
