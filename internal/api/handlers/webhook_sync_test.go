package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Silo-Server/silo-server/internal/access"
	"github.com/Silo-Server/silo-server/internal/models"
	"github.com/Silo-Server/silo-server/internal/userstore"
	"github.com/Silo-Server/silo-server/internal/webhooksync"
)

func TestRequestWebhookURLWithPrefix(t *testing.T) {
	t.Parallel()

	if got := requestWebhookURLWithPrefix("https://example.com/", legacyPlexSyncPathPrefix, "secret"); got != "https://example.com/api/v1/plex-sync/webhooks/secret" {
		t.Fatalf("unexpected legacy webhook URL: %q", got)
	}
	if got := requestWebhookURLWithPrefix("https://example.com/", webhookSyncPathPrefix, "secret"); got != "https://example.com/api/v1/webhook-sync/webhooks/secret" {
		t.Fatalf("unexpected generic webhook URL: %q", got)
	}
}

func TestToLegacyPlexActorsResponse(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 4, 7, 12, 0, 0, 0, time.UTC)
	profileID := "profile-1"
	resp := toLegacyPlexActorsResponse(&webhooksync.ProfileMappingsResponse{
		Mappings: []webhooksync.ProfileMapping{
			{
				ID:               11,
				ConnectionID:     "conn-1",
				ExternalUserID:   "42",
				ExternalUserName: "Alice",
				SiloProfileID:    &profileID,
				CreatedAt:        now,
				UpdatedAt:        now,
			},
		},
		DiscoveredUsers: []webhooksync.DiscoveredUser{
			{ExternalUserID: "42", ExternalUserName: "Alice"},
			{ExternalUserID: "77", ExternalUserName: "Bob"},
		},
		AccountDiscoveryAvailable: true,
	})

	if !resp.AccountDiscoveryAvailable {
		t.Fatalf("expected discovery to be available")
	}
	if len(resp.Mappings) != 1 || resp.Mappings[0].PlexAccountID != 42 || resp.Mappings[0].SiloProfileID != "profile-1" {
		t.Fatalf("unexpected legacy mappings: %#v", resp.Mappings)
	}
	if len(resp.DiscoveredActors) != 2 || resp.DiscoveredActors[1].PlexAccountID != 77 {
		t.Fatalf("unexpected legacy discovered actors: %#v", resp.DiscoveredActors)
	}
}

func TestHandleCreateConnection_ChildCannotTargetSibling(t *testing.T) {
	store := newHouseholdTestStore(t)
	if err := store.CreateProfile(t.Context(), userstore.Profile{ID: "primary", Name: "Sam", IsPrimary: true}); err != nil {
		t.Fatalf("create primary: %v", err)
	}
	if err := store.CreateProfile(t.Context(), userstore.Profile{ID: "child", Name: "Robin"}); err != nil {
		t.Fatalf("create child: %v", err)
	}

	handler := NewWebhookSyncHandler(nil)
	handler.StoreProvider = testUserStoreProvider{store: store}
	handler.UserRepo = stubUserRepo{user: &models.User{ID: 1}}
	handler.ProfileTokens = access.NewProfileTokenService("test-secret-value-at-least-32-chars", 0)

	body, err := json.Marshal(map[string]string{
		"provider":           "plex",
		"default_profile_id": "primary",
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	req := householdRequest("child", false, "")
	req.Method = http.MethodPost
	req.Body = httptest.NewRequest(http.MethodPost, "/webhook-sync/connections", bytes.NewReader(body)).Body
	req.Header.Set("Content-Type", "application/json")

	rec := httptest.NewRecorder()
	handler.HandleCreateConnection(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("child webhook into primary = %d, want 403: %s", rec.Code, rec.Body.String())
	}
}
