package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/Silo-Server/silo-server/internal/access"
	apimw "github.com/Silo-Server/silo-server/internal/api/middleware"
	"github.com/Silo-Server/silo-server/internal/models"
	"github.com/Silo-Server/silo-server/internal/userstore"
)

// userLookup is the slice of the user repository the household check needs: a
// profile token is only valid against the access-policy revision it was minted
// for, so verifying one means reading the user's current revision.
type userLookup interface {
	GetByID(ctx context.Context, id int) (*models.User, error)
}

// canManageHousehold reports whether the caller may act for the whole household
// — every profile on their own account — rather than only for themselves.
//
// Server admins always may. Otherwise the caller's active profile must be the
// one flagged is_primary, which is the household parent and is deliberately
// *not* the server-wide admin role: a household parent manages their family,
// an admin manages the server.
//
// When that primary profile has a PIN, management additionally requires a valid
// X-Profile-Token from /profiles/{id}/verify-pin. Without that, a client could
// walk past a profile lock by sending only X-Profile-Id.
//
// This is a policy boundary for well-behaved clients rather than a defense
// against the account holder: every profile on an account shares one login
// session, so X-Profile-Id is self-asserted (see the note in
// internal/api/middleware/auth.go). It is the same boundary profile management
// has always used, and it is applied here so household settings management is
// guarded and auditable rather than implicit.
func canManageHousehold(
	r *http.Request,
	store userstore.UserStore,
	users userLookup,
	tokens *access.ProfileTokenService,
) (bool, error) {
	ctx := r.Context()
	if apimw.IsAdmin(ctx) {
		return true, nil
	}
	activeProfileID := apimw.GetProfileID(ctx)
	if activeProfileID == "" {
		activeProfileID = r.Header.Get("X-Profile-Id")
	}
	if activeProfileID == "" {
		return false, nil
	}
	active, err := store.GetProfile(ctx, activeProfileID)
	if err != nil {
		return false, err
	}
	if active == nil {
		return false, nil
	}
	if !active.IsPrimary {
		return false, nil
	}
	if active.PINHash == "" {
		return true, nil
	}
	if err := verifyProfileToken(r, users, tokens, active.ID); err != nil {
		return false, err
	}
	return true, nil
}

// authorizeNamedProfile allows a mutation that names targetProfileID in the
// body rather than in X-Profile-Id. Acting for yourself is allowed. Acting for
// another household member uses the same canManageHousehold rule as settings
// and devices, so a child profile cannot write watch state into a PIN-locked
// sibling by swapping the body id.
//
// An empty target is left to the caller to reject as a validation error. A
// missing store provider fails closed: the widening is unavailable, never
// unguarded.
func authorizeNamedProfile(
	w http.ResponseWriter,
	r *http.Request,
	provider userstore.UserStoreProvider,
	users userLookup,
	tokens *access.ProfileTokenService,
	targetProfileID string,
	forbiddenMessage string,
) bool {
	target := strings.TrimSpace(targetProfileID)
	if target == "" {
		return true
	}
	caller := strings.TrimSpace(apimw.GetProfileID(r.Context()))
	if caller == "" {
		caller = strings.TrimSpace(r.Header.Get("X-Profile-Id"))
	}
	if caller != "" && target == caller {
		return true
	}

	userID := apimw.GetUserID(r.Context())
	if userID == 0 {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return false
	}
	if provider == nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to access user store")
		return false
	}
	store, err := provider.ForUser(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to access user store")
		return false
	}

	allowed, err := canManageHousehold(r, store, users, tokens)
	if err != nil {
		writeProfileManagementPermissionError(w, err)
		return false
	}
	if !allowed {
		if forbiddenMessage == "" {
			forbiddenMessage = "Managing another profile requires the primary profile or admin access"
		}
		writeError(w, http.StatusForbidden, "forbidden", forbiddenMessage)
		return false
	}

	profile, err := store.GetProfile(r.Context(), target)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to load profile")
		return false
	}
	if profile == nil {
		writeError(w, http.StatusNotFound, "not_found", "Profile not found")
		return false
	}
	return true
}

// verifyProfileToken checks the X-Profile-Token a PIN-locked profile must
// present. Missing dependencies fail closed: a handler wired without a token
// service cannot verify a PIN, and "cannot verify" is not "verified".
func verifyProfileToken(
	r *http.Request,
	users userLookup,
	tokens *access.ProfileTokenService,
	profileID string,
) error {
	if users == nil || tokens == nil {
		return access.ErrProfileUnverified
	}

	claims := apimw.GetClaims(r.Context())
	if claims == nil || claims.SessionID == "" {
		return access.ErrProfileUnverified
	}

	userID := apimw.GetUserID(r.Context())
	if userID == 0 {
		return access.ErrProfileUnverified
	}

	user, err := users.GetByID(r.Context(), userID)
	if err != nil {
		return fmt.Errorf("loading user policy: %w", err)
	}
	if user == nil {
		return access.ErrProfileUnverified
	}

	profileClaims, err := tokens.Validate(r.Header.Get("X-Profile-Token"))
	if err != nil {
		return err
	}
	if profileClaims.UserID != userID ||
		profileClaims.SessionID != claims.SessionID ||
		profileClaims.ProfileID != profileID ||
		profileClaims.PolicyRevision != user.AccessPolicyRevision {
		return access.ErrProfileUnverified
	}

	return nil
}
