import { memo, useCallback } from "react";
import { Star } from "lucide-react";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

interface StarRatingProps {
  value: number | null;
  onChange: (rating: number | null) => void;
  size?: number;
}

const STAR_COUNT = 5;

function StarRating({ value, onChange, size = 20 }: StarRatingProps) {
  useUILanguage();
  function handleClick(star: number) {
    if (star === value) {
      onChange(null);
    } else {
      onChange(star);
    }
  }

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let newValue: number | null = null;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") {
        e.preventDefault();
        newValue = Math.min((value ?? 0) + 1, STAR_COUNT);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
        e.preventDefault();
        newValue = Math.max((value ?? 2) - 1, 1);
      }
      if (newValue !== null) {
        onChange(newValue);
        e.currentTarget
          .querySelector<HTMLButtonElement>(`[data-rating="${newValue}"]`)
          ?.focus({ preventScroll: true });
      }
    },
    [value, onChange],
  );

  const tabbableStar = value ?? 1;

  return (
    <div
      role="radiogroup"
      aria-label={tr("components.star_rating.rating")}
      className="star-rating flex items-center gap-0.5 rounded-full px-2.5 py-2"
      onKeyDown={handleKeyDown}
    >
      {Array.from({ length: STAR_COUNT }, (_, i) => {
        const star = i + 1;
        const filled = value !== null && star <= value;
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-label={tr("components.star_rating.star_star_value", {
              star: star,
              value: star !== 1 ? "s" : "",
            })}
            aria-checked={value === star}
            tabIndex={star === tabbableStar ? 0 : -1}
            data-filled={filled}
            data-rating={star}
            className="star-rating-star focus-visible:ring-ring cursor-pointer rounded-sm border-none bg-transparent p-0.5 leading-none outline-none focus-visible:ring-2"
            onClick={() => handleClick(star)}
          >
            <Star size={size} fill="none" strokeWidth={1.5} />
          </button>
        );
      })}
    </div>
  );
}

export default memo(StarRating);
