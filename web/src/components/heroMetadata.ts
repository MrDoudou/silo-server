import type { SectionItem } from "@/api/types";

import { tr } from "@/i18n/translate";

function isPositiveFinite(value: number | undefined | null): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}

function resolveHeroRuntimeSeconds(item: SectionItem): number | null {
  if (isPositiveFinite(item.runtime)) {
    const runtimeSeconds = item.runtime * 60;
    if (isPositiveFinite(runtimeSeconds)) {
      return runtimeSeconds;
    }
  }
  if (isPositiveFinite(item.duration_seconds)) {
    return item.duration_seconds;
  }
  return null;
}

function formatRuntime(seconds: number | undefined | null): string | null {
  if (!isPositiveFinite(seconds)) return null;
  const minutes = Math.round(seconds / 60);
  if (minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining === 0 ? `${hours}h` : `${hours}h ${remaining}m`;
}

export interface HeroMetadataEntry {
  key: string;
  label: string;
}

function isNonNegativeInteger(value: number | undefined | null): value is number {
  return value != null && Number.isInteger(value) && value >= 0;
}

export function formatHeroMetadata(item: SectionItem): HeroMetadataEntry[] {
  const entries: HeroMetadataEntry[] = [];
  const runtime = formatRuntime(resolveHeroRuntimeSeconds(item));
  const contentRating = item.content_rating?.trim().toUpperCase();

  if (item.type === "episode") {
    if (isNonNegativeInteger(item.season_number) && isNonNegativeInteger(item.episode_number)) {
      entries.push({
        key: "episode-identity",
        get label() {
          return tr("components.hero_metadata.s_value1_e_value2", {
            value1: item.season_number,
            value2: item.episode_number,
          });
        },
      });
    }
    if (runtime) entries.push({ key: "runtime", label: runtime });
    if (contentRating) entries.push({ key: "content-rating", label: contentRating });
    return entries;
  }

  if (Number.isInteger(item.year) && item.year > 0) {
    entries.push({ key: "year", label: String(item.year) });
  }
  if (runtime) entries.push({ key: "runtime", label: runtime });
  const imdbRating = item.rating_imdb;
  if (imdbRating != null && Number.isFinite(imdbRating) && imdbRating > 0 && imdbRating <= 10) {
    entries.push({
      key: "imdb",
      get label() {
        return tr("components.hero_metadata.imdb_value1", { value1: imdbRating.toFixed(1) });
      },
    });
  }

  const genres = [...new Set((item.genres ?? []).map((genre) => genre.trim()).filter(Boolean))];
  genres.slice(0, 2).forEach((genre, index) => {
    entries.push({ key: `genre-${index}`, label: genre });
  });

  if (contentRating) entries.push({ key: "content-rating", label: contentRating });
  return entries;
}
