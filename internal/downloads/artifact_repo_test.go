package downloads

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Silo-Server/silo-server/internal/downloadprepare"
	"github.com/Silo-Server/silo-server/internal/idgen"
	"github.com/Silo-Server/silo-server/internal/models"
)

func newArtifactTestRepo(t *testing.T) (*ArtifactRepository, *pgxpool.Pool, int) {
	t.Helper()
	pool := newDownloadsTestPool(t)
	ctx := context.Background()
	var present *string
	if err := pool.QueryRow(ctx, `SELECT to_regclass('public.download_artifacts')::text`).Scan(&present); err != nil {
		t.Fatalf("check download_artifacts: %v", err)
	}
	if present == nil {
		t.Skip("download_artifacts migration has not been applied")
	}
	if err := pool.QueryRow(ctx, `SELECT to_regclass('public.download_artifact_orphans')::text`).Scan(&present); err != nil {
		t.Fatalf("check download_artifact_orphans: %v", err)
	}
	if present == nil {
		t.Skip("download_artifact_orphans migration has not been applied")
	}

	suffix := time.Now().UnixNano()
	var folderID int
	if err := pool.QueryRow(ctx,
		`INSERT INTO media_folders (type, name) VALUES ('movies', $1) RETURNING id`,
		fmt.Sprintf("Artifacts Test %d", suffix),
	).Scan(&folderID); err != nil {
		t.Fatalf("seed folder: %v", err)
	}
	var fileID int
	if err := pool.QueryRow(ctx,
		`INSERT INTO media_files (media_folder_id, file_path) VALUES ($1, $2) RETURNING id`,
		folderID, fmt.Sprintf("/tmp/artifact-%d.mkv", suffix),
	).Scan(&fileID); err != nil {
		t.Fatalf("seed media file: %v", err)
	}
	t.Cleanup(func() {
		// downloads_artifact_id_fkey is ON DELETE RESTRICT: unpin any surviving
		// links before removing the artifact rows they reference.
		_, _ = pool.Exec(ctx, `UPDATE downloads SET artifact_id = NULL WHERE media_file_id = $1`, fileID)
		_, _ = pool.Exec(ctx, `DELETE FROM download_artifacts WHERE media_file_id = $1`, fileID)
		_, _ = pool.Exec(ctx, `DELETE FROM media_files WHERE id = $1`, fileID)
		_, _ = pool.Exec(ctx, `DELETE FROM media_folders WHERE id = $1`, folderID)
	})
	return NewArtifactRepository(pool), pool, fileID
}

func newArtifact(t *testing.T, fileID int, hash string) *Artifact {
	t.Helper()
	id, err := idgen.NextID()
	if err != nil {
		t.Fatalf("id: %v", err)
	}
	return &Artifact{
		ID: id, MediaFileID: fileID, Format: "transcode", ParamsHash: hash,
		Container: "mp4", CodecVideo: "h264", CodecAudio: "aac", Resolution: "1080p",
		AudioTrackIndex: -1, OutputPath: "/tmp/" + id + ".mp4", MaxAttempts: 3,
	}
}

func remoteOrphansForArtifact(orphans []RemoteArtifactOrphan, artifactID string) []RemoteArtifactOrphan {
	filtered := make([]RemoteArtifactOrphan, 0, 1)
	for _, orphan := range orphans {
		if orphan.DownloadArtifactID == artifactID {
			filtered = append(filtered, orphan)
		}
	}
	return filtered
}

// TestArtifactQueueClaimAndLeaseRecovery is the Phase 3 / invariant-3 acceptance
// test: a crash mid-encode (an expired lease) is recovered on the next sweep so
// the job re-enqueues and reaches ready, and concurrent workers never claim the
// same job twice (no double-encode).
func TestArtifactQueueClaimAndLeaseRecovery(t *testing.T) {
	repo, pool, fileID := newArtifactTestRepo(t)
	ctx := context.Background()

	a := newArtifact(t, fileID, "hash-recovery")
	row, created, err := repo.EnsureQueued(ctx, a)
	if err != nil || !created || row.Status != ArtifactQueued {
		t.Fatalf("EnsureQueued = (%+v, created=%v, %v), want new queued row", row, created, err)
	}

	// Dedup: a second ensure for the same key returns the same row, not a new one.
	dup, created2, err := repo.EnsureQueued(ctx, newArtifact(t, fileID, "hash-recovery"))
	if err != nil || created2 || dup.ID != row.ID {
		t.Fatalf("dedup EnsureQueued = (%s, created=%v, %v), want existing %s", dup.ID, created2, err, row.ID)
	}

	// Worker 1 claims the job; worker 2 finds nothing (no double-encode).
	claim, err := repo.ClaimNext(ctx, "worker-1", time.Minute)
	if err != nil || claim.ID != row.ID || claim.Status != ArtifactRunning || claim.Attempts != 1 {
		t.Fatalf("ClaimNext = (%+v, %v), want running attempts=1", claim, err)
	}
	if _, err := repo.ClaimNext(ctx, "worker-2", time.Minute); !errors.Is(err, ErrNoArtifactJob) {
		t.Fatalf("second ClaimNext err = %v, want ErrNoArtifactJob", err)
	}

	// Simulate a crash: expire the lease, then run the startup sweep.
	if _, err := pool.Exec(ctx, `UPDATE download_artifacts SET lease_expires_at = now() - interval '1 minute' WHERE id = $1`, row.ID); err != nil {
		t.Fatalf("expire lease: %v", err)
	}
	reclaimed, err := repo.ReclaimExpiredLeases(ctx)
	if err != nil {
		t.Fatalf("reclaim: %v", err)
	}
	if len(reclaimed) != 1 || reclaimed[0].ID != row.ID || reclaimed[0].Terminal {
		t.Fatalf("reclaimed = %+v, want one non-terminal %s", reclaimed, row.ID)
	}
	back, err := repo.GetByID(ctx, row.ID)
	if err != nil || back.Status != ArtifactQueued {
		t.Fatalf("after reclaim status = %v (%v), want queued (no permanent running)", back.Status, err)
	}

	// Another worker reclaims and completes it.
	claim2, err := repo.ClaimNext(ctx, "worker-2", time.Minute)
	if err != nil || claim2.ID != row.ID || claim2.Attempts != 2 {
		t.Fatalf("reclaim ClaimNext = (%+v, %v), want attempts=2", claim2, err)
	}
	if applied, err := repo.MarkReady(ctx, row.ID, "worker-2", claim2.OutputPath, 0, "", "", "", 4242); err != nil || !applied {
		t.Fatalf("MarkReady = (%v, %v), want (true, nil)", applied, err)
	}
	done, err := repo.GetByKey(ctx, fileID, "transcode", "hash-recovery")
	if err != nil || done.Status != ArtifactReady || done.FileSize != 4242 {
		t.Fatalf("final = (%+v, %v), want ready size=4242", done, err)
	}
}

// TestArtifactRetryUntilTerminal verifies attempt counting and backoff: a job
// retries behind its backoff gate until max_attempts, then goes terminal-failed.
func TestArtifactRetryUntilTerminal(t *testing.T) {
	repo, pool, fileID := newArtifactTestRepo(t)
	ctx := context.Background()

	row, _, err := repo.EnsureQueued(ctx, newArtifact(t, fileID, "hash-retry"))
	if err != nil {
		t.Fatalf("EnsureQueued: %v", err)
	}

	for attempt := 1; attempt <= 3; attempt++ {
		claim, err := repo.ClaimNext(ctx, "worker", time.Minute)
		if err != nil {
			t.Fatalf("attempt %d ClaimNext: %v", attempt, err)
		}
		if claim.Attempts != attempt {
			t.Fatalf("attempt %d: attempts = %d", attempt, claim.Attempts)
		}
		terminal, applied, err := repo.MarkFailedOrRetry(ctx, row.ID, "worker", "boom", 30*time.Second)
		if err != nil || !applied {
			t.Fatalf("attempt %d MarkFailedOrRetry = (%v, %v, %v)", attempt, terminal, applied, err)
		}
		if attempt < 3 {
			if terminal {
				t.Fatalf("attempt %d went terminal too early", attempt)
			}
			// Behind the backoff gate the job is not yet claimable.
			if _, err := repo.ClaimNext(ctx, "worker", time.Minute); !errors.Is(err, ErrNoArtifactJob) {
				t.Fatalf("attempt %d: job claimable during backoff", attempt)
			}
			if _, err := pool.Exec(ctx, `UPDATE download_artifacts SET next_retry_at = now() - interval '1 second' WHERE id = $1`, row.ID); err != nil {
				t.Fatalf("clear backoff: %v", err)
			}
		} else if !terminal {
			t.Fatalf("final attempt should be terminal")
		}
	}

	failed, err := repo.GetByID(ctx, row.ID)
	if err != nil || failed.Status != ArtifactFailed {
		t.Fatalf("final status = %v (%v), want failed", failed.Status, err)
	}
}

// TestArtifactMarkFencedByOwner verifies MarkReady/MarkFailedOrRetry only apply
// for the worker that currently holds the lease, so a worker whose lease was
// stolen (e.g. a slow encode reclaimed by another node) cannot flip a job it no
// longer owns — the double-encode guard behind invariant 3.
func TestArtifactMarkFencedByOwner(t *testing.T) {
	repo, _, fileID := newArtifactTestRepo(t)
	ctx := context.Background()

	row, _, err := repo.EnsureQueued(ctx, newArtifact(t, fileID, "hash-fence"))
	if err != nil {
		t.Fatalf("EnsureQueued: %v", err)
	}
	if _, err := repo.ClaimNext(ctx, "owner-1", time.Minute); err != nil {
		t.Fatalf("ClaimNext: %v", err)
	}

	// A non-owner cannot mark the job ready or failed.
	if applied, err := repo.MarkReady(ctx, row.ID, "owner-2", "/tmp/x.mp4", 0, "", "", "", 10); err != nil || applied {
		t.Fatalf("MarkReady(non-owner) = (%v, %v), want (false, nil)", applied, err)
	}
	if _, applied, err := repo.MarkFailedOrRetry(ctx, row.ID, "owner-2", "boom", time.Second); err != nil || applied {
		t.Fatalf("MarkFailedOrRetry(non-owner) applied = %v (%v), want false", applied, err)
	}

	// The job remains claimable-state 'running' and untouched.
	mid, err := repo.GetByID(ctx, row.ID)
	if err != nil || mid.Status != ArtifactRunning {
		t.Fatalf("status after fenced writes = %v (%v), want running", mid.Status, err)
	}

	// The real owner succeeds.
	if applied, err := repo.MarkReady(ctx, row.ID, "owner-1", "/tmp/x.mp4", 0, "", "", "", 10); err != nil || !applied {
		t.Fatalf("MarkReady(owner) = (%v, %v), want (true, nil)", applied, err)
	}
}

func TestArtifactRemoteLocatorRoundTripsAndRequeueClearsIt(t *testing.T) {
	repo, _, fileID := newArtifactTestRepo(t)
	ctx := context.Background()
	row, _, err := repo.EnsureQueued(ctx, newArtifact(t, fileID, "hash-remote-locator"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repo.ClaimNext(ctx, "worker", time.Minute); err != nil {
		t.Fatal(err)
	}
	if applied, err := repo.MarkReady(ctx, row.ID, "worker", "", 17, "http://transcode", "host-a", "artifact-opaque", 4242); err != nil || !applied {
		t.Fatalf("MarkReady = (%v, %v)", applied, err)
	}
	ready, err := repo.GetByID(ctx, row.ID)
	if err != nil {
		t.Fatal(err)
	}
	if ready.OutputPath != "" || ready.OriginNodeID != 17 || ready.OriginNodeURL != "http://transcode" || ready.OriginNodeGroup != "host-a" || ready.OriginArtifactID != "artifact-opaque" || ready.FileSize != 4242 {
		t.Fatalf("ready artifact = %+v", ready)
	}
	ready.OriginNodeURL = "http://transcode-new"
	ready.OriginNodeGroup = "host-new"
	if applied, err := repo.RefreshRemoteLocator(ctx, ready); err != nil || !applied {
		t.Fatalf("RefreshRemoteLocator = (%v, %v)", applied, err)
	}
	refreshed, err := repo.GetByID(ctx, row.ID)
	if err != nil {
		t.Fatal(err)
	}
	if refreshed.OriginNodeURL != "http://transcode-new" || refreshed.OriginNodeGroup != "host-new" {
		t.Fatalf("refreshed artifact = %+v", refreshed)
	}
	if err := repo.Requeue(ctx, row.ID); err != nil {
		t.Fatal(err)
	}
	queued, err := repo.GetByID(ctx, row.ID)
	if err != nil {
		t.Fatal(err)
	}
	if queued.OriginNodeID != 0 || queued.OriginNodeURL != "" || queued.OriginNodeGroup != "" || queued.OriginArtifactID != "" {
		t.Fatalf("requeued artifact retained remote locator: %+v", queued)
	}
}

func TestArtifactReadyPersistsRefreshedOriginLocator(t *testing.T) {
	repo, _, fileID := newArtifactTestRepo(t)
	ctx := context.Background()
	row, _, err := repo.EnsureQueued(ctx, newArtifact(t, fileID, "hash-refresh-origin-locator"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repo.ClaimNext(ctx, "worker", time.Minute); err != nil {
		t.Fatal(err)
	}
	if applied, err := repo.MarkReady(ctx, row.ID, "worker", "", 17, "http://old-url", "old-group", "artifact-refresh", 4242); err != nil || !applied {
		t.Fatalf("MarkReady = (%v, %v)", applied, err)
	}
	manager := &ArtifactManager{
		repo: repo,
		preparer: &lifecycleTestPreparer{
			resolvedURL: "http://new-url", resolvedGroup: "new-group",
		},
	}
	resolved, err := manager.Ready(ctx, row.ID)
	if err != nil {
		t.Fatal(err)
	}
	if resolved.OriginNodeURL != "http://new-url" || resolved.OriginNodeGroup != "new-group" {
		t.Fatalf("resolved artifact = %+v", resolved)
	}
	persisted, err := repo.GetByID(ctx, row.ID)
	if err != nil {
		t.Fatal(err)
	}
	if persisted.OriginNodeURL != "http://new-url" || persisted.OriginNodeGroup != "new-group" {
		t.Fatalf("persisted artifact = %+v", persisted)
	}
}

func TestArtifactReadyMapsRemovedOriginToInactiveWhenRequeueLosesFence(t *testing.T) {
	repo, _, fileID := newArtifactTestRepo(t)
	ctx := context.Background()
	row, _, err := repo.EnsureQueued(ctx, newArtifact(t, fileID, "hash-removed-origin-stale-fence"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repo.ClaimNext(ctx, "worker", time.Minute); err != nil {
		t.Fatal(err)
	}
	if applied, err := repo.MarkReady(ctx, row.ID, "worker", "", 17, "http://removed", "host-a", "artifact-removed", 4242); err != nil || !applied {
		t.Fatalf("MarkReady = (%v, %v)", applied, err)
	}
	manager := &ArtifactManager{
		repo: repo,
		preparer: &lifecycleTestPreparer{
			resolvedNode: 18,
			resolveErr:   ErrArtifactOriginRemoved,
		},
	}
	_, err = manager.Ready(ctx, row.ID)
	if !errors.Is(err, ErrDownloadNotActive) || !errors.Is(err, ErrArtifactOriginRemoved) {
		t.Fatalf("Ready error = %v, want inactive removed-origin error", err)
	}
}

func TestArtifactRecoveryContinuesAfterStaleLocatorRefresh(t *testing.T) {
	repo, pool, fileID := newArtifactTestRepo(t)
	ctx := context.Background()
	ready := make([]*Artifact, 0, 2)
	for i := range 2 {
		row, _, err := repo.EnsureQueued(ctx, newArtifact(t, fileID, fmt.Sprintf("hash-stale-locator-batch-%d", i)))
		if err != nil {
			t.Fatal(err)
		}
		if _, err := repo.ClaimNext(ctx, "worker", time.Minute); err != nil {
			t.Fatal(err)
		}
		if applied, err := repo.MarkReady(ctx, row.ID, "worker", "", 17, "http://old-url", "host-a", fmt.Sprintf("artifact-%d", i), 4242); err != nil || !applied {
			t.Fatalf("MarkReady(%d) = (%v, %v)", i, applied, err)
		}
		artifact, err := repo.GetByID(ctx, row.ID)
		if err != nil {
			t.Fatal(err)
		}
		ready = append(ready, artifact)
	}

	// Simulate another worker replacing the first locator after this recovery
	// pass read it. Its refresh must lose the fence without suppressing checks
	// for the remaining artifacts on the still-healthy origin.
	if _, err := pool.Exec(ctx,
		`UPDATE download_artifacts SET origin_artifact_id = 'artifact-replaced' WHERE id = $1`,
		ready[0].ID,
	); err != nil {
		t.Fatal(err)
	}
	preparer := &lifecycleTestPreparer{
		resolvedURL: "http://new-url", resolvedGroup: "host-new",
		stat: downloadprepare.Result{FileSize: 4242},
	}
	manager := &ArtifactManager{repo: repo, preparer: preparer}
	manager.probeRemoteArtifactGroup(ctx, preparer, ready)

	if len(preparer.statIDs) != 1 || preparer.statIDs[0] != ready[1].ID {
		t.Fatalf("probed artifacts = %v, want only continuing artifact %s", preparer.statIDs, ready[1].ID)
	}
	persisted, err := repo.GetByID(ctx, ready[1].ID)
	if err != nil {
		t.Fatal(err)
	}
	if persisted.OriginNodeURL != "http://new-url" || persisted.OriginNodeGroup != "host-new" {
		t.Fatalf("continued artifact locator = %+v", persisted)
	}
}

func TestArtifactInvalidRemoteResultQueuesCleanup(t *testing.T) {
	repo, pool, fileID := newArtifactTestRepo(t)
	ctx := context.Background()
	row, _, err := repo.EnsureQueued(ctx, newArtifact(t, fileID, "hash-invalid-remote-result"))
	if err != nil {
		t.Fatal(err)
	}
	claimed, err := repo.ClaimNext(ctx, "worker", time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	preparer := &lifecycleTestPreparer{prepared: PreparedArtifact{
		OriginNodeID: 17, OriginNodeURL: "http://transcode", OriginNodeGroup: "host-a",
		OriginArtifactID: "artifact-zero-byte", FileSize: 0,
	}}
	manager := &ArtifactManager{
		repo: repo, owner: "worker", fileRepo: fakeFileResolver{file: &models.MediaFile{ID: fileID, FilePath: "/media/movie.mkv"}},
		preparer: preparer,
	}
	manager.encodeOne(ctx, claimed)

	queued, err := repo.GetByID(ctx, row.ID)
	if err != nil {
		t.Fatal(err)
	}
	if queued.Status != ArtifactQueued {
		t.Fatalf("artifact status = %q, want queued retry", queued.Status)
	}
	var orphanID int64
	if err := pool.QueryRow(ctx,
		`SELECT id FROM download_artifact_orphans
		 WHERE download_artifact_id = $1 AND origin_node_id = 17 AND origin_artifact_id = 'artifact-zero-byte'`,
		row.ID,
	).Scan(&orphanID); err != nil {
		t.Fatalf("remote cleanup row: %v", err)
	}
	t.Cleanup(func() { _ = repo.DeleteRemoteOrphan(ctx, orphanID) })
}

func TestArtifactRecoveryDeletesWrongSizedRemoteBeforeRequeue(t *testing.T) {
	repo, pool, fileID := newArtifactTestRepo(t)
	ctx := context.Background()
	row, _, err := repo.EnsureQueued(ctx, newArtifact(t, fileID, "hash-remote-size-mismatch"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repo.ClaimNext(ctx, "worker", time.Minute); err != nil {
		t.Fatal(err)
	}
	if applied, err := repo.MarkReady(ctx, row.ID, "worker", row.OutputPath, 17, "http://transcode", "host-a", "artifact-truncated", 4242); err != nil || !applied {
		t.Fatalf("MarkReady = (%v, %v)", applied, err)
	}

	preparer := &lifecycleTestPreparer{stat: downloadprepare.Result{ArtifactID: "artifact-truncated", FileSize: 42}}
	manager := &ArtifactManager{
		repo:      repo,
		downloads: NewRepository(pool),
		preparer:  preparer,
	}
	manager.recover(ctx)

	got, err := repo.GetByID(ctx, row.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != ArtifactQueued || got.OriginArtifactID != "" {
		t.Fatalf("recovered artifact = %+v, want queued without remote locator", got)
	}
	orphans, err := repo.ListRemoteOrphansDue(ctx, 10)
	if err != nil {
		t.Fatal(err)
	}
	orphans = remoteOrphansForArtifact(orphans, row.ID)
	if len(orphans) != 1 || orphans[0].OriginNodeID != 17 || orphans[0].OriginArtifactID != "artifact-truncated" {
		t.Fatalf("remote cleanup queue = %+v", orphans)
	}
	if preparer.deleted != "artifact-truncated" {
		t.Fatalf("deleted remote artifact = %q, want artifact-truncated", preparer.deleted)
	}
	t.Cleanup(func() { _ = repo.DeleteRemoteOrphan(ctx, orphans[0].ID) })
}

func TestRemoteRecoveryBudgetBoundsUnreachableOrigins(t *testing.T) {
	repo, pool, fileID := newArtifactTestRepo(t)
	ctx := context.Background()
	for i := range 5 {
		row, _, err := repo.EnsureQueued(ctx, newArtifact(t, fileID, fmt.Sprintf("hash-recovery-budget-%d-%d", time.Now().UnixNano(), i)))
		if err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx,
			`UPDATE download_artifacts
			 SET status = 'ready', file_size = 42, completed_at = now(),
			     origin_node_id = $2, origin_node_url = $3, origin_artifact_id = $4
			 WHERE id = $1`,
			row.ID, 32000+i, fmt.Sprintf("http://unreachable-recovery-%d", i), fmt.Sprintf("artifact-blocked-%d", i),
		); err != nil {
			t.Fatal(err)
		}
	}
	preparer := &lifecycleTestPreparer{statWait: true}
	manager := &ArtifactManager{repo: repo, preparer: preparer, remoteRecoveryBudget: 50 * time.Millisecond}
	begin := time.Now()
	manager.recoverReadyArtifacts(ctx)
	if elapsed := time.Since(begin); elapsed > time.Second {
		t.Fatalf("recovery elapsed = %s, want bounded return", elapsed)
	}
	if started := preparer.statStarted.Load(); started == 0 || started > 4 {
		t.Fatalf("started probes = %d, want one bounded wave of at most four", started)
	}
}

func TestArtifactRemoteRequeueAtomicallyQueuesCleanup(t *testing.T) {
	repo, pool, fileID := newArtifactTestRepo(t)
	ctx := context.Background()
	row, _, err := repo.EnsureQueued(ctx, newArtifact(t, fileID, fmt.Sprintf("hash-remote-atomic-requeue-%d", time.Now().UnixNano())))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repo.ClaimNext(ctx, "worker", time.Minute); err != nil {
		t.Fatal(err)
	}
	if applied, err := repo.MarkReady(ctx, row.ID, "worker", row.OutputPath, 23, "http://transcode-old", "host-a", "artifact-abandoned", 4242); err != nil || !applied {
		t.Fatalf("MarkReady = (%v, %v)", applied, err)
	}
	ready, err := repo.GetByID(ctx, row.ID)
	if err != nil {
		t.Fatal(err)
	}
	var userID int
	if err := pool.QueryRow(ctx,
		`INSERT INTO users (username, role, download_allowed) VALUES ($1, 'user', true) RETURNING id`,
		fmt.Sprintf("requeue-user-%d", time.Now().UnixNano()),
	).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	downloadID := fmt.Sprintf("requeue-download-%d", time.Now().UnixNano())
	if err := NewRepository(pool).Create(ctx, &Download{
		ID: downloadID, UserID: userID, MediaFileID: fileID,
		ContentID: "requeue-content", Kind: KindQueued, Status: StatusCompleted,
		Format: FormatTranscode, ArtifactID: row.ID, FileSize: ready.FileSize,
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM downloads WHERE id = $1`, downloadID)
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	})
	// An indeterminate MarkReady result may enqueue the locator even though its
	// database write committed. Cleanup must recognize the winning locator and
	// remove only the stale queue row, never the node-local bytes.
	if err := repo.EnqueueRemoteOrphan(ctx, row.ID, ready.OriginNodeID, ready.OriginNodeURL, ready.OriginArtifactID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE download_artifact_orphans SET next_retry_at = NULL WHERE origin_node_id = $1 AND origin_artifact_id = $2`, ready.OriginNodeID, ready.OriginArtifactID); err != nil {
		t.Fatal(err)
	}
	orphans, err := repo.ListRemoteOrphansDue(ctx, 10)
	orphans = remoteOrphansForArtifact(orphans, row.ID)
	if err != nil || len(orphans) != 1 {
		t.Fatalf("uncertain cleanup queue = %+v (%v)", orphans, err)
	}
	owned, claimed, err := repo.PrepareRemoteOrphanCleanup(ctx, orphans[0])
	if err != nil || !claimed || !owned {
		t.Fatalf("PrepareRemoteOrphanCleanup = (owned=%v claimed=%v err=%v)", owned, claimed, err)
	}
	if left, err := repo.ListRemoteOrphansDue(ctx, 10); err != nil || len(remoteOrphansForArtifact(left, row.ID)) != 0 {
		t.Fatalf("owned cleanup rows left = %+v (%v)", left, err)
	}
	// The in-memory URL may already have followed an administrative edit; the
	// transaction deliberately matches stable node/id fields and stores the
	// refreshed URL as the cleanup target.
	ready.OriginNodeURL = "http://transcode-new"
	linked, applied, err := repo.RequeueRemote(ctx, ready)
	if err != nil || !applied {
		t.Fatalf("RequeueRemote = (%v, %v)", applied, err)
	}
	if len(linked) != 1 || linked[0].ID != downloadID || linked[0].Status != StatusPreparing {
		t.Fatalf("reset linked downloads = %+v", linked)
	}
	queued, err := repo.GetByID(ctx, row.ID)
	if err != nil {
		t.Fatal(err)
	}
	if queued.Status != ArtifactQueued || queued.OriginArtifactID != "" {
		t.Fatalf("queued artifact = %+v", queued)
	}
	orphans, err = repo.ListRemoteOrphansDue(ctx, 10)
	if err != nil {
		t.Fatal(err)
	}
	orphans = remoteOrphansForArtifact(orphans, row.ID)
	if len(orphans) != 1 || orphans[0].DownloadArtifactID != row.ID || orphans[0].OriginNodeURL != "http://transcode-new" || orphans[0].OriginArtifactID != "artifact-abandoned" {
		t.Fatalf("remote cleanup queue = %+v", orphans)
	}
	t.Cleanup(func() { _ = repo.DeleteRemoteOrphan(ctx, orphans[0].ID) })
	// A stale caller cannot enqueue a second cleanup after the row changed.
	if _, applied, err := repo.RequeueRemote(ctx, ready); err != nil || applied {
		t.Fatalf("stale RequeueRemote = (%v, %v), want false, nil", applied, err)
	}
}

func TestProxyMissingReportFencesCompleteRemoteLocator(t *testing.T) {
	repo, _, fileID := newArtifactTestRepo(t)
	ctx := context.Background()
	row, _, err := repo.EnsureQueued(ctx, newArtifact(t, fileID, fmt.Sprintf("hash-proxy-missing-report-%d", time.Now().UnixNano())))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repo.ClaimNext(ctx, "worker", time.Minute); err != nil {
		t.Fatal(err)
	}
	if applied, err := repo.MarkReady(ctx, row.ID, "worker", "", 23, "http://transcode-current", "host-a", "artifact-missing", 4242); err != nil || !applied {
		t.Fatalf("MarkReady = (%v, %v)", applied, err)
	}
	manager := NewArtifactManager(repo, nil, nil, nil, "proxy-test", nil, nil)
	stillReady, err := repo.GetByID(ctx, row.ID)
	if err != nil {
		t.Fatal(err)
	}
	stale := *stillReady
	stale.OriginNodeURL = "http://transcode-stale"
	if applied, err := manager.requeueRemoteArtifactExactNow(ctx, &stale, "stale API miss"); err != nil || applied {
		t.Fatalf("stale exact requeue = (%v, %v), want false, nil", applied, err)
	}
	if err := manager.ReportRemoteArtifactMissing(ctx, row.ID, "http://transcode-stale", "artifact-missing"); err != nil {
		t.Fatal(err)
	}
	stillReady, err = repo.GetByID(ctx, row.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stillReady.Status != ArtifactReady {
		t.Fatalf("stale report changed artifact = %+v", stillReady)
	}
	if err := manager.ReportRemoteArtifactMissing(ctx, row.ID, "http://transcode-current", "artifact-missing"); err != nil {
		t.Fatal(err)
	}
	queued, err := repo.GetByID(ctx, row.ID)
	if err != nil {
		t.Fatal(err)
	}
	if queued.Status != ArtifactQueued || queued.OriginArtifactID != "" {
		t.Fatalf("artifact after authoritative missing report = %+v", queued)
	}
	orphans, err := repo.ListRemoteOrphansDue(ctx, 10)
	if err != nil {
		t.Fatal(err)
	}
	orphans = remoteOrphansForArtifact(orphans, row.ID)
	if len(orphans) != 1 || orphans[0].DownloadArtifactID != row.ID || orphans[0].OriginArtifactID != "artifact-missing" {
		t.Fatalf("remote cleanup queue = %+v", orphans)
	}
	t.Cleanup(func() { _ = repo.DeleteRemoteOrphan(ctx, orphans[0].ID) })
}

func TestRemoteCleanupBudgetBoundsUnreachableOrigins(t *testing.T) {
	repo, _, fileID := newArtifactTestRepo(t)
	ctx := context.Background()
	row, _, err := repo.EnsureQueued(ctx, newArtifact(t, fileID, fmt.Sprintf("hash-cleanup-budget-%d", time.Now().UnixNano())))
	if err != nil {
		t.Fatal(err)
	}
	suffix := time.Now().UnixNano()
	originArtifactID := fmt.Sprintf("artifact-blocked-%d", suffix)
	originURL := fmt.Sprintf("http://unreachable-%d", suffix)
	if err := repo.EnqueueRemoteOrphan(ctx, row.ID, 31, originURL, originArtifactID); err != nil {
		t.Fatal(err)
	}
	started := make(chan struct{})
	preparer := &lifecycleTestPreparer{deleteStarted: started, deleteWait: true}
	manager := &ArtifactManager{repo: repo, preparer: preparer, remoteCleanupBudget: 50 * time.Millisecond}
	begin := time.Now()
	manager.cleanupRemoteOrphans(ctx)
	if elapsed := time.Since(begin); elapsed > time.Second {
		t.Fatalf("cleanup elapsed = %s, want bounded return", elapsed)
	}
	select {
	case <-started:
	default:
		t.Fatal("remote deletion was not attempted")
	}
	orphans, err := repo.ListRemoteOrphansDue(ctx, 100)
	if err != nil {
		t.Fatal(err)
	}
	for _, orphan := range orphans {
		if orphan.DownloadArtifactID == row.ID {
			t.Fatalf("timed-out orphan remained immediately due: %+v", orphan)
		}
	}
}

func TestListRemoteOrphansDueIsFairAcrossOrigins(t *testing.T) {
	repo, pool, fileID := newArtifactTestRepo(t)
	ctx := context.Background()
	row, _, err := repo.EnsureQueued(ctx, newArtifact(t, fileID, fmt.Sprintf("hash-orphan-fairness-%d", time.Now().UnixNano())))
	if err != nil {
		t.Fatal(err)
	}
	suffix := time.Now().UnixNano()
	artifactIDs := []string{
		fmt.Sprintf("fair-origin-a-first-%d", suffix),
		fmt.Sprintf("fair-origin-a-second-%d", suffix),
		fmt.Sprintf("fair-origin-b-%d", suffix),
	}
	for i, artifactID := range artifactIDs {
		nodeID := 31001
		nodeURL := "http://origin-a"
		if i == 2 {
			nodeID = 31002
			nodeURL = "http://origin-b"
		}
		if err := repo.EnqueueRemoteOrphan(ctx, row.ID, nodeID, nodeURL, artifactID); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM download_artifact_orphans WHERE origin_artifact_id = ANY($1)`, artifactIDs)
	})
	if _, err := pool.Exec(ctx,
		`UPDATE download_artifact_orphans
		 SET next_retry_at = NULL, created_at = '-infinity'
		 WHERE origin_artifact_id = ANY($1)`,
		artifactIDs,
	); err != nil {
		t.Fatal(err)
	}

	due, err := repo.ListRemoteOrphansDue(ctx, 2)
	if err != nil {
		t.Fatal(err)
	}
	seen := make(map[int]int)
	for _, orphan := range due {
		if orphan.OriginNodeID == 31001 || orphan.OriginNodeID == 31002 {
			seen[orphan.OriginNodeID]++
		}
	}
	if seen[31001] != 1 || seen[31002] != 1 {
		t.Fatalf("due candidates by origin = %+v, want one candidate for each origin", seen)
	}
}

// TestEvictionFenceCoversEphemeralRows pins the eviction guard: an ephemeral
// (device-less web) download row must protect its artifact from LRU cleanup
// exactly like a managed row does, and terminal rows must not.
func TestEvictionFenceCoversEphemeralRows(t *testing.T) {
	repo, pool, fileID := newArtifactTestRepo(t)
	ctx := context.Background()

	art := newArtifact(t, fileID, fmt.Sprintf("hash-link-%d", time.Now().UnixNano()))
	if _, _, err := repo.EnsureQueued(ctx, art); err != nil {
		t.Fatalf("ensure artifact: %v", err)
	}
	markArtifactReady(t, pool, art.ID)

	var userID int
	if err := pool.QueryRow(ctx,
		`INSERT INTO users (username, role, download_allowed) VALUES ($1, 'user', true) RETURNING id`,
		fmt.Sprintf("linkuser-%d", time.Now().UnixNano()),
	).Scan(&userID); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	contentID := fmt.Sprintf("link-content-%d", time.Now().UnixNano())
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM downloads WHERE user_id = $1`, userID)
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	})

	dlRepo := NewRepository(pool)
	now := time.Now()
	dlID := fmt.Sprintf("dl-link-%d", now.UnixNano())
	if err := dlRepo.Create(ctx, &Download{
		ID: dlID, UserID: userID, MediaFileID: fileID, ContentID: contentID,
		Kind: KindQueued, Status: StatusReady, Format: FormatTranscode,
		ArtifactID: art.ID, FileSize: 1024, CreatedAt: now, UpdatedAt: now,
	}); err != nil {
		t.Fatalf("create ephemeral download: %v", err)
	}

	deleted, err := repo.DeleteReadyIfEvictable(ctx, art.ID)
	if err != nil {
		t.Fatalf("DeleteReadyIfEvictable with ephemeral link: %v", err)
	}
	if deleted {
		t.Fatal("ephemeral ready row must protect its artifact from eviction")
	}

	if _, err := pool.Exec(ctx, `UPDATE downloads SET status = 'cancelled', artifact_id = NULL WHERE id = $1`, dlID); err != nil {
		t.Fatalf("cancel download: %v", err)
	}
	deleted, err = repo.DeleteReadyIfEvictable(ctx, art.ID)
	if err != nil {
		t.Fatalf("DeleteReadyIfEvictable after cancel: %v", err)
	}
	if !deleted {
		t.Fatal("terminal-only links must not protect an artifact")
	}
}

// TestDeleteFailedIfEvictableFencesRequeuedArtifact covers the failed-artifact
// sweep: a linked row must survive the sweep, an unlinked row Ensure requeued
// (status back to 'queued'/'running') must survive it too, and the row becomes
// removable only once it is failed and unlinked.
func TestDeleteFailedIfEvictableFencesRequeuedArtifact(t *testing.T) {
	repo, pool, fileID := newArtifactTestRepo(t)
	ctx := context.Background()

	art := newArtifact(t, fileID, fmt.Sprintf("hash-requeued-%d", time.Now().UnixNano()))
	if _, _, err := repo.EnsureQueued(ctx, art); err != nil {
		t.Fatalf("ensure artifact: %v", err)
	}
	userID := seedDownloadUser(t, pool)
	dlRepo := NewRepository(pool)
	now := time.Now()
	dlID := fmt.Sprintf("dl-requeued-%d", now.UnixNano())
	if err := dlRepo.Create(ctx, &Download{
		ID: dlID, UserID: userID, MediaFileID: fileID,
		ContentID: fmt.Sprintf("requeued-content-%d", now.UnixNano()),
		Kind:      KindQueued, Status: StatusPreparing, Format: FormatTranscode,
		ArtifactID: art.ID, FileSize: 1024, CreatedAt: now, UpdatedAt: now,
	}); err != nil {
		t.Fatalf("create preparing download: %v", err)
	}

	deleted, err := repo.DeleteFailedIfEvictable(ctx, art.ID)
	if err != nil {
		t.Fatalf("DeleteFailedIfEvictable linked: %v", err)
	}
	if deleted {
		t.Fatal("a linked non-failed artifact must not be swept")
	}
	if _, err := repo.GetByID(ctx, art.ID); err != nil {
		t.Fatalf("linked artifact missing after sweep attempt: %v", err)
	}

	if _, err := pool.Exec(ctx, `UPDATE downloads SET status = 'failed', artifact_id = NULL WHERE id = $1`, dlID); err != nil {
		t.Fatalf("fail download: %v", err)
	}
	// Unlinked but still queued: a requeued job the drain may already own must
	// survive a status-unrestricted sweep would have removed it.
	deleted, err = repo.DeleteFailedIfEvictable(ctx, art.ID)
	if err != nil {
		t.Fatalf("DeleteFailedIfEvictable requeued: %v", err)
	}
	if deleted {
		t.Fatal("an unlinked requeued artifact must not be swept")
	}

	if _, err := pool.Exec(ctx, `UPDATE download_artifacts SET status = 'failed' WHERE id = $1`, art.ID); err != nil {
		t.Fatalf("fail artifact: %v", err)
	}
	deleted, err = repo.DeleteFailedIfEvictable(ctx, art.ID)
	if err != nil {
		t.Fatalf("DeleteFailedIfEvictable after fail: %v", err)
	}
	if !deleted {
		t.Fatal("an unlinked failed artifact must be swept")
	}
}

// TestLocalOrphanQueueRoundTrip covers the durable local cleanup intent: an
// enqueue is idempotent per path, becomes due immediately, defers on a bumped
// retry, and clears by id and by path.
func TestLocalOrphanQueueRoundTrip(t *testing.T) {
	repo, pool, fileID := newArtifactTestRepo(t)
	ctx := context.Background()
	var present *string
	if err := pool.QueryRow(ctx, `SELECT to_regclass('public.download_artifact_local_orphans')::text`).Scan(&present); err != nil {
		t.Fatalf("check download_artifact_local_orphans: %v", err)
	}
	if present == nil {
		t.Skip("download_artifact_local_orphans migration has not been applied")
	}

	art := newArtifact(t, fileID, fmt.Sprintf("hash-local-orphan-%d", time.Now().UnixNano()))
	path := art.OutputPath
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM download_artifact_local_orphans WHERE output_path = $1`, path)
	})

	if err := repo.EnqueueLocalOrphan(ctx, art.ID, path); err != nil {
		t.Fatalf("EnqueueLocalOrphan: %v", err)
	}
	if err := repo.EnqueueLocalOrphan(ctx, art.ID, path); err != nil {
		t.Fatalf("EnqueueLocalOrphan (repeat): %v", err)
	}
	due, err := repo.ListLocalOrphansDue(ctx, 500)
	if err != nil {
		t.Fatalf("ListLocalOrphansDue: %v", err)
	}
	mine := localOrphansForPath(due, path)
	if len(mine) != 1 {
		t.Fatalf("due local orphans for path = %d, want exactly 1 (enqueue must dedupe)", len(mine))
	}
	if mine[0].DownloadArtifactID != art.ID {
		t.Fatalf("orphan artifact id = %q, want %q", mine[0].DownloadArtifactID, art.ID)
	}

	if err := repo.BumpLocalOrphanRetry(ctx, mine[0].ID); err != nil {
		t.Fatalf("BumpLocalOrphanRetry: %v", err)
	}
	due, err = repo.ListLocalOrphansDue(ctx, 500)
	if err != nil {
		t.Fatalf("ListLocalOrphansDue after bump: %v", err)
	}
	if len(localOrphansForPath(due, path)) != 0 {
		t.Fatal("a bumped local orphan must not be due again immediately")
	}

	if err := repo.DeleteLocalOrphanByPath(ctx, path); err != nil {
		t.Fatalf("DeleteLocalOrphanByPath: %v", err)
	}
	var remaining int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM download_artifact_local_orphans WHERE output_path = $1`, path,
	).Scan(&remaining); err != nil {
		t.Fatalf("count local orphans: %v", err)
	}
	if remaining != 0 {
		t.Fatalf("local orphan rows after delete = %d, want 0", remaining)
	}
}

func localOrphansForPath(orphans []LocalArtifactOrphan, path string) []LocalArtifactOrphan {
	filtered := make([]LocalArtifactOrphan, 0, 1)
	for _, orphan := range orphans {
		if orphan.OutputPath == path {
			filtered = append(filtered, orphan)
		}
	}
	return filtered
}

func markArtifactReady(t *testing.T, pool *pgxpool.Pool, id string) {
	t.Helper()
	if _, err := pool.Exec(context.Background(),
		`UPDATE download_artifacts SET status = 'ready', file_size = 1024, completed_at = now() WHERE id = $1`,
		id,
	); err != nil {
		t.Fatalf("mark artifact ready: %v", err)
	}
}

func seedDownloadUser(t *testing.T, pool *pgxpool.Pool) int {
	t.Helper()
	var userID int
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO users (username, role, download_allowed) VALUES ($1, 'user', true) RETURNING id`,
		fmt.Sprintf("evictuser-%d", time.Now().UnixNano()),
	).Scan(&userID); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM downloads WHERE user_id = $1`, userID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, userID)
	})
	return userID
}

// TestDeleteReadyIfEvictableFencesConcurrentLink pins the LRU eviction
// invariant: a ready download that lands after the unlinked check must keep
// the artifact row, and a download insert against a deleted id must fail
// rather than advertise a 404-forever handle.
func TestDeleteReadyIfEvictableFencesConcurrentLink(t *testing.T) {
	repo, pool, fileID := newArtifactTestRepo(t)
	ctx := context.Background()

	art := newArtifact(t, fileID, fmt.Sprintf("hash-evict-%d", time.Now().UnixNano()))
	if _, _, err := repo.EnsureQueued(ctx, art); err != nil {
		t.Fatalf("ensure artifact: %v", err)
	}
	markArtifactReady(t, pool, art.ID)
	userID := seedDownloadUser(t, pool)
	dlRepo := NewRepository(pool)
	now := time.Now()
	contentID := fmt.Sprintf("evict-content-%d", now.UnixNano())

	deleted, err := repo.DeleteReadyIfEvictable(ctx, art.ID)
	if err != nil {
		t.Fatalf("DeleteReadyIfEvictable unlinked: %v", err)
	}
	if !deleted {
		t.Fatal("unlinked ready artifact must be evictable")
	}
	if err := dlRepo.Create(ctx, &Download{
		ID: fmt.Sprintf("dl-evict-miss-%d", now.UnixNano()), UserID: userID, MediaFileID: fileID, ContentID: contentID,
		Kind: KindQueued, Status: StatusReady, Format: FormatTranscode,
		ArtifactID: art.ID, FileSize: 1024, CreatedAt: now, UpdatedAt: now,
	}); !errors.Is(err, ErrArtifactEvicted) {
		t.Fatalf("Create after eviction = %v, want ErrArtifactEvicted", err)
	}

	art2 := newArtifact(t, fileID, fmt.Sprintf("hash-evict-live-%d", time.Now().UnixNano()))
	if _, _, err := repo.EnsureQueued(ctx, art2); err != nil {
		t.Fatalf("ensure second artifact: %v", err)
	}
	markArtifactReady(t, pool, art2.ID)
	if err := dlRepo.Create(ctx, &Download{
		ID: fmt.Sprintf("dl-evict-live-%d", now.UnixNano()), UserID: userID, MediaFileID: fileID, ContentID: contentID + "-live",
		Kind: KindQueued, Status: StatusReady, Format: FormatTranscode,
		ArtifactID: art2.ID, FileSize: 1024, CreatedAt: now, UpdatedAt: now,
	}); err != nil {
		t.Fatalf("Create live download: %v", err)
	}
	deleted, err = repo.DeleteReadyIfEvictable(ctx, art2.ID)
	if err != nil {
		t.Fatalf("DeleteReadyIfEvictable linked: %v", err)
	}
	if deleted {
		t.Fatal("ready download must fence LRU eviction")
	}
	if _, err := repo.GetByID(ctx, art2.ID); err != nil {
		t.Fatalf("linked artifact missing after eviction attempt: %v", err)
	}

	// Terminal transitions drop the link, as CancelByID and the fail paths do.
	if _, err := pool.Exec(ctx, `UPDATE downloads SET status = 'cancelled', artifact_id = NULL WHERE artifact_id = $1`, art2.ID); err != nil {
		t.Fatalf("cancel download: %v", err)
	}
	deleted, err = repo.DeleteReadyIfEvictable(ctx, art2.ID)
	if err != nil {
		t.Fatalf("DeleteReadyIfEvictable after cancel: %v", err)
	}
	if !deleted {
		t.Fatal("terminal-only links must not fence eviction")
	}
}

func TestCreateOriginalDownloadDoesNotRequireArtifact(t *testing.T) {
	_, pool, fileID := newArtifactTestRepo(t)
	ctx := context.Background()
	userID := seedDownloadUser(t, pool)
	now := time.Now()
	if err := NewRepository(pool).Create(ctx, &Download{
		ID: fmt.Sprintf("dl-original-%d", now.UnixNano()), UserID: userID, MediaFileID: fileID,
		ContentID: fmt.Sprintf("original-content-%d", now.UnixNano()),
		Kind:      KindQueued, Status: StatusQueued, Format: FormatOriginal,
		FileSize: 1024, CreatedAt: now, UpdatedAt: now,
	}); err != nil {
		t.Fatalf("Create original download: %v", err)
	}
}

// TestCreateAgainstMissingArtifactIsEvicted pins the enforcement layer itself:
// a download that names an artifact id with no row must be rejected as evicted,
// whichever mechanism catches it (the EXISTS fast path or the foreign key).
func TestCreateAgainstMissingArtifactIsEvicted(t *testing.T) {
	_, pool, fileID := newArtifactTestRepo(t)
	ctx := context.Background()
	userID := seedDownloadUser(t, pool)
	now := time.Now()
	missingID, err := idgen.NextID()
	if err != nil {
		t.Fatalf("id: %v", err)
	}
	d := &Download{
		ID: fmt.Sprintf("dl-missing-%d", now.UnixNano()), UserID: userID, MediaFileID: fileID,
		ContentID: fmt.Sprintf("missing-content-%d", now.UnixNano()),
		Kind:      KindQueued, Status: StatusReady, Format: FormatTranscode,
		ArtifactID: missingID, FileSize: 1024, CreatedAt: now, UpdatedAt: now,
	}
	if err := NewRepository(pool).Create(ctx, d); !errors.Is(err, ErrArtifactEvicted) {
		t.Fatalf("Create against missing artifact = %v, want ErrArtifactEvicted", err)
	}
	if err := NewRepository(pool).CreateBatch(ctx, []*Download{d}); !errors.Is(err, ErrArtifactEvicted) {
		t.Fatalf("CreateBatch against missing artifact = %v, want ErrArtifactEvicted", err)
	}
}

// TestTerminalTransitionsUnpinArtifact pins the ON DELETE RESTRICT contract:
// canceling or failing a download must drop its artifact link, otherwise the
// artifact stays pinned against eviction forever.
func TestTerminalTransitionsUnpinArtifact(t *testing.T) {
	repo, pool, fileID := newArtifactTestRepo(t)
	ctx := context.Background()
	dlRepo := NewRepository(pool)
	userID := seedDownloadUser(t, pool)
	now := time.Now()

	cancelArt := newArtifact(t, fileID, fmt.Sprintf("hash-cancel-%d", now.UnixNano()))
	if _, _, err := repo.EnsureQueued(ctx, cancelArt); err != nil {
		t.Fatalf("ensure cancel artifact: %v", err)
	}
	markArtifactReady(t, pool, cancelArt.ID)
	cancelID := fmt.Sprintf("dl-cancel-%d", now.UnixNano())
	if err := dlRepo.Create(ctx, &Download{
		ID: cancelID, UserID: userID, MediaFileID: fileID,
		ContentID: fmt.Sprintf("cancel-content-%d", now.UnixNano()),
		Kind:      KindQueued, Status: StatusQueued, Format: FormatTranscode,
		ArtifactID: cancelArt.ID, FileSize: 1024, CreatedAt: now, UpdatedAt: now,
	}); err != nil {
		t.Fatalf("create cancelable download: %v", err)
	}
	if err := dlRepo.CancelByID(ctx, cancelID, userID); err != nil {
		t.Fatalf("CancelByID: %v", err)
	}
	canceled, err := dlRepo.GetByID(ctx, cancelID)
	if err != nil {
		t.Fatalf("get canceled download: %v", err)
	}
	if canceled.ArtifactID != "" {
		t.Fatalf("canceled download artifact_id = %q, want empty", canceled.ArtifactID)
	}
	deleted, err := repo.DeleteReadyIfEvictable(ctx, cancelArt.ID)
	if err != nil {
		t.Fatalf("DeleteReadyIfEvictable after cancel: %v", err)
	}
	if !deleted {
		t.Fatal("a canceled download must not pin its artifact")
	}

	failArt := newArtifact(t, fileID, fmt.Sprintf("hash-fail-%d", now.UnixNano()))
	if _, _, err := repo.EnsureQueued(ctx, failArt); err != nil {
		t.Fatalf("ensure fail artifact: %v", err)
	}
	failID := fmt.Sprintf("dl-fail-%d", now.UnixNano())
	if err := dlRepo.Create(ctx, &Download{
		ID: failID, UserID: userID, MediaFileID: fileID,
		ContentID: fmt.Sprintf("fail-content-%d", now.UnixNano()),
		Kind:      KindQueued, Status: StatusPreparing, Format: FormatTranscode,
		ArtifactID: failArt.ID, FileSize: 1024, CreatedAt: now, UpdatedAt: now,
	}); err != nil {
		t.Fatalf("create preparing download: %v", err)
	}
	flipped, err := dlRepo.MarkLinkedDownloadsFailed(ctx, failArt.ID, "encode failed")
	if err != nil {
		t.Fatalf("MarkLinkedDownloadsFailed: %v", err)
	}
	if len(flipped) != 1 {
		t.Fatalf("flipped rows = %d, want 1", len(flipped))
	}
	if flipped[0].ArtifactID != "" {
		t.Fatalf("failed download artifact_id = %q, want empty", flipped[0].ArtifactID)
	}
	if _, err := pool.Exec(ctx, `UPDATE download_artifacts SET status = 'failed' WHERE id = $1`, failArt.ID); err != nil {
		t.Fatalf("fail artifact: %v", err)
	}
	deleted, err = repo.DeleteFailedIfEvictable(ctx, failArt.ID)
	if err != nil {
		t.Fatalf("DeleteFailedIfEvictable after fail: %v", err)
	}
	if !deleted {
		t.Fatal("a failed download must not pin its artifact")
	}
}

// TestReconcileFailedDownloadsUnpinArtifact covers the reconcile-to-failed
// update: it must both preserve the artifact's error message (read from the OLD
// row) and clear the link in the same statement.
func TestReconcileFailedDownloadsUnpinArtifact(t *testing.T) {
	repo, pool, fileID := newArtifactTestRepo(t)
	ctx := context.Background()
	dlRepo := NewRepository(pool)
	userID := seedDownloadUser(t, pool)
	now := time.Now()

	art := newArtifact(t, fileID, fmt.Sprintf("hash-reconcile-%d", now.UnixNano()))
	if _, _, err := repo.EnsureQueued(ctx, art); err != nil {
		t.Fatalf("ensure artifact: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`UPDATE download_artifacts SET status = 'failed', error_message = 'ffmpeg exploded' WHERE id = $1`, art.ID,
	); err != nil {
		t.Fatalf("mark artifact failed: %v", err)
	}
	dlID := fmt.Sprintf("dl-reconcile-%d", now.UnixNano())
	if err := dlRepo.Create(ctx, &Download{
		ID: dlID, UserID: userID, MediaFileID: fileID,
		ContentID: fmt.Sprintf("reconcile-content-%d", now.UnixNano()),
		Kind:      KindQueued, Status: StatusPreparing, Format: FormatTranscode,
		ArtifactID: art.ID, FileSize: 1024, CreatedAt: now, UpdatedAt: now,
	}); err != nil {
		t.Fatalf("create preparing download: %v", err)
	}

	if _, _, err := dlRepo.ReconcileLinkedDownloads(ctx); err != nil {
		t.Fatalf("ReconcileLinkedDownloads: %v", err)
	}
	row, err := dlRepo.GetByID(ctx, dlID)
	if err != nil {
		t.Fatalf("get reconciled download: %v", err)
	}
	if row.Status != StatusFailed {
		t.Fatalf("reconciled status = %q, want failed", row.Status)
	}
	if row.ErrorMessage != "ffmpeg exploded" {
		t.Fatalf("reconciled error_message = %q, want the artifact's message", row.ErrorMessage)
	}
	if row.ArtifactID != "" {
		t.Fatalf("reconciled artifact_id = %q, want empty", row.ArtifactID)
	}
}

// TestEvictionVersusLinkRace is the invariant test the fence alone could not
// satisfy: many rounds of a genuine two-goroutine race between linking an
// artifact and evicting it, asserting after every round that no download row
// points at a missing artifact and that exactly one side lost.
func TestEvictionVersusLinkRace(t *testing.T) {
	repo, pool, fileID := newArtifactTestRepo(t)
	ctx := context.Background()
	dlRepo := NewRepository(pool)
	userID := seedDownloadUser(t, pool)

	const rounds = 100
	for i := 0; i < rounds; i++ {
		art := newArtifact(t, fileID, fmt.Sprintf("hash-race-%d-%d", time.Now().UnixNano(), i))
		if _, _, err := repo.EnsureQueued(ctx, art); err != nil {
			t.Fatalf("round %d: ensure artifact: %v", i, err)
		}
		markArtifactReady(t, pool, art.ID)

		now := time.Now()
		d := &Download{
			ID: fmt.Sprintf("dl-race-%d-%d", now.UnixNano(), i), UserID: userID, MediaFileID: fileID,
			ContentID: fmt.Sprintf("race-content-%d-%d", now.UnixNano(), i),
			Kind:      KindQueued, Status: StatusReady, Format: FormatTranscode,
			ArtifactID: art.ID, FileSize: 1024, CreatedAt: now, UpdatedAt: now,
		}

		start := make(chan struct{})
		var wg sync.WaitGroup
		var createErr, deleteErr error
		var evicted bool
		wg.Add(2)
		go func() {
			defer wg.Done()
			<-start
			createErr = dlRepo.Create(ctx, d)
		}()
		go func() {
			defer wg.Done()
			<-start
			evicted, deleteErr = repo.DeleteReadyIfEvictable(ctx, art.ID)
		}()
		close(start)
		wg.Wait()

		if deleteErr != nil {
			t.Fatalf("round %d: DeleteReadyIfEvictable: %v", i, deleteErr)
		}
		if createErr != nil && !errors.Is(createErr, ErrArtifactEvicted) {
			t.Fatalf("round %d: Create: %v", i, createErr)
		}

		// The invariant: never a download row whose artifact row is gone.
		var dangling int
		if err := pool.QueryRow(ctx,
			`SELECT count(*) FROM downloads d
			 WHERE d.artifact_id IS NOT NULL
			   AND NOT EXISTS (SELECT 1 FROM download_artifacts a WHERE a.id = d.artifact_id)`,
		).Scan(&dangling); err != nil {
			t.Fatalf("round %d: dangling check: %v", i, err)
		}
		if dangling != 0 {
			t.Fatalf("round %d: %d download rows point at a deleted artifact", i, dangling)
		}

		// And the eviction direction: exactly one side may win.
		linked := createErr == nil
		if linked && evicted {
			t.Fatalf("round %d: both the link and the eviction succeeded", i)
		}
		if linked {
			if _, err := repo.GetByID(ctx, art.ID); err != nil {
				t.Fatalf("round %d: linked artifact missing: %v", i, err)
			}
		}

		if _, err := pool.Exec(ctx, `DELETE FROM downloads WHERE id = $1`, d.ID); err != nil {
			t.Fatalf("round %d: cleanup download: %v", i, err)
		}
		if _, err := pool.Exec(ctx, `DELETE FROM download_artifacts WHERE id = $1`, art.ID); err != nil {
			t.Fatalf("round %d: cleanup artifact: %v", i, err)
		}
	}
}
