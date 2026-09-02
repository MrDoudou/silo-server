import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { RefreshCw } from "lucide-react";

import type { Profile, UserLibrary } from "@/api/types";
import { ImageUploadField } from "@/components/ImageUploadField";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  useCreateProfile,
  useDeleteProfileAvatar,
  useUpdateProfile,
  useUploadProfileAvatar,
} from "@/hooks/queries/profiles";
import {
  buildProfileAvatarPresetBatch,
  parseDiceBearPresetId,
  PROFILE_AVATAR_STYLES,
  resolveProfileAvatarImage,
  resolveProfileAvatarPreset,
} from "@/lib/profile-avatars";
import { PLAYBACK_QUALITY_OPTIONS, type PlaybackQualityPreset } from "@/lib/playback-quality";
import {
  applyKidsPreset,
  buildProfileRequestFromDraft,
  clearKidsPreset,
  CONTENT_RATING_OPTIONS,
  createProfileDraft,
  type ProfileDraft,
} from "@/lib/profile-management";
import { cn } from "@/lib/utils";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

interface ProfileEditorDialogProps {
  open: boolean;
  profile?: Profile | null;
  libraries: UserLibrary[];
  avatarUploadEnabled?: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveSuccess?: (
    profile: Profile,
    context: {
      mode: "create" | "edit";
      pin: string;
    },
  ) => void;
}

interface ValidationErrors {
  name?: string;
  pin?: string;
  libraries?: string;
}

const ANY_CONTENT_RATING_VALUE = "__any_content__";

function sortLibraryIDs(ids: number[]) {
  return [...new Set(ids)].sort((left, right) => left - right);
}

export function ProfileEditorDialog({
  open,
  profile = null,
  libraries,
  avatarUploadEnabled = false,
  onOpenChange,
  onSaveSuccess,
}: ProfileEditorDialogProps) {
  useUILanguage();
  const mode = profile ? "edit" : "create";
  const sortedLibraries = useMemo(
    () => [...libraries].sort((left, right) => left.sort_order - right.sort_order),
    [libraries],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit"
              ? tr("components.profiles.profile_editor_dialog.edit_profile")
              : tr("components.profiles.profile_editor_dialog.new_profile")}
          </DialogTitle>
          <DialogDescription>
            {tr(
              "components.profiles.profile_editor_dialog.set_the_avatar_name_pin_and_access_rules_for_this",
            )}
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <ProfileEditorForm
            key={profile?.id ?? "new-profile"}
            mode={mode}
            profile={profile}
            libraries={sortedLibraries}
            avatarUploadEnabled={avatarUploadEnabled}
            onOpenChange={onOpenChange}
            onSaveSuccess={onSaveSuccess}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ProfileEditorForm({
  mode,
  profile,
  libraries,
  avatarUploadEnabled,
  onOpenChange,
  onSaveSuccess,
}: {
  mode: "create" | "edit";
  profile: Profile | null;
  libraries: UserLibrary[];
  avatarUploadEnabled: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveSuccess?: (
    profile: Profile,
    context: {
      mode: "create" | "edit";
      pin: string;
    },
  ) => void;
}) {
  useUILanguage();
  const createMutation = useCreateProfile();
  const updateMutation = useUpdateProfile();
  const uploadAvatarMutation = useUploadProfileAvatar();
  const deleteAvatarMutation = useDeleteProfileAvatar();
  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    uploadAvatarMutation.isPending ||
    deleteAvatarMutation.isPending;

  const [draft, setDraft] = useState<ProfileDraft>(() => createProfileDraft(profile));
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [removeUploadedAvatar, setRemoveUploadedAvatar] = useState(false);
  const [activePresetStyle, setActivePresetStyle] = useState(
    () =>
      parseDiceBearPresetId(draft.avatarPreset)?.styleId ??
      PROFILE_AVATAR_STYLES[0]?.id ??
      "identicon",
  );
  const [presetBatch, setPresetBatch] = useState(0);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [contentRatingTouched, setContentRatingTouched] = useState(false);
  const [libraryAccessTouched, setLibraryAccessTouched] = useState(false);

  const nameId = useId();
  const pinId = useId();
  const contentRatingId = useId();
  const playbackQualityId = useId();
  const restrictLibrariesId = useId();
  const selectedContentRatingValue =
    draft.maxContentRating === "" ? ANY_CONTENT_RATING_VALUE : draft.maxContentRating;

  const selectedPreset = resolveProfileAvatarPreset(draft.avatarPreset);
  const visiblePresets = useMemo(
    () => buildProfileAvatarPresetBatch(activePresetStyle, presetBatch),
    [activePresetStyle, presetBatch],
  );
  const filePreviewURL = useMemo(
    () => (avatarFile ? URL.createObjectURL(avatarFile) : ""),
    [avatarFile],
  );
  const existingUploadedAvatarURL =
    !removeUploadedAvatar && profile?.avatar_source === "upload"
      ? resolveProfileAvatarImage(profile)
      : "";
  const previewImage = filePreviewURL || selectedPreset?.previewUrl || existingUploadedAvatarURL;

  useEffect(() => {
    return () => {
      if (filePreviewURL) {
        URL.revokeObjectURL(filePreviewURL);
      }
    };
  }, [filePreviewURL]);

  function updateDraft<K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function selectPreset(presetID: string) {
    setRemoveUploadedAvatar(true);
    updateDraft("avatarPreset", draft.avatarPreset === presetID ? "" : presetID);
  }

  function toggleLibrary(libraryID: number, checked: boolean) {
    setLibraryAccessTouched(true);
    setErrors((current) => ({ ...current, libraries: undefined }));
    setDraft((current) => ({
      ...current,
      allowedLibraryIDs: checked
        ? sortLibraryIDs([...current.allowedLibraryIDs, libraryID])
        : current.allowedLibraryIDs.filter((id) => id !== libraryID),
    }));
  }

  function handleKidsChange(checked: boolean) {
    if (!checked) {
      setContentRatingTouched(false);
      setLibraryAccessTouched(false);
      setErrors((current) => ({ ...current, libraries: undefined }));
      setDraft((current) => clearKidsPreset(current));
      return;
    }

    setDraft((current) =>
      applyKidsPreset(current, {
        contentRatingTouched,
        libraryAccessTouched,
      }),
    );
  }

  function validate(current: ProfileDraft): ValidationErrors {
    const nextErrors: ValidationErrors = {};

    if (current.name.trim() === "") {
      nextErrors.name = "Enter a profile name.";
    }

    if (current.pin.trim() !== "" && !/^\d{4}$/.test(current.pin.trim())) {
      nextErrors.pin = "PIN must be exactly 4 digits.";
    }

    if (current.libraryRestrictionsEnabled && current.allowedLibraryIDs.length === 0) {
      nextErrors.libraries = "Choose at least one library.";
    }

    return nextErrors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validate(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const body = buildProfileRequestFromDraft(draft);
    const pin = draft.pin.trim();
    const preserveExistingUpload =
      mode === "edit" &&
      profile?.avatar_source === "upload" &&
      !removeUploadedAvatar &&
      !avatarFile &&
      draft.avatarPreset === "";
    const deleteExistingUpload =
      mode === "edit" &&
      profile?.avatar_source === "upload" &&
      removeUploadedAvatar &&
      !avatarFile &&
      draft.avatarPreset === "";

    if (preserveExistingUpload || deleteExistingUpload) {
      delete body.avatar;
    }

    let savedProfile: Profile;
    try {
      if (mode === "edit" && profile) {
        savedProfile = await updateMutation.mutateAsync({ id: profile.id, body });
      } else {
        savedProfile = await createMutation.mutateAsync(body);
      }
    } catch {
      return;
    }

    let finalProfile = savedProfile;
    if (avatarFile) {
      try {
        finalProfile = await uploadAvatarMutation.mutateAsync({
          id: savedProfile.id,
          file: avatarFile,
        });
      } catch {
        finalProfile = savedProfile;
      }
    } else if (deleteExistingUpload) {
      try {
        finalProfile = await deleteAvatarMutation.mutateAsync(savedProfile.id);
      } catch {
        finalProfile = savedProfile;
      }
    }

    onSaveSuccess?.(finalProfile, { mode, pin });
    onOpenChange(false);
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5">
      <section className="border-border space-y-4 rounded-md border p-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">
            {tr("components.profiles.profile_editor_dialog.profile")}
          </h3>
          <p className="text-muted-foreground text-sm">
            {tr("components.profiles.profile_editor_dialog.choose_an_avatar_and_basic_details")}
          </p>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="flex flex-col items-center gap-3 rounded-xl border px-5 py-4 lg:w-52">
            <Avatar className="ring-border h-24 w-24 ring-2">
              {previewImage ? (
                <AvatarImage
                  src={previewImage}
                  alt={draft.name || tr("components.profiles.profile_editor_dialog.profile_avatar")}
                />
              ) : null}
              <AvatarFallback className="bg-surface text-primary text-3xl font-bold">
                {(draft.name || profile?.name || "?").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="text-center">
              <div className="text-sm font-medium">
                {draft.name.trim() || tr("components.profiles.profile_editor_dialog.preview")}
              </div>
              <div className="text-muted-foreground text-xs">
                {avatarFile
                  ? tr("components.profiles.profile_editor_dialog.custom_upload_selected")
                  : selectedPreset
                    ? selectedPreset.label
                    : existingUploadedAvatarURL
                      ? tr("components.profiles.profile_editor_dialog.custom_upload")
                      : tr("components.profiles.profile_editor_dialog.initials_fallback")}
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-4">
            <div className="space-y-2">
              <Label htmlFor={nameId}>{tr("components.profiles.profile_editor_dialog.name")}</Label>
              <Input
                id={nameId}
                value={draft.name}
                onChange={(event) => {
                  updateDraft("name", event.target.value);
                  setErrors((current) => ({ ...current, name: undefined }));
                }}
                required
              />
              {errors.name ? <p className="text-destructive text-sm">{errors.name}</p> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor={pinId}>
                {draft.clearPin
                  ? tr("components.profiles.profile_editor_dialog.pin_will_be_removed")
                  : profile?.has_pin
                    ? tr("components.profiles.profile_editor_dialog.new_pin")
                    : tr("components.profiles.profile_editor_dialog.pin_optional")}
              </Label>
              <Input
                id={pinId}
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder={
                  draft.clearPin
                    ? tr("components.profiles.profile_editor_dialog.pin_will_be_removed_on_save")
                    : tr("components.profiles.profile_editor_dialog.value_4_digits")
                }
                value={draft.clearPin ? "" : draft.pin}
                disabled={draft.clearPin}
                onChange={(event) => {
                  updateDraft("pin", event.target.value.replace(/\D/g, "").slice(0, 4));
                  setErrors((current) => ({ ...current, pin: undefined }));
                }}
              />
              {mode === "edit" && profile?.has_pin ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground h-7 px-2 text-xs"
                  onClick={() => {
                    const next = !draft.clearPin;
                    setDraft((current) => ({
                      ...current,
                      clearPin: next,
                      pin: next ? "" : current.pin,
                    }));
                    setErrors((current) => ({ ...current, pin: undefined }));
                  }}
                >
                  {draft.clearPin
                    ? tr("components.profiles.profile_editor_dialog.keep_existing_pin")
                    : tr("components.profiles.profile_editor_dialog.remove_pin")}
                </Button>
              ) : null}
              {errors.pin ? <p className="text-destructive text-sm">{errors.pin}</p> : null}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{tr("components.profiles.profile_editor_dialog.preset_avatars")}</Label>
            <p className="text-muted-foreground text-xs">
              {tr(
                "components.profiles.profile_editor_dialog.pick_a_dice_bear_style_shuffle_fun_options_or_leave",
              )}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {PROFILE_AVATAR_STYLES.map((style) => {
              const selected = style.id === activePresetStyle;

              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => {
                    setActivePresetStyle(style.id);
                    setPresetBatch(0);
                  }}
                  className={cn(
                    "rounded-2xl border px-4 py-3 text-left transition-colors",
                    selected
                      ? "border-primary bg-primary/8 text-foreground"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  <div className="text-sm font-medium">{style.label}</div>
                  <div className="text-muted-foreground mt-1 text-xs">{style.summary}</div>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-xs">
              {PROFILE_AVATAR_STYLES.find((style) => style.id === activePresetStyle)?.summary}
              {tr("components.profiles.profile_editor_dialog.showing")} {visiblePresets.length}{" "}
              {tr("components.profiles.profile_editor_dialog.options_right_now")}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPresetBatch((current) => current + 1)}
            >
              <RefreshCw className="h-4 w-4" />
              {tr("components.profiles.profile_editor_dialog.more_options")}
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {visiblePresets.map((preset) => {
              const selected = preset.id === draft.avatarPreset;

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => selectPreset(preset.id)}
                  className={cn(
                    "flex aspect-square w-full max-w-20 items-center justify-center justify-self-center rounded-2xl border p-2 transition-colors",
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50",
                  )}
                  aria-pressed={selected}
                  title={preset.label}
                >
                  <div className="size-16 overflow-hidden rounded-xl">
                    <img
                      src={preset.previewUrl}
                      alt={preset.label}
                      className="block h-full w-full object-cover"
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {avatarUploadEnabled ? (
          <ImageUploadField
            label={tr("components.profiles.profile_editor_dialog.custom_upload")}
            currentUrl={existingUploadedAvatarURL}
            file={avatarFile}
            onFileChange={(file) => {
              setAvatarFile(file);
              if (file) {
                setRemoveUploadedAvatar(true);
              } else if (profile?.avatar_source === "upload") {
                setRemoveUploadedAvatar(false);
              }
            }}
            onDelete={
              existingUploadedAvatarURL
                ? () => {
                    setAvatarFile(null);
                    setRemoveUploadedAvatar(true);
                  }
                : undefined
            }
          />
        ) : (
          <div className="rounded-md border border-dashed px-4 py-3 text-sm">
            <p className="font-medium">
              {tr("components.profiles.profile_editor_dialog.custom_uploads_are_unavailable")}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {tr(
                "components.profiles.profile_editor_dialog.configure_private_s3_avatar_storage_to_enable_uploaded_profile_avatars",
              )}
            </p>
          </div>
        )}
      </section>

      <section className="border-border space-y-4 rounded-md border p-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">
            {tr("components.profiles.profile_editor_dialog.access")}
          </h3>
          <p className="text-muted-foreground text-sm">
            {tr(
              "components.profiles.profile_editor_dialog.content_limits_and_library_visibility_for_this_profile",
            )}
          </p>
        </div>

        <div className="border-border flex items-center justify-between rounded-md border px-3 py-2">
          <div className="space-y-0.5">
            <Label htmlFor="profile-is-child">
              {tr("components.profiles.profile_editor_dialog.kids_profile")}
            </Label>
            <p className="text-muted-foreground text-xs">
              {tr(
                "components.profiles.profile_editor_dialog.seeds_a_safer_default_rating_and_library_setup",
              )}
            </p>
          </div>
          <Switch
            id="profile-is-child"
            checked={draft.isChild}
            onCheckedChange={handleKidsChange}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={contentRatingId}>
              {tr("components.profiles.profile_editor_dialog.maximum_content_rating")}
            </Label>
            <Select
              value={selectedContentRatingValue}
              onValueChange={(value) => {
                setContentRatingTouched(true);
                updateDraft("maxContentRating", value === ANY_CONTENT_RATING_VALUE ? "" : value);
              }}
            >
              <SelectTrigger id={contentRatingId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTENT_RATING_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value || ANY_CONTENT_RATING_VALUE}
                    value={option.value === "" ? ANY_CONTENT_RATING_VALUE : option.value}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={playbackQualityId}>
              {tr("components.profiles.profile_editor_dialog.maximum_playback_quality")}
            </Label>
            <Select
              value={draft.maxPlaybackQuality}
              onValueChange={(value) =>
                updateDraft("maxPlaybackQuality", value as PlaybackQualityPreset)
              }
            >
              <SelectTrigger id={playbackQualityId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAYBACK_QUALITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border-border space-y-3 rounded-md border p-3">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor={restrictLibrariesId}>
                {tr("components.profiles.profile_editor_dialog.restrict_libraries")}
              </Label>
              <p className="text-muted-foreground text-xs">
                {tr(
                  "components.profiles.profile_editor_dialog.limit_this_profile_to_a_specific_set_of_libraries",
                )}
              </p>
            </div>
            <Switch
              id={restrictLibrariesId}
              checked={draft.libraryRestrictionsEnabled}
              onCheckedChange={(checked) => {
                setLibraryAccessTouched(true);
                updateDraft("libraryRestrictionsEnabled", checked);
                setErrors((current) => ({ ...current, libraries: undefined }));
              }}
            />
          </div>

          {draft.libraryRestrictionsEnabled ? (
            <div className="space-y-2">
              <div className="grid gap-2">
                {libraries.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {tr("components.profiles.profile_editor_dialog.no_libraries_available")}
                  </p>
                ) : (
                  libraries.map((library) => {
                    const checked = draft.allowedLibraryIDs.includes(library.id);

                    return (
                      <div
                        key={library.id}
                        className="border-border flex items-center justify-between rounded-md border px-3 py-2"
                      >
                        <div className="space-y-0.5">
                          <div className="text-sm font-medium">{library.name}</div>
                          <div className="text-muted-foreground text-xs capitalize">
                            {library.type}
                          </div>
                        </div>
                        <Switch
                          checked={checked}
                          onCheckedChange={(nextChecked) => toggleLibrary(library.id, nextChecked)}
                        />
                      </div>
                    );
                  })
                )}
              </div>

              {errors.libraries ? (
                <p className="text-destructive text-sm">{errors.libraries}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          {tr("common.actions.cancel")}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending
            ? tr("components.profiles.profile_editor_dialog.saving")
            : tr("components.profiles.profile_editor_dialog.save_profile")}
        </Button>
      </DialogFooter>
    </form>
  );
}
