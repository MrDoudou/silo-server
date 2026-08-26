package handlers

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Silo-Server/silo-server/internal/access"
	apimw "github.com/Silo-Server/silo-server/internal/api/middleware"
	"github.com/Silo-Server/silo-server/internal/auth"
	"github.com/Silo-Server/silo-server/internal/models"
	"github.com/Silo-Server/silo-server/internal/userdb"
	"github.com/Silo-Server/silo-server/internal/userstore"
)

type stubUserRepo struct {
	user *models.User
}

func (s stubUserRepo) GetByID(context.Context, int) (*models.User, error) {
	return s.user, nil
}

func newHouseholdTestStore(t *testing.T) userstore.UserStore {
	t.Helper()
	dsn := "file:" + strings.NewReplacer("/", "_", " ", "_").Replace(t.Name()) +
		"?mode=memory&cache=shared"
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := userdb.InitSchema(db); err != nil {
		t.Fatalf("init schema: %v", err)
	}
	return userdb.NewSQLiteUserStore(db)
}

func householdRequest(profileID string, admin bool, profileToken string) *http.Request {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	claims := &auth.Claims{UserID: 1, SessionID: "session-1"}
	if admin {
		claims.Role = "admin"
	}
	ctx := apimw.SetClaims(req.Context(), claims)
	if profileID != "" {
		ctx = apimw.SetProfileID(ctx, profileID)
	}
	if profileToken != "" {
		req.Header.Set("X-Profile-Token", profileToken)
	}
	return req.WithContext(ctx)
}

// TestCanManageHousehold pins the household-parent boundary before it is shared
// with the settings routes. The rule is deliberately narrow: a server admin, or
// the one profile flagged is_primary — and when that profile carries a PIN, a
// verified profile token, so sending only X-Profile-Id cannot walk past a
// profile lock.
func TestCanManageHousehold(t *testing.T) {
	ctx := context.Background()

	setup := func(t *testing.T, pin string) (userstore.UserStore, *access.ProfileTokenService) {
		t.Helper()
		store := newHouseholdTestStore(t)
		if err := store.CreateProfile(ctx, userstore.Profile{
			ID: "primary", Name: "Sam", IsPrimary: true,
		}); err != nil {
			t.Fatalf("create primary: %v", err)
		}
		if err := store.CreateProfile(ctx, userstore.Profile{
			ID: "child", Name: "Robin",
		}); err != nil {
			t.Fatalf("create child: %v", err)
		}
		if pin != "" {
			if err := store.UpdateProfile(ctx, "primary", userstore.UpdateProfileInput{
				PIN: &pin,
			}); err != nil {
				t.Fatalf("set pin: %v", err)
			}
		}
		return store, access.NewProfileTokenService("test-secret-value-at-least-32-chars", 0)
	}

	t.Run("admin always may", func(t *testing.T) {
		store, tokens := setup(t, "")
		// An admin with no active profile at all still manages.
		ok, err := canManageHousehold(householdRequest("", true, ""), store, nil, tokens)
		if err != nil || !ok {
			t.Fatalf("admin = (%v, %v), want (true, nil)", ok, err)
		}
	})

	t.Run("primary without pin may", func(t *testing.T) {
		store, tokens := setup(t, "")
		ok, err := canManageHousehold(householdRequest("primary", false, ""), store, nil, tokens)
		if err != nil || !ok {
			t.Fatalf("primary = (%v, %v), want (true, nil)", ok, err)
		}
	})

	t.Run("non-primary may not", func(t *testing.T) {
		store, tokens := setup(t, "")
		ok, err := canManageHousehold(householdRequest("child", false, ""), store, nil, tokens)
		if err != nil || ok {
			t.Fatalf("non-primary = (%v, %v), want (false, nil)", ok, err)
		}
	})

	t.Run("no active profile may not", func(t *testing.T) {
		store, tokens := setup(t, "")
		ok, err := canManageHousehold(householdRequest("", false, ""), store, nil, tokens)
		if err != nil || ok {
			t.Fatalf("no profile = (%v, %v), want (false, nil)", ok, err)
		}
	})

	t.Run("unknown profile may not", func(t *testing.T) {
		store, tokens := setup(t, "")
		ok, err := canManageHousehold(householdRequest("ghost", false, ""), store, nil, tokens)
		if err != nil || ok {
			t.Fatalf("unknown profile = (%v, %v), want (false, nil)", ok, err)
		}
	})

	t.Run("primary with pin and no token may not", func(t *testing.T) {
		store, tokens := setup(t, "1234")
		repo := stubUserRepo{user: &models.User{ID: 1}}
		_, err := canManageHousehold(householdRequest("primary", false, ""), store, repo, tokens)
		if !errors.Is(err, access.ErrProfileUnverified) {
			t.Fatalf("pin without token err = %v, want ErrProfileUnverified", err)
		}
	})

	t.Run("primary with pin and valid token may", func(t *testing.T) {
		store, tokens := setup(t, "1234")
		repo := stubUserRepo{user: &models.User{ID: 1}}
		token, _, err := tokens.Mint(access.ProfileTokenClaims{
			UserID: 1, SessionID: "session-1", ProfileID: "primary", PolicyRevision: 0,
		})
		if err != nil {
			t.Fatalf("issuing token: %v", err)
		}
		ok, err := canManageHousehold(householdRequest("primary", false, token), store, repo, tokens)
		if err != nil || !ok {
			t.Fatalf("pin with token = (%v, %v), want (true, nil)", ok, err)
		}
	})

	// Nil dependencies must fail closed. A settings handler built without a
	// token service is not a reason to skip the PIN check.
	t.Run("pin with no token service may not", func(t *testing.T) {
		store, _ := setup(t, "1234")
		repo := stubUserRepo{user: &models.User{ID: 1}}
		_, err := canManageHousehold(householdRequest("primary", false, "tok"), store, repo, nil)
		if !errors.Is(err, access.ErrProfileUnverified) {
			t.Fatalf("nil token service err = %v, want ErrProfileUnverified", err)
		}
	})
}

func TestAuthorizeNamedProfile(t *testing.T) {
	ctx := context.Background()

	setup := func(t *testing.T, pin string) (userstore.UserStoreProvider, *access.ProfileTokenService) {
		t.Helper()
		store := newHouseholdTestStore(t)
		if err := store.CreateProfile(ctx, userstore.Profile{
			ID: "primary", Name: "Sam", IsPrimary: true,
		}); err != nil {
			t.Fatalf("create primary: %v", err)
		}
		if err := store.CreateProfile(ctx, userstore.Profile{
			ID: "child", Name: "Robin",
		}); err != nil {
			t.Fatalf("create child: %v", err)
		}
		if pin != "" {
			if err := store.UpdateProfile(ctx, "primary", userstore.UpdateProfileInput{
				PIN: &pin,
			}); err != nil {
				t.Fatalf("set pin: %v", err)
			}
		}
		return testUserStoreProvider{store: store}, access.NewProfileTokenService("test-secret-value-at-least-32-chars", 0)
	}

	authorize := func(provider userstore.UserStoreProvider, req *http.Request, target string) *httptest.ResponseRecorder {
		t.Helper()
		rec := httptest.NewRecorder()
		ok := authorizeNamedProfile(rec, req, provider, stubUserRepo{user: &models.User{ID: 1}},
			access.NewProfileTokenService("test-secret-value-at-least-32-chars", 0),
			target, "Importing watch history into another profile requires the primary profile or admin access")
		if !ok && rec.Code == http.StatusOK {
			t.Fatal("authorizeNamedProfile returned false without writing an error")
		}
		return rec
	}

	t.Run("child targeting self is allowed", func(t *testing.T) {
		provider, _ := setup(t, "")
		rec := httptest.NewRecorder()
		ok := authorizeNamedProfile(rec, householdRequest("child", false, ""), provider, nil, nil, "child", "forbidden")
		if !ok {
			t.Fatalf("self target denied: %d %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("child targeting primary is forbidden", func(t *testing.T) {
		provider, _ := setup(t, "1234")
		rec := authorize(provider, householdRequest("child", false, ""), "primary")
		if rec.Code != http.StatusForbidden {
			t.Fatalf("child→primary = %d, want 403: %s", rec.Code, rec.Body.String())
		}
		if !strings.Contains(rec.Body.String(), "primary profile or admin access") {
			t.Fatalf("unexpected body: %s", rec.Body.String())
		}
	})

	t.Run("primary targeting child is allowed", func(t *testing.T) {
		provider, _ := setup(t, "")
		rec := httptest.NewRecorder()
		ok := authorizeNamedProfile(rec, householdRequest("primary", false, ""), provider,
			stubUserRepo{user: &models.User{ID: 1}}, nil, "child", "forbidden")
		if !ok {
			t.Fatalf("primary→child denied: %d %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("pin-locked primary without token cannot target child", func(t *testing.T) {
		provider, tokens := setup(t, "1234")
		rec := httptest.NewRecorder()
		ok := authorizeNamedProfile(rec, householdRequest("primary", false, ""), provider,
			stubUserRepo{user: &models.User{ID: 1}}, tokens, "child", "forbidden")
		if ok || rec.Code != http.StatusForbidden {
			t.Fatalf("pin without token = ok=%v status=%d body=%s", ok, rec.Code, rec.Body.String())
		}
	})

	t.Run("empty target is deferred", func(t *testing.T) {
		provider, _ := setup(t, "")
		rec := httptest.NewRecorder()
		ok := authorizeNamedProfile(rec, householdRequest("child", false, ""), provider, nil, nil, "", "forbidden")
		if !ok {
			t.Fatalf("empty target denied: %d %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("primary targeting missing profile is not found", func(t *testing.T) {
		provider, _ := setup(t, "")
		rec := httptest.NewRecorder()
		ok := authorizeNamedProfile(rec, householdRequest("primary", false, ""), provider,
			stubUserRepo{user: &models.User{ID: 1}}, nil, "ghost", "forbidden")
		if ok || rec.Code != http.StatusNotFound {
			t.Fatalf("missing profile = ok=%v status=%d body=%s", ok, rec.Code, rec.Body.String())
		}
	})
}
