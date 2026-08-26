package artworkurl

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/Silo-Server/silo-server/internal/artworkmetrics"
	"github.com/Silo-Server/silo-server/internal/artworkstore"
)

// Resolver turns a logical artwork key into a URL a client can fetch, hiding
// which backend holds the object.
//
// A backend that mints its own read URLs (S3 presigned, public, or CDN token)
// keeps doing so: direct delivery is the reason an operator chose it, and the
// bytes never touch Silo. Every other backend is delivered through the signed
// native artwork route.
//
// This is the single place that decision is made. Delivery surfaces — the
// catalog image resolver, jellycompat, admin responses — ask for a URL and get
// one that works, rather than each testing for a configured bucket.
type Resolver struct {
	direct artworkstore.DirectURLProvider
	signer *Signer
	ttl    func() time.Duration
}

// NewResolver builds a resolver over the active store. direct is the backend's
// own URL minter when it has one (see artworkstore.Handle.DirectURL) and nil
// otherwise; signer delivers everything else through the native route. ttl
// reads the configured artwork URL lifetime and may be nil.
//
// At least one of direct and signer must be usable, otherwise stored artwork
// would resolve to nothing at all.
func NewResolver(direct artworkstore.DirectURLProvider, signer *Signer, ttl func() time.Duration) (*Resolver, error) {
	if direct == nil && signer == nil {
		return nil, errors.New("artworkurl: a direct url provider or a signer is required to resolve artwork urls")
	}
	return &Resolver{direct: direct, signer: signer, ttl: ttl}, nil
}

// DirectDelivery reports whether clients fetch artwork straight from the
// backend instead of through Silo. It describes delivery for capability
// reporting; it never gates whether a URL can be produced.
func (r *Resolver) DirectDelivery() bool {
	return r != nil && r.direct != nil
}

// ResolveArtworkURL returns a fetchable URL for one logical artwork key.
func (r *Resolver) ResolveArtworkURL(ctx context.Context, key string) (artworkstore.ResolvedURL, error) {
	if r == nil {
		return artworkstore.ResolvedURL{}, errors.New("artworkurl: artwork url resolution is not configured")
	}
	if strings.HasPrefix(key, LibraryReferencePrefix) {
		if r.signer == nil {
			return artworkstore.ResolvedURL{}, errors.New("artworkurl: signer is required for direct-library artwork")
		}
		return r.signer.SignLibraryReference(key, time.Now())
	}
	if err := artworkstore.ValidateKey(key); err != nil {
		return artworkstore.ResolvedURL{}, err
	}
	if r.direct != nil {
		resolved, err := r.direct.ReadURL(ctx, key, r.directTTL())
		if err == nil {
			artworkmetrics.DirectURLMinted()
		}
		return resolved, err
	}
	return r.signer.Sign(key, time.Now())
}

// ResolveArtworkURLs resolves a batch of logical keys. Keys that cannot be
// resolved are absent from the result rather than mapped to an empty URL, so a
// caller never publishes a broken reference; the reason is logged once per key.
func (r *Resolver) ResolveArtworkURLs(ctx context.Context, keys []string) map[string]artworkstore.ResolvedURL {
	resolved := make(map[string]artworkstore.ResolvedURL, len(keys))
	if r == nil {
		return resolved
	}
	for _, key := range keys {
		url, err := r.ResolveArtworkURL(ctx, key)
		if err != nil {
			if errors.Is(err, artworkstore.ErrInvalidKey) {
				// Not every stored image reference is a store key: bundled
				// asset paths and legacy values reach here too. They are not
				// an operational problem, only unresolvable.
				slog.DebugContext(ctx, "skipping unresolvable artwork reference",
					"component", "artwork", "key", key, "error", err)
				continue
			}
			slog.ErrorContext(ctx, "artwork url resolution failed",
				"component", "artwork", "key", key, "error", err)
			continue
		}
		if url.URL == "" {
			continue
		}
		resolved[key] = url
	}
	return resolved
}

// directTTL is the lifetime requested from a direct-URL backend. The backend
// may shorten it (a CDN token TTL, for example) and reports the result.
func (r *Resolver) directTTL() time.Duration {
	if r == nil {
		return DefaultTTL
	}
	return clampTTL(r.ttl)
}
