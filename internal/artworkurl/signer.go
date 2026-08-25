// Package artworkurl mints and verifies the short-lived signed URLs that
// deliver locally stored artwork, and resolves a logical artwork key to
// whatever URL its backend serves it through.
//
// Artwork held in an S3 bucket is fetched directly by the client from a
// presigned, public, or CDN-token URL. Artwork held on the filesystem has no
// such URL, so it is delivered by Silo itself through
//
//	GET /api/v1/artwork/{base64url-logical-key}?expires={unix}&signature={hmac}
//
// The signature is a bearer capability, exactly like a presigned S3 URL:
// access is authorized when the surrounding catalog response is built, and the
// resulting URL is usable by a browser <img> element that cannot attach a
// bearer header. It is deliberately not bound to a profile, client, or address
// so several clients and any future edge cache can share identical bytes;
// revocation is bounded by the short lifetime.
//
// The signing key is derived from the cluster authentication secret rather than
// configured separately, which keeps artwork tokens cryptographically separate
// from login and playback tokens while adding no setup step. Rotating the
// cluster secret invalidates outstanding artwork URLs along with every other
// derived token family; the short lifetime bounds that to one refresh.
package artworkurl

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/Silo-Server/silo-server/internal/artworkstore"
)

const (
	// RoutePrefix is the path every signed artwork URL starts with. Minted
	// URLs are root-relative: they are correct for every origin the server is
	// reached through (LAN address, tunnel, reverse proxy), which a single
	// configured public origin would not be, and they stay cacheable by the
	// resolver across those origins.
	RoutePrefix = "/api/v1/artwork/"

	// ExpiresParam carries the signed expiry as a Unix timestamp in seconds.
	ExpiresParam = "expires"

	// SignatureParam carries the base64url HMAC over the key and expiry.
	SignatureParam = "signature"

	// secretContext domain-separates the artwork signing key from every other
	// secret derived from the cluster authentication secret. Never reuse it.
	secretContext = "silo-artwork-url-v1"

	// routeVersion is covered by the signature, so a future change to the URL
	// grammar invalidates outstanding URLs instead of letting an old signature
	// authenticate a new meaning.
	routeVersion = "v1"

	// DefaultTTL is the artwork URL lifetime used when none is configured. It
	// mirrors the default S3 presign lifetime.
	DefaultTTL = 4 * time.Hour

	// minTTL and maxTTL bound a configured lifetime. The floor keeps
	// quantization from minting a URL that expires before a page finishes
	// loading; the ceiling bounds how long a leaked URL stays usable.
	minTTL = time.Minute
	maxTTL = 24 * time.Hour
)

var (
	// ErrInvalidSignature reports a URL that this server did not mint: a
	// malformed key, a key outside the logical-key grammar, a missing or
	// unparsable expiry, or a signature mismatch. Callers must answer it
	// identically to an unknown key so the response reveals nothing about
	// which keys exist.
	ErrInvalidSignature = errors.New("artworkurl: invalid artwork url signature")

	// ErrExpired reports a correctly signed URL whose lifetime has passed. It
	// is only ever returned after the signature verifies, so answering it
	// distinctly still reveals nothing about stored objects.
	ErrExpired = errors.New("artworkurl: artwork url expired")
)

// DeriveSecret produces the artwork URL signing key from the cluster
// authentication secret. Same construction as the OAuth state secret, with its
// own context string.
func DeriveSecret(jwtSecret []byte) []byte {
	mac := hmac.New(sha256.New, jwtSecret)
	_, _ = mac.Write([]byte(secretContext))
	return mac.Sum(nil)
}

// Signer mints and verifies signed artwork URLs. It holds no per-URL state:
// every API and proxy node deriving from the same cluster secret mints and
// accepts the same URLs.
type Signer struct {
	secret []byte
	ttl    func() time.Duration
}

// NewSigner derives a signer from the cluster authentication secret. ttl reads
// the configured artwork URL lifetime and may be nil; it is read per mint so an
// administrator's change takes effect without a restart. Already-minted URLs
// keep the lifetime they were signed with.
func NewSigner(jwtSecret string, ttl func() time.Duration) (*Signer, error) {
	if strings.TrimSpace(jwtSecret) == "" {
		return nil, errors.New("artworkurl: a cluster authentication secret is required to sign artwork urls")
	}
	return &Signer{secret: DeriveSecret([]byte(jwtSecret)), ttl: ttl}, nil
}

// TTL is the currently configured URL lifetime, clamped to the supported range.
func (s *Signer) TTL() time.Duration {
	if s == nil {
		return DefaultTTL
	}
	return clampTTL(s.ttl)
}

// clampTTL reads a configured lifetime and holds it inside the supported range.
// A missing or nonsensical value falls back to the default rather than minting
// a URL that expires immediately or never.
func clampTTL(ttl func() time.Duration) time.Duration {
	if ttl == nil {
		return DefaultTTL
	}
	value := ttl()
	switch {
	case value <= 0:
		return DefaultTTL
	case value < minTTL:
		return minTTL
	case value > maxTTL:
		return maxTTL
	}
	return value
}

// Sign returns the root-relative signed URL for a logical artwork key, plus the
// instant it stops working.
//
// The expiry is quantized to a fixed boundary rather than measured from now:
// every mint inside one window produces a byte-identical URL, which is what
// lets a client cache the bytes at all — browsers key their cache on the whole
// URL, so a per-request signature would defeat caching of objects that never
// change. Quantization at most doubles the maximum lifetime and changes no
// other property of the capability.
func (s *Signer) Sign(key string, now time.Time) (artworkstore.ResolvedURL, error) {
	if s == nil {
		return artworkstore.ResolvedURL{}, errors.New("artworkurl: signer is not configured")
	}
	if err := artworkstore.ValidateKey(key); err != nil {
		return artworkstore.ResolvedURL{}, err
	}
	expiresAt := quantizedExpiry(now, s.TTL())
	unix := expiresAt.Unix()
	url := RoutePrefix + base64.RawURLEncoding.EncodeToString([]byte(key)) +
		"?" + ExpiresParam + "=" + strconv.FormatInt(unix, 10) +
		"&" + SignatureParam + "=" + s.signature(key, unix)
	return artworkstore.ResolvedURL{URL: url, ExpiresAt: &expiresAt}, nil
}

// Verify authenticates a signed artwork URL and returns the logical key it
// authorizes together with its expiry.
//
// The key is recovered from the signed payload, never interpreted as a path:
// callers pass the returned key to the store, which resolves it beneath its own
// root. Verification order matters — the signature is checked before expiry,
// and both before any store access, so a forged request can never reach the
// backend.
func (s *Signer) Verify(encodedKey, expires, signature string, now time.Time) (string, time.Time, error) {
	if s == nil {
		return "", time.Time{}, ErrInvalidSignature
	}
	if encodedKey == "" || expires == "" || signature == "" {
		return "", time.Time{}, ErrInvalidSignature
	}

	keyBytes, err := base64.RawURLEncoding.DecodeString(encodedKey)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("%w: undecodable key", ErrInvalidSignature)
	}
	key := string(keyBytes)
	// Reject any non-canonical encoding of the same key so one stored object
	// cannot be addressed through several distinct URLs.
	if base64.RawURLEncoding.EncodeToString(keyBytes) != encodedKey {
		return "", time.Time{}, fmt.Errorf("%w: non-canonical key encoding", ErrInvalidSignature)
	}
	if err := artworkstore.ValidateKey(key); err != nil {
		// Both sentinels matter: the caller answers on ErrInvalidSignature,
		// and the key error explains why in a log line.
		return "", time.Time{}, errors.Join(ErrInvalidSignature, err)
	}

	unix, err := strconv.ParseInt(expires, 10, 64)
	if err != nil || unix <= 0 {
		return "", time.Time{}, fmt.Errorf("%w: unparsable expiry", ErrInvalidSignature)
	}

	expected := s.signature(key, unix)
	if len(expected) != len(signature) ||
		subtle.ConstantTimeCompare([]byte(expected), []byte(signature)) != 1 {
		return "", time.Time{}, ErrInvalidSignature
	}

	expiresAt := time.Unix(unix, 0).UTC()
	if now.After(expiresAt) {
		return key, expiresAt, ErrExpired
	}
	return key, expiresAt, nil
}

// signature is the HMAC over the route version, the logical key, and the
// expiry. Every field a client could vary is covered, and the fields are
// NUL-separated so no two different triples share one signed message.
func (s *Signer) signature(key string, expiresUnix int64) string {
	mac := hmac.New(sha256.New, s.secret)
	_, _ = mac.Write([]byte(routeVersion))
	_, _ = mac.Write([]byte{0})
	_, _ = mac.Write([]byte(key))
	_, _ = mac.Write([]byte{0})
	_, _ = mac.Write([]byte(strconv.FormatInt(expiresUnix, 10)))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// quantizedExpiry returns the next TTL boundary after now, plus one TTL. Every
// mint within one window returns the same instant, so the whole URL is stable
// for at least one TTL and at most two.
func quantizedExpiry(now time.Time, ttl time.Duration) time.Time {
	step := int64(ttl / time.Second)
	if step <= 0 {
		step = int64(DefaultTTL / time.Second)
	}
	boundary := (now.Unix()/step + 1) * step
	return time.Unix(boundary+step, 0).UTC()
}
