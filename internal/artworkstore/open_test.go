package artworkstore

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// fakeSettings is an in-memory server_settings stand-in with the same
// set-if-absent semantics: only the first non-empty write to a key wins.
type fakeSettings struct {
	mu      sync.Mutex
	values  map[string]string
	getErr  error
	setErr  error
	setCall int
}

func newFakeSettings() *fakeSettings {
	return &fakeSettings{values: map[string]string{}}
}

func (s *fakeSettings) Get(_ context.Context, key string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.getErr != nil {
		return "", s.getErr
	}
	return s.values[key], nil
}

func (s *fakeSettings) SetIfAbsent(_ context.Context, key, value string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.setCall++
	if s.setErr != nil {
		return false, s.setErr
	}
	if s.values[key] != "" {
		return false, nil
	}
	s.values[key] = value
	return true, nil
}

func (s *fakeSettings) pin(t *testing.T) Pin {
	t.Helper()
	s.mu.Lock()
	raw := s.values[StorePinSettingKey]
	s.mu.Unlock()
	pin, err := decodePin(raw)
	if err != nil {
		t.Fatalf("decoding the recorded pin: %v", err)
	}
	return pin
}

func openLocal(t *testing.T, root string, settings SettingsStore) *Handle {
	t.Helper()
	handle, err := Open(context.Background(), Options{
		Backend:   BackendAuto,
		LocalPath: root,
		Settings:  settings,
	})
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { _ = handle.Close() })
	return handle
}

func TestOpenRequiresSettings(t *testing.T) {
	if _, err := Open(context.Background(), Options{Backend: BackendLocal, LocalPath: t.TempDir()}); err == nil {
		t.Fatal("Open without a settings store succeeded")
	}
}

// auto selects the local filesystem when no bucket is configured. This is the
// whole point of the change: a deployment with no object storage must work
// without the operator choosing anything.
func TestOpenAutoSelectsLocalWithoutS3(t *testing.T) {
	root := filepath.Join(t.TempDir(), "artwork")
	handle := openLocal(t, root, newFakeSettings())

	if handle.Backend != BackendLocal {
		t.Fatalf("Backend = %q, want %q", handle.Backend, BackendLocal)
	}
	if handle.Generation == "" {
		t.Fatal("no store generation for the filesystem backend")
	}
	if handle.LocalRoot() != root {
		t.Fatalf("LocalRoot = %q, want %q", handle.LocalRoot(), root)
	}
	if _, ok := handle.DirectURL(); ok {
		t.Fatal("the filesystem backend offered a direct URL provider")
	}
}

// An existing S3 installation keeps using its bucket under auto.
func TestOpenAutoSelectsS3WhenConfigured(t *testing.T) {
	handle, err := Open(context.Background(), Options{
		Backend:   BackendAuto,
		LocalPath: t.TempDir(),
		S3:        newFakeS3(),
		Settings:  newFakeSettings(),
	})
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { _ = handle.Close() })

	if handle.Backend != BackendS3 {
		t.Fatalf("Backend = %q, want %q", handle.Backend, BackendS3)
	}
	if handle.Generation != "" {
		t.Fatalf("Generation = %q, want empty for S3 (bucket identity is the reconcile task's)", handle.Generation)
	}
	if _, ok := handle.DirectURL(); !ok {
		t.Fatal("the S3 backend offered no direct URL provider")
	}
	if handle.LocalRoot() != "" {
		t.Fatal("the S3 backend reported a local root")
	}
}

// An operator may keep a bucket for other public assets and still choose local
// artwork.
func TestOpenExplicitLocalIgnoresConfiguredS3(t *testing.T) {
	handle, err := Open(context.Background(), Options{
		Backend:   BackendLocal,
		LocalPath: t.TempDir(),
		S3:        newFakeS3(),
		Settings:  newFakeSettings(),
	})
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { _ = handle.Close() })
	if handle.Backend != BackendLocal {
		t.Fatalf("Backend = %q, want %q", handle.Backend, BackendLocal)
	}
}

func TestOpenExplicitS3WithoutBucketFails(t *testing.T) {
	_, err := Open(context.Background(), Options{
		Backend:   BackendS3,
		LocalPath: t.TempDir(),
		Settings:  newFakeSettings(),
	})
	if err == nil || !strings.Contains(err.Error(), "no public S3 bucket is configured") {
		t.Fatalf("Open = %v, want a configuration error", err)
	}
}

func TestOpenRejectsUnknownBackend(t *testing.T) {
	_, err := Open(context.Background(), Options{
		Backend:   "gcs",
		LocalPath: t.TempDir(),
		Settings:  newFakeSettings(),
	})
	if err == nil || !strings.Contains(err.Error(), "auto, local, s3") {
		t.Fatalf("Open = %v, want an unknown-backend error", err)
	}
}

// An unwritable canonical store is an operational failure, never a reason to
// quietly fall back to another backend or to upstream sources.
func TestOpenFailsOnUnwritableLocalRootWithoutFallingBack(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root ignores directory permissions")
	}
	parent := t.TempDir()
	if err := os.Chmod(parent, 0o500); err != nil {
		t.Fatalf("chmod: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(parent, 0o700) })

	// A configured bucket is deliberately present: selecting local must fail
	// rather than quietly serving artwork from somewhere else.
	_, err := Open(context.Background(), Options{
		Backend:   BackendLocal,
		LocalPath: filepath.Join(parent, "artwork"),
		S3:        newFakeS3(),
		Settings:  newFakeSettings(),
	})
	if err == nil {
		t.Fatal("Open succeeded on an unwritable root")
	}
}

func TestOpenSurfacesSettingsReadFailure(t *testing.T) {
	settings := newFakeSettings()
	settings.getErr = errors.New("settings unavailable")

	_, err := Open(context.Background(), Options{
		Backend:   BackendLocal,
		LocalPath: t.TempDir(),
		Settings:  settings,
	})
	if err == nil || !strings.Contains(err.Error(), "settings unavailable") {
		t.Fatalf("Open = %v, want the settings failure", err)
	}
}

func TestOpenRejectsACorruptPin(t *testing.T) {
	settings := newFakeSettings()
	settings.values[StorePinSettingKey] = `{"version":1,"backend":"tape"}`

	_, err := Open(context.Background(), Options{
		Backend:   BackendLocal,
		LocalPath: t.TempDir(),
		Settings:  settings,
	})
	if err == nil || !strings.Contains(err.Error(), "unknown backend") {
		t.Fatalf("Open = %v, want a rejected pin", err)
	}
}

func TestOpenDoesNotPinBeforeMaterialization(t *testing.T) {
	settings := newFakeSettings()
	openLocal(t, t.TempDir(), settings)

	if pin := settings.pin(t); !pin.IsZero() {
		t.Fatalf("opening the store recorded pin %+v; auto must stay free until something is materialized", pin)
	}
}

func TestFirstWritePinsTheStore(t *testing.T) {
	settings := newFakeSettings()
	handle := openLocal(t, t.TempDir(), settings)
	ctx := context.Background()

	if err := handle.Store.WriteImmutable(ctx, testKey, []byte("bytes"), ObjectMetadata{}); err != nil {
		t.Fatalf("WriteImmutable: %v", err)
	}
	pin := settings.pin(t)
	if pin.Backend != BackendLocal || pin.Generation != handle.Generation {
		t.Fatalf("pin = %+v, want local/%s", pin, handle.Generation)
	}

	// Later writes must not keep hitting the settings store.
	before := settings.setCall
	if err := handle.Store.WriteImmutable(ctx, siblingKey, []byte("more"), ObjectMetadata{}); err != nil {
		t.Fatalf("second WriteImmutable: %v", err)
	}
	if settings.setCall != before {
		t.Fatalf("settings writes = %d, want no further pin attempts after %d", settings.setCall, before)
	}
}

func TestPinFailureFailsTheWrite(t *testing.T) {
	settings := newFakeSettings()
	handle := openLocal(t, t.TempDir(), settings)
	settings.setErr = errors.New("settings unavailable")

	err := handle.Store.WriteImmutable(context.Background(), testKey, []byte("bytes"), ObjectMetadata{})
	if err == nil || !strings.Contains(err.Error(), "settings unavailable") {
		t.Fatalf("WriteImmutable = %v, want the pin failure", err)
	}
}

// The exact scenario invariant 9 exists for: a local store that has been
// materialized into, and object storage configured months later for an
// unrelated feature. auto must not reinterpret live keys against the bucket.
func TestPinnedLocalStoreRefusesToSwitchToS3(t *testing.T) {
	settings := newFakeSettings()
	root := t.TempDir()
	handle := openLocal(t, root, settings)
	if err := handle.Store.WriteImmutable(context.Background(), testKey, []byte("bytes"), ObjectMetadata{}); err != nil {
		t.Fatalf("WriteImmutable: %v", err)
	}
	_ = handle.Close()

	_, err := Open(context.Background(), Options{
		Backend:   BackendAuto,
		LocalPath: root,
		S3:        newFakeS3(),
		Settings:  settings,
	})
	var mismatch *PinMismatchError
	if !errors.As(err, &mismatch) {
		t.Fatalf("Open = %v, want a PinMismatchError", err)
	}
	if !strings.Contains(err.Error(), "Reconcile artwork cache") {
		t.Fatalf("error %q does not name the reconcile workflow", err)
	}
	if !strings.Contains(err.Error(), "artwork.storage_backend=local") {
		t.Fatalf("error %q does not tell the operator how to keep the pinned backend", err)
	}
}

// Pointing a node at a different (or freshly emptied) directory must be caught
// rather than silently reinterpreting live catalog keys against empty storage.
func TestPinnedLocalStoreRefusesADifferentStoreCopy(t *testing.T) {
	settings := newFakeSettings()
	handle := openLocal(t, t.TempDir(), settings)
	if err := handle.Store.WriteImmutable(context.Background(), testKey, []byte("bytes"), ObjectMetadata{}); err != nil {
		t.Fatalf("WriteImmutable: %v", err)
	}
	_ = handle.Close()

	_, err := Open(context.Background(), Options{
		Backend:   BackendLocal,
		LocalPath: t.TempDir(),
		Settings:  settings,
	})
	var mismatch *PinMismatchError
	if !errors.As(err, &mismatch) {
		t.Fatalf("Open = %v, want a PinMismatchError", err)
	}
	if !strings.Contains(err.Error(), "different store copy") {
		t.Fatalf("error %q does not describe a store-copy mismatch", err)
	}
}

// Reopening the same store must succeed and must not re-pin.
func TestReopeningAPinnedStoreSucceeds(t *testing.T) {
	settings := newFakeSettings()
	root := t.TempDir()
	first := openLocal(t, root, settings)
	if err := first.Store.WriteImmutable(context.Background(), testKey, []byte("bytes"), ObjectMetadata{}); err != nil {
		t.Fatalf("WriteImmutable: %v", err)
	}
	generation := first.Generation
	_ = first.Close()

	second := openLocal(t, root, settings)
	if second.Generation != generation {
		t.Fatalf("generation changed across restarts: %q then %q", generation, second.Generation)
	}
	before := settings.setCall
	if err := second.Store.WriteImmutable(context.Background(), siblingKey, []byte("more"), ObjectMetadata{}); err != nil {
		t.Fatalf("WriteImmutable after restart: %v", err)
	}
	if settings.setCall != before {
		t.Fatalf("an already-pinned store attempted %d more pin writes", settings.setCall-before)
	}
}

// Two nodes racing on a fresh install: one wins the pin, and the loser must
// fail loudly instead of materializing into a second divergent store.
func TestConcurrentPinDisagreementFailsTheLoser(t *testing.T) {
	settings := newFakeSettings()
	local := openLocal(t, t.TempDir(), settings)

	remote, err := Open(context.Background(), Options{
		Backend:  BackendS3,
		S3:       newFakeS3(),
		Settings: settings,
	})
	if err != nil {
		t.Fatalf("Open s3: %v", err)
	}
	t.Cleanup(func() { _ = remote.Close() })

	if err := local.Store.WriteImmutable(context.Background(), testKey, []byte("bytes"), ObjectMetadata{}); err != nil {
		t.Fatalf("local WriteImmutable: %v", err)
	}
	err = remote.Store.WriteImmutable(context.Background(), testKey, []byte("bytes"), ObjectMetadata{})
	var mismatch *PinMismatchError
	if !errors.As(err, &mismatch) {
		t.Fatalf("the losing node's write = %v, want a PinMismatchError", err)
	}
}

func TestCheckDetectsASwappedStore(t *testing.T) {
	settings := newFakeSettings()
	root := t.TempDir()
	handle := openLocal(t, root, settings)
	ctx := context.Background()

	if err := handle.Check(ctx); err != nil {
		t.Fatalf("Check on a healthy store: %v", err)
	}

	// Simulate the mount being replaced by a different store copy.
	if err := os.Remove(filepath.Join(root, markerFileName)); err != nil {
		t.Fatalf("removing the marker: %v", err)
	}
	if _, _, err := handle.Local().EnsureMarker(ctx); err != nil {
		t.Fatalf("re-creating the marker: %v", err)
	}
	// Within the cache window the previous healthy verdict is served; readiness
	// probing must not write to the store on every request.
	if err := handle.Check(ctx); err != nil {
		t.Fatalf("Check inside the cache window = %v, want the cached healthy verdict", err)
	}
	handle.expireCheckCacheForTest()
	var mismatch *PinMismatchError
	if err := handle.Check(ctx); !errors.As(err, &mismatch) {
		t.Fatalf("Check = %v, want a PinMismatchError", err)
	}
}

// A bucket outage is a readiness problem, not a configuration error: an
// existing S3 install must keep starting exactly as it does today and report
// the outage through /ready.
func TestOpenDoesNotFailOnAnUnreachableBucket(t *testing.T) {
	client := newFakeS3()
	client.headErr = errors.New("bucket unreachable")

	handle, err := Open(context.Background(), Options{Backend: BackendS3, S3: client, Settings: newFakeSettings()})
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { _ = handle.Close() })
	if err := handle.Check(context.Background()); err == nil {
		t.Fatal("Check succeeded against an unreachable bucket")
	}
}

func TestCheckProbesTheBucket(t *testing.T) {
	client := newFakeS3()
	handle, err := Open(context.Background(), Options{Backend: BackendS3, S3: client, Settings: newFakeSettings()})
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { _ = handle.Close() })

	if err := handle.Check(context.Background()); err != nil {
		t.Fatalf("Check on a healthy bucket: %v", err)
	}
	client.headErr = errors.New("bucket gone")
	handle.expireCheckCacheForTest()
	if err := handle.Check(context.Background()); err == nil {
		t.Fatal("Check succeeded against an unreachable bucket")
	}
}

func TestNilHandleCheckFails(t *testing.T) {
	var handle *Handle
	if err := handle.Check(context.Background()); err == nil {
		t.Fatal("a nil handle reported ready")
	}
	if err := handle.Close(); err != nil {
		t.Fatalf("closing a nil handle: %v", err)
	}
}
