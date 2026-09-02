import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, Monitor, RotateCcw, X } from "lucide-react";
import { toast } from "@/i18n/toast";

import { SettingsGroup } from "@/components/settings/SettingsGroup";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUICustomization } from "@/hooks/useUICustomization";
import { useUserLibraries } from "@/hooks/queries/libraries";
import { useClearSettingValue, useSetSettingValue } from "@/hooks/queries/settingValues";
import { SETTING_KEYS } from "@/lib/settingsContract";
import {
  CARD_PRESENTATION_PRESETS,
  defaultWebPrimaryMenu,
  menuItemKey,
  moveMenuItem,
  type CardCaption,
  type CardPresentation,
  type PosterSize,
  type PrimaryMenuItem,
} from "@/lib/uiCustomization";
import { cn } from "@/lib/utils";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

const CLIENT_SCOPE = { scope: "profile_client" } as const;

const BUILTIN_LABELS: Record<string, string> = {
  home: "pages.settings.interface_settings.home",
  movies: "pages.settings.interface_settings.movies",
  series: "pages.settings.interface_settings.tv_shows",
  music: "pages.settings.interface_settings.music",
  audiobooks: "pages.settings.interface_settings.audiobooks",
  for_you: "pages.settings.interface_settings.for_you",
  calendar: "pages.settings.interface_settings.calendar",
};

const ADDABLE_WEB_BUILTINS: PrimaryMenuItem[] = [
  // Media-family built-ins are global by contract. Until web has global
  // routes for every family, users can add the explicit library destinations
  // below without giving a global item first-library semantics.
  { type: "builtin", destination: "for_you" },
  { type: "builtin", destination: "calendar" },
];

function menuItemLabel(item: PrimaryMenuItem): string {
  if (item.type === "builtin") {
    return tr(BUILTIN_LABELS[item.destination] ?? item.destination);
  }
  if (item.type === "library") {
    return tr("pages.settings.interface_settings.value_library", { value: item.label });
  }
  if (item.type === "section") {
    return tr("pages.settings.interface_settings.value_section", { value: item.label });
  }
  return tr("pages.settings.interface_settings.value_collection", { value: item.label });
}

function samePresentation(left: CardPresentation, right: CardPresentation) {
  return left.poster_size === right.poster_size && left.caption === right.caption;
}

function CardPreview({ presentation }: { presentation: CardPresentation }) {
  useUILanguage();
  const widths =
    presentation.poster_size === "compact"
      ? ["w-12", "w-12", "w-12", "w-12"]
      : presentation.poster_size === "large"
        ? ["w-20", "w-20"]
        : ["w-16", "w-16", "w-16"];
  return (
    <div className="bg-background/35 flex min-h-40 items-start gap-3 overflow-hidden rounded-xl border border-white/8 p-4">
      {widths.map((width, index) => (
        <div key={index} className={cn("shrink-0", width)}>
          <div className="from-primary/45 to-accent aspect-[2/3] rounded-lg bg-gradient-to-br" />
          {presentation.caption !== "artwork" ? (
            <>
              <div className="bg-foreground/75 mt-2 h-2 w-4/5 rounded-full" />
              {presentation.caption === "title_metadata" ? (
                <div className="bg-muted-foreground/45 mt-1.5 h-1.5 w-1/2 rounded-full" />
              ) : null}
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function InterfaceHeader() {
  useUILanguage();
  return (
    <header className="space-y-2">
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {tr("pages.settings.interface_settings.navigation_cards")}
      </h2>
      <p className="text-muted-foreground text-sm">
        {tr(
          "pages.settings.interface_settings.these_choices_sync_between_web_browsers_signed_into_this_profile",
        )}
      </p>
    </header>
  );
}

export default function InterfaceSettings() {
  useUILanguage();
  const { data: libraries = [] } = useUserLibraries();
  const customization = useUICustomization();
  const setValue = useSetSettingValue();
  const clearValue = useClearSettingValue();
  const baselineMenu = useMemo(
    () => customization.primaryMenu ?? defaultWebPrimaryMenu(),
    [customization.primaryMenu],
  );
  const baselineKey = useMemo(() => JSON.stringify(baselineMenu.items), [baselineMenu.items]);
  const [menuDraft, setMenuDraft] = useState<{
    baselineKey: string;
    /** The just-saved baseline expected from the asynchronous query refresh. */
    pendingBaselineKey?: string;
    items: PrimaryMenuItem[];
    dirty: boolean;
  } | null>(null);
  const [addItemKey, setAddItemKey] = useState("");
  const menuDraftMatchesBaseline =
    menuDraft?.baselineKey === baselineKey || menuDraft?.pendingBaselineKey === baselineKey;
  const menuItems = menuDraftMatchesBaseline ? menuDraft.items : baselineMenu.items;
  const menuDirty = menuDraftMatchesBaseline === true && menuDraft.dirty;
  const cardPresentation = customization.cardPresentation;
  const cardDeviceOverride = customization.cardPresentationSource === "profile_device";
  const cardClientOverride = customization.cardPresentationSource === "profile_client";
  const menuDeviceOverride = customization.primaryMenuSource === "profile_device";
  const menuClientOverride = customization.primaryMenuSource === "profile_client";
  const menuMutationPending = setValue.isPending || clearValue.isPending;
  const cardMutationPending = menuMutationPending || cardDeviceOverride;
  const menuAtLimit = menuItems.length >= 64;

  const availableItems = useMemo(() => {
    const current = new Set(menuItems.map(menuItemKey));
    const visibleLibraryIds = new Set(libraries.map((library) => library.id));
    const candidates: PrimaryMenuItem[] = [
      ...ADDABLE_WEB_BUILTINS,
      ...libraries.map(
        (library): PrimaryMenuItem => ({
          type: "library",
          library_id: library.id,
          label: library.name,
        }),
      ),
      ...customization.shortcuts.items.filter(
        (item) => item.library_id === undefined || visibleLibraryIds.has(item.library_id),
      ),
    ];
    const unique = new Map<string, PrimaryMenuItem>();
    for (const candidate of candidates) {
      const key = menuItemKey(candidate);
      if (!current.has(key)) unique.set(key, candidate);
    }
    return [...unique.values()];
  }, [customization.shortcuts.items, libraries, menuItems]);
  const selectedAddItem = availableItems.find((item) => menuItemKey(item) === addItemKey);

  async function saveCardPresentation(next: CardPresentation) {
    try {
      await setValue.mutateAsync({
        key: SETTING_KEYS.UI_CARD_PRESENTATION,
        value: next,
        identity: CLIENT_SCOPE,
      });
    } catch (error) {
      toast.error("errors.settings.interface_settings.could_not_save_card_layout", {
        error: error,
      });
    }
  }

  async function resetCardPresentation() {
    try {
      await clearValue.mutateAsync({
        key: SETTING_KEYS.UI_CARD_PRESENTATION,
        identity: CLIENT_SCOPE,
      });
      toast.success("feedback.settings.interface_settings.web_family_card_layout_reset");
    } catch (error) {
      toast.error("errors.settings.interface_settings.could_not_reset_card_layout", {
        error: error,
      });
    }
  }

  async function clearDeviceOverride(
    key: typeof SETTING_KEYS.UI_CARD_PRESENTATION | typeof SETTING_KEYS.NAV_PRIMARY_MENU,
    label: string,
  ) {
    try {
      await clearValue.mutateAsync({ key, identity: { scope: "profile_device" } });
      toast.success(
        "feedback.settings.interface_settings.setting_now_follows_the_web_family_preference",
        {
          values: {
            setting: label,
          },
        },
      );
    } catch (error) {
      toast.error("errors.settings.interface_settings.reported_message", {
        values: {
          message:
            error instanceof Error ? error.message : `Could not clear ${label.toLowerCase()}`,
        },
      });
    }
  }

  function updateMenu(next: PrimaryMenuItem[]) {
    setMenuDraft((current) => {
      if (current?.pendingBaselineKey === baselineKey) {
        return { baselineKey, items: next, dirty: true };
      }
      if (current?.baselineKey === baselineKey) {
        return { ...current, items: next, dirty: true };
      }
      return { baselineKey, items: next, dirty: true };
    });
  }

  async function saveMenu() {
    const savedItems = menuItems;
    const savedBaselineKey = JSON.stringify(savedItems);
    try {
      await setValue.mutateAsync({
        key: SETTING_KEYS.NAV_PRIMARY_MENU,
        value: { items: savedItems },
        identity: CLIENT_SCOPE,
      });
      setMenuDraft((current) => {
        const currentItemsKey = current ? JSON.stringify(current.items) : null;
        if (current?.dirty && currentItemsKey !== savedBaselineKey) {
          return { ...current, pendingBaselineKey: savedBaselineKey };
        }
        return {
          baselineKey,
          pendingBaselineKey: savedBaselineKey,
          items: savedItems,
          dirty: false,
        };
      });
      toast.success("feedback.settings.interface_settings.web_navigation_saved");
    } catch (error) {
      toast.error("errors.settings.interface_settings.could_not_save_navigation", { error: error });
    }
  }

  async function resetMenu() {
    const pendingClientOverride = menuDraft?.pendingBaselineKey !== undefined;
    if (!menuClientOverride && !pendingClientOverride) {
      setMenuDraft(null);
      toast.success("feedback.settings.interface_settings.web_navigation_reset");
      return;
    }
    try {
      await clearValue.mutateAsync({
        key: SETTING_KEYS.NAV_PRIMARY_MENU,
        identity: CLIENT_SCOPE,
      });
      setMenuDraft(null);
      toast.success("feedback.settings.interface_settings.web_navigation_reset");
    } catch (error) {
      toast.error("errors.settings.interface_settings.could_not_reset_navigation", {
        error: error,
      });
    }
  }

  if (customization.isLoading) {
    return (
      <div className="space-y-6">
        <InterfaceHeader />
        <div className="surface-panel-subtle text-muted-foreground rounded-xl border p-5 text-sm">
          {tr("pages.settings.interface_settings.checking_server_support")}
        </div>
      </div>
    );
  }

  if (customization.isUnavailable) {
    return (
      <div className="space-y-6">
        <InterfaceHeader />
        <div className="surface-panel-subtle rounded-xl border p-5" role="alert">
          <p className="font-medium">
            {tr("pages.settings.interface_settings.customization_unavailable")}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {tr(
              "pages.settings.interface_settings.saved_navigation_and_card_settings_could_not_be_loaded_editing",
            )}
          </p>
        </div>
      </div>
    );
  }

  if (!customization.isSupported) {
    return (
      <div className="space-y-6">
        <InterfaceHeader />
        <div className="surface-panel-subtle rounded-xl border p-5" role="alert">
          <p className="font-medium">
            {tr("pages.settings.interface_settings.server_upgrade_required")}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {tr(
              "pages.settings.interface_settings.this_server_does_not_support_synchronized_navigation_and_card_customization",
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <InterfaceHeader />

      <SettingsGroup
        title={tr("pages.settings.interface_settings.card_preset")}
        description={tr(
          "pages.settings.interface_settings.start_with_a_complete_layout_then_adjust_poster_size_or",
        )}
      >
        {cardDeviceOverride ? (
          <div className="border-border/70 bg-muted/25 mb-4 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground text-sm">
              {tr(
                "pages.settings.interface_settings.this_browser_has_a_higher_priority_device_override_clear_it",
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={menuMutationPending}
              onClick={() =>
                void clearDeviceOverride(SETTING_KEYS.UI_CARD_PRESENTATION, "Card layout")
              }
            >
              {tr("pages.settings.interface_settings.use_web_family_layout")}
            </Button>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {CARD_PRESENTATION_PRESETS.map((preset) => {
            const active = samePresentation(cardPresentation, preset.value);
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => void saveCardPresentation(preset.value)}
                aria-pressed={active}
                disabled={cardMutationPending}
                className={cn(
                  "surface-panel-subtle relative rounded-xl border p-4 text-left transition-colors",
                  active ? "border-primary/50 bg-primary/8" : "border-border/70 hover:bg-accent/45",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{preset.label}</p>
                    <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                      {preset.description}
                    </p>
                  </div>
                  {active ? <Check className="text-primary h-4 w-4 shrink-0" /> : null}
                </div>
              </button>
            );
          })}
        </div>
      </SettingsGroup>

      <SettingsGroup
        title={tr("pages.settings.interface_settings.poster_cards")}
        description={tr(
          "pages.settings.interface_settings.fine_tune_density_and_the_rows_shown_below_artwork_changes",
        )}
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.8fr)]">
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {tr("pages.settings.interface_settings.poster_size")}
              </p>
              <div
                className="flex flex-wrap gap-2"
                role="radiogroup"
                aria-label={tr("pages.settings.interface_settings.poster_size")}
              >
                {(
                  [
                    ["compact", "Compact"],
                    ["standard", "Standard"],
                    ["large", "Large"],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={cardPresentation.poster_size === value}
                    size="sm"
                    variant={cardPresentation.poster_size === value ? "default" : "outline"}
                    disabled={cardMutationPending}
                    onClick={() =>
                      void saveCardPresentation({
                        ...cardPresentation,
                        poster_size: value as PosterSize,
                      })
                    }
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {tr("pages.settings.interface_settings.caption")}
              </p>
              <div
                className="flex flex-wrap gap-2"
                role="radiogroup"
                aria-label={tr("pages.settings.interface_settings.card_caption")}
              >
                {(
                  [
                    ["title_metadata", "Title & metadata"],
                    ["title", "Title only"],
                    ["artwork", "Artwork only"],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={cardPresentation.caption === value}
                    size="sm"
                    variant={cardPresentation.caption === value ? "default" : "outline"}
                    disabled={cardMutationPending}
                    onClick={() =>
                      void saveCardPresentation({
                        ...cardPresentation,
                        caption: value as CardCaption,
                      })
                    }
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <CardPreview presentation={cardPresentation} />
        </div>
        {cardClientOverride ? (
          <div className="border-border/70 mt-5 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p id="card-layout-reset-description" className="text-muted-foreground text-sm">
              {tr(
                "pages.settings.interface_settings.remove_the_layout_shared_by_web_browsers_and_inherit_the",
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={menuMutationPending}
              aria-describedby="card-layout-reset-description"
              onClick={() => void resetCardPresentation()}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              {tr("pages.settings.interface_settings.reset_web_family_card_layout")}
            </Button>
          </div>
        ) : null}
      </SettingsGroup>

      <SettingsGroup
        title={tr("pages.settings.interface_settings.primary_menu")}
        description={tr(
          "pages.settings.interface_settings.choose_the_ordered_shortcuts_at_the_top_of_the_web",
        )}
      >
        <div className="space-y-4">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <Monitor className="h-4 w-4" />
            {tr("pages.settings.interface_settings.web_browsers")}
          </div>
          {menuDeviceOverride ? (
            <div className="border-border/70 bg-muted/25 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground text-sm">
                {tr(
                  "pages.settings.interface_settings.this_browser_has_a_higher_priority_device_menu_clear_it",
                )}
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={menuMutationPending}
                onClick={() =>
                  void clearDeviceOverride(SETTING_KEYS.NAV_PRIMARY_MENU, "Navigation")
                }
              >
                {tr("pages.settings.interface_settings.use_web_family_menu")}
              </Button>
            </div>
          ) : null}
          <ol className="space-y-2">
            {menuItems.map((item, index) => {
              const home = item.type === "builtin" && item.destination === "home";
              return (
                <li
                  key={menuItemKey(item)}
                  className="surface-panel-subtle border-border/65 flex items-center gap-3 rounded-xl border px-3 py-2.5"
                >
                  <span className="text-muted-foreground w-6 shrink-0 text-center text-xs tabular-nums">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {menuItemLabel(item)}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={menuMutationPending || menuDeviceOverride || index === 0}
                      aria-label={tr("pages.settings.interface_settings.move_value_up", {
                        value: menuItemLabel(item),
                      })}
                      onClick={() => updateMenu(moveMenuItem(menuItems, index, -1))}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={
                        menuMutationPending || menuDeviceOverride || index === menuItems.length - 1
                      }
                      aria-label={tr("pages.settings.interface_settings.move_value_down", {
                        value: menuItemLabel(item),
                      })}
                      onClick={() => updateMenu(moveMenuItem(menuItems, index, 1))}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={menuMutationPending || menuDeviceOverride || home}
                      aria-label={
                        home
                          ? tr("pages.settings.interface_settings.home_cannot_be_removed")
                          : tr("pages.settings.interface_settings.remove_value", {
                              value: menuItemLabel(item),
                            })
                      }
                      onClick={() =>
                        updateMenu(menuItems.filter((_, itemIndex) => itemIndex !== index))
                      }
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>

          {availableItems.length > 0 ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select
                value={addItemKey}
                onValueChange={setAddItemKey}
                disabled={menuMutationPending || menuDeviceOverride || menuAtLimit}
              >
                <SelectTrigger className="w-full sm:max-w-sm">
                  <SelectValue
                    placeholder={tr(
                      "pages.settings.interface_settings.choose_destination_or_shortcut",
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableItems.map((item) => (
                    <SelectItem key={menuItemKey(item)} value={menuItemKey(item)}>
                      {menuItemLabel(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="secondary"
                disabled={
                  !selectedAddItem || menuMutationPending || menuDeviceOverride || menuAtLimit
                }
                onClick={() => {
                  if (!selectedAddItem) return;
                  updateMenu([...menuItems, selectedAddItem]);
                  setAddItemKey("");
                }}
              >
                {tr("pages.settings.interface_settings.add_to_menu")}
              </Button>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              onClick={() => void saveMenu()}
              disabled={!menuDirty || menuMutationPending || menuDeviceOverride}
            >
              {tr("pages.settings.interface_settings.save_menu")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void resetMenu()}
              disabled={menuMutationPending || menuDeviceOverride}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              {tr("pages.settings.interface_settings.reset_to_default")}
            </Button>
          </div>
        </div>
      </SettingsGroup>
    </div>
  );
}
