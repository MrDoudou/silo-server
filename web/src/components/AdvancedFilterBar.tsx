import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ArrowUp, ArrowDown } from "lucide-react";
import { getDefaultQuerySortOrder, getQuerySortOptions } from "@/lib/querySortOptions";
import { ADVANCED_FILTER_CONTENT_RATINGS, ADVANCED_FILTER_GENRES } from "./advancedFilterOptions";
import type { AdvancedFilters } from "./advancedFilterOptions";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

interface AdvancedFilterBarProps {
  filters: AdvancedFilters;
  onChange: (filters: AdvancedFilters) => void;
  showTypeFilter?: boolean;
}

const filterTrigger = (active: boolean) =>
  `h-9 rounded-full text-[13px] ${
    active ? "border-primary/40 bg-primary/8 text-foreground" : "border-border/50 bg-transparent"
  }`;

const yearInput = (active: boolean) =>
  `h-9 w-[4.5rem] rounded-full text-center text-[13px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
    active ? "border-primary/40 bg-primary/8 text-foreground" : "border-border/50 bg-transparent"
  }`;

export default function AdvancedFilterBar({
  filters,
  onChange,
  showTypeFilter = true,
}: AdvancedFilterBarProps) {
  useUILanguage();
  const sortOptions = getQuerySortOptions(true);

  const toggleOrder = () => {
    onChange({ ...filters, order: filters.order === "asc" ? "desc" : "asc" });
  };

  const isYearActive = Boolean(filters.year_min || filters.year_max);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showTypeFilter && (
        <Select value={filters.type} onValueChange={(v) => onChange({ ...filters, type: v })}>
          <SelectTrigger className={filterTrigger(filters.type !== "all")}>
            <SelectValue placeholder={tr("components.advanced_filter_bar.type")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tr("components.advanced_filter_bar.all_types")}</SelectItem>
            <SelectItem value="movie">{tr("components.advanced_filter_bar.movies")}</SelectItem>
            <SelectItem value="series">{tr("components.advanced_filter_bar.series")}</SelectItem>
          </SelectContent>
        </Select>
      )}

      <Select value={filters.genre} onValueChange={(v) => onChange({ ...filters, genre: v })}>
        <SelectTrigger className={filterTrigger(filters.genre !== "all")}>
          <SelectValue placeholder={tr("components.advanced_filter_bar.genre")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{tr("components.advanced_filter_bar.all_genres")}</SelectItem>
          {ADVANCED_FILTER_GENRES.map((g) => (
            <SelectItem key={g} value={g}>
              {g}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground text-[13px]">
          {tr("components.advanced_filter_bar.year")}
        </span>
        <Input
          type="number"
          placeholder={tr("components.advanced_filter_bar.from")}
          value={filters.year_min}
          onChange={(e) => onChange({ ...filters, year_min: e.target.value })}
          className={yearInput(isYearActive)}
          min={1900}
          max={2099}
        />
        <span className="text-muted-foreground/50 text-xs">–</span>
        <Input
          type="number"
          placeholder={tr("components.advanced_filter_bar.to")}
          value={filters.year_max}
          onChange={(e) => onChange({ ...filters, year_max: e.target.value })}
          className={yearInput(isYearActive)}
          min={1900}
          max={2099}
        />
      </div>

      <Select
        value={filters.content_rating}
        onValueChange={(v) => onChange({ ...filters, content_rating: v })}
      >
        <SelectTrigger className={filterTrigger(filters.content_rating !== "all")}>
          <SelectValue placeholder={tr("components.advanced_filter_bar.rating")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{tr("components.advanced_filter_bar.all_ratings")}</SelectItem>
          {ADVANCED_FILTER_CONTENT_RATINGS.map((r) => (
            <SelectItem key={r} value={r}>
              {r}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Sort — right-aligned */}
      <div className="ml-auto flex items-center gap-1.5">
        <Select
          value={filters.sort}
          onValueChange={(v) =>
            onChange({
              ...filters,
              sort: v,
              order: getDefaultQuerySortOrder(v),
            })
          }
        >
          <SelectTrigger className="border-border/50 h-9 rounded-full bg-transparent text-[13px]">
            <SelectValue placeholder={tr("components.advanced_filter_bar.sort_by")} />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={toggleOrder}
          className="border-border/50 text-muted-foreground hover:bg-accent hover:text-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors"
          title={
            filters.order === "asc"
              ? tr("components.advanced_filter_bar.ascending")
              : tr("components.advanced_filter_bar.descending")
          }
        >
          {filters.order === "asc" ? (
            <ArrowUp className="size-3.5" />
          ) : (
            <ArrowDown className="size-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
