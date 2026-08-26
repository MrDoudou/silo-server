package artworkurl

import (
	"context"
	"strings"
	"testing"
	"time"
)

func testLibraryReference(t *testing.T, signer *Signer) string {
	t.Helper()
	reference, err := signer.LibraryReference(LibraryIdentity{
		Surface:     SurfaceItemPosters,
		Keys:        []string{"movie-1"},
		Fingerprint: strings.Repeat("a", 64),
	})
	if err != nil {
		t.Fatalf("LibraryReference: %v", err)
	}
	return reference
}

func TestNewResolverRequiresSigner(t *testing.T) {
	if _, err := NewResolver(nil); err == nil {
		t.Fatal("NewResolver accepted no signer")
	}
}

func TestResolverUsesTargetBoundRoute(t *testing.T) {
	signer := testSigner(t, time.Hour)
	resolver, err := NewResolver(signer)
	if err != nil {
		t.Fatalf("NewResolver: %v", err)
	}
	target := Target{Surface: SurfaceItemPosters, Keys: []string{"movie-1"}, Slot: "poster"}.WithReference(testKey)
	resolved, err := resolver.ResolveTargetURL(context.Background(), target, "w300")
	if err != nil {
		t.Fatalf("ResolveTargetURL: %v", err)
	}
	if !strings.HasPrefix(resolved.URL, RoutePrefix) {
		t.Fatalf("URL = %q, want the resilient API route", resolved.URL)
	}
}

func TestResolveArtworkURLRequiresLibraryReference(t *testing.T) {
	resolver, err := NewResolver(testSigner(t, time.Hour))
	if err != nil {
		t.Fatalf("NewResolver: %v", err)
	}

	for _, reference := range []string{testKey, "/images/collection-templates/x.jpg", "../../etc/passwd", ""} {
		if _, err := resolver.ResolveArtworkURL(context.Background(), reference); err == nil {
			t.Fatalf("ResolveArtworkURL(%q) succeeded, want a library-reference error", reference)
		}
	}
}

func TestResolveArtworkURLsIncludesOnlyLibraryReferences(t *testing.T) {
	signer := testSigner(t, time.Hour)
	resolver, err := NewResolver(signer)
	if err != nil {
		t.Fatalf("NewResolver: %v", err)
	}
	reference := testLibraryReference(t, signer)

	resolved := resolver.ResolveArtworkURLs(context.Background(), []string{
		reference,
		testKey,
		"/images/collection-templates/x.jpg",
	})
	if len(resolved) != 1 {
		t.Fatalf("resolved %d URLs, want 1: %v", len(resolved), resolved)
	}
	if !strings.HasPrefix(resolved[reference].URL, LibraryRoutePrefix) {
		t.Fatalf("resolved URL = %q, want direct-library route", resolved[reference].URL)
	}
}

func TestResolveArtworkURLsOmitsInvalidLibraryReferences(t *testing.T) {
	resolver, err := NewResolver(testSigner(t, time.Hour))
	if err != nil {
		t.Fatalf("NewResolver: %v", err)
	}
	malformed := LibraryReferencePrefix + "not-base64"

	if resolved := resolver.ResolveArtworkURLs(context.Background(), []string{malformed}); len(resolved) != 0 {
		t.Fatalf("resolved = %v, want no entries for an invalid library reference", resolved)
	}
}

func TestNilResolverIsInert(t *testing.T) {
	var resolver *Resolver
	if _, err := resolver.ResolveArtworkURL(context.Background(), testKey); err == nil {
		t.Fatal("nil resolver resolved a URL")
	}
	if resolved := resolver.ResolveArtworkURLs(context.Background(), []string{testKey}); len(resolved) != 0 {
		t.Fatalf("nil resolver resolved %v", resolved)
	}
}
