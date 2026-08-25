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

// A bucket-backed store keeps delivering directly: that is the reason an
// operator chose it, and proxying its bytes through Silo would be a regression.
func TestResolverPrefersDirectDelivery(t *testing.T) {
	direct := &fakeDirectURLs{}
	resolver, err := NewResolver(direct, testSigner(t, time.Hour), func() time.Duration { return 30 * time.Minute })
	if err != nil {
		t.Fatalf("NewResolver: %v", err)
	}

	if !resolver.DirectDelivery() {
		t.Fatal("DirectDelivery = false, want true")
	}
	resolved, err := resolver.ResolveArtworkURL(context.Background(), testKey)
	if err != nil {
		t.Fatalf("ResolveArtworkURL: %v", err)
	}
	if !strings.HasPrefix(resolved.URL, "https://cdn.test/") {
		t.Fatalf("URL = %q, want the backend's own URL", resolved.URL)
	}
	if direct.requestedTTL != 30*time.Minute {
		t.Fatalf("requested TTL = %s, want 30m", direct.requestedTTL)
	}
}

func TestResolverSignsWhenTheBackendHasNoDirectURL(t *testing.T) {
	resolver, err := NewResolver(nil, testSigner(t, time.Hour), nil)
	if err != nil {
		t.Fatalf("NewResolver: %v", err)
	}

	if resolver.DirectDelivery() {
		t.Fatal("DirectDelivery = true, want false")
	}
	resolved, err := resolver.ResolveArtworkURL(context.Background(), testKey)
	if err != nil {
		t.Fatalf("ResolveArtworkURL: %v", err)
	}
	if !strings.HasPrefix(resolved.URL, RoutePrefix) {
		t.Fatalf("URL = %q, want a signed native artwork URL", resolved.URL)
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
