package metadata

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Silo-Server/silo-server/internal/artworkurl"
	"github.com/Silo-Server/silo-server/internal/models"
)

func localArtworkTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("SILO_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("SILO_TEST_DATABASE_URL is not set")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatalf("connect test database: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func TestCurrentTargetCachedPathItem(t *testing.T) {
	pool := localArtworkTestPool(t)
	ctx := context.Background()
	contentID := fmt.Sprintf("local-art-%d", time.Now().UnixNano())
	if _, err := pool.Exec(ctx, `
		INSERT INTO media_items (content_id, type, title, status, genres, poster_path, poster_source_path)
		VALUES ($1, 'movie', 'Local Art Test', 'matched', '{}'::text[], $2, $3)
	`, contentID, "local/movies/"+contentID+"/deadbeef/poster/original.webp", "file:///media/movies/Film/poster.jpg"); err != nil {
		t.Fatalf("seed item: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM media_items WHERE content_id = $1`, contentID)
	})

	repo := NewImageCacheJobRepository(pool)
	job := &models.MetadataImageCacheJob{
		TargetType:      ImageCacheTargetItem,
		TargetContentID: contentID,
		ImageType:       ImageCacheImagePoster,
	}
	cached, err := repo.CurrentTargetCachedPath(ctx, job)
	if err != nil {
		t.Fatalf("CurrentTargetCachedPath: %v", err)
	}
	if want := "local/movies/" + contentID + "/deadbeef/poster/original.webp"; cached != want {
		t.Fatalf("cached = %q, want %q", cached, want)
	}
	source, err := repo.CurrentTargetSourcePath(ctx, job)
	if err != nil {
		t.Fatalf("CurrentTargetSourcePath: %v", err)
	}
	if source != "file:///media/movies/Film/poster.jpg" {
		t.Fatalf("source = %q", source)
	}

	// Missing rows report empty, not an error.
	missing, err := repo.CurrentTargetCachedPath(ctx, &models.MetadataImageCacheJob{
		TargetType:      ImageCacheTargetItem,
		TargetContentID: contentID + "-missing",
		ImageType:       ImageCacheImagePoster,
	})
	if err != nil || missing != "" {
		t.Fatalf("missing row: cached=%q err=%v", missing, err)
	}
}

func TestEnqueueBatchAcceptsLocalSourceDB(t *testing.T) {
	pool := localArtworkTestPool(t)
	ctx := context.Background()
	contentID := fmt.Sprintf("local-art-enq-%d", time.Now().UnixNano())
	repo := NewImageCacheJobRepository(pool)
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM metadata_image_cache_jobs WHERE target_content_id = $1`, contentID)
	})

	n, err := repo.EnqueueBatch(ctx, []EnqueueImageCacheJobInput{{
		TargetType:      ImageCacheTargetItem,
		TargetContentID: contentID,
		SeriesID:        contentID,
		SourcePath:      "file:///media/movies/Film/poster.jpg",
		ContentType:     "movies",
		ImageType:       ImageCacheImagePoster,
	}})
	if err != nil {
		t.Fatalf("EnqueueBatch: %v", err)
	}
	if n != 1 {
		t.Fatalf("enqueued %d, want 1", n)
	}
	var providerID string
	if err := pool.QueryRow(ctx,
		`SELECT provider_id FROM metadata_image_cache_jobs WHERE target_content_id = $1`, contentID,
	).Scan(&providerID); err != nil {
		t.Fatalf("read job: %v", err)
	}
	if providerID != "local" {
		t.Fatalf("provider_id = %q, want local", providerID)
	}
}

func TestArtworkRepairPublicationDrainsRebuildState(t *testing.T) {
	pool := localArtworkTestPool(t)
	ctx := context.Background()
	suffix := time.Now().UnixNano()
	contentID := fmt.Sprintf("artwork-repair-%d", suffix)
	oldPath := fmt.Sprintf("tmdb/movies/%s/poster/original.old.webp", contentID)
	revision := fmt.Sprintf("%064x", suffix)
	newPath := fmt.Sprintf("artwork/v1/objects/poster/%s/%s/original.webp", revision[:2], revision)
	workerID := fmt.Sprintf("repair-worker-%d", suffix)
	targetKeys := []string{contentID}

	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM artwork_storage_alerts WHERE target_keys = $1`, targetKeys)
		_, _ = pool.Exec(ctx, `DELETE FROM metadata_image_cache_jobs WHERE target_content_id = $1`, contentID)
		_, _ = pool.Exec(ctx, `DELETE FROM artwork_revision_gc_candidates WHERE original_path = ANY($1)`, []string{oldPath, newPath})
	})

	for _, path := range []string{oldPath, newPath} {
		if _, err := pool.Exec(ctx, `
			INSERT INTO artwork_revision_gc_candidates (
				original_path, object_keys, missing_at, repair_state,
				repair_queued_at, protected_loss_at, not_before, next_attempt_at
			) VALUES ($1, ARRAY[$1], NOW(), 'protected_loss', NOW(), NOW(),
				NOW() + interval '24 hours', NOW() + interval '24 hours')`, path); err != nil {
			t.Fatalf("seed missing revision %q: %v", path, err)
		}
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO artwork_storage_alerts (
			kind, surface_name, target_keys, image_slot, original_path, message
		) VALUES ('protected_data_loss', $1, $2, 'poster', $3, 'test loss')`,
		artworkurl.SurfaceItemPosters, targetKeys, oldPath); err != nil {
		t.Fatalf("seed protected-loss alert: %v", err)
	}

	repo := NewImageCacheJobRepository(pool)
	if _, err := repo.EnqueueRepair(ctx, EnqueueImageCacheJobInput{
		TargetType:        ImageCacheTargetItem,
		TargetContentID:   contentID,
		SeriesID:          contentID,
		SourcePath:        "tmdb://movie/repair-test",
		ProviderID:        "tmdb",
		ProviderContentID: contentID,
		ContentType:       "movie",
		ImageType:         ImageCacheImagePoster,
	}); err != nil {
		t.Fatalf("enqueue repair: %v", err)
	}
	jobs, err := repo.claimDue(ctx, workerID, contentID, 1)
	if err != nil || len(jobs) != 1 {
		t.Fatalf("claim repair: jobs=%d err=%v", len(jobs), err)
	}

	coordinator := NewArtworkDeliveryCoordinator(pool, nil)
	if err := coordinator.ArtworkPublished(ctx, jobs[0], oldPath, newPath); err != nil {
		t.Fatalf("record publication: %v", err)
	}
	if err := repo.MarkSucceeded(ctx, jobs[0].ID, workerID); err != nil {
		t.Fatalf("complete repair: %v", err)
	}

	var outstanding, missing, unresolved int64
	var publishedNextAttempt *time.Time
	if err := pool.QueryRow(ctx, `
		SELECT
			(SELECT count(*) FROM metadata_image_cache_jobs
			 WHERE target_content_id = $1 AND repair_requested AND status IN ('queued', 'running')),
			(SELECT count(*) FROM artwork_revision_gc_candidates
			 WHERE original_path = ANY($2) AND missing_at IS NOT NULL AND tombstoned_at IS NULL),
			(SELECT count(*) FROM artwork_storage_alerts
			 WHERE target_keys = $3 AND resolved_at IS NULL),
			(SELECT next_attempt_at FROM artwork_revision_gc_candidates WHERE original_path = $4)`,
		contentID, []string{oldPath, newPath}, targetKeys, newPath).Scan(&outstanding, &missing, &unresolved, &publishedNextAttempt); err != nil {
		t.Fatalf("read rebuild completion gate: %v", err)
	}
	if outstanding != 0 || missing != 0 || unresolved != 0 {
		t.Fatalf("completion gate did not drain: outstanding=%d missing=%d unresolved_alerts=%d", outstanding, missing, unresolved)
	}
	if publishedNextAttempt != nil {
		t.Fatalf("published revision remained armed for GC at %v", *publishedNextAttempt)
	}
}

func TestArtworkRebuildStatusIgnoresUnreferencedMissingRevisions(t *testing.T) {
	pool := localArtworkTestPool(t)
	ctx := context.Background()
	suffix := time.Now().UnixNano()
	contentID := fmt.Sprintf("artwork-rebuild-gate-%d", suffix)
	referencedPath := fmt.Sprintf("tmdb/movies/%s/poster/original.missing.webp", contentID)
	orphanPath := fmt.Sprintf("tmdb/movies/%s/poster/original.orphan.webp", contentID)
	healthyPath := fmt.Sprintf("tmdb/movies/%s/poster/original.healthy.webp", contentID)

	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM media_items WHERE content_id = $1`, contentID)
		_, _ = pool.Exec(ctx, `DELETE FROM artwork_revision_gc_candidates WHERE original_path = ANY($1)`, []string{referencedPath, orphanPath, healthyPath})
	})
	if _, err := pool.Exec(ctx, `
		INSERT INTO media_items (content_id, type, title, status, genres, poster_path, poster_source_path)
		VALUES ($1, 'movie', 'Artwork rebuild gate', 'matched', '{}'::text[], $2, 'tmdb://movie/rebuild-gate')`,
		contentID, referencedPath); err != nil {
		t.Fatalf("seed referenced owner: %v", err)
	}
	for _, path := range []string{referencedPath, orphanPath} {
		if _, err := pool.Exec(ctx, `
			INSERT INTO artwork_revision_gc_candidates (original_path, object_keys)
			VALUES ($1, ARRAY[$1])`, path); err != nil {
			t.Fatalf("seed inventory %q: %v", path, err)
		}
	}

	coordinator := NewArtworkDeliveryCoordinator(pool, nil)
	if err := coordinator.markBulkMissing(ctx, []string{referencedPath, orphanPath}); err != nil {
		t.Fatalf("bulk-mark missing: %v", err)
	}
	status, err := coordinator.RebuildStatus(ctx)
	if err != nil {
		t.Fatalf("load initial rebuild status: %v", err)
	}
	if status.MissingReferences != 1 {
		t.Fatalf("referenced missing revisions = %d, want 1", status.MissingReferences)
	}

	if _, err := pool.Exec(ctx, `UPDATE media_items SET poster_path = $2 WHERE content_id = $1`, contentID, healthyPath); err != nil {
		t.Fatalf("repoint owner: %v", err)
	}
	if err := coordinator.ArtworkPublished(ctx, &models.MetadataImageCacheJob{
		TargetType: ImageCacheTargetItem, TargetContentID: contentID, ImageType: ImageCacheImagePoster,
	}, referencedPath, healthyPath); err != nil {
		t.Fatalf("record replacement publication: %v", err)
	}
	status, err = coordinator.RebuildStatus(ctx)
	if err != nil {
		t.Fatalf("load completed rebuild status: %v", err)
	}
	if status.MissingReferences != 0 || status.ProtectedLosses != 0 {
		t.Fatalf("orphan held rebuild open: missing=%d protected=%d", status.MissingReferences, status.ProtectedLosses)
	}
	var orphanStillMissing bool
	if err := pool.QueryRow(ctx, `SELECT missing_at IS NOT NULL FROM artwork_revision_gc_candidates WHERE original_path = $1`, orphanPath).Scan(&orphanStillMissing); err != nil {
		t.Fatalf("read orphan inventory: %v", err)
	}
	if !orphanStillMissing {
		t.Fatal("completion gate mutated the orphaned missing row")
	}
}
