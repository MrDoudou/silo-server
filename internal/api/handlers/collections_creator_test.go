package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	apimw "github.com/Silo-Server/silo-server/internal/api/middleware"
	"github.com/Silo-Server/silo-server/internal/auth"
	"github.com/Silo-Server/silo-server/internal/userstore"
)

func TestSharedCollectionMutationsRequireCreator(t *testing.T) {
	store := newHouseholdTestStore(t)
	const (
		creatorID = "profile-parent"
		memberID  = "profile-child"
		itemID    = "movie-1"
	)
	if err := store.CreateProfile(context.Background(), userstore.Profile{ID: creatorID, Name: "Parent"}); err != nil {
		t.Fatalf("create creator profile: %v", err)
	}
	if err := store.CreateProfile(context.Background(), userstore.Profile{ID: memberID, Name: "Child"}); err != nil {
		t.Fatalf("create member profile: %v", err)
	}

	collection, err := store.CreateCollection(context.Background(), userstore.CreateCollectionInput{
		CreatorProfileID:  creatorID,
		Name:              "Family Picks",
		CollectionType:    "manual",
		IsShared:          true,
		AllowedProfileIDs: []string{memberID},
	})
	if err != nil {
		t.Fatalf("create shared collection: %v", err)
	}
	if err := store.AddCollectionItem(context.Background(), collection.ID, itemID, 0); err != nil {
		t.Fatalf("seed collection item: %v", err)
	}

	handler := NewCollectionHandler(testUserStoreProvider{store: store})

	memberDelete := collectionMutationRequest(t, http.MethodDelete, "/collections/"+collection.ID, "", memberID, collection.ID, "")
	memberDeleteRec := httptest.NewRecorder()
	handler.HandleDeleteCollection(memberDeleteRec, memberDelete)
	if memberDeleteRec.Code != http.StatusForbidden {
		t.Fatalf("member delete status = %d, want 403; body = %s", memberDeleteRec.Code, memberDeleteRec.Body.String())
	}
	assertErrorCode(t, memberDeleteRec, "forbidden")

	stillThere, err := store.GetCollection(context.Background(), collection.ID)
	if err != nil {
		t.Fatalf("collection missing after rejected member delete: %v", err)
	}
	if stillThere.Name != "Family Picks" {
		t.Fatalf("collection mutated after rejected delete: %+v", stillThere)
	}

	memberAdd := collectionMutationRequest(t, http.MethodPut, "/collections/"+collection.ID+"/items/movie-2", `{"position":1}`, memberID, collection.ID, "movie-2")
	memberAddRec := httptest.NewRecorder()
	handler.HandleAddCollectionItem(memberAddRec, memberAdd)
	if memberAddRec.Code != http.StatusForbidden {
		t.Fatalf("member add status = %d, want 403; body = %s", memberAddRec.Code, memberAddRec.Body.String())
	}

	memberRemove := collectionMutationRequest(t, http.MethodDelete, "/collections/"+collection.ID+"/items/"+itemID, "", memberID, collection.ID, itemID)
	memberRemoveRec := httptest.NewRecorder()
	handler.HandleRemoveCollectionItem(memberRemoveRec, memberRemove)
	if memberRemoveRec.Code != http.StatusForbidden {
		t.Fatalf("member remove status = %d, want 403; body = %s", memberRemoveRec.Code, memberRemoveRec.Body.String())
	}

	items, err := store.ListCollectionItems(context.Background(), collection.ID)
	if err != nil {
		t.Fatalf("list items: %v", err)
	}
	if len(items) != 1 || items[0].MediaItemID != itemID {
		t.Fatalf("collection items changed after rejected member mutations: %+v", items)
	}

	creatorDelete := collectionMutationRequest(t, http.MethodDelete, "/collections/"+collection.ID, "", creatorID, collection.ID, "")
	creatorDeleteRec := httptest.NewRecorder()
	handler.HandleDeleteCollection(creatorDeleteRec, creatorDelete)
	if creatorDeleteRec.Code != http.StatusNoContent {
		t.Fatalf("creator delete status = %d, want 204; body = %s", creatorDeleteRec.Code, creatorDeleteRec.Body.String())
	}
	if _, err := store.GetCollection(context.Background(), collection.ID); err == nil {
		t.Fatal("creator delete left the collection in place")
	}
}

func TestCollectionMutationMissingCollectionIsNotFound(t *testing.T) {
	store := newHouseholdTestStore(t)
	const profileID = "profile-parent"
	if err := store.CreateProfile(context.Background(), userstore.Profile{ID: profileID, Name: "Parent"}); err != nil {
		t.Fatalf("create profile: %v", err)
	}
	handler := NewCollectionHandler(testUserStoreProvider{store: store})

	req := collectionMutationRequest(t, http.MethodDelete, "/collections/missing", "", profileID, "missing", "")
	rec := httptest.NewRecorder()
	handler.HandleDeleteCollection(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404; body = %s", rec.Code, rec.Body.String())
	}
	assertErrorCode(t, rec, "not_found")
}

func collectionMutationRequest(t *testing.T, method, path, body, profileID, collectionID, itemID string) *http.Request {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	ctx := apimw.SetClaims(req.Context(), &auth.Claims{UserID: 1, Role: "user", TokenType: auth.TokenTypeAccess})
	ctx = apimw.SetProfileID(ctx, profileID)
	routeCtx := chi.NewRouteContext()
	routeCtx.URLParams.Add("id", collectionID)
	if itemID != "" {
		routeCtx.URLParams.Add("item_id", itemID)
	}
	return req.WithContext(context.WithValue(ctx, chi.RouteCtxKey, routeCtx))
}

func assertErrorCode(t *testing.T, rec *httptest.ResponseRecorder, want string) {
	t.Helper()
	var payload struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error body %q: %v", rec.Body.String(), err)
	}
	if payload.Error != want {
		t.Fatalf("error code = %q, want %q; body = %s", payload.Error, want, rec.Body.String())
	}
}
