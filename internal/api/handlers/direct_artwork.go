package handlers

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/Silo-Server/silo-server/internal/artworkstore"
	"github.com/Silo-Server/silo-server/internal/artworkurl"
)

const DirectArtworkKeyParam = "*"

// DirectArtworkHandler serves explicit direct-policy local URLs. Signed URLs
// remain valid after a mode flip; unsigned URLs are accepted only while the
// live policy is public.
type DirectArtworkHandler struct {
	store   ArtworkObjectStore
	signer  *artworkurl.Signer
	urlAuth func() string
}

func NewDirectArtworkHandler(store ArtworkObjectStore, signer *artworkurl.Signer, urlAuth func() string) *DirectArtworkHandler {
	if store == nil || signer == nil {
		return nil
	}
	return &DirectArtworkHandler{store: store, signer: signer, urlAuth: urlAuth}
}

func (h *DirectArtworkHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	rawPath := chi.URLParam(r, DirectArtworkKeyParam)
	// A raw key contains no percent escapes. Reject against EscapedPath before
	// chi's decoded parameter can turn an encoded slash into another grammar.
	escaped := strings.TrimPrefix(r.URL.EscapedPath(), artworkurl.DirectRoutePrefix)
	if rawPath == "" || escaped != rawPath || strings.Contains(escaped, "%") {
		artworkNotFound(w)
		return
	}
	key, err := artworkurl.DirectKeyFromPath(rawPath)
	if err != nil {
		artworkNotFound(w)
		return
	}
	public := r.URL.Query().Get(artworkurl.SignatureParam) == "" && r.URL.Query().Get(artworkurl.ExpiresParam) == ""
	now := time.Now()
	var expiresAt time.Time
	if public {
		if h.urlAuth == nil || !strings.EqualFold(strings.TrimSpace(h.urlAuth()), "public") {
			artworkNotFound(w)
			return
		}
		if err := artworkstore.ValidateKey(key); err != nil {
			artworkNotFound(w)
			return
		}
	} else {
		var err error
		expiresAt, err = h.signer.VerifyDirectKey(key, r.URL.Query().Get(artworkurl.ExpiresParam), r.URL.Query().Get(artworkurl.SignatureParam), now)
		if errors.Is(err, artworkurl.ErrExpired) {
			writeError(w, http.StatusUnauthorized, "artwork_url_expired", "Artwork URL expired")
			return
		}
		if err != nil {
			artworkNotFound(w)
			return
		}
	}
	if health, ok := h.store.(artworkStoreHealth); ok {
		state, _ := health.Health()
		if state == artworkstore.HealthUnavailable || state == artworkstore.HealthWrongMount {
			artworkNotFound(w)
			return
		}
	}
	object, err := h.store.Open(r.Context(), key)
	if err != nil {
		artworkNotFound(w)
		return
	}
	defer func() { _ = object.Close() }()
	writer := &ArtworkHandler{}
	if public {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		expiresAt = now.Add(365 * 24 * time.Hour)
	}
	writer.writeObject(w, r, object, expiresAt, now)
}
