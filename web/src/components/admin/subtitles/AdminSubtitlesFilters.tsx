import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { LANGUAGES } from "@/player/utils/languageNames";
import { SUBTITLE_PROVIDER_OPTIONS } from "./subtitleAdminStyles";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

const ALL = "all";

interface AdminSubtitlesFiltersProps {
  provider: string;
  language: string;
  userId: string;
  search: string;
  users: Array<{ id: number; username: string }>;
  onProviderChange: (value: string) => void;
  onLanguageChange: (value: string) => void;
  onUserChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onReset: () => void;
}

export default function AdminSubtitlesFilters({
  provider,
  language,
  userId,
  search,
  users,
  onProviderChange,
  onLanguageChange,
  onUserChange,
  onSearchChange,
  onReset,
}: AdminSubtitlesFiltersProps) {
  useUILanguage();
  return (
    <div className="surface-panel rounded-2xl border-0 px-3 py-3 sm:px-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 flex-1">
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={tr(
              "components.admin.subtitles.admin_subtitles_filters.search_release_name",
            )}
            className="font-mono text-xs sm:max-w-sm"
            aria-label={tr(
              "components.admin.subtitles.admin_subtitles_filters.search_subtitle_release_name",
            )}
          />
        </div>

        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label={tr(
            "components.admin.subtitles.admin_subtitles_filters.filter_by_subtitle_provider",
          )}
        >
          {SUBTITLE_PROVIDER_OPTIONS.map((option) => {
            const active = provider === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => onProviderChange(option.value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-primary/40 bg-primary/15 text-foreground shadow-[inset_0_1px_0_rgb(255_255_255_/_0.06)]"
                    : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={language} onValueChange={onLanguageChange}>
            <SelectTrigger
              className="w-[180px]"
              aria-label={tr(
                "components.admin.subtitles.admin_subtitles_filters.filter_by_language",
              )}
            >
              <SelectValue
                placeholder={tr("components.admin.subtitles.admin_subtitles_filters.language")}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>
                {tr("components.admin.subtitles.admin_subtitles_filters.all_languages")}
              </SelectItem>
              {LANGUAGES.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={userId} onValueChange={onUserChange}>
            <SelectTrigger
              className="w-[200px]"
              aria-label={tr(
                "components.admin.subtitles.admin_subtitles_filters.filter_by_uploader",
              )}
            >
              <SelectValue
                placeholder={tr("components.admin.subtitles.admin_subtitles_filters.uploader")}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>
                {tr("components.admin.subtitles.admin_subtitles_filters.all_uploaders")}
              </SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={String(user.id)}>
                  {user.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button type="button" variant="ghost" size="sm" onClick={onReset}>
            {tr("components.admin.subtitles.admin_subtitles_filters.reset_filters")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export { ALL as FILTER_ALL };
