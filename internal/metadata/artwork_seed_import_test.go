package metadata

import (
	"strings"
	"testing"
	"time"

	"github.com/Silo-Server/silo-server/internal/artworkkey"
)

func TestParseSeedAdoptionGrace(t *testing.T) {
	for raw, want := range map[string]time.Duration{"30d": 30 * 24 * time.Hour, "72h": 72 * time.Hour} {
		got, err := parseSeedAdoptionGrace(raw)
		if err != nil || got != want {
			t.Fatalf("parse %q = %s, %v; want %s", raw, got, err, want)
		}
	}
	if _, err := parseSeedAdoptionGrace("0d"); err == nil {
		t.Fatal("zero grace was accepted")
	}
}

func TestUntrackedUserArtworkSeedPolicy(t *testing.T) {
	for _, imageType := range []string{
		artworkkey.ImageTypeAvatar,
		artworkkey.ImageTypeCollectionPoster,
		artworkkey.ImageTypeCollectionBackdrop,
	} {
		if !isUntrackedUserArtworkImageType(imageType) {
			t.Fatalf("%q was not retained for an unverifiable user reference", imageType)
		}
	}
	for _, imageType := range []string{artworkkey.ImageTypeLibraryPoster, artworkkey.ImageTypePoster} {
		if isUntrackedUserArtworkImageType(imageType) {
			t.Fatalf("Postgres-visible image type %q was treated as unverifiable", imageType)
		}
	}
}

func TestSeedImportUpsertLeavesUnverifiableSeedsUnarmed(t *testing.T) {
	for _, want := range []string{
		"CASE WHEN $7 OR $10 THEN NULL ELSE $9 END",
		"seed_expires_at = CASE WHEN $7 OR $10 THEN NULL",
		"next_attempt_at = CASE WHEN $7 OR $10 THEN NULL",
	} {
		if !strings.Contains(artworkSeedImportUpsertSQL, want) {
			t.Fatalf("seed import SQL does not pin retained-unverifiable behavior %q", want)
		}
	}
}

func TestSeedImportPageCountersCommitWithCursor(t *testing.T) {
	checkpoint := ArtworkInventoryCheckpoint{ImportedSeeds: 3, AdoptedSeeds: 2, RetainedSeeds: 1, ImportSkipped: 4, ImportCursor: "previous"}
	page := seedImportPageCounts{imported: 2, adopted: 1, retained: 3, skipped: 1}

	// A failed/crashed page has only local counters and therefore cannot alter
	// the persisted checkpoint. A resume starts from this exact state.
	before := checkpoint
	if checkpoint != before {
		t.Fatal("local page counters changed the persisted checkpoint")
	}
	commitSeedImportPage(&checkpoint, "next", page)
	if checkpoint.ImportedSeeds != 5 || checkpoint.AdoptedSeeds != 3 || checkpoint.RetainedSeeds != 4 || checkpoint.ImportSkipped != 5 || checkpoint.ImportCursor != "next" {
		t.Fatalf("committed checkpoint = %#v", checkpoint)
	}
}
