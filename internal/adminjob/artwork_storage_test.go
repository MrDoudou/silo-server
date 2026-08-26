package adminjob

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Silo-Server/silo-server/internal/metadata"
)

func TestDecodeArtworkPurgeRequestNormalizesMode(t *testing.T) {
	req, err := decodeArtworkPurgeRequest(json.RawMessage(`{"scope":{"server":true},"mode":"Edge_Only","dry_run":false}`))
	if err != nil {
		t.Fatalf("decodeArtworkPurgeRequest: %v", err)
	}
	if req.Mode != ArtworkPurgeModeEdgeOnly {
		t.Fatalf("mode = %q, want %q", req.Mode, ArtworkPurgeModeEdgeOnly)
	}
}

func TestArtworkStorageJobResumesLatestTimedOutCheckpoint(t *testing.T) {
	dsn := os.Getenv("SILO_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("SILO_TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("connect test database: %v", err)
	}
	t.Cleanup(pool.Close)

	repo := NewRepository(pool)
	suffix := time.Now().UnixNano()
	message := fmt.Sprintf("checkpoint resume test %d", suffix)
	first, err := repo.Create(ctx, CreateJobInput{
		JobType: JobTypeArtworkStorageRefresh, RequestPayload: map[string]any{}, Message: message,
	})
	if err != nil {
		t.Fatalf("create first artwork refresh: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM admin_jobs WHERE id = $1 OR message = $2`, first.ID, message)
	})
	claimed, err := repo.ClaimNextQueued(ctx, JobTypeArtworkStorageRefresh)
	if err != nil || claimed == nil || claimed.ID != first.ID {
		t.Fatalf("claim first artwork refresh = %#v, %v", claimed, err)
	}
	want := metadata.ArtworkInventoryCheckpoint{Version: 1, Cursor: "revision-500", KnownRevisions: 500}
	if err := repo.UpdateCheckpoint(ctx, first.ID, want); err != nil {
		t.Fatalf("save checkpoint: %v", err)
	}
	if err := repo.Fail(ctx, first.ID, FailJobInput{
		Message: "Artwork storage refresh failed", ErrorMessage: "timed out after 6h0m0s: context deadline exceeded",
	}); err != nil {
		t.Fatalf("fail timed-out artwork refresh: %v", err)
	}

	successor, err := repo.Create(ctx, CreateJobInput{
		JobType: JobTypeArtworkStorageRefresh, RequestPayload: map[string]any{}, Message: message, ResumeCheckpoint: true,
	})
	if err != nil {
		t.Fatalf("create successor artwork refresh: %v", err)
	}
	resumed, err := decodeArtworkInventoryCheckpoint(successor.Checkpoint)
	if err != nil {
		t.Fatalf("decode successor checkpoint: %v", err)
	}
	if resumed == nil || resumed.Cursor != want.Cursor || resumed.KnownRevisions != want.KnownRevisions {
		t.Fatalf("successor checkpoint = %#v, want %#v", resumed, want)
	}
	claimed, err = repo.ClaimNextQueued(ctx, JobTypeArtworkStorageRefresh)
	if err != nil || claimed == nil || claimed.ID != successor.ID {
		t.Fatalf("claim resumed artwork refresh = %#v, %v", claimed, err)
	}
	if _, err := repo.Cancel(ctx, successor.ID, "cancel resumed refresh", time.Now().UTC().Add(time.Hour)); err != nil {
		t.Fatalf("cancel resumed artwork refresh: %v", err)
	}

	withoutResume, err := repo.Create(ctx, CreateJobInput{
		JobType: JobTypeArtworkStorageRefresh, RequestPayload: map[string]any{}, Message: message,
	})
	if err != nil {
		t.Fatalf("create non-resuming artwork refresh: %v", err)
	}
	notResumed, err := decodeArtworkInventoryCheckpoint(withoutResume.Checkpoint)
	if err != nil {
		t.Fatalf("decode non-resuming checkpoint: %v", err)
	}
	if notResumed != nil {
		t.Fatalf("non-resuming checkpoint = %#v, want nil", notResumed)
	}
	claimed, err = repo.ClaimNextQueued(ctx, JobTypeArtworkStorageRefresh)
	if err != nil || claimed == nil || claimed.ID != withoutResume.ID {
		t.Fatalf("claim non-resuming artwork refresh = %#v, %v", claimed, err)
	}
	canceledWant := metadata.ArtworkInventoryCheckpoint{Version: 1, Cursor: "revision-750", KnownRevisions: 750}
	if err := repo.UpdateCheckpoint(ctx, withoutResume.ID, canceledWant); err != nil {
		t.Fatalf("save canceled predecessor checkpoint: %v", err)
	}
	if _, err := repo.Cancel(ctx, withoutResume.ID, "cancel checkpointed refresh", time.Now().UTC().Add(time.Hour)); err != nil {
		t.Fatalf("cancel checkpointed predecessor: %v", err)
	}

	afterCancellation, err := repo.Create(ctx, CreateJobInput{
		JobType: JobTypeArtworkStorageRefresh, RequestPayload: map[string]any{}, Message: message, ResumeCheckpoint: true,
	})
	if err != nil {
		t.Fatalf("create refresh after cancellation: %v", err)
	}
	canceledResume, err := decodeArtworkInventoryCheckpoint(afterCancellation.Checkpoint)
	if err != nil {
		t.Fatalf("decode canceled predecessor checkpoint: %v", err)
	}
	if canceledResume == nil || canceledResume.Cursor != canceledWant.Cursor || canceledResume.KnownRevisions != canceledWant.KnownRevisions {
		t.Fatalf("canceled predecessor checkpoint = %#v, want %#v", canceledResume, canceledWant)
	}

	failed, err := repo.GetByID(ctx, first.ID)
	if err != nil || failed.Status != StatusFailed {
		t.Fatalf("timed-out predecessor = %#v, %v; want failed", failed, err)
	}
}
