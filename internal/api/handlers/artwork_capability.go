package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/Silo-Server/silo-server/internal/artworkkey"
)

// Artwork delivery modes reported by the capability endpoint.
const (
	// artworkDeliveryAPI means clients fetch artwork from this server through
	// short-lived signed URLs on the native artwork route.
	artworkDeliveryAPI = "api"
	// artworkDeliveryDirect means clients fetch artwork straight from the
	// object store or CDN and the bytes never pass through Silo.
	artworkDeliveryDirect    = "direct"
	artworkDeliveryResilient = "resilient"
)

// artworkCapabilityResponse describes how this server stores and delivers
// artwork, so a client or administrator can observe delivery behavior without
// sniffing versions or guessing from a URL shape.
//
// It deliberately reveals no location: no bucket, endpoint, filesystem root,
// key prefix, or credential. Everything here is a policy fact that is already
// implied by the URLs the server hands out.
type artworkCapabilityResponse struct {
	SchemaVersion int `json:"schema_version"`
	// StorageBackend is the pinned canonical backend: "local" or "s3". It is
	// the backend the catalog's keys belong to, not merely what is configured.
	StorageBackend string `json:"storage_backend"`
	// StorageFormat identifies the logical key layout new materializations
	// use. Objects written before it stay readable under their old keys.
	StorageFormat string `json:"storage_format"`
	// PortableStorage reports that the stored tree can be copied between
	// roots, buckets, and backends without rewriting catalog references.
	PortableStorage bool `json:"portable_storage"`
	// DeliveryModes are how artwork URLs are fetched: "api" for signed URLs
	// served by this server, "direct" for object-store or CDN URLs.
	DeliveryModes []string `json:"delivery_modes"`
	// DeliveryPolicy is resilient by default; direct is an explicit
	// administrator opt-out from request-time recovery.
	DeliveryPolicy string `json:"delivery_policy"`
	StoreHealth    string `json:"store_health"`
	// AutomaticRecovery reports whether target-bound loss detection and the
	// durable repair coordinator are active.
	AutomaticRecovery bool `json:"automatic_recovery"`
	// RemoteMaterialization is "selected" when remote provider artwork is
	// copied into the store on selection, or "passthrough" when catalog
	// responses keep pointing at the provider.
	RemoteMaterialization string `json:"remote_materialization"`
	// LocalSourcePolicy is the default selected-artwork policy. Sidecars are
	// materialized normally; safe purge may transition an accessible one to
	// the signed direct-library fallback without changing this default.
	LocalSourcePolicy string                             `json:"local_source_policy"`
	StorageManagement artworkStorageManagementCapability `json:"storage_management"`
	Portability       artworkPortabilityCapability       `json:"portability"`
	// Variants is the variant ladder generated per image type. The names are
	// the ones a stored key can carry, largest first after "original".
	Variants map[string][]string `json:"variants"`
}

type artworkStorageManagementCapability struct {
	Accounting            bool `json:"accounting"`
	SafePurge             bool `json:"safe_purge"`
	DirectLibraryFallback bool `json:"direct_library_fallback"`
}

type artworkPortabilityCapability struct {
	AdoptionIndex bool `json:"adoption_index"`
	SeedImport    bool `json:"seed_import"`
	PortableCopy  bool `json:"portable_copy"`
}

// ArtworkCapabilityHandler answers the artwork capability probe.
type ArtworkCapabilityHandler struct {
	backend         string
	directDelivery  bool
	materialization func() string
	deliveryPolicy  func() string
	storeHealth     func() string
}

func (h *ArtworkCapabilityHandler) SetResilientStatus(deliveryPolicy, storeHealth func() string) {
	if h == nil {
		return
	}
	h.deliveryPolicy = deliveryPolicy
	h.storeHealth = storeHealth
}

// NewArtworkCapabilityHandler builds the capability handler. backend is the
// pinned store backend and directDelivery reports whether clients fetch from
// that backend themselves; both are fixed for the process lifetime because the
// store is opened once at startup. materialization is read per request since
// the policy is hot-reloadable.
func NewArtworkCapabilityHandler(backend string, directDelivery bool, materialization func() string) *ArtworkCapabilityHandler {
	return &ArtworkCapabilityHandler{
		backend:         backend,
		directDelivery:  directDelivery,
		materialization: materialization,
	}
}

// HandleCapability reports the artwork storage and delivery capability.
func (h *ArtworkCapabilityHandler) HandleCapability(w http.ResponseWriter, r *http.Request) {
	materialization := ""
	if h.materialization != nil {
		materialization = h.materialization()
	}
	deliveryPolicy := artworkDeliveryResilient
	if h.deliveryPolicy != nil && h.deliveryPolicy() == artworkDeliveryDirect {
		deliveryPolicy = artworkDeliveryDirect
	}
	deliveryMode := artworkDeliveryAPI
	if deliveryPolicy == artworkDeliveryDirect && h.directDelivery {
		deliveryMode = artworkDeliveryDirect
	}
	storeHealth := "healthy"
	if h.storeHealth != nil && h.storeHealth() != "" {
		storeHealth = h.storeHealth()
	}

	imageTypes := artworkkey.ImageTypes()
	variants := make(map[string][]string, len(imageTypes))
	for _, imageType := range imageTypes {
		variants[imageType] = artworkkey.VariantNames(imageType)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(artworkCapabilityResponse{
		SchemaVersion:         1,
		StorageBackend:        h.backend,
		StorageFormat:         artworkkey.PortableStorageFormat,
		PortableStorage:       true,
		DeliveryModes:         []string{deliveryMode},
		DeliveryPolicy:        deliveryPolicy,
		StoreHealth:           storeHealth,
		AutomaticRecovery:     deliveryPolicy == artworkDeliveryResilient,
		RemoteMaterialization: materialization,
		LocalSourcePolicy:     "materialize",
		StorageManagement: artworkStorageManagementCapability{
			Accounting: true, SafePurge: true, DirectLibraryFallback: true,
		},
		Portability: artworkPortabilityCapability{AdoptionIndex: true, SeedImport: true, PortableCopy: true},
		Variants:    variants,
	})
}
