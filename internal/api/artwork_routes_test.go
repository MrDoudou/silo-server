package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Silo-Server/silo-server/internal/artworkstore"
	"github.com/Silo-Server/silo-server/internal/artworkurl"
	"github.com/Silo-Server/silo-server/internal/catalog"
	"github.com/Silo-Server/silo-server/internal/config"
	"github.com/Silo-Server/silo-server/internal/playback"
	"github.com/Silo-Server/silo-server/internal/scanner"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// memorySettings is the durable surface the artwork store pin needs, without a
// database.
type memorySettings struct {
	mu     sync.Mutex
	values map[string]string
}

func (s *memorySettings) Get(_ context.Context, key string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.values[key], nil
}

func (s *memorySettings) SetIfAbsent(_ context.Context, key, value string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.values[key]; ok {
		return false, nil
	}
	if s.values == nil {
		s.values = map[string]string{}
	}
	s.values[key] = value
	return true, nil
}

// The artwork route has to be reachable with no Authorization header at all: a
// browser <img> element cannot attach one, and the signature in the URL is the
// capability that replaces it.
func TestArtworkRouteIsPublicAndSignedWhenArtworkIsStoredLocally(t *testing.T) {
	cfg, err := config.LoadFromDB(map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	settings := &memorySettings{values: map[string]string{}}
	handle, err := artworkstore.Open(t.Context(), artworkstore.Options{
		Backend:   artworkstore.BackendLocal,
		LocalPath: t.TempDir(),
		Settings:  settings,
	})
	if err != nil {
		t.Fatalf("opening the artwork store: %v", err)
	}
	t.Cleanup(func() { _ = handle.Close() })

	const key = "artwork/v1/objects/poster/ab/abcdef0123/original.webp"
	payload := []byte("stored artwork bytes")
	if err := handle.Store.WriteImmutable(t.Context(), key, payload, artworkstore.ObjectMetadata{}); err != nil {
		t.Fatalf("WriteImmutable: %v", err)
	}

	signer, err := artworkurl.NewSigner("cluster-secret", func() time.Duration { return time.Hour })
	if err != nil {
		t.Fatalf("NewSigner: %v", err)
	}
	resolver, err := artworkurl.NewResolver(nil, signer, nil)
	if err != nil {
		t.Fatalf("NewResolver: %v", err)
	}

	router := NewRouter(Dependencies{
		Config:           cfg,
		ArtworkStore:     handle,
		ArtworkURLSigner: signer,
		ArtworkURLs:      resolver,
	})

	signed, err := resolver.ResolveArtworkURL(t.Context(), key)
	if err != nil {
		t.Fatalf("ResolveArtworkURL: %v", err)
	}
	if !strings.HasPrefix(signed.URL, artworkurl.RoutePrefix) {
		t.Fatalf("resolved URL = %q, want a native signed artwork URL", signed.URL)
	}

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, signed.URL, nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %q)", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != string(payload) {
		t.Fatalf("body = %q, want the stored bytes", rec.Body.String())
	}

	head := httptest.NewRecorder()
	router.ServeHTTP(head, httptest.NewRequest(http.MethodHead, signed.URL, nil))
	if head.Code != http.StatusOK {
		t.Fatalf("HEAD status = %d, want 200", head.Code)
	}
}

// The capability probe is a static sibling of the delivery route's key
// parameter. Registering them in that order on one tree is what makes both
// reachable; a shadowed capability route would have clients concluding the
// server is too old to describe its own artwork storage.
func TestArtworkCapabilityAndDeliveryRoutesCoexist(t *testing.T) {
	cfg, err := config.LoadFromDB(map[string]string{"auth.jwt_secret": "Y2x1c3Rlci1zZWNyZXQ="})
	if err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(context.Background(), "postgres://nobody:nobody@127.0.0.1:1/none?sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	settings := &memorySettings{values: map[string]string{}}
	handle, err := artworkstore.Open(t.Context(), artworkstore.Options{
		Backend:   artworkstore.BackendLocal,
		LocalPath: t.TempDir(),
		Settings:  settings,
	})
	if err != nil {
		t.Fatalf("opening the artwork store: %v", err)
	}
	t.Cleanup(func() { _ = handle.Close() })

	signer, err := artworkurl.NewSigner("cluster-secret", func() time.Duration { return time.Hour })
	if err != nil {
		t.Fatalf("NewSigner: %v", err)
	}
	resolver, err := artworkurl.NewResolver(nil, signer, nil)
	if err != nil {
		t.Fatalf("NewResolver: %v", err)
	}

	router := NewRouter(Dependencies{
		DB:               pool,
		Config:           cfg,
		FileRepo:         scanner.NewFileRepository(pool),
		FolderRepo:       catalog.NewFolderRepository(pool),
		SessionMgr:       playback.NewSessionManager(0, 0),
		ArtworkStore:     handle,
		ArtworkURLSigner: signer,
		ArtworkURLs:      resolver,
	})

	registered := map[string]bool{}
	if err := chi.Walk(router, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		registered[method+" "+route] = true
		return nil
	}); err != nil {
		t.Fatalf("walking routes: %v", err)
	}

	for _, want := range []string{
		"GET /api/v1/artwork/capability",
		"GET /api/v1/artwork/{key}",
		"HEAD /api/v1/artwork/{key}",
	} {
		if !registered[want] {
			t.Fatalf("route %q is not registered", want)
		}
	}
}

// A bucket-backed store delivers directly, so the API must not stand up a route
// that proxies its bytes.
func TestArtworkRouteIsAbsentWhenTheBackendDeliversDirectly(t *testing.T) {
	cfg, err := config.LoadFromDB(map[string]string{})
	if err != nil {
		t.Fatal(err)
	}

	signer, err := artworkurl.NewSigner("cluster-secret", func() time.Duration { return time.Hour })
	if err != nil {
		t.Fatalf("NewSigner: %v", err)
	}
	resolver, err := artworkurl.NewResolver(directURLsStub{}, signer, nil)
	if err != nil {
		t.Fatalf("NewResolver: %v", err)
	}

	router := NewRouter(Dependencies{
		Config:           cfg,
		ArtworkStore:     &artworkstore.Handle{Backend: artworkstore.BackendS3},
		ArtworkURLSigner: signer,
		ArtworkURLs:      resolver,
	})

	signed, err := signer.Sign("artwork/v1/objects/poster/ab/abcdef0123/original.webp", time.Now())
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, signed.URL, nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (no artwork route registered)", rec.Code)
	}
}

type directURLsStub struct{}

func (directURLsStub) ReadURL(_ context.Context, key string, _ time.Duration) (artworkstore.ResolvedURL, error) {
	return artworkstore.ResolvedURL{URL: "https://cdn.test/" + key}, nil
}
