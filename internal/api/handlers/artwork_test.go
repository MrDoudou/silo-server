package handlers

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/Silo-Server/silo-server/internal/artworkstore"
	"github.com/Silo-Server/silo-server/internal/artworkurl"
	"github.com/go-chi/chi/v5"
)

const (
	artworkTestSecret = "cluster-authentication-secret"
	artworkTestKey    = "artwork/v1/objects/poster/ab/abcdef0123/original.webp"
	artworkTestTTL    = time.Hour
)

var artworkTestBytes = []byte("not really webp, but immutable bytes")

// newArtworkTestRig stands up the real filesystem store behind the real route,
// so the assertions below cover key validation, media typing, and entity tags
// exactly as production does.
func newArtworkTestRig(t *testing.T) (http.Handler, *ArtworkHandler, *artworkurl.Signer) {
	t.Helper()

	store, err := artworkstore.NewFilesystemStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewFilesystemStore: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	if err := store.Probe(t.Context()); err != nil {
		t.Fatalf("Probe: %v", err)
	}
	if err := store.WriteImmutable(t.Context(), artworkTestKey, artworkTestBytes, artworkstore.ObjectMetadata{}); err != nil {
		t.Fatalf("WriteImmutable: %v", err)
	}

	signer, err := artworkurl.NewSigner(artworkTestSecret, func() time.Duration { return artworkTestTTL })
	if err != nil {
		t.Fatalf("NewSigner: %v", err)
	}

	handler := NewArtworkHandler(store, signer)
	if handler == nil {
		t.Fatal("NewArtworkHandler returned nil")
	}

	router := chi.NewRouter()
	router.Get("/api/v1/artwork/{"+ArtworkKeyParam+"}", handler.ServeHTTP)
	router.Head("/api/v1/artwork/{"+ArtworkKeyParam+"}", handler.ServeHTTP)
	return router, handler, signer
}

func signArtworkURL(t *testing.T, signer *artworkurl.Signer, key string, at time.Time) string {
	t.Helper()
	signed, err := signer.Sign(key, at)
	if err != nil {
		t.Fatalf("Sign(%q): %v", key, err)
	}
	return signed.URL
}

func TestArtworkHandlerServesSignedObject(t *testing.T) {
	router, _, signer := newArtworkTestRig(t)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, signArtworkURL(t, signer, artworkTestKey, time.Now()), nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %q)", rec.Code, rec.Body.String())
	}
	if got := rec.Body.String(); got != string(artworkTestBytes) {
		t.Fatalf("body = %q, want the stored bytes", got)
	}
	if got := rec.Header().Get("Content-Type"); got != "image/webp" {
		t.Fatalf("Content-Type = %q, want image/webp", got)
	}
	if got := rec.Header().Get("Content-Length"); got != strconv.Itoa(len(artworkTestBytes)) {
		t.Fatalf("Content-Length = %q, want %d", got, len(artworkTestBytes))
	}
	etag := rec.Header().Get("ETag")
	if !strings.HasPrefix(etag, `"`) || !strings.HasSuffix(etag, `"`) {
		t.Fatalf("ETag = %q, want a quoted strong entity tag", etag)
	}
	if got := rec.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("X-Content-Type-Options = %q, want nosniff", got)
	}

	// Private and bounded by the signed lifetime: a client must not hold bytes
	// under a URL it can no longer fetch, and no shared cache may keep them.
	cacheControl := rec.Header().Get("Cache-Control")
	if !strings.HasPrefix(cacheControl, "private, max-age=") {
		t.Fatalf("Cache-Control = %q, want a private bounded lifetime", cacheControl)
	}
	maxAge, err := strconv.Atoi(strings.TrimSuffix(strings.TrimPrefix(cacheControl, "private, max-age="), ", immutable"))
	if err != nil {
		t.Fatalf("parsing max-age from %q: %v", cacheControl, err)
	}
	if maxAge <= 0 || time.Duration(maxAge)*time.Second > 2*artworkTestTTL {
		t.Fatalf("max-age = %ds, want a positive value within the signed lifetime", maxAge)
	}
}

func TestArtworkHandlerHonorsHeadAndConditionalRequests(t *testing.T) {
	router, _, signer := newArtworkTestRig(t)
	signedURL := signArtworkURL(t, signer, artworkTestKey, time.Now())

	head := httptest.NewRecorder()
	router.ServeHTTP(head, httptest.NewRequest(http.MethodHead, signedURL, nil))
	if head.Code != http.StatusOK {
		t.Fatalf("HEAD status = %d, want 200", head.Code)
	}
	if head.Body.Len() != 0 {
		t.Fatalf("HEAD body = %q, want empty", head.Body.String())
	}
	if got := head.Header().Get("Content-Length"); got != strconv.Itoa(len(artworkTestBytes)) {
		t.Fatalf("HEAD Content-Length = %q, want %d", got, len(artworkTestBytes))
	}

	etag := head.Header().Get("ETag")
	conditional := httptest.NewRequest(http.MethodGet, signedURL, nil)
	conditional.Header.Set("If-None-Match", etag)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, conditional)
	if rec.Code != http.StatusNotModified {
		t.Fatalf("conditional GET status = %d, want 304", rec.Code)
	}
	if rec.Body.Len() != 0 {
		t.Fatalf("304 body = %q, want empty", rec.Body.String())
	}
}

// Ranges are not required by the delivery contract, but a seekable store gets
// them from the standard serving primitives, and a client that asks for one
// must not receive the whole object with a 200.
func TestArtworkHandlerServesRangesFromASeekableStore(t *testing.T) {
	router, _, signer := newArtworkTestRig(t)

	req := httptest.NewRequest(http.MethodGet, signArtworkURL(t, signer, artworkTestKey, time.Now()), nil)
	req.Header.Set("Range", "bytes=0-3")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusPartialContent {
		t.Fatalf("status = %d, want 206", rec.Code)
	}
	if got, want := rec.Body.String(), string(artworkTestBytes[:4]); got != want {
		t.Fatalf("body = %q, want %q", got, want)
	}
}

// Every rejection has to look the same, or the route becomes a way to ask
// which artwork a server holds.
func TestArtworkHandlerHidesKeyExistence(t *testing.T) {
	router, _, signer := newArtworkTestRig(t)

	valid := signArtworkURL(t, signer, artworkTestKey, time.Now())
	unstoredKey := signArtworkURL(t, signer, "artwork/v1/objects/poster/cd/cdef456789/original.webp", time.Now())
	encodedTraversal := base64.RawURLEncoding.EncodeToString([]byte("../../etc/passwd"))

	cases := []struct {
		name string
		url  string
	}{
		{"unsigned", artworkurl.RoutePrefix + base64.RawURLEncoding.EncodeToString([]byte(artworkTestKey))},
		{"forged signature", strings.Replace(valid, "&signature=", "&signature=AAAA", 1)},
		{"missing expiry", strings.SplitN(valid, "?", 2)[0] + "?signature=AAAA"},
		{"escaping key", artworkurl.RoutePrefix + encodedTraversal + "?expires=99999999999&signature=AAAA"},
		{"valid signature, unstored object", unstoredKey},
	}

	var bodies []string
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, tc.url, nil))
			if rec.Code != http.StatusNotFound {
				t.Fatalf("status = %d, want 404 (body %q)", rec.Code, rec.Body.String())
			}
			bodies = append(bodies, rec.Body.String())
		})
	}
	for _, body := range bodies {
		if body != bodies[0] {
			t.Fatalf("rejection bodies differ: %q vs %q", body, bodies[0])
		}
	}
}

func TestArtworkHandlerRejectsExpiredURL(t *testing.T) {
	router, _, signer := newArtworkTestRig(t)

	// Signed three windows ago, so the quantized expiry is already behind us.
	expired := signArtworkURL(t, signer, artworkTestKey, time.Now().Add(-3*artworkTestTTL))

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, expired, nil))

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	// A browser must not be prompted for credentials over an <img> request.
	if got := rec.Header().Get("WWW-Authenticate"); got != "" {
		t.Fatalf("WWW-Authenticate = %q, want none", got)
	}
}

func TestArtworkHandlerRejectsForeignSecret(t *testing.T) {
	router, _, _ := newArtworkTestRig(t)

	foreign, err := artworkurl.NewSigner("a different cluster secret", func() time.Duration { return artworkTestTTL })
	if err != nil {
		t.Fatalf("NewSigner: %v", err)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, signArtworkURL(t, foreign, artworkTestKey, time.Now()), nil))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

// The compat surface listens on its own port and cannot redirect a client to a
// root-relative native URL, so it serves those bytes through this entry point.
func TestServeArtworkURLServesOnlyArtworkRouteURLs(t *testing.T) {
	_, handler, signer := newArtworkTestRig(t)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/Items/abc/Images/Primary", nil)
	if handler.ServeArtworkURL(rec, req, "https://cdn.example/poster.webp") {
		t.Fatal("ServeArtworkURL claimed a remote provider URL")
	}
	if rec.Body.Len() != 0 {
		t.Fatalf("wrote %q for a URL it does not own", rec.Body.String())
	}

	rec = httptest.NewRecorder()
	if !handler.ServeArtworkURL(rec, req, signArtworkURL(t, signer, artworkTestKey, time.Now())) {
		t.Fatal("ServeArtworkURL declined a signed artwork URL")
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %q)", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != string(artworkTestBytes) {
		t.Fatalf("body = %q, want the stored bytes", rec.Body.String())
	}
}

func TestArtworkCapabilityReportsDeliveryFacts(t *testing.T) {
	handler := NewArtworkCapabilityHandler("local", false, func() string { return "selected" })

	rec := httptest.NewRecorder()
	handler.HandleCapability(rec, httptest.NewRequest(http.MethodGet, "/api/v1/artwork/capability", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	body, err := io.ReadAll(rec.Body)
	if err != nil {
		t.Fatalf("reading body: %v", err)
	}
	var got artworkCapabilityResponse
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("decoding %q: %v", body, err)
	}

	if got.StorageBackend != "local" {
		t.Fatalf("storage_backend = %q, want local", got.StorageBackend)
	}
	if got.StorageFormat != "artwork/v1" {
		t.Fatalf("storage_format = %q, want artwork/v1", got.StorageFormat)
	}
	if len(got.DeliveryModes) != 1 || got.DeliveryModes[0] != artworkDeliveryAPI {
		t.Fatalf("delivery_modes = %v, want [%s]", got.DeliveryModes, artworkDeliveryAPI)
	}
	if got.RemoteMaterialization != "selected" {
		t.Fatalf("remote_materialization = %q, want selected", got.RemoteMaterialization)
	}
	if want := []string{"original", "w500", "w300"}; !equalStrings(got.Variants["poster"], want) {
		t.Fatalf("poster variants = %v, want %v", got.Variants["poster"], want)
	}
	if want := []string{"original", "w1920", "w1280", "w300"}; !equalStrings(got.Variants["backdrop"], want) {
		t.Fatalf("backdrop variants = %v, want %v", got.Variants["backdrop"], want)
	}

	// A bucket-backed store keeps delivering directly; the capability has to
	// say so, because that is the difference clients and operators observe.
	direct := NewArtworkCapabilityHandler("s3", true, nil)
	rec = httptest.NewRecorder()
	direct.HandleCapability(rec, httptest.NewRequest(http.MethodGet, "/api/v1/artwork/capability", nil))
	var directResponse artworkCapabilityResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &directResponse); err != nil {
		t.Fatalf("decoding %q: %v", rec.Body.String(), err)
	}
	if len(directResponse.DeliveryModes) != 1 || directResponse.DeliveryModes[0] != artworkDeliveryDirect {
		t.Fatalf("delivery_modes = %v, want [%s]", directResponse.DeliveryModes, artworkDeliveryDirect)
	}
}

func equalStrings(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}
