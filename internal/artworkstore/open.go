package artworkstore

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"
)

// Options selects and configures the canonical artwork store.
type Options struct {
	// Backend is the administrator's artwork.storage_backend value:
	// BackendAuto, BackendLocal, or BackendS3.
	Backend string

	// LocalPath is the filesystem store root. Required whenever the
	// filesystem backend can be selected.
	LocalPath string

	// S3 is the configured public bucket client, or nil when the deployment
	// has none. Its presence is what BackendAuto resolves on.
	S3 S3Client

	// Settings is the durable store holding the backend pin. Required: an
	// unpinnable store would let a later configuration change silently
	// reinterpret live catalog keys against different storage.
	Settings SettingsStore
}

// Handle is an opened, probed, and pin-verified canonical artwork store.
type Handle struct {
	// Store is what the pipeline and lifecycle code write through. It is the
	// selected backend wrapped so the first successful materialization
	// records the pin.
	Store Store

	// Backend is what Options.Backend resolved to: BackendLocal or BackendS3.
	Backend string

	// Generation identifies the physical store copy, or is empty for
	// backends that do not have one. See Pin.
	Generation string

	local *FilesystemStore
	s3    *S3Store

	// checkMu serializes readiness probes and guards the cached verdict below.
	// /ready is public and unrate-limited, and a filesystem probe is a real
	// write plus fsync on the canonical store, so uncached probing would let an
	// anonymous request loop turn health checking into an I/O amplification
	// attack on the artwork volume.
	checkMu   sync.Mutex
	checkedAt time.Time
	checkErr  error
}

// checkCacheTTL bounds how often Check re-probes the backing store. Readiness
// consumers tolerate staleness of this order; a swapped mount or unwritable
// root still surfaces within seconds.
const checkCacheTTL = 10 * time.Second

// Open selects the artwork backend, proves it is usable, and verifies it
// against the recorded pin.
//
// Every failure here is fatal by design: falling back to another backend would
// either serve missing artwork from an empty store or start a second divergent
// copy of every image. What counts as a failure is scoped to configuration,
// though — an unwritable local root and a store that disagrees with the pin
// both stop startup, while a bucket that is merely unreachable right now is
// left to readiness (see Check) so a transient outage cannot crash-loop a
// correctly configured server.
func Open(ctx context.Context, opts Options) (*Handle, error) {
	if opts.Settings == nil {
		return nil, errors.New("artworkstore: a settings store is required to open artwork storage")
	}

	recorded, err := ReadPin(ctx, opts.Settings)
	if err != nil {
		return nil, err
	}

	backend, err := resolveBackend(opts.Backend, opts.S3 != nil)
	if err != nil {
		return nil, err
	}

	handle := &Handle{Backend: backend}
	switch backend {
	case BackendS3:
		store, err := NewS3Store(opts.S3)
		if err != nil {
			return nil, err
		}
		// The bucket is deliberately not probed here. Its reachability is a
		// readiness concern — a transient outage must degrade /ready, exactly
		// as it does today, not crash-loop a server whose configuration is
		// perfectly correct. Handle.Check does the probe.
		handle.s3 = store
		handle.Store = store

	case BackendLocal:
		store, err := NewFilesystemStore(opts.LocalPath)
		if err != nil {
			return nil, err
		}
		if err := store.Probe(ctx); err != nil {
			_ = store.Close()
			return nil, err
		}
		marker, _, err := store.EnsureMarker(ctx)
		if err != nil {
			_ = store.Close()
			return nil, err
		}
		handle.local = store
		handle.Store = store
		handle.Generation = marker.ID
	}

	resolved := Pin{Backend: handle.Backend, Generation: handle.Generation}
	if err := VerifyPin(recorded, resolved); err != nil {
		_ = handle.Close()
		return nil, err
	}

	handle.Store = observeStore(newPinningStore(handle.Store, resolved, opts.Settings, !recorded.IsZero()), handle.Backend)
	return handle, nil
}

// resolveBackend applies the selection rule. "auto" prefers a configured public
// bucket, because an existing S3 install must keep using it, and otherwise
// selects the local filesystem so a deployment without object storage works
// with no choice to make.
//
// Note that auto is only *allowed* to resolve freely; Open still verifies the
// result against the pin, so an install that materialized against the local
// store does not switch to S3 merely because a bucket was later configured for
// subtitles or branding.
func resolveBackend(configured string, s3Configured bool) (string, error) {
	switch configured {
	case "", BackendAuto:
		if s3Configured {
			return BackendS3, nil
		}
		return BackendLocal, nil
	case BackendLocal:
		return BackendLocal, nil
	case BackendS3:
		if !s3Configured {
			return "", errors.New(
				"artwork.storage_backend=s3 but no public S3 bucket is configured; " +
					"configure the public bucket or set artwork.storage_backend=local")
		}
		return BackendS3, nil
	default:
		return "", fmt.Errorf("artwork.storage_backend %q is not one of auto, local, s3", configured)
	}
}

// Local returns the filesystem store, or nil when another backend is selected.
// It exists for operations that only the filesystem backend has — temp-file
// sweeps, root reporting, marker checks.
func (h *Handle) Local() *FilesystemStore {
	if h == nil {
		return nil
	}
	return h.local
}

// LocalRoot returns the filesystem store root, or "" for other backends. It is
// deployment configuration for admin status and log lines, never a client URL.
func (h *Handle) LocalRoot() string {
	if h == nil || h.local == nil {
		return ""
	}
	return h.local.Root()
}

// DirectURL returns the backend's direct-URL minter when it has one. S3 does;
// the filesystem store deliberately does not, and its objects are delivered
// through the signed native artwork route instead.
func (h *Handle) DirectURL() (DirectURLProvider, bool) {
	if h == nil || h.s3 == nil {
		return nil, false
	}
	return h.s3, true
}

// Check re-verifies the store for a readiness probe: the backend is reachable
// and writable, and — on the filesystem — the marker under the configured root
// still identifies the same physical store this process opened. A swapped or
// re-created mount is reported rather than served from.
//
// Verdicts are cached for checkCacheTTL so a hot health-check loop performs a
// bounded number of real store operations. A probe cut short by the caller's
// own context is not a store verdict and is never cached.
func (h *Handle) Check(ctx context.Context) error {
	if h == nil {
		return errors.New("artworkstore: artwork storage is not configured")
	}
	h.checkMu.Lock()
	defer h.checkMu.Unlock()
	if !h.checkedAt.IsZero() && time.Since(h.checkedAt) < checkCacheTTL {
		return h.checkErr
	}
	err := h.check(ctx)
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return err
	}
	h.checkErr = err
	h.checkedAt = time.Now()
	return err
}

// expireCheckCacheForTest discards the cached readiness verdict so tests can
// observe a fresh probe without waiting out checkCacheTTL.
func (h *Handle) expireCheckCacheForTest() {
	h.checkMu.Lock()
	defer h.checkMu.Unlock()
	h.checkedAt = time.Time{}
	h.checkErr = nil
}

func (h *Handle) check(ctx context.Context) error {
	if h.local != nil {
		if err := h.local.Probe(ctx); err != nil {
			return err
		}
		marker, err := h.local.ReadMarker(ctx)
		if err != nil {
			return err
		}
		if marker.ID != h.Generation {
			return &PinMismatchError{
				Recorded: Pin{Backend: h.Backend, Generation: h.Generation},
				Resolved: Pin{Backend: h.Backend, Generation: marker.ID},
			}
		}
		return nil
	}
	if h.s3 != nil {
		return h.s3.Probe(ctx)
	}
	return errors.New("artworkstore: artwork storage is not configured")
}

// Close releases backend resources.
func (h *Handle) Close() error {
	if h == nil || h.local == nil {
		return nil
	}
	return h.local.Close()
}
