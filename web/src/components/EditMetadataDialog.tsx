import { useState, useMemo, useCallback } from "react";
import { Lock, Unlock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { MetadataTranslatePanel } from "@/components/MetadataTranslatePanel";
import { TagInput } from "@/components/TagInput";
import ImageSelectorTab from "@/components/ImageSelectorTab";
import type { ItemDetail } from "@/api/types";
import {
  useUpdateItemMetadata,
  useRefreshItemMetadata,
  type UpdateItemMetadataRequest,
} from "@/hooks/queries/items";
import { useIsActingAdmin } from "@/hooks/useIsActingAdmin";
import { cn } from "@/lib/utils";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

// MetadataField enum values matching internal/metadata/types.go
const FIELD_NAME = 0;
const FIELD_OVERVIEW = 1;
const FIELD_GENRES = 2;
const FIELD_STUDIOS = 3;
const FIELD_RATING = 6;
const FIELD_TAGS = 8;
const FIELD_RUNTIME = 7;
const FIELD_CONTENT_RATING = 9;
const FIELD_AIR_SCHEDULE = 11;
const FIELD_RELEASE_DATES = 13;

const AIR_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
];

type Section = "general" | "dates" | "tags" | "ids" | "images";

const SECTIONS: { key: Section; label: string; types: ItemDetail["type"][] }[] = [
  {
    key: "general",
    get label() {
      return tr("components.edit_metadata_dialog.general");
    },
    types: ["movie", "series", "season", "episode"],
  },
  {
    key: "dates",
    get label() {
      return tr("components.edit_metadata_dialog.dates_ratings");
    },
    types: ["movie", "series", "season", "episode"],
  },
  {
    key: "tags",
    get label() {
      return tr("components.edit_metadata_dialog.tags_genres");
    },
    types: ["movie", "series"],
  },
  {
    key: "ids",
    get label() {
      return tr("components.edit_metadata_dialog.external_ids");
    },
    types: ["movie", "series", "season", "episode"],
  },
  // Episodes are excluded: the image search endpoint only returns series-level
  // posters/backdrops/logos, and episodes store stills — there is nothing an
  // episode apply could legitimately show or persist from this dialog.
  {
    key: "images",
    get label() {
      return tr("components.edit_metadata_dialog.images");
    },
    types: ["movie", "series", "season"],
  },
];

// Maps form field names to their MetadataField lock value.
const FIELD_LOCK_MAP: Record<string, number> = {
  title: FIELD_NAME,
  sort_title: FIELD_NAME,
  original_title: FIELD_NAME,
  tagline: FIELD_NAME,
  overview: FIELD_OVERVIEW,
  genres: FIELD_GENRES,
  studios: FIELD_STUDIOS,
  networks: FIELD_STUDIOS,
  countries: FIELD_TAGS,
  rating_imdb: FIELD_RATING,
  rating_tmdb: FIELD_RATING,
  rating_rt_critic: FIELD_RATING,
  rating_rt_audience: FIELD_RATING,
  runtime: FIELD_RUNTIME,
  content_rating: FIELD_CONTENT_RATING,
  air_time: FIELD_AIR_SCHEDULE,
  air_timezone: FIELD_AIR_SCHEDULE,
  year: FIELD_RELEASE_DATES,
  release_date: FIELD_RELEASE_DATES,
  first_air_date: FIELD_RELEASE_DATES,
  last_air_date: FIELD_RELEASE_DATES,
};

interface EditMetadataDialogProps {
  item: ItemDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function initFormState(item: ItemDetail) {
  return {
    title: item.title ?? "",
    sort_title: item.sort_title ?? "",
    original_title: item.original_title ?? "",
    overview: item.overview ?? "",
    tagline: item.tagline ?? "",
    content_rating: item.content_rating ?? "",
    year: item.year ?? 0,
    runtime: item.runtime ?? 0,
    genres: item.genres ?? [],
    studios: item.studios ?? [],
    networks: item.networks ?? [],
    countries: item.countries ?? [],
    release_date: item.release_date ?? "",
    first_air_date: item.first_air_date ?? "",
    last_air_date: item.last_air_date ?? "",
    air_time: item.air_time ?? "",
    air_timezone: item.air_timezone ?? "",
    air_date: item.air_date ?? "",
    status: item.status ?? "",
    rating_imdb: item.rating_imdb,
    rating_tmdb: item.rating_tmdb,
    rating_rt_critic: item.rating_rt_critic,
    rating_rt_audience: item.rating_rt_audience,
    imdb_id: item.imdb_id ?? "",
    tmdb_id: item.tmdb_id ?? "",
    tvdb_id: item.tvdb_id ?? "",
    season_number: item.season_number ?? undefined,
    episode_number: item.episode_number ?? undefined,
  };
}

export default function EditMetadataDialog({ item, open, onOpenChange }: EditMetadataDialogProps) {
  useUILanguage();
  const [activeSection, setActiveSection] = useState<Section>("general");
  const [form, setForm] = useState(() => initFormState(item));
  const [lockedFields, setLockedFields] = useState<Set<number>>(
    () => new Set(item.locked_fields ?? []),
  );
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const updateMutation = useUpdateItemMetadata(item.content_id);
  const refreshMutation = useRefreshItemMetadata();

  const isLockable = item.type === "movie" || item.type === "series";
  const canEditImages = useIsActingAdmin();
  const visibleSections = SECTIONS.filter(
    (s) => s.types.includes(item.type) && (s.key !== "images" || canEditImages),
  );
  const effectiveActiveSection = visibleSections.some((section) => section.key === activeSection)
    ? activeSection
    : "general";

  const originalForm = useMemo(() => initFormState(item), [item]);

  const setField = useCallback(
    (field: string, value: unknown) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      if (isLockable && field in FIELD_LOCK_MAP) {
        const lockField = FIELD_LOCK_MAP[field] as number;
        setLockedFields((prev) => new Set(prev).add(lockField));
      }
    },
    [isLockable],
  );

  const toggleLock = useCallback((metadataField: number) => {
    setLockedFields((prev) => {
      const next = new Set(prev);
      if (next.has(metadataField)) {
        next.delete(metadataField);
      } else {
        next.add(metadataField);
      }
      return next;
    });
  }, []);

  const lockedCount = lockedFields.size;

  function handleSave() {
    const data: UpdateItemMetadataRequest = {};

    if (form.title !== originalForm.title) data.title = form.title;
    if (form.sort_title !== originalForm.sort_title) data.sort_title = form.sort_title;
    if (form.original_title !== originalForm.original_title)
      data.original_title = form.original_title;
    if (form.overview !== originalForm.overview) data.overview = form.overview;
    if (form.tagline !== originalForm.tagline) data.tagline = form.tagline;
    if (form.content_rating !== originalForm.content_rating)
      data.content_rating = form.content_rating;
    if (form.year !== originalForm.year) data.year = form.year;
    if (form.runtime !== originalForm.runtime) data.runtime = form.runtime;
    if (JSON.stringify(form.genres) !== JSON.stringify(originalForm.genres))
      data.genres = form.genres;
    if (JSON.stringify(form.studios) !== JSON.stringify(originalForm.studios))
      data.studios = form.studios;
    if (JSON.stringify(form.networks) !== JSON.stringify(originalForm.networks))
      data.networks = form.networks;
    if (JSON.stringify(form.countries) !== JSON.stringify(originalForm.countries))
      data.countries = form.countries;
    if (form.release_date !== originalForm.release_date)
      data.release_date = form.release_date || null;
    if (form.first_air_date !== originalForm.first_air_date)
      data.first_air_date = form.first_air_date || null;
    if (form.last_air_date !== originalForm.last_air_date)
      data.last_air_date = form.last_air_date || null;
    if (form.air_time !== originalForm.air_time) data.air_time = form.air_time || null;
    if (form.air_timezone !== originalForm.air_timezone)
      // Send "" (not null) when cleared: the server treats null as "skip", so
      // clearing a previously-set timezone would not persist. "" is accepted by
      // validation and normalized to NULL server-side.
      data.air_timezone = form.air_timezone;
    if (form.air_date !== originalForm.air_date) data.air_date = form.air_date || null;
    if (form.status !== originalForm.status) data.status = form.status;
    if (form.rating_imdb !== originalForm.rating_imdb) data.rating_imdb = form.rating_imdb;
    if (form.rating_tmdb !== originalForm.rating_tmdb) data.rating_tmdb = form.rating_tmdb;
    if (form.rating_rt_critic !== originalForm.rating_rt_critic)
      data.rating_rt_critic = form.rating_rt_critic;
    if (form.rating_rt_audience !== originalForm.rating_rt_audience)
      data.rating_rt_audience = form.rating_rt_audience;
    if (form.imdb_id !== originalForm.imdb_id) data.imdb_id = form.imdb_id;
    if (form.tmdb_id !== originalForm.tmdb_id) data.tmdb_id = form.tmdb_id;
    if (form.tvdb_id !== originalForm.tvdb_id) data.tvdb_id = form.tvdb_id;
    if (form.season_number !== originalForm.season_number) data.season_number = form.season_number;
    if (form.episode_number !== originalForm.episode_number)
      data.episode_number = form.episode_number;

    if (isLockable) {
      const originalLocked = new Set(item.locked_fields ?? []);
      const currentLocked = Array.from(lockedFields).sort();
      const originalSorted = Array.from(originalLocked).sort();
      if (JSON.stringify(currentLocked) !== JSON.stringify(originalSorted)) {
        data.locked_fields = currentLocked;
      }
    }

    if (Object.keys(data).length === 0) {
      onOpenChange(false);
      return;
    }

    updateMutation.mutate(data, {
      onSuccess: () => onOpenChange(false),
    });
  }

  function handleReset() {
    refreshMutation.mutate({ item, mode: "quick" });
    setShowResetConfirm(false);
    onOpenChange(false);
  }

  function renderLockIcon(fieldName: string) {
    if (!isLockable || !(fieldName in FIELD_LOCK_MAP)) return null;
    const metadataField = FIELD_LOCK_MAP[fieldName] as number;
    const isLocked = lockedFields.has(metadataField);
    return (
      <button
        type="button"
        onClick={() => toggleLock(metadataField)}
        className={cn(
          "inline-flex items-center gap-1 text-[10px] transition-colors",
          isLocked
            ? "text-amber-500/80 hover:text-amber-500"
            : "text-muted-foreground/30 hover:text-muted-foreground/60",
        )}
        title={
          isLocked
            ? tr("components.edit_metadata_dialog.locked_click_to_unlock")
            : tr("components.edit_metadata_dialog.unlocked_edits_will_auto_lock")
        }
      >
        {isLocked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
        {isLocked ? tr("components.edit_metadata_dialog.locked") : ""}
      </button>
    );
  }

  const typeLabel =
    item.type === "movie"
      ? "Movie"
      : item.type === "series"
        ? "Series"
        : item.type === "season"
          ? "Season"
          : "Episode";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0 sm:max-w-5xl" showCloseButton>
          {/* Header */}
          <DialogHeader className="border-border/10 flex-row items-center justify-between border-b px-5 py-4">
            <div className="flex items-center gap-2.5">
              <DialogTitle className="text-[15px] font-semibold">
                {tr("components.edit_metadata_dialog.edit_metadata")}
              </DialogTitle>
              <span className="bg-muted/50 text-muted-foreground rounded px-2 py-0.5 text-[11px]">
                {typeLabel}
              </span>
            </div>
            {isLockable && lockedCount > 0 && (
              <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                <Lock className="size-3" />
                {lockedCount} {tr("components.edit_metadata_dialog.locked")}
              </span>
            )}
          </DialogHeader>

          <div className="flex flex-col sm:flex-row" style={{ height: "min(70vh, 580px)" }}>
            {/* Sidebar — horizontal tabs on mobile, vertical on sm+ */}
            <nav className="border-border/10 flex flex-shrink-0 overflow-x-auto border-b bg-black/10 sm:w-[160px] sm:flex-col sm:overflow-x-visible sm:border-r sm:border-b-0 sm:py-2">
              {visibleSections.map((section) => (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => setActiveSection(section.key)}
                  className={cn(
                    "px-4 py-2 text-left text-[13px] font-medium whitespace-nowrap transition-colors",
                    effectiveActiveSection === section.key
                      ? "border-primary bg-primary/8 text-primary max-sm:border-b-2 sm:border-r-2"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {section.label}
                </button>
              ))}
            </nav>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              {effectiveActiveSection === "general" && (
                <div className="space-y-4">
                  <FieldRow
                    label={tr("components.edit_metadata_dialog.title")}
                    lockIcon={renderLockIcon("title")}
                  >
                    <Input value={form.title} onChange={(e) => setField("title", e.target.value)} />
                  </FieldRow>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FieldRow
                      label={tr("components.edit_metadata_dialog.sort_title")}
                      lockIcon={renderLockIcon("sort_title")}
                    >
                      <Input
                        value={form.sort_title}
                        onChange={(e) => setField("sort_title", e.target.value)}
                      />
                    </FieldRow>
                    <FieldRow
                      label={tr("components.edit_metadata_dialog.original_title")}
                      lockIcon={renderLockIcon("original_title")}
                    >
                      <Input
                        value={form.original_title}
                        onChange={(e) => setField("original_title", e.target.value)}
                      />
                    </FieldRow>
                  </div>

                  <FieldRow
                    label={tr("components.edit_metadata_dialog.overview")}
                    lockIcon={renderLockIcon("overview")}
                  >
                    <textarea
                      value={form.overview}
                      onChange={(e) => setField("overview", e.target.value)}
                      rows={4}
                      className="border-border bg-background text-foreground focus:border-ring focus:ring-ring/50 w-full resize-y rounded-md px-3 py-2.5 text-sm shadow-xs transition-[color,box-shadow] outline-none focus:ring-[3px]"
                    />
                  </FieldRow>

                  <FieldRow
                    label={tr("components.edit_metadata_dialog.tagline")}
                    lockIcon={renderLockIcon("tagline")}
                  >
                    <Input
                      value={form.tagline}
                      onChange={(e) => setField("tagline", e.target.value)}
                      placeholder={tr("components.edit_metadata_dialog.no_tagline")}
                    />
                  </FieldRow>

                  {["movie", "series", "season", "episode"].includes(item.type) && (
                    <MetadataTranslatePanel item={item} />
                  )}

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FieldRow
                      label={tr("components.edit_metadata_dialog.content_rating")}
                      lockIcon={renderLockIcon("content_rating")}
                    >
                      <Input
                        value={form.content_rating}
                        onChange={(e) => setField("content_rating", e.target.value)}
                      />
                    </FieldRow>

                    {item.type === "movie" && (
                      <FieldRow
                        label={tr("components.edit_metadata_dialog.runtime_min")}
                        lockIcon={renderLockIcon("runtime")}
                      >
                        <Input
                          type="number"
                          value={form.runtime || ""}
                          onChange={(e) => setField("runtime", parseInt(e.target.value) || 0)}
                        />
                      </FieldRow>
                    )}

                    {item.type === "series" && (
                      <FieldRow label={tr("components.edit_metadata_dialog.status")}>
                        <select
                          value={form.status}
                          onChange={(e) => setField("status", e.target.value)}
                          className="border-border bg-background text-foreground focus:border-ring focus:ring-ring/50 h-9 w-full rounded-md px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none focus:ring-[3px]"
                        >
                          <option value="Continuing">
                            {tr("components.edit_metadata_dialog.continuing")}
                          </option>
                          <option value="Ended">
                            {tr("components.edit_metadata_dialog.ended")}
                          </option>
                        </select>
                      </FieldRow>
                    )}

                    {item.type === "season" && (
                      <FieldRow label={tr("components.edit_metadata_dialog.season_number")}>
                        <Input
                          type="number"
                          value={form.season_number ?? ""}
                          onChange={(e) =>
                            setField("season_number", parseInt(e.target.value) || undefined)
                          }
                        />
                      </FieldRow>
                    )}

                    {item.type === "episode" && (
                      <FieldRow label={tr("components.edit_metadata_dialog.season_number")}>
                        <Input
                          type="number"
                          value={form.season_number ?? ""}
                          disabled
                          className="opacity-50"
                        />
                      </FieldRow>
                    )}
                  </div>

                  {item.type === "episode" && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FieldRow label={tr("components.edit_metadata_dialog.episode_number")}>
                        <Input
                          type="number"
                          value={form.episode_number ?? ""}
                          onChange={(e) =>
                            setField("episode_number", parseInt(e.target.value) || undefined)
                          }
                        />
                      </FieldRow>
                      <FieldRow
                        label={tr("components.edit_metadata_dialog.runtime_min")}
                        lockIcon={renderLockIcon("runtime")}
                      >
                        <Input
                          type="number"
                          value={form.runtime || ""}
                          onChange={(e) => setField("runtime", parseInt(e.target.value) || 0)}
                        />
                      </FieldRow>
                    </div>
                  )}
                </div>
              )}

              {effectiveActiveSection === "dates" && (
                <div className="space-y-4">
                  {(item.type === "movie" || item.type === "series") && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FieldRow
                        label={tr("components.edit_metadata_dialog.year")}
                        lockIcon={renderLockIcon("year")}
                      >
                        <Input
                          type="number"
                          value={form.year || ""}
                          onChange={(e) => setField("year", parseInt(e.target.value) || 0)}
                        />
                      </FieldRow>

                      {item.type === "movie" && (
                        <FieldRow
                          label={tr("components.edit_metadata_dialog.release_date")}
                          lockIcon={renderLockIcon("release_date")}
                        >
                          <Input
                            type="date"
                            value={form.release_date}
                            onChange={(e) => setField("release_date", e.target.value)}
                          />
                        </FieldRow>
                      )}

                      {item.type === "series" && (
                        <FieldRow
                          label={tr("components.edit_metadata_dialog.first_air_date")}
                          lockIcon={renderLockIcon("first_air_date")}
                        >
                          <Input
                            type="date"
                            value={form.first_air_date}
                            onChange={(e) => setField("first_air_date", e.target.value)}
                          />
                        </FieldRow>
                      )}
                    </div>
                  )}

                  {item.type === "series" && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <FieldRow
                        label={tr("components.edit_metadata_dialog.last_air_date")}
                        lockIcon={renderLockIcon("last_air_date")}
                      >
                        <Input
                          type="date"
                          value={form.last_air_date}
                          onChange={(e) => setField("last_air_date", e.target.value)}
                        />
                      </FieldRow>
                      <FieldRow
                        label={tr("components.edit_metadata_dialog.air_time")}
                        lockIcon={renderLockIcon("air_time")}
                      >
                        <Input
                          type="time"
                          value={form.air_time}
                          onChange={(e) => setField("air_time", e.target.value)}
                        />
                      </FieldRow>
                      <FieldRow
                        label={tr("components.edit_metadata_dialog.air_timezone")}
                        lockIcon={renderLockIcon("air_timezone")}
                      >
                        <Input
                          list="air-timezone-options"
                          value={form.air_timezone}
                          placeholder={tr("components.edit_metadata_dialog.america_new_york")}
                          onChange={(e) => setField("air_timezone", e.target.value)}
                        />
                        <datalist id="air-timezone-options">
                          {AIR_TIMEZONES.map((timezone) => (
                            <option key={timezone} value={timezone} />
                          ))}
                        </datalist>
                      </FieldRow>
                    </div>
                  )}

                  {(item.type === "season" || item.type === "episode") && (
                    <FieldRow label={tr("components.edit_metadata_dialog.air_date")}>
                      <Input
                        type="date"
                        value={form.air_date}
                        onChange={(e) => setField("air_date", e.target.value)}
                      />
                    </FieldRow>
                  )}

                  {(item.type === "movie" || item.type === "series") && (
                    <>
                      <div className="text-muted-foreground pt-2 text-[11px] font-semibold tracking-wider uppercase">
                        {tr("components.edit_metadata_dialog.ratings")}
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <FieldRow
                          label={tr("components.edit_metadata_dialog.imdb_rating")}
                          lockIcon={renderLockIcon("rating_imdb")}
                        >
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="10"
                            value={form.rating_imdb ?? ""}
                            onChange={(e) =>
                              setField(
                                "rating_imdb",
                                e.target.value ? parseFloat(e.target.value) : null,
                              )
                            }
                          />
                        </FieldRow>
                        <FieldRow
                          label={tr("components.edit_metadata_dialog.tmdb_rating")}
                          lockIcon={renderLockIcon("rating_tmdb")}
                        >
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="10"
                            value={form.rating_tmdb ?? ""}
                            onChange={(e) =>
                              setField(
                                "rating_tmdb",
                                e.target.value ? parseFloat(e.target.value) : null,
                              )
                            }
                          />
                        </FieldRow>
                        <FieldRow
                          label={tr("components.edit_metadata_dialog.rt_critic_score")}
                          lockIcon={renderLockIcon("rating_rt_critic")}
                        >
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={form.rating_rt_critic ?? ""}
                            onChange={(e) =>
                              setField(
                                "rating_rt_critic",
                                e.target.value ? parseInt(e.target.value) : null,
                              )
                            }
                          />
                        </FieldRow>
                        <FieldRow
                          label={tr("components.edit_metadata_dialog.rt_audience_score")}
                          lockIcon={renderLockIcon("rating_rt_audience")}
                        >
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={form.rating_rt_audience ?? ""}
                            onChange={(e) =>
                              setField(
                                "rating_rt_audience",
                                e.target.value ? parseInt(e.target.value) : null,
                              )
                            }
                          />
                        </FieldRow>
                      </div>
                    </>
                  )}
                </div>
              )}

              {effectiveActiveSection === "tags" && (
                <div className="space-y-4">
                  <FieldRow
                    label={tr("components.edit_metadata_dialog.genres")}
                    lockIcon={renderLockIcon("genres")}
                  >
                    <TagInput
                      value={form.genres}
                      onChange={(v) => setField("genres", v)}
                      placeholder={tr("components.edit_metadata_dialog.add_genre")}
                    />
                  </FieldRow>

                  <FieldRow
                    label={tr("components.edit_metadata_dialog.studios")}
                    lockIcon={renderLockIcon("studios")}
                  >
                    <TagInput
                      value={form.studios}
                      onChange={(v) => setField("studios", v)}
                      placeholder={tr("components.edit_metadata_dialog.add_studio")}
                    />
                  </FieldRow>

                  {item.type === "series" && (
                    <FieldRow
                      label={tr("components.edit_metadata_dialog.networks")}
                      lockIcon={renderLockIcon("networks")}
                    >
                      <TagInput
                        value={form.networks}
                        onChange={(v) => setField("networks", v)}
                        placeholder={tr("components.edit_metadata_dialog.add_network")}
                      />
                    </FieldRow>
                  )}

                  <FieldRow
                    label={tr("components.edit_metadata_dialog.countries")}
                    lockIcon={renderLockIcon("countries")}
                  >
                    <TagInput
                      value={form.countries}
                      onChange={(v) => setField("countries", v)}
                      placeholder={tr("components.edit_metadata_dialog.add_country")}
                    />
                  </FieldRow>
                </div>
              )}

              {effectiveActiveSection === "ids" && (
                <div className="space-y-4">
                  <FieldRow label={tr("components.edit_metadata_dialog.imdb_id")}>
                    <Input
                      value={form.imdb_id}
                      onChange={(e) => setField("imdb_id", e.target.value)}
                      placeholder={tr("components.edit_metadata_dialog.tt")}
                    />
                  </FieldRow>
                  <FieldRow label={tr("components.edit_metadata_dialog.tmdb_id")}>
                    <Input
                      value={form.tmdb_id}
                      onChange={(e) => setField("tmdb_id", e.target.value)}
                    />
                  </FieldRow>
                  <FieldRow label={tr("components.edit_metadata_dialog.tvdb_id")}>
                    <Input
                      value={form.tvdb_id}
                      onChange={(e) => setField("tvdb_id", e.target.value)}
                    />
                  </FieldRow>
                </div>
              )}

              {canEditImages && (
                <div
                  className={
                    effectiveActiveSection === "images" ? "flex h-full flex-col" : "hidden"
                  }
                >
                  <ImageSelectorTab item={item} enabled={effectiveActiveSection === "images"} />
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-border/10 flex flex-col-reverse gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-3.5">
            <div>
              {isLockable && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowResetConfirm(true)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {tr("components.edit_metadata_dialog.reset_to_provider")}
                </Button>
              )}
            </div>
            <div className="flex gap-2 max-sm:w-full">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="max-sm:flex-1"
              >
                {tr("common.actions.cancel")}
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="max-sm:flex-1"
              >
                {updateMutation.isPending
                  ? tr("components.edit_metadata_dialog.saving")
                  : tr("components.edit_metadata_dialog.save_changes")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showResetConfirm}
        onOpenChange={setShowResetConfirm}
        title={tr("components.edit_metadata_dialog.reset_to_provider")}
        description={tr(
          "components.edit_metadata_dialog.this_will_unlock_all_fields_and_refresh_metadata_from_your",
        )}
        confirmLabel={tr("components.edit_metadata_dialog.reset_refresh")}
        variant="destructive"
        onConfirm={handleReset}
      />
    </>
  );
}

function FieldRow({
  label,
  lockIcon,
  children,
}: {
  label: string;
  lockIcon?: React.ReactNode;
  children: React.ReactNode;
}) {
  useUILanguage();
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <Label className="text-muted-foreground text-[12px] font-medium">{label}</Label>
        {lockIcon}
      </div>
      {children}
    </div>
  );
}
