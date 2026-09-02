import { useState } from "react";
import { Link } from "react-router";
import { Sparkles, ArrowRight, Heart, Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFavorites } from "@/hooks/queries/favorites";
import { useOnboardingFlow } from "@/hooks/queries/onboarding";
import { TourHost } from "@/components/onboarding/TourHost";
import { useUILanguage } from "@/i18n/uiText";
import { tr } from "@/i18n/translate";

/**
 * Re-entry point for the taste-seeding flow. Always links to /taste-seed —
 * the page itself handles already-favorited items by pre-marking them, so
 * users can both add new picks and review their existing ones from here.
 */
export default function PersonalizeSettings() {
  useUILanguage();
  const { data: favorites } = useFavorites();
  const favoriteCount = favorites?.length ?? 0;
  const [replaying, setReplaying] = useState(false);
  // Fetch lazily: the flow only loads when the user asks for a replay.
  const flow = useOnboardingFlow({ enabled: replaying });

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-foreground text-xl font-semibold tracking-tight">
          {tr("pages.settings.personalize_settings.personalize")}
        </h2>
        <p className="text-muted-foreground text-sm">
          {tr(
            "pages.settings.personalize_settings.pick_titles_you_love_so_your_home_recommendations_and_for",
          )}
        </p>
      </header>

      <div className="surface-panel rounded-2xl border-0 p-6">
        <div className="flex items-start gap-4">
          <div className="bg-primary/10 text-primary flex h-12 w-12 shrink-0 items-center justify-center rounded-full">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h3 className="text-base font-semibold">
                {tr("pages.settings.personalize_settings.refine_your_taste_profile")}
              </h3>
              <p className="text-muted-foreground mt-1 text-sm">
                {tr(
                  "pages.settings.personalize_settings.browse_popular_titles_and_pick_the_ones_you_love_already",
                )}
              </p>
            </div>
            <Button asChild>
              <Link to="/taste-seed?from=settings">
                {tr("pages.settings.personalize_settings.open_the_picker")}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="surface-panel rounded-2xl border-0 p-6">
        <div className="flex items-start gap-4">
          <div className="bg-primary/10 text-primary flex h-12 w-12 shrink-0 items-center justify-center rounded-full">
            <Map className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h3 className="text-base font-semibold">
                {tr("pages.settings.personalize_settings.replay_the_feature_tour")}
              </h3>
              <p className="text-muted-foreground mt-1 text-sm">
                {tr(
                  "pages.settings.personalize_settings.a_two_minute_walkthrough_of_what_this_server_can_do",
                )}
              </p>
            </div>
            <Button variant="outline" onClick={() => setReplaying(true)}>
              {tr("pages.settings.personalize_settings.start_the_tour")}
            </Button>
          </div>
        </div>
      </div>

      {replaying && flow.data && flow.data.steps.length > 0 && (
        <TourHost flow={flow.data} onDone={() => setReplaying(false)} />
      )}

      <div className="text-muted-foreground flex items-center gap-2 px-2 text-sm">
        <Heart className="h-4 w-4" />
        <span>
          {favoriteCount === 0
            ? tr("pages.settings.personalize_settings.you_haven_t_favorited_anything_yet")
            : favoriteCount === 1
              ? tr(
                  "pages.settings.personalize_settings.value_1_favorite_is_shaping_your_recommendations",
                )
              : tr(
                  "pages.settings.personalize_settings.favorite_count_favorites_are_shaping_your_recommendations",
                  {
                    favoriteCount: favoriteCount,
                  },
                )}
        </span>
      </div>
    </div>
  );
}
