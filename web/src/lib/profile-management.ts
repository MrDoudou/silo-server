import type { CreateProfileRequest, Profile } from "@/api/types";
import { avatarPresetRef, parseProfileAvatarPresetRef } from "@/lib/profile-avatars";
import {
  formatPlaybackQualityPreset,
  playbackQualityPresetFromValue,
  playbackQualityValueFromPreset,
  type PlaybackQualityPreset,
} from "@/lib/playback-quality";

import { tr } from "@/i18n/translate";

export interface ProfileDraft {
  name: string;
  avatarPreset: string;
  pin: string;
  clearPin: boolean;
  isChild: boolean;
  maxContentRating: string;
  maxPlaybackQuality: PlaybackQualityPreset;
  libraryRestrictionsEnabled: boolean;
  allowedLibraryIDs: number[];
}

export interface ContentRatingOption {
  value: string;
  label: string;
  summary: string;
}

export interface ProfileAccessSummary {
  contentRating: string;
  libraries: string;
  playbackQuality: string;
  text: string;
}

export const CONTENT_RATING_OPTIONS: ContentRatingOption[] = [
  {
    value: "",
    get label() {
      return tr("lib.profile_management.any_content");
    },
    get summary() {
      return tr("lib.profile_management.any_content");
    },
  },
  {
    value: "G",
    get label() {
      return tr("lib.profile_management.g_tv_g");
    },
    get summary() {
      return tr("lib.profile_management.g_max");
    },
  },
  {
    value: "PG",
    get label() {
      return tr("lib.profile_management.pg_tv_pg_tv_y7");
    },
    get summary() {
      return tr("lib.profile_management.pg_max");
    },
  },
  {
    value: "PG-13",
    get label() {
      return tr("lib.profile_management.pg_13_tv_14");
    },
    get summary() {
      return tr("lib.profile_management.pg_13_max");
    },
  },
  {
    value: "R",
    get label() {
      return tr("lib.profile_management.r_tv_ma_nc_17");
    },
    get summary() {
      return tr("lib.profile_management.r_max");
    },
  },
];

function sortUniqueLibraryIDs(ids: number[] | null | undefined): number[] {
  if (!ids || ids.length === 0) {
    return [];
  }

  return [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].sort((a, b) => a - b);
}

export function createProfileDraft(profile?: Profile | null): ProfileDraft {
  return {
    name: profile?.name ?? "",
    avatarPreset: parseProfileAvatarPresetRef(profile?.avatar),
    pin: "",
    clearPin: false,
    isChild: profile?.is_child ?? false,
    maxContentRating: profile?.max_content_rating ?? "",
    maxPlaybackQuality: playbackQualityPresetFromValue(profile?.max_playback_quality),
    libraryRestrictionsEnabled: profile?.library_restrictions_enabled ?? false,
    allowedLibraryIDs: sortUniqueLibraryIDs(profile?.allowed_library_ids),
  };
}

export function buildProfileRequestFromDraft(draft: ProfileDraft): CreateProfileRequest {
  const body: CreateProfileRequest = {
    name: draft.name.trim(),
    avatar: draft.avatarPreset ? avatarPresetRef(draft.avatarPreset) : "",
    is_child: draft.isChild,
    max_content_rating: draft.maxContentRating,
    max_playback_quality: playbackQualityValueFromPreset(draft.maxPlaybackQuality),
    library_restrictions_enabled: draft.libraryRestrictionsEnabled,
    allowed_library_ids: draft.libraryRestrictionsEnabled
      ? sortUniqueLibraryIDs(draft.allowedLibraryIDs)
      : [],
  };

  if (draft.clearPin) {
    body.pin = "";
  } else if (draft.pin.trim() !== "") {
    body.pin = draft.pin.trim();
  }

  return body;
}

export function buildProfileAccessSummary(
  profile: Pick<
    Profile,
    | "max_content_rating"
    | "library_restrictions_enabled"
    | "allowed_library_ids"
    | "max_playback_quality"
  >,
): ProfileAccessSummary {
  const contentRating =
    CONTENT_RATING_OPTIONS.find((option) => option.value === profile.max_content_rating)?.summary ??
    "Any content";
  const libraryCount = sortUniqueLibraryIDs(profile.allowed_library_ids).length;
  const libraries = profile.library_restrictions_enabled
    ? `${libraryCount} ${libraryCount === 1 ? "library" : "libraries"}`
    : "All libraries";
  const qualityLabel = formatPlaybackQualityPreset(profile.max_playback_quality);
  const playbackQuality = `${qualityLabel} quality`;

  return {
    contentRating,
    libraries,
    playbackQuality,
    text: [contentRating, libraries, playbackQuality].join(" · "),
  };
}

export function applyKidsPreset(
  draft: ProfileDraft,
  options: {
    contentRatingTouched: boolean;
    libraryAccessTouched: boolean;
  },
): ProfileDraft {
  const next: ProfileDraft = {
    ...draft,
    isChild: true,
  };

  if (!options.contentRatingTouched && next.maxContentRating === "") {
    next.maxContentRating = "PG";
  }

  if (!options.libraryAccessTouched && !next.libraryRestrictionsEnabled) {
    next.libraryRestrictionsEnabled = true;
    next.allowedLibraryIDs = [];
  }

  return next;
}

export function clearKidsPreset(draft: ProfileDraft): ProfileDraft {
  return {
    ...draft,
    isChild: false,
    maxContentRating: "",
    maxPlaybackQuality: "any",
    libraryRestrictionsEnabled: false,
    allowedLibraryIDs: [],
  };
}
