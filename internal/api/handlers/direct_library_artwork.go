package handlers

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/Silo-Server/silo-server/internal/artworkurl"
	"github.com/Silo-Server/silo-server/internal/metadata"
)

const DirectLibraryArtworkParam = "identity"

type directLibraryArtworkResolver interface {
	ResolveFile(ctx context.Context, reference string, identity artworkurl.LibraryIdentity, ifNoneMatch string) (metadata.DirectLibraryArtworkFile, error)
}

type DirectLibraryArtworkHandler struct {
	resolver directLibraryArtworkResolver
	signer   *artworkurl.Signer
}

func NewDirectLibraryArtworkHandler(resolver directLibraryArtworkResolver, signer *artworkurl.Signer) *DirectLibraryArtworkHandler {
	if resolver == nil || signer == nil {
		return nil
	}
	return &DirectLibraryArtworkHandler{resolver: resolver, signer: signer}
}

func (h *DirectLibraryArtworkHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	now := time.Now()
	reference, identity, expiresAt, err := h.signer.VerifyLibraryURL(
		chi.URLParam(r, DirectLibraryArtworkParam),
		r.URL.Query().Get(artworkurl.ExpiresParam),
		r.URL.Query().Get(artworkurl.SignatureParam),
		now,
	)
	if errors.Is(err, artworkurl.ErrExpired) {
		writeError(w, http.StatusUnauthorized, "artwork_url_expired", "Artwork URL expired")
		return
	}
	if err != nil {
		artworkNotFound(w)
		return
	}
	artwork, err := h.resolver.ResolveFile(r.Context(), reference, identity, r.Header.Get("If-None-Match"))
	if err != nil {
		artworkNotFound(w)
		return
	}
	header := w.Header()
	if artwork.MediaType != "" {
		header.Set("Content-Type", artwork.MediaType)
	}
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("Content-Security-Policy", artworkContentSecurityPolicy)
	header.Set("ETag", `"`+artwork.Fingerprint+`"`)
	header.Set("Cache-Control", artworkCacheControl(expiresAt, now))
	if artwork.NotModified {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	defer func() { _ = artwork.File.Close() }()
	http.ServeContent(w, r, "artwork", artwork.ModTime, artwork.File)
}
