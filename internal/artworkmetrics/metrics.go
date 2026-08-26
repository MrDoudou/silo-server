package artworkmetrics

import (
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

const (
	labelOperation = "operation"
	labelOutcome   = "outcome"
	labelUnknown   = "unknown"
)

var (
	materializationSources = labelSet("provider", "plugin", "library_sidecar", "embedded", "generated", "upload", "bundled", "seed", labelUnknown)
	materializationResults = labelSet("materialized", "adopted", "failed", labelUnknown)
	storeBackends          = labelSet("local", "s3", labelUnknown)
	storeOperations        = labelSet("write", "open", "stat", "matches", "delete", "probe", "list", "maintenance_delete", labelUnknown)
	deliveryRoutes         = labelSet("store", "direct_library", labelUnknown)
	deliveryResults        = labelSet("served", "conditional_hit", "invalid_signature", "expired_signature", "miss", labelUnknown)
	purgeResults           = labelSet("completed", "failed", "cancelled", labelUnknown)
	seedResults            = labelSet("imported", "adopted", "skipped", "retained_unverifiable", "expired", labelUnknown)
	variantResults         = labelSet("written", "matched", labelUnknown)
	manifestOperations     = labelSet("adoption_index", "adoption_manifest_digest", "adoption_manifest", "adoption_objects", labelUnknown)
)

func labelSet(values ...string) map[string]struct{} {
	set := make(map[string]struct{}, len(values))
	for _, value := range values {
		set[value] = struct{}{}
	}
	return set
}

func boundedLabel(value string, allowed map[string]struct{}) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if _, ok := allowed[value]; ok {
		return value
	}
	return labelUnknown
}

var (
	materializations = promauto.NewCounterVec(prometheus.CounterOpts{Name: "silo_artwork_materializations_total", Help: "Artwork materialization outcomes."}, []string{"source_class", labelOutcome})
	storeDuration    = promauto.NewHistogramVec(prometheus.HistogramOpts{Name: "silo_artwork_store_operation_duration_seconds", Help: "Artwork store operation latency.", Buckets: prometheus.DefBuckets}, []string{"backend", labelOperation})
	storeFailures    = promauto.NewCounterVec(prometheus.CounterOpts{Name: "silo_artwork_store_operation_failures_total", Help: "Artwork store operation failures."}, []string{"backend", labelOperation})
	delivery         = promauto.NewCounterVec(prometheus.CounterOpts{Name: "silo_artwork_delivery_requests_total", Help: "Artwork delivery requests by bounded outcome."}, []string{"route", labelOutcome})
	purgeJobs        = promauto.NewCounterVec(prometheus.CounterOpts{Name: "silo_artwork_purge_jobs_total", Help: "Artwork purge job outcomes."}, []string{"dry_run", labelOutcome})
	purgeBytes       = promauto.NewCounterVec(prometheus.CounterOpts{Name: "silo_artwork_purge_bytes_total", Help: "Bytes reported by artwork purge plans and jobs."}, []string{"kind"})
	inventoryAge     = promauto.NewGauge(prometheus.GaugeOpts{Name: "silo_artwork_inventory_snapshot_age_seconds", Help: "Age of the latest artwork inventory snapshot."})
	inventoryDrift   = promauto.NewGaugeVec(prometheus.GaugeOpts{Name: "silo_artwork_inventory_drift_objects", Help: "Artwork inventory drift counters."}, []string{"kind"})
	seedEvents       = promauto.NewCounterVec(prometheus.CounterOpts{Name: "silo_artwork_seed_events_total", Help: "Portable artwork seed import, adoption, and expiry events."}, []string{labelOutcome})
	variantBytes     = promauto.NewCounterVec(prometheus.CounterOpts{Name: "silo_artwork_variant_bytes_total", Help: "Artwork variant bytes written or matched."}, []string{labelOutcome})
	deliveryBytes    = promauto.NewCounterVec(prometheus.CounterOpts{Name: "silo_artwork_delivery_bytes_total", Help: "Artwork bytes served by delivery route."}, []string{"route"})
	directURLs       = promauto.NewCounter(prometheus.CounterOpts{Name: "silo_artwork_direct_urls_minted_total", Help: "Direct S3 or CDN artwork URLs minted."})
	manifestErrors   = promauto.NewCounterVec(prometheus.CounterOpts{Name: "silo_artwork_manifest_validation_failures_total", Help: "Portable manifest validation failures."}, []string{"operation"})
	tempCleaned      = promauto.NewCounter(prometheus.CounterOpts{Name: "silo_artwork_abandoned_temp_files_cleaned_total", Help: "Abandoned artwork temporary files removed."})
	seedExpired      = promauto.NewGauge(prometheus.GaugeOpts{Name: "silo_artwork_seed_expired_bytes", Help: "Expired unused portable seed bytes."})
)

func Materialization(sourceClass, outcome string) {
	materializations.WithLabelValues(
		boundedLabel(sourceClass, materializationSources),
		boundedLabel(outcome, materializationResults),
	).Inc()
}

func ObserveStore(backend, operation string, started time.Time, err error) {
	if started.IsZero() {
		started = time.Now()
	}
	backend = boundedLabel(backend, storeBackends)
	operation = boundedLabel(operation, storeOperations)
	storeDuration.WithLabelValues(backend, operation).Observe(time.Since(started).Seconds())
	if err != nil {
		storeFailures.WithLabelValues(backend, operation).Inc()
	}
}

func Delivery(route, outcome string) {
	delivery.WithLabelValues(boundedLabel(route, deliveryRoutes), boundedLabel(outcome, deliveryResults)).Inc()
}

func Purge(dryRun bool, outcome string, pending, reclaimable int64) {
	purgeJobs.WithLabelValues(map[bool]string{true: "true", false: "false"}[dryRun], boundedLabel(outcome, purgeResults)).Inc()
	if pending > 0 {
		purgeBytes.WithLabelValues("pending").Add(float64(pending))
	}
	if reclaimable > 0 {
		purgeBytes.WithLabelValues("reclaimable").Add(float64(reclaimable))
	}
}

func Inventory(snapshot time.Time, missingRevisions, missingObjects, orphans int64) {
	if !snapshot.IsZero() {
		inventoryAge.Set(time.Since(snapshot).Seconds())
	}
	inventoryDrift.WithLabelValues("missing_revisions").Set(float64(missingRevisions))
	inventoryDrift.WithLabelValues("missing_objects").Set(float64(missingObjects))
	inventoryDrift.WithLabelValues("orphan_objects").Set(float64(orphans))
}

func Seed(outcome string, count int64) {
	if count > 0 {
		seedEvents.WithLabelValues(boundedLabel(outcome, seedResults)).Add(float64(count))
	}
}

func Variant(outcome string, bytes int64) {
	if bytes > 0 {
		variantBytes.WithLabelValues(boundedLabel(outcome, variantResults)).Add(float64(bytes))
	}
}

func DeliveryBytes(route string, bytes int64) {
	if bytes > 0 {
		deliveryBytes.WithLabelValues(boundedLabel(route, deliveryRoutes)).Add(float64(bytes))
	}
}

func DirectURLMinted() { directURLs.Inc() }
func ManifestFailure(operation string) {
	manifestErrors.WithLabelValues(boundedLabel(operation, manifestOperations)).Inc()
}
func TempFilesCleaned(count int) {
	if count > 0 {
		tempCleaned.Add(float64(count))
	}
}
func SeedExpiredBytes(bytes int64) { seedExpired.Set(float64(bytes)) }
