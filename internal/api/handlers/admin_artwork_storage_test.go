package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Silo-Server/silo-server/internal/adminjob"
	"github.com/Silo-Server/silo-server/internal/metadata"
	"github.com/Silo-Server/silo-server/internal/models"
)

type fakeArtworkStorageAccountant struct {
	result metadata.ArtworkStorageAccounting
	called int
}

func (f *fakeArtworkStorageAccountant) Accounting(context.Context) (metadata.ArtworkStorageAccounting, error) {
	f.called++
	return f.result, nil
}

type fakeArtworkStorageJobs struct {
	input adminjob.CreateJobInput
}

func (f *fakeArtworkStorageJobs) Create(_ context.Context, input adminjob.CreateJobInput) (*models.AdminJob, error) {
	f.input = input
	return &models.AdminJob{
		ID: "job-1", JobType: input.JobType, Status: adminjob.StatusQueued,
		DryRun: input.DryRun, RequestedAt: time.Now(),
	}, nil
}

func TestAdminArtworkStorageEndpointsReadSnapshotAndQueueAsyncJobs(t *testing.T) {
	accountant := &fakeArtworkStorageAccountant{result: metadata.ArtworkStorageAccounting{
		Backend: "local", Complete: false, KnownBytes: 123,
	}}
	jobs := &fakeArtworkStorageJobs{}
	handler := NewAdminArtworkStorageHandler(accountant, jobs)

	recorder := httptest.NewRecorder()
	handler.HandleStorage(recorder, httptest.NewRequest(http.MethodGet, "/api/v1/admin/artwork/storage", nil))
	if recorder.Code != http.StatusOK || accountant.called != 1 || !strings.Contains(recorder.Body.String(), `"known_bytes":123`) {
		t.Fatalf("storage response = %d %s", recorder.Code, recorder.Body.String())
	}

	recorder = httptest.NewRecorder()
	handler.HandleRefresh(recorder, httptest.NewRequest(http.MethodPost, "/api/v1/admin/artwork/storage/refresh", nil))
	if recorder.Code != http.StatusAccepted || jobs.input.JobType != adminjob.JobTypeArtworkStorageRefresh {
		t.Fatalf("refresh response = %d %s, job = %#v", recorder.Code, recorder.Body.String(), jobs.input)
	}

	recorder = httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/admin/artwork/purge", strings.NewReader(
		`{"scope":{"library_id":12},"mode":"safe_materialized","dry_run":true}`,
	))
	handler.HandlePurge(recorder, request)
	if recorder.Code != http.StatusAccepted || jobs.input.JobType != adminjob.JobTypeArtworkPurge || !jobs.input.DryRun {
		t.Fatalf("purge response = %d %s, job = %#v", recorder.Code, recorder.Body.String(), jobs.input)
	}
}

func TestAdminArtworkPurgeRejectsAmbiguousScope(t *testing.T) {
	handler := NewAdminArtworkStorageHandler(&fakeArtworkStorageAccountant{}, &fakeArtworkStorageJobs{})
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/admin/artwork/purge", strings.NewReader(
		`{"scope":{"library_id":12,"server":true},"mode":"safe_materialized","dry_run":true}`,
	))
	handler.HandlePurge(recorder, request)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", recorder.Code)
	}
}

func TestAdminArtworkPurgeNormalizesEdgeOnlyBeforeQueueing(t *testing.T) {
	jobs := &fakeArtworkStorageJobs{}
	handler := NewAdminArtworkStorageHandler(&fakeArtworkStorageAccountant{}, jobs)
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/admin/artwork/purge", strings.NewReader(
		`{"scope":{"server":true},"mode":"Edge_Only","dry_run":false}`,
	))
	handler.HandlePurge(recorder, request)
	if recorder.Code != http.StatusAccepted {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	queued, ok := jobs.input.RequestPayload.(adminjob.ArtworkPurgeRequest)
	if !ok {
		t.Fatalf("queued payload type = %T", jobs.input.RequestPayload)
	}
	if queued.Mode != adminjob.ArtworkPurgeModeEdgeOnly {
		t.Fatalf("queued mode = %q, want %q", queued.Mode, adminjob.ArtworkPurgeModeEdgeOnly)
	}
}
