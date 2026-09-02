import { useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  FolderSearch,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";

import FolderBrowser from "@/components/FolderBrowser";
import PathAutocompleteInput from "@/components/PathAutocompleteInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { extraKindGroupLabel, PROVIDER_TRAILER_KINDS } from "@/lib/extraKinds";
import { LANGUAGES } from "@/player/utils/languageNames";

import { LIBRARY_TYPES } from "./libraryTypes";
import { contentLevelLabel } from "./useLibraryForm";
import type { LevelChainItem, LibraryFormController } from "./useLibraryForm";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

function SettingCard({
  htmlFor,
  title,
  description,
  children,
  footer,
}: {
  htmlFor?: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useUILanguage();
  useUILanguage();
  return (
    <div className="border-border bg-surface rounded-xl border p-3.5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor={htmlFor}>{title}</Label>
          <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
          {footer}
        </div>
        {children}
      </div>
    </div>
  );
}

export function GeneralFields({
  form,
  posterSlot,
}: {
  form: LibraryFormController;
  posterSlot?: ReactNode;
}) {
  useUILanguage();
  useUILanguage();
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="library-name">
          {tr("components.admin.libraries.library_form_sections.name")}
        </Label>
        <Input
          id="library-name"
          value={form.name}
          onChange={(e) => form.setName(e.target.value)}
          placeholder={tr("components.admin.libraries.library_form_sections.e_g_movies")}
          aria-invalid={form.errors.name ? true : undefined}
        />
        {form.errors.name ? <p className="text-destructive text-xs">{form.errors.name}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label>{tr("components.admin.libraries.library_form_sections.type")}</Label>
        <div
          className="grid grid-cols-3 gap-2 sm:grid-cols-5"
          role="radiogroup"
          aria-label={tr("components.admin.libraries.library_form_sections.library_type")}
        >
          {LIBRARY_TYPES.map(({ value, label, icon: Icon }) => {
            const selected = form.type === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => form.handleTypeChange(value)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 transition-colors duration-150",
                  selected
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border bg-surface text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                )}
              >
                <Icon
                  className={cn("size-5", selected ? "text-primary" : "text-muted-foreground")}
                />
                <span className="text-[11px] font-medium">{label}</span>
              </button>
            );
          })}
        </div>
        {form.library && form.type !== form.library.type ? (
          <p className="text-warning text-xs">
            {tr(
              "components.admin.libraries.library_form_sections.changing_the_type_of_an_existing_library_may_require_a",
            )}
          </p>
        ) : null}
      </div>
      <SettingCard
        htmlFor="library-enabled-switch"
        title={tr("components.admin.libraries.library_form_sections.enabled")}
        description={tr(
          "components.admin.libraries.library_form_sections.disabled_libraries_are_hidden_from_browsing_and_skipped_by_scans",
        )}
      >
        <Switch
          id="library-enabled-switch"
          checked={form.enabled}
          onCheckedChange={form.setEnabled}
        />
      </SettingCard>
      {posterSlot}
    </div>
  );
}

export function FolderFields({ form }: { form: LibraryFormController }) {
  useUILanguage();
  useUILanguage();
  const [browserOpen, setBrowserOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {form.paths.map((path, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <FolderOpen className="text-muted-foreground/60 size-4 shrink-0" />
            <PathAutocompleteInput
              value={path}
              onValueChange={(value) => form.updatePath(i, value)}
              placeholder={tr("components.admin.libraries.library_form_sections.mnt_media_movies")}
              aria-invalid={form.errors.paths ? true : undefined}
            />
            {form.paths.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive size-9 shrink-0"
                onClick={() => form.removePath(i)}
                title={tr("components.admin.libraries.library_form_sections.remove_folder")}
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>
      {form.errors.paths ? <p className="text-destructive text-xs">{form.errors.paths}</p> : null}
      <div className="flex gap-1.5">
        <Button type="button" variant="outline" size="sm" onClick={() => setBrowserOpen(true)}>
          <FolderSearch className="mr-1 size-3.5" />{" "}
          {tr("components.admin.libraries.library_form_sections.browse")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={form.addPath}>
          <Plus className="mr-1 size-3.5" />{" "}
          {tr("components.admin.libraries.library_form_sections.add_path")}
        </Button>
      </div>
      <FolderBrowser
        open={browserOpen}
        onOpenChange={setBrowserOpen}
        onSelect={(selected) => {
          form.mergeBrowsedPaths(selected);
          setBrowserOpen(false);
        }}
        existingPaths={form.paths.filter((path) => path.trim())}
      />
    </div>
  );
}

function ProviderLevelSection({
  level,
  items,
  onReorder,
  onToggleEnabled,
}: {
  level: string;
  items: LevelChainItem[];
  onReorder: (items: LevelChainItem[]) => void;
  onToggleEnabled: (index: number) => void;
}) {
  useUILanguage();
  useUILanguage();
  const [collapsed, setCollapsed] = useState(false);

  const moveItem = (index: number, direction: -1 | 1) => {
    const newItems = [...items];
    const target = index + direction;
    if (target < 0 || target >= newItems.length) return;
    [newItems[index], newItems[target]] = [newItems[target]!, newItems[index]!];
    onReorder(newItems);
  };

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="text-primary hover:text-primary/80 mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {contentLevelLabel(level)}
      </button>
      {!collapsed && (
        <div className="flex flex-col gap-1">
          {items.map((item, i) => (
            <div
              key={`${item.plugin_installation_id}:${item.capability_id}`}
              className={cn(
                "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm",
                item.enabled
                  ? "border-border bg-muted text-foreground"
                  : "border-border/50 bg-muted/30 text-muted-foreground",
              )}
            >
              <input
                type="checkbox"
                checked={item.enabled}
                onChange={() => onToggleEnabled(i)}
                className="h-3.5 w-3.5"
                style={{ accentColor: "var(--primary)" }}
              />
              <span className="flex-1 font-mono text-xs">{item.provider_slug}</span>
              <div className="flex gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  disabled={i === 0}
                  onClick={() => moveItem(i, -1)}
                >
                  <ArrowUp className="h-2.5 w-2.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  disabled={i === items.length - 1}
                  onClick={() => moveItem(i, 1)}
                >
                  <ArrowDown className="h-2.5 w-2.5" />
                </Button>
              </div>
              <span className="text-muted-foreground/70 font-mono text-[10px]">{i + 1}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MetadataFields({ form }: { form: LibraryFormController }) {
  useUILanguage();
  useUILanguage();
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label>{tr("components.admin.libraries.library_form_sections.metadata_language")}</Label>
        <Select value={form.metadataLanguage} onValueChange={form.setMetadataLanguage}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((lang) => (
              <SelectItem key={lang.code} value={lang.code}>
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">
          {tr(
            "components.admin.libraries.library_form_sections.preferred_language_for_titles_summaries_and_artwork_fetched_from_providers",
          )}
        </p>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor="auto-translate-metadata">
            {tr("components.admin.libraries.library_form_sections.auto_translate_descriptions")}
          </Label>
          <p className="text-muted-foreground text-xs">
            {tr(
              "components.admin.libraries.library_form_sections.when_providers_have_no_translation_for_this_library_s_language",
            )}
          </p>
        </div>
        <Switch
          id="auto-translate-metadata"
          checked={form.autoTranslateMetadata}
          onCheckedChange={form.setAutoTranslateMetadata}
        />
      </div>
      <div className="space-y-1.5">
        <Label>{tr("components.admin.libraries.library_form_sections.trailer_extras_types")}</Label>
        <p className="text-muted-foreground text-xs">
          {tr(
            "components.admin.libraries.library_form_sections.video_types_fetched_from_metadata_providers_during_refresh_uncheck_everything",
          )}
        </p>
        <div
          className="grid grid-cols-1 gap-1.5 sm:grid-cols-2"
          role="group"
          aria-label={tr(
            "components.admin.libraries.library_form_sections.trailer_and_extras_types",
          )}
        >
          {PROVIDER_TRAILER_KINDS.map((kind) => {
            const checked = form.trailerKinds.includes(kind);
            return (
              <label
                key={kind}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm",
                  checked
                    ? "border-border bg-muted text-foreground"
                    : "border-border/50 bg-muted/30 text-muted-foreground",
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => form.toggleTrailerKind(kind)}
                  className="h-3.5 w-3.5"
                  style={{ accentColor: "var(--primary)" }}
                />
                {extraKindGroupLabel(kind)}
              </label>
            );
          })}
        </div>
      </div>
      {form.contentLevels.length > 0 && (
        <div className="space-y-1.5">
          <Label>{tr("components.admin.libraries.library_form_sections.provider_priority")}</Label>
          <p className="text-muted-foreground mb-3 text-xs">
            {tr(
              "components.admin.libraries.library_form_sections.providers_are_asked_in_order_from_top_to_bottom_uncheck",
            )}
          </p>
          {form.chainLoading ? (
            <div className="border-border bg-surface text-muted-foreground flex items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-xs">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {tr("components.admin.libraries.library_form_sections.loading_providers")}
            </div>
          ) : form.hasMetadataProviders ? (
            form.contentLevels.map((level) => (
              <ProviderLevelSection
                key={level}
                level={level}
                items={form.activeLevelChains[level] ?? []}
                onReorder={(newItems) => form.reorderLevel(level, newItems)}
                onToggleEnabled={(index) => form.toggleLevelProvider(level, index)}
              />
            ))
          ) : (
            <p className="border-border bg-surface text-muted-foreground rounded-xl border border-dashed p-4 text-center text-xs">
              {tr(
                "components.admin.libraries.library_form_sections.no_metadata_provider_plugins_are_installed_install_one_under_admin",
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function AdvancedFields({
  form,
  chapterThumbnailsSupported,
}: {
  form: LibraryFormController;
  chapterThumbnailsSupported: boolean;
}) {
  useUILanguage();
  useUILanguage();
  return (
    <div className="space-y-3">
      <SettingCard
        htmlFor="chapter-thumbnails-switch"
        title={tr("components.admin.libraries.library_form_sections.generate_chapter_thumbnails")}
        description={tr(
          "components.admin.libraries.library_form_sections.stores_chapter_preview_images_in_the_configured_public_asset_s3",
        )}
        footer={
          !chapterThumbnailsSupported ? (
            <p className="text-warning text-xs">
              {tr(
                "components.admin.libraries.library_form_sections.public_asset_s3_storage_is_required_before_this_can_be",
              )}
            </p>
          ) : null
        }
      >
        <Switch
          id="chapter-thumbnails-switch"
          checked={form.chapterThumbnailsEnabled}
          disabled={!chapterThumbnailsSupported}
          onCheckedChange={form.setChapterThumbnailsEnabled}
        />
      </SettingCard>
      <SettingCard
        htmlFor="intro-detection-switch"
        title={tr("components.admin.libraries.library_form_sections.detect_intro_markers")}
        description={tr(
          "components.admin.libraries.library_form_sections.runs_background_audio_analysis_for_episodes_in_this_library_embedded",
        )}
      >
        <Switch
          id="intro-detection-switch"
          checked={form.introDetectionEnabled}
          onCheckedChange={form.setIntroDetectionEnabled}
        />
      </SettingCard>
    </div>
  );
}
