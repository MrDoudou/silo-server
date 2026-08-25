package handlers

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/Silo-Server/silo-server/internal/artworkstore"
	"github.com/Silo-Server/silo-server/internal/artworkurl"
	"github.com/go-chi/chi/v5"
)

// ArtworkKeyParam is the route parameter carrying the base64url-encoded
// logical artwork key.
const ArtworkKeyParam = "key"

// artworkContentSecurityPolicy hardens every artwork response. Stored artwork
// is encoded by the image pipeline, but the store also holds objects that
// arrived from upstream providers and local sidecars, and an SVG served from
// the app origin and navigated to directly would otherwise run scripts in the
// viewer's session. Same policy the branding assets are served with.
const artworkContentSecurityPolicy = "default-src 'none'; style-src 'unsafe-inline'; sandbox"

// artworkFallbackMediaType is served when the store cannot name an object's
// media type. Opaque bytes are safer than a guessed image type, and the CSP and
// nosniff headers above keep them inert.
const artworkFallbackMediaType = "application/octet-stream"

// ArtworkObjectStore is the read side of the canonical artwork store.
// *artworkstore.Handle's Store satisfies it.
type ArtworkObjectStore interface {
	Open(ctx context.Context, key string) (*artworkstore.Object, error)
}

// ArtworkHandler serves canonical artwork through short-lived signed URLs.
//
// The route is public because a browser <img> element cannot attach a bearer
// header. Authorization happened when the surrounding authenticated catalog
// response was built and minted the URL; the signature is the capability that
// carries that decision, exactly as a presigned S3 URL does. The handler
// therefore trusts nothing in the request except a signature it can verify, and
// never interprets the key as a path — it hands the key to the store, which
// resolves it beneath its own root.
type ArtworkHandler struct {
	store  ArtworkObjectStore
	signer *artworkurl.Signer
}

// NewArtworkHandler builds the delivery handler. It returns nil when either
// dependency is missing, which leaves the route unregistered rather than
// standing up an endpoint that can only fail.
func NewArtworkHandler(store ArtworkObjectStore, signer *artworkurl.Signer) *ArtworkHandler {
	if store == nil || signer == nil {
		return nil
	}
	return &ArtworkHandler{store: store, signer: signer}
}

// ServeHTTP answers GET and HEAD on /api/v1/artwork/{key}.
func (h *ArtworkHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h.serve(w, r, chi.URLParam(r, ArtworkKeyParam), r.URL.Query())
}

// ServeArtworkURL serves a signed artwork URL this server minted, in process,
// and reports whether the URL addressed the artwork route at all.
//
// The jellycompat surface runs on its own listener, so redirecting a compat
// client to a root-relative native URL would resolve against the wrong server.
// Serving the bytes here answers proxying and redirecting clients alike, with
// no second hop, and forwards the caller's conditional headers unchanged.
func (h *ArtworkHandler) ServeArtworkURL(w http.ResponseWriter, r *http.Request, artworkURL string) bool {
	parsed, err := url.Parse(artworkURL)
	if err != nil || !strings.HasPrefix(parsed.Path, artworkurl.RoutePrefix) {
		return false
	}
	encodedKey := strings.TrimPrefix(parsed.Path, artworkurl.RoutePrefix)
	if encodedKey == "" || strings.Contains(encodedKey, "/") {
		return false
	}
	h.serve(w, r, encodedKey, parsed.Query())
	return true
}

func (h *ArtworkHandler) serve(w http.ResponseWriter, r *http.Request, encodedKey string, query url.Values) {
	if h == nil || h.store == nil || h.signer == nil {
		artworkNotFound(w)
		return
	}

	now := time.Now()
	key, expiresAt, err := h.signer.Verify(
		encodedKey,
		query.Get(artworkurl.ExpiresParam),
		query.Get(artworkurl.SignatureParam),
		now,
	)
	switch {
	case errors.Is(err, artworkurl.ErrExpired):
		// The capability was ours and has simply run out; the client refetches
		// the catalog response to get a current URL. No store lookup happened,
		// so this still says nothing about which keys exist. No
		// WWW-Authenticate header: a browser must not prompt for credentials
		// over an image.
		writeError(w, http.StatusUnauthorized, "artwork_url_expired", "Artwork URL expired")
		return
	case err != nil:
		// Malformed, unsigned, or forged. Answered identically to an unknown
		// key so a caller cannot probe for stored objects.
		artworkNotFound(w)
		return
	}

	object, err := h.store.Open(r.Context(), key)
	if err != nil {
		if errors.Is(err, artworkstore.ErrNotFound) {
			// A referenced object that is not stored is a clean miss. The
			// artwork reconciler owns repairing or clearing the reference; a
			// delivery request must not rebuild the catalog synchronously.
			slog.DebugContext(r.Context(), "artwork object missing",
				"component", "api", "key", key)
		} else {
			slog.ErrorContext(r.Context(), "artwork delivery failed",
				"component", "api", "key", key, "error", err)
		}
		artworkNotFound(w)
		return
	}
	defer func() { _ = object.Close() }()

	h.writeObject(w, r, object, expiresAt, now)
}

// writeObject emits the object with its immutable identity: a strong entity tag
// derived from the revisioned key, the stored media type and length, and a
// private cache lifetime bounded by the signed URL's own.
func (h *ArtworkHandler) writeObject(
	w http.ResponseWriter,
	r *http.Request,
	object *artworkstore.Object,
	expiresAt time.Time,
	now time.Time,
) {
	info := object.Info
	mediaType := info.MediaType
	if mediaType == "" {
		mediaType = artworkFallbackMediaType
	}

	header := w.Header()
	header.Set("Content-Type", mediaType)
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("Content-Security-Policy", artworkContentSecurityPolicy)
	if info.ETag != "" {
		header.Set("ETag", info.ETag)
	}
	// Private, never public: an unguessable key is not a reason to let shared
	// caches keep bytes a viewer was authorized for. Public/CDN caching belongs
	// to backends the operator explicitly selected for direct delivery.
	header.Set("Cache-Control", artworkCacheControl(expiresAt, now))

	// A seekable body (the filesystem store) gets the standard serving
	// primitives: conditional requests, ranges, and HEAD handled for free.
	if seeker, ok := object.ReadSeeker(); ok {
		http.ServeContent(w, r, info.Key, info.ModTime, seeker)
		return
	}

	// A streaming backend answers the parts that do not need seeking.
	if artworkETagMatches(r.Header.Get("If-None-Match"), info.ETag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	if info.SizeBytes > 0 {
		header.Set("Content-Length", strconv.FormatInt(info.SizeBytes, 10))
	}
	if r.Method == http.MethodHead {
		w.WriteHeader(http.StatusOK)
		return
	}
	w.WriteHeader(http.StatusOK)
	if _, err := io.Copy(w, object.Body); err != nil {
		slog.DebugContext(r.Context(), "artwork response interrupted",
			"component", "api", "key", info.Key, "error", err)
	}
}

// artworkNotFound is the single negative response. Every rejection reason —
// unsigned, forged, unknown key, missing object, unreadable store — produces
// the same body and status so the route cannot be used to enumerate storage.
func artworkNotFound(w http.ResponseWriter) {
	writeError(w, http.StatusNotFound, "not_found", "Artwork not found")
}

// artworkCacheControl bounds client caching by the signed lifetime: a client
// must never hold bytes under a URL it can no longer fetch.
func artworkCacheControl(expiresAt, now time.Time) string {
	maxAge := int64(expiresAt.Sub(now) / time.Second)
	if maxAge < 0 {
		maxAge = 0
	}
	return "private, max-age=" + strconv.FormatInt(maxAge, 10) + ", immutable"
}

// artworkETagMatches evaluates If-None-Match against a strong entity tag.
// Stored objects are immutable, so a weak comparison is sufficient and a
// received weak tag still matches.
func artworkETagMatches(ifNoneMatch, etag string) bool {
	if etag == "" || ifNoneMatch == "" {
		return false
	}
	for _, candidate := range strings.Split(ifNoneMatch, ",") {
		candidate = strings.TrimSpace(candidate)
		if candidate == "*" || candidate == etag || strings.TrimPrefix(candidate, "W/") == etag {
			return true
		}
	}
	return false
}
