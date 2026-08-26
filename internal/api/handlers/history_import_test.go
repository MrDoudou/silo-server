package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Silo-Server/silo-server/internal/access"
	"github.com/Silo-Server/silo-server/internal/models"
	"github.com/Silo-Server/silo-server/internal/userstore"
)

func TestHistoryImportUpstreamError(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		status     int
		wantStatus int
		wantCode   string
		wantMsg    string
	}{
		{
			name:       "unauthorized",
			status:     http.StatusUnauthorized,
			wantStatus: http.StatusUnauthorized,
			wantCode:   "unauthorized",
			wantMsg:    "Couldn't connect to that server. Check the URL, username, and password and try again.",
		},
		{
			name:       "bad request",
			status:     http.StatusBadRequest,
			wantStatus: http.StatusBadRequest,
			wantCode:   "bad_request",
			wantMsg:    "Couldn't start the import with those server settings.",
		},
		{
			name:       "upstream failure",
			status:     http.StatusBadGateway,
			wantStatus: http.StatusBadGateway,
			wantCode:   "bad_gateway",
			wantMsg:    "The source server couldn't complete the import right now. Please try again.",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			gotStatus, gotCode, gotMsg := historyImportUpstreamError(tt.status)
			if gotStatus != tt.wantStatus || gotCode != tt.wantCode || gotMsg != tt.wantMsg {
				t.Fatalf("got (%d, %q, %q), want (%d, %q, %q)", gotStatus, gotCode, gotMsg, tt.wantStatus, tt.wantCode, tt.wantMsg)
			}
		})
	}
}

func TestHandleCreateRun_ChildCannotTargetSibling(t *testing.T) {
	store := newHouseholdTestStore(t)
	if err := store.CreateProfile(t.Context(), userstore.Profile{ID: "primary", Name: "Sam", IsPrimary: true}); err != nil {
		t.Fatalf("create primary: %v", err)
	}
	if err := store.CreateProfile(t.Context(), userstore.Profile{ID: "child", Name: "Robin"}); err != nil {
		t.Fatalf("create child: %v", err)
	}

	handler := NewHistoryImportHandler(nil)
	handler.StoreProvider = testUserStoreProvider{store: store}
	handler.UserRepo = stubUserRepo{user: &models.User{ID: 1}}
	handler.ProfileTokens = access.NewProfileTokenService("test-secret-value-at-least-32-chars", 0)

	body, err := json.Marshal(map[string]string{
		"profile_id": "primary",
		"source":     "jellyfin",
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	req := householdRequest("child", false, "")
	req.Method = http.MethodPost
	req.Body = httptest.NewRequest(http.MethodPost, "/history-imports/runs", bytes.NewReader(body)).Body
	req.Header.Set("Content-Type", "application/json")

	rec := httptest.NewRecorder()
	handler.HandleCreateRun(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("child import into primary = %d, want 403: %s", rec.Code, rec.Body.String())
	}
}
