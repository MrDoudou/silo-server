package metadata

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/Silo-Server/silo-server/internal/artworkkey"
	"github.com/Silo-Server/silo-server/internal/artworkstore"
)

type scriptedInventoryPage struct {
	objects []artworkstore.ObjectInfo
	next    string
	done    bool
	err     error
}

type scriptedInventoryStore struct {
	pages []scriptedInventoryPage
	calls int
}

func (*scriptedInventoryStore) Open(context.Context, string) (*artworkstore.Object, error) {
	return nil, artworkstore.ErrNotFound
}

func (*scriptedInventoryStore) Stat(context.Context, string) (artworkstore.ObjectInfo, error) {
	return artworkstore.ObjectInfo{}, artworkstore.ErrNotFound
}

func (*scriptedInventoryStore) Probe(context.Context) error { return nil }

func (s *scriptedInventoryStore) ListPage(context.Context, string, string, int) ([]artworkstore.ObjectInfo, string, bool, error) {
	if s.calls >= len(s.pages) {
		return nil, "", true, errors.New("unexpected list call")
	}
	page := s.pages[s.calls]
	s.calls++
	return page.objects, page.next, page.done, page.err
}

func TestDiscoverOrphansClassifiesAuxiliaryArtwork(t *testing.T) {
	indexKey := artworkkey.AdoptionIndexKey(strings.Repeat("a", 64), artworkkey.ImageTypePoster, artworkkey.PortableRecipeVersion)
	if indexKey == "" {
		t.Fatal("build adoption index key")
	}
	store := &scriptedInventoryStore{pages: []scriptedInventoryPage{{
		objects: []artworkstore.ObjectInfo{
			{Key: "branding/wordmark/revision.webp", SizeBytes: 11},
			{Key: "library-posters/7.jpg", SizeBytes: 12},
			{Key: "collection-images/admin/poster/original.webp", SizeBytes: 13},
			{Key: "user-collection-images/personal/poster/original.webp", SizeBytes: 14},
			{Key: "profile-avatars/12/main/original.webp", SizeBytes: 15},
			{Key: indexKey, SizeBytes: 16},
		},
		done: true,
	}}}
	service := &ArtworkStorageService{store: store}
	checkpoint := ArtworkInventoryCheckpoint{Version: artworkInventoryCheckpointVersion}
	if err := service.discoverOrphans(context.Background(), &checkpoint, nil, nil); err != nil {
		t.Fatalf("discoverOrphans: %v", err)
	}
	if checkpoint.OrphanObjects != 0 {
		t.Fatalf("orphan objects = %d, want 0", checkpoint.OrphanObjects)
	}
	if checkpoint.BrandingObjects != 1 || checkpoint.BrandingBytes != 11 {
		t.Fatalf("branding accounting = %d objects/%d bytes", checkpoint.BrandingObjects, checkpoint.BrandingBytes)
	}
	if checkpoint.LegacyUploadObjects != 4 || checkpoint.LegacyUploadBytes != 54 {
		t.Fatalf("legacy upload accounting = %d objects/%d bytes", checkpoint.LegacyUploadObjects, checkpoint.LegacyUploadBytes)
	}
	if checkpoint.IndexObjects != 1 || checkpoint.IndexBytes != 16 {
		t.Fatalf("adoption index accounting = %d objects/%d bytes", checkpoint.IndexObjects, checkpoint.IndexBytes)
	}
}

func TestDiscoverOrphansPersistsAdvancedEmptyPageCursor(t *testing.T) {
	store := &scriptedInventoryStore{pages: []scriptedInventoryPage{
		{next: "page-2", done: false},
		{next: "page-2", done: true},
	}}
	service := &ArtworkStorageService{store: store}
	checkpoint := ArtworkInventoryCheckpoint{Version: artworkInventoryCheckpointVersion}
	var saved ArtworkInventoryCheckpoint
	if err := service.discoverOrphans(context.Background(), &checkpoint, func(cp ArtworkInventoryCheckpoint) error {
		saved = cp
		return nil
	}, nil); err != nil {
		t.Fatalf("discoverOrphans: %v", err)
	}
	if checkpoint.StoreCursor != "page-2" || saved.StoreCursor != "page-2" {
		t.Fatalf("empty-page cursor = checkpoint %q saved %q, want page-2", checkpoint.StoreCursor, saved.StoreCursor)
	}
}

func TestArtworkListingLoopsRejectNonAdvancingCursor(t *testing.T) {
	for _, operation := range []string{"artwork inventory: store", "artwork seed import: portable tree"} {
		for _, next := range []string{"", "same"} {
			err := validateArtworkListCursor(operation, "same", next, false)
			if err == nil || !strings.Contains(err.Error(), "listing did not advance") {
				t.Fatalf("%s next %q error = %v", operation, next, err)
			}
		}
		if err := validateArtworkListCursor(operation, "same", "same", true); err != nil {
			t.Fatalf("%s terminal page rejected: %v", operation, err)
		}
	}
}
