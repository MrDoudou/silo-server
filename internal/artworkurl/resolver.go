package artworkurl

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/Silo-Server/silo-server/internal/artworkkey"
	"github.com/Silo-Server/silo-server/internal/artworkmetrics"
	"github.com/Silo-Server/silo-server/internal/artworkstore"
	"github.com/Silo-Server/silo-server/internal/artworkvariant"
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
	direct   artworkstore.DirectURLProvider
	signer   *Signer
	ttl      func() time.Duration
	policy   func() string
	urlAuth  func() string
	variants *artworkvariant.Selector
}

const (
	DeliveryPolicyResilient = "resilient"
	DeliveryPolicyDirect    = "direct"
)

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
	return &Resolver{direct: direct, signer: signer, ttl: ttl, policy: func() string { return DeliveryPolicyResilient }}, nil
}

// SetDeliveryPolicy wires the hot-reloadable delivery policy. Unknown values
// fail closed to resilient routing rather than bypassing automatic recovery.
func (r *Resolver) SetDeliveryPolicy(policy func() string) {
	if r != nil && policy != nil {
		r.policy = policy
	}
}

func (r *Resolver) SetLocalURLAuth(urlAuth func() string) {
	if r != nil && urlAuth != nil {
		r.urlAuth = urlAuth
	}
}

// SetStore enables manifest-aware direct-policy variant selection. Resilient
// URLs carry the requested variant and perform the same selection in the
// delivery handler; direct URLs must choose the actual stored key while they
// are minted because the client bypasses that handler.
func (r *Resolver) SetStore(store artworkstore.Store) {
	if r != nil {
		r.variants = artworkvariant.New(store)
	}
}

func (r *Resolver) DeliveryPolicy() string {
	if r != nil && r.policy != nil && strings.EqualFold(strings.TrimSpace(r.policy()), DeliveryPolicyDirect) {
		return DeliveryPolicyDirect
	}
	return DeliveryPolicyResilient
}

// DirectDelivery reports whether clients fetch artwork straight from the
// backend instead of through Silo. It describes delivery for capability
// reporting; it never gates whether a URL can be produced.
func (r *Resolver) DirectDelivery() bool {
	return r != nil && r.DeliveryPolicy() == DeliveryPolicyDirect && r.direct != nil
}

// ResolveTargetURL is the target-aware owning API. Resilient mode always
// returns Silo's target capability, including for S3 and source references.
// Direct mode retains backend URLs for stored keys; direct-library references
// remain signed and Silo-served.
func (r *Resolver) ResolveTargetURL(ctx context.Context, target Target, variant string) (artworkstore.ResolvedURL, error) {
	if r == nil {
		return artworkstore.ResolvedURL{}, errors.New("artworkurl: artwork url resolution is not configured")
	}
	if err := target.Validate(); err != nil {
		return artworkstore.ResolvedURL{}, err
	}
	if r.DeliveryPolicy() == DeliveryPolicyResilient || strings.HasPrefix(target.Reference, LibraryReferencePrefix) {
		if r.signer == nil {
			return artworkstore.ResolvedURL{}, errors.New("artworkurl: signer is required for resilient artwork delivery")
		}
		return r.signer.SignTarget(target, variant, time.Now())
	}
	key := artworkkey.Variant(target.Reference, variant)
	if r.variants != nil {
		selected, err := r.variants.Select(ctx, target.Reference, target.Slot, variant)
		if err != nil {
			return artworkstore.ResolvedURL{}, err
		}
		key = selected
	}
	if err := artworkstore.ValidateKey(key); err != nil {
		return artworkstore.ResolvedURL{}, err
	}
	if r.direct == nil {
		if r.urlAuth != nil && strings.EqualFold(strings.TrimSpace(r.urlAuth()), "public") {
			directPath, err := DirectPathFromKey(key)
			if err != nil {
				return artworkstore.ResolvedURL{}, err
			}
			return artworkstore.ResolvedURL{URL: DirectRoutePrefix + directPath}, nil
		}
		return r.signer.SignDirectKey(key, time.Now())
	}
	resolved, err := r.direct.ReadURL(ctx, key, r.directTTL())
	if err == nil {
		artworkmetrics.DirectURLMinted()
	}
	return resolved, err
}

func (r *Resolver) ResolveTargetURLs(ctx context.Context, targets []Target, variant string) map[string]artworkstore.ResolvedURL {
	resolved := make(map[string]artworkstore.ResolvedURL, len(targets))
	for _, target := range targets {
		value, err := r.ResolveTargetURL(ctx, target, variant)
		if err == nil && value.URL != "" {
			resolved[target.CacheKey()] = value
		}
	}
	return resolved
}

func (r *Resolver) ResolveTargetRequests(ctx context.Context, requests []TargetRequest) map[string]artworkstore.ResolvedURL {
	resolved := make(map[string]artworkstore.ResolvedURL, len(requests))
	for _, request := range requests {
		value, err := r.ResolveTargetURL(ctx, request.Target, request.Variant)
		if err == nil && value.URL != "" {
			resolved[request.CacheKey()] = value
		}
	}
	return resolved
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
	if r.DeliveryPolicy() == DeliveryPolicyResilient {
		return artworkstore.ResolvedURL{}, errors.New("artworkurl: resilient delivery requires catalog target context")
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
	if r.urlAuth != nil && strings.EqualFold(strings.TrimSpace(r.urlAuth()), "public") {
		directPath, err := DirectPathFromKey(key)
		if err != nil {
			return artworkstore.ResolvedURL{}, err
		}
		return artworkstore.ResolvedURL{URL: DirectRoutePrefix + directPath}, nil
	}
	return r.signer.SignDirectKey(key, time.Now())
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
