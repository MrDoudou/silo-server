package metadata

import (
	"context"
	"testing"

	"github.com/Silo-Server/silo-server/internal/models"
)

// Admin artwork selection locks FieldImages. Refresh must not let
// applyBestImages rewrite the curated poster afterward — including on
// MergeReplaceUnlocked manual refreshes and on FillEmpty scheduled refreshes
// when the provider image carries a popularity rating.
func TestMergeAndPersist_RespectsFieldImagesLock(t *testing.T) {
	const curatedPoster = "tmdb/movies/550/poster/original.curated.webp"
	const curatedSource = "tmdb://images/poster/curated.jpg"

	for _, tc := range []struct {
		name string
		mode RefreshMode
	}{
		{name: "manual refresh", mode: ModeManualRefresh},
		{name: "scheduled refresh", mode: ModeScheduledRefresh},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := newTestHarness()
			ctx := context.Background()

			if err := h.itemRepo.Upsert(ctx, &models.MediaItem{
				ContentID:        "movie-locked-art",
				Type:             "movie",
				Title:            "Fight Club",
				Year:             1999,
				Status:           "matched",
				PosterPath:       curatedPoster,
				PosterSourcePath: curatedSource,
				LockedFields:     []int{int(FieldImages)},
				Studios:          []string{},
				Networks:         []string{},
				Countries:        []string{},
				Genres:           []string{},
			}); err != nil {
				t.Fatalf("upsert: %v", err)
			}

			_, err := h.service.mergeAndPersist(ctx, ProcessRequest{
				ContentID: "movie-locked-art",
				Language:  "en",
				Mode:      tc.mode,
			}, &MetadataResult{
				HasMetadata: true,
				Title:       "Fight Club",
				Year:        1999,
				ProviderIDs: map[string]string{"tmdb": "550"},
			}, []RemoteImage{
				{
					ProviderID: "tmdb",
					URL:        "https://image.tmdb.org/t/p/original/provider-best.jpg",
					Type:       ImagePoster,
					Language:   "en",
					Rating:     9.5,
				},
			}, nil, nil, "movie")
			if err != nil {
				t.Fatalf("mergeAndPersist: %v", err)
			}

			stored, err := h.itemRepo.GetByID(ctx, "movie-locked-art")
			if err != nil {
				t.Fatalf("GetByID: %v", err)
			}
			if stored.PosterPath != curatedPoster {
				t.Fatalf("PosterPath = %q, want curated %q", stored.PosterPath, curatedPoster)
			}
			if stored.PosterSourcePath != curatedSource {
				t.Fatalf("PosterSourcePath = %q, want curated %q", stored.PosterSourcePath, curatedSource)
			}
		})
	}
}

func TestMergeAndPersist_RespectsParentFieldImagesLockOnSeasonsAndEpisodes(t *testing.T) {
	const seriesID = "series-locked-art"
	const curatedSeasonPoster = "tmdb/series/1396/season/1/poster/original.curated.webp"
	const curatedSeasonSource = "tmdb://images/season/curated.jpg"
	const curatedStill = "tmdb/series/1396/season/1/episode/1/still/original.curated.webp"
	const curatedStillSource = "tmdb://images/still/curated.jpg"

	service, itemRepo, seasonRepo, episodeRepo := newSeasonEpisodeServiceForTest(seriesID)
	itemRepo.items[seriesID].Status = "matched"
	itemRepo.items[seriesID].LockedFields = []int{int(FieldImages)}
	itemRepo.items[seriesID].Studios = []string{}
	itemRepo.items[seriesID].Networks = []string{}
	itemRepo.items[seriesID].Countries = []string{}
	itemRepo.items[seriesID].Genres = []string{}

	seasonRepo.seasons[seasonKey(seriesID, 1)] = &models.Season{
		ContentID:        "season-locked-art",
		SeriesID:         seriesID,
		SeasonNumber:     1,
		Title:            "Season 1",
		PosterPath:       curatedSeasonPoster,
		PosterSourcePath: curatedSeasonSource,
	}
	episodeRepo.episodes[episodeKey(seriesID, 1, 1)] = &models.Episode{
		ContentID:       "episode-locked-art",
		SeriesID:        seriesID,
		SeasonID:        "season-locked-art",
		SeasonNumber:    1,
		EpisodeNumber:   1,
		Title:           "Pilot",
		StillPath:       curatedStill,
		StillSourcePath: curatedStillSource,
	}

	_, err := service.mergeAndPersist(context.Background(), ProcessRequest{
		ContentID: seriesID,
		Language:  "en",
		Mode:      ModeManualRefresh,
	}, &MetadataResult{
		HasMetadata: true,
		Title:       "Test Series",
		ProviderIDs: map[string]string{"tmdb": "1396"},
	}, nil, []SeasonResult{{
		SeasonNumber: 1,
		Title:        "Season 1",
		PosterPath:   "https://image.tmdb.org/t/p/original/new-season.jpg",
	}}, []EpisodeResult{{
		SeasonNumber:  1,
		EpisodeNumber: 1,
		Title:         "Pilot",
		StillPath:     "https://image.tmdb.org/t/p/original/new-still.jpg",
	}}, "series")
	if err != nil {
		t.Fatalf("mergeAndPersist: %v", err)
	}

	season := seasonRepo.seasons[seasonKey(seriesID, 1)]
	if season == nil {
		t.Fatal("season missing after persist")
	}
	if season.PosterPath != curatedSeasonPoster {
		t.Fatalf("season PosterPath = %q, want curated %q", season.PosterPath, curatedSeasonPoster)
	}
	if season.PosterSourcePath != curatedSeasonSource {
		t.Fatalf("season PosterSourcePath = %q, want curated %q", season.PosterSourcePath, curatedSeasonSource)
	}

	episode := episodeRepo.episodes[episodeKey(seriesID, 1, 1)]
	if episode == nil {
		t.Fatal("episode missing after persist")
	}
	if episode.StillPath != curatedStill {
		t.Fatalf("episode StillPath = %q, want curated %q", episode.StillPath, curatedStill)
	}
	if episode.StillSourcePath != curatedStillSource {
		t.Fatalf("episode StillSourcePath = %q, want curated %q", episode.StillSourcePath, curatedStillSource)
	}
}
