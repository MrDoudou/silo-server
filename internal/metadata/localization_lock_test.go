package metadata

import (
	"testing"

	"github.com/Silo-Server/silo-server/internal/models"
)

// Non-canonical refreshes must write the provider's language-bearing text into
// the localization row. Feeding the post-MergeGlobalMetadata accumulator
// (canonical-language base row) with MergeReplaceUnlocked would replace a
// correct French title with the English base title on every manual refresh.
func TestBuildItemLocalizationRecord_UsesProviderLanguageText(t *testing.T) {
	existing := &models.MediaItemLocalization{
		ContentID: "movie-1",
		Language:  "fr",
		Title:     "Ancien titre",
		Overview:  "Ancien resume",
		Tagline:   "Ancien slogan",
	}
	providerLang := &MetadataResult{
		Title:    "Nouveau titre FR",
		Overview: "Nouveau resume FR",
		Tagline:  "Nouveau slogan FR",
	}

	loc := buildItemLocalizationRecord(
		existing, "movie-1", "fr", "movie", providerLang, nil,
		MergeReplaceUnlocked, "fr", false, false, false,
	)

	if loc.Title != "Nouveau titre FR" {
		t.Fatalf("title = %q, want provider-language title", loc.Title)
	}
	if loc.Overview != "Nouveau resume FR" {
		t.Fatalf("overview = %q, want provider-language overview", loc.Overview)
	}
	if loc.Tagline != "Nouveau slogan FR" {
		t.Fatalf("tagline = %q, want provider-language tagline", loc.Tagline)
	}
}

func TestBuildItemLocalizationRecord_RespectsFieldLocks(t *testing.T) {
	existing := &models.MediaItemLocalization{
		ContentID:          "movie-1",
		Language:           "fr",
		Title:              "Titre verrouille",
		SortTitle:          "Titre verrouille",
		Overview:           "Resume verrouille",
		Tagline:            "Slogan verrouille",
		PosterPath:         "s3://poster-fr.jpg",
		PosterSourcePath:   "https://img.example/poster-fr.jpg",
		BackdropPath:       "s3://backdrop-fr.jpg",
		BackdropSourcePath: "https://img.example/backdrop-fr.jpg",
	}
	providerLang := &MetadataResult{
		Title:    "Titre provider",
		Overview: "Resume provider",
		Tagline:  "Slogan provider",
	}
	images := []RemoteImage{
		{ProviderID: "tmdb", URL: "https://img.example/new-poster.jpg", Type: ImagePoster, Language: "fr", Rating: 10},
		{ProviderID: "tmdb", URL: "https://img.example/new-backdrop.jpg", Type: ImageBackdrop, Language: "", Rating: 10},
	}

	loc := buildItemLocalizationRecord(
		existing, "movie-1", "fr", "movie", providerLang, images,
		MergeReplaceUnlocked, "fr", true, true, true,
	)

	if loc.Title != "Titre verrouille" || loc.Overview != "Resume verrouille" || loc.Tagline != "Slogan verrouille" {
		t.Fatalf("locked text overwritten: title=%q overview=%q tagline=%q", loc.Title, loc.Overview, loc.Tagline)
	}
	if loc.PosterPath != "s3://poster-fr.jpg" || loc.BackdropPath != "s3://backdrop-fr.jpg" {
		t.Fatalf("locked artwork overwritten: poster=%q backdrop=%q", loc.PosterPath, loc.BackdropPath)
	}
}
