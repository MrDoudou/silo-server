package artworkurl

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/Silo-Server/silo-server/internal/artworkstore"
)

// fakeDirectURLs stands in for a bucket-backed store that mints its own read
// URLs.
type fakeDirectURLs struct {
	requestedTTL time.Duration
	calls        int
	err          error
}

func (f *fakeDirectURLs) ReadURL(_ context.Context, key string, ttl time.Duration) (artworkstore.ResolvedURL, error) {
	f.calls++
	f.requestedTTL = ttl
	if f.err != nil {
		return artworkstore.ResolvedURL{}, f.err
	}
	expiresAt := time.Now().Add(ttl)
	return artworkstore.ResolvedURL{URL: "https://cdn.test/" + key, ExpiresAt: &expiresAt}, nil
}

func TestNewResolverRequiresADeliveryPath(t *testing.T) {
	if _, err := NewResolver(nil, nil, nil); err == nil {
		t.Fatal("NewResolver accepted a store with no way to deliver artwork")
	}
}

func TestResolverDefaultsToTargetBoundResilientDeliveryForS3(t *testing.T) {
	direct := &fakeDirectURLs{}
	resolver, err := NewResolver(direct, testSigner(t, time.Hour), func() time.Duration { return 30 * time.Minute })
	if err != nil {
		t.Fatalf("NewResolver: %v", err)
	}

	if resolver.DirectDelivery() {
		t.Fatal("DirectDelivery = true under resilient policy")
	}
	target := Target{Surface: SurfaceItemPosters, Keys: []string{"movie-1"}, Slot: "poster"}.WithReference(testKey)
	resolved, err := resolver.ResolveTargetURL(context.Background(), target, "w300")
	if err != nil {
		t.Fatalf("ResolveTargetURL: %v", err)
	}
	if !strings.HasPrefix(resolved.URL, RoutePrefix) {
		t.Fatalf("URL = %q, want the resilient API route", resolved.URL)
	}
	if direct.calls != 0 {
		t.Fatalf("direct backend calls = %d, want zero", direct.calls)
	}
}

func TestResolverDirectPolicyUsesBackendURL(t *testing.T) {
	direct := &fakeDirectURLs{}
	resolver, err := NewResolver(direct, testSigner(t, time.Hour), func() time.Duration { return 30 * time.Minute })
	if err != nil {
		t.Fatalf("NewResolver: %v", err)
	}
	resolver.SetDeliveryPolicy(func() string { return DeliveryPolicyDirect })
	target := Target{Surface: SurfaceItemPosters, Keys: []string{"movie-1"}, Slot: "poster"}.WithReference(testKey)
	resolved, err := resolver.ResolveTargetURL(context.Background(), target, "w300")
	if err != nil {
		t.Fatalf("ResolveTargetURL: %v", err)
	}
	if !strings.HasPrefix(resolved.URL, "https://cdn.test/") || direct.requestedTTL != 30*time.Minute {
		t.Fatalf("resolved = %#v, ttl %s", resolved, direct.requestedTTL)
	}
}

func TestResolverDirectPolicySignsRawKeyWhenBackendHasNoDirectURL(t *testing.T) {
	resolver, err := NewResolver(nil, testSigner(t, time.Hour), nil)
	if err != nil {
		t.Fatalf("NewResolver: %v", err)
	}

	resolver.SetDeliveryPolicy(func() string { return DeliveryPolicyDirect })
	if resolver.DirectDelivery() {
		t.Fatal("DirectDelivery = true, want false")
	}
	resolved, err := resolver.ResolveArtworkURL(context.Background(), testKey)
	if err != nil {
		t.Fatalf("ResolveArtworkURL: %v", err)
	}
	directPath, err := DirectPathFromKey(testKey)
	if err != nil {
		t.Fatalf("DirectPathFromKey: %v", err)
	}
	if !strings.HasPrefix(resolved.URL, DirectRoutePrefix+directPath) {
		t.Fatalf("URL = %q, want a signed raw-key artwork URL", resolved.URL)
	}
	if resolved.ExpiresAt == nil {
		t.Fatal("signed URL reports no expiry; the resolver cache would never store it")
	}
}

func TestResolveArtworkURLRejectsNonKeys(t *testing.T) {
	resolver, err := NewResolver(nil, testSigner(t, time.Hour), nil)
	if err != nil {
		t.Fatalf("NewResolver: %v", err)
	}
	resolver.SetDeliveryPolicy(func() string { return DeliveryPolicyDirect })

	// Bundled asset paths and other non-key references reach this resolver
	// too; none of them may become a signed URL.
	for _, ref := range []string{"/images/collection-templates/x.jpg", "../../etc/passwd", ""} {
		if _, err := resolver.ResolveArtworkURL(context.Background(), ref); !errors.Is(err, artworkstore.ErrInvalidKey) {
			t.Fatalf("ResolveArtworkURL(%q) error = %v, want ErrInvalidKey", ref, err)
		}
	}
}

func TestResolveArtworkURLsOmitsFailures(t *testing.T) {
	resolver, err := NewResolver(nil, testSigner(t, time.Hour), nil)
	if err != nil {
		t.Fatalf("NewResolver: %v", err)
	}
	resolver.SetDeliveryPolicy(func() string { return DeliveryPolicyDirect })

	resolved := resolver.ResolveArtworkURLs(context.Background(), []string{
		testKey,
		"/images/collection-templates/x.jpg",
	})
	if len(resolved) != 1 {
		t.Fatalf("resolved %d URLs, want 1: %v", len(resolved), resolved)
	}
	if _, ok := resolved[testKey]; !ok {
		t.Fatalf("resolved map missing %q", testKey)
	}
}

func TestResolveArtworkURLsSkipsBackendErrors(t *testing.T) {
	direct := &fakeDirectURLs{err: errors.New("bucket unreachable")}
	resolver, err := NewResolver(direct, nil, nil)
	if err != nil {
		t.Fatalf("NewResolver: %v", err)
	}
	resolver.SetDeliveryPolicy(func() string { return DeliveryPolicyDirect })

	if resolved := resolver.ResolveArtworkURLs(context.Background(), []string{testKey}); len(resolved) != 0 {
		t.Fatalf("resolved = %v, want no entries when the backend fails", resolved)
	}
}

func TestNilResolverIsInert(t *testing.T) {
	var resolver *Resolver
	if resolver.DirectDelivery() {
		t.Fatal("nil resolver reported direct delivery")
	}
	if _, err := resolver.ResolveArtworkURL(context.Background(), testKey); err == nil {
		t.Fatal("nil resolver resolved a URL")
	}
	if resolved := resolver.ResolveArtworkURLs(context.Background(), []string{testKey}); len(resolved) != 0 {
		t.Fatalf("nil resolver resolved %v", resolved)
	}
}
