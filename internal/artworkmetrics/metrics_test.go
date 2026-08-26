package artworkmetrics

import (
	"errors"
	"testing"
	"time"
)

func TestArtworkMetricLabelsAreBounded(t *testing.T) {
	tests := []struct {
		name    string
		allowed map[string]struct{}
		known   string
	}{
		{"materialization source", materializationSources, "provider"},
		{"materialization result", materializationResults, "adopted"},
		{"store backend", storeBackends, "s3"},
		{"store operation", storeOperations, "maintenance_delete"},
		{"delivery route", deliveryRoutes, "direct_library"},
		{"delivery result", deliveryResults, "conditional_hit"},
		{"purge result", purgeResults, "completed"},
		{"seed result", seedResults, "retained_unverifiable"},
		{"variant result", variantResults, "matched"},
		{"manifest operation", manifestOperations, "adoption_objects"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := boundedLabel(test.known, test.allowed); got != test.known {
				t.Fatalf("known label = %q", got)
			}
			if got := boundedLabel("catalog-id-or-path", test.allowed); got != labelUnknown {
				t.Fatalf("unbounded label = %q, want %q", got, labelUnknown)
			}
		})
	}
}

func TestArtworkMetricRecordingAcceptsZeroAndNilInputs(t *testing.T) {
	Materialization("", "")
	ObserveStore("", "", time.Time{}, nil)
	ObserveStore("local", "stat", time.Now(), errors.New("unavailable"))
	Delivery("", "")
	DeliveryBytes("", 0)
	Purge(false, "", 0, 0)
	Inventory(time.Time{}, 0, 0, 0)
	Seed("", 0)
	Variant("", 0)
	ManifestFailure("")
	TempFilesCleaned(0)
	SeedExpiredBytes(0)
}
