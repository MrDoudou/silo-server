// Package dashmetrics records the admin dashboard time series that cannot be
// reconstructed after the fact: live streams, egress, process resource
// pressure, and dependency latency. These values either disappear when the
// moment passes or are overwritten by their next reading, so they have to be
// sampled as they happen.
//
// One row per minute per source lands in dashboard_metric_samples. System
// readings are cleared after their short diagnostic window, while rows remain
// available for the longer playback and egress history:
//
//   - "shared" is the cluster-wide snapshot. Every replica writes it with
//     INSERT ... ON CONFLICT DO NOTHING, so the first writer for a minute wins
//     and the others collapse. Replica snapshots differ only by sub-second
//     timing, which is below the resolution a dashboard chart can show, so this
//     is deliberately cheaper than coordinating with an advisory lock.
//   - "proc:<node_id>" carries the viewer egress served by one API process,
//     measured from the local stream-telemetry registry. stream_nodes only
//     describes external stream nodes, so without these rows a single-server
//     deployment would chart zero egress forever. egress_kbps is the process
//     total; download_egress_kbps is the file-transfer subset of that total
//     (see computeEgressDelta), so the dashboard can split playback from
//     download traffic. The same row carries the local resource snapshot and
//     successful PostgreSQL/Redis round trips.
//
// Sampling is best-effort: every failure is logged and swallowed. A missed
// minute is a gap in the chart, never a failed request or a dead server.
package dashmetrics

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"os"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/Silo-Server/silo-server/internal/nodemetrics"
	"github.com/Silo-Server/silo-server/internal/streamtelemetry"
)

const (
	// component is the slog component key every line from this package carries.
	component = "dashmetrics"

	// sampleInterval matches the minute resolution of the samples table.
	sampleInterval = time.Minute

	// sampleTickTimeout bounds one tick's database work, comfortably under the
	// interval so a wedged pool costs missed minutes, not a stuck sampler.
	sampleTickTimeout = 30 * time.Second

	// sampleRetentionDays is how much playback and egress history the charts
	// can show — a month, so the dashboard's widest range has samples to draw.
	// 1440 minutes a day times 31 days is ~45k rows per source, and sources are
	// (1 + replicas), so the table stays in the low hundreds of thousands of
	// rows at most. Reads bucket the minutes down before returning them
	// (internal/api/handlers), so a wide window costs the same on the wire as a
	// narrow one.
	sampleRetentionDays = 31

	// systemMetricRetentionHours keeps enough detail for current incidents
	// without storing long-term host and dependency telemetry.
	systemMetricRetentionHours = 24
)

type metricStore interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

// resourceSnapshotter is the read side of the local resource sampler. Reads
// are atomic and never perform system work; the five-second collector owns it.
type resourceSnapshotter interface {
	Snapshot() nodemetrics.Snapshot
}

type nodeLatencySource interface {
	MaxHealthyLatencyMS() *float64
}

// Options are the process-local inputs to dashboard sampling.
type Options struct {
	Pool      *pgxpool.Pool
	Telemetry *streamtelemetry.Registry
	Resources resourceSnapshotter
	Redis     *redis.Client
	Nodes     nodeLatencySource
	NodeID    string
}

// Sampler writes one dashboard_metric_samples row per minute for as long as it
// runs. Its state is owned by the single goroutine Start launches; nothing else
// reads or mutates it.
type Sampler struct {
	pool      *pgxpool.Pool
	telemetry *streamtelemetry.Registry // nil when stream telemetry is disabled
	resources resourceSnapshotter       // nil when host sampling is disabled
	redis     *redis.Client             // nil when Redis is not configured
	nodes     nodeLatencySource         // nil when node health checks are disabled
	source    string                    // "proc:<node_id>"
	interval  time.Duration

	// lastBucket is the minute the last tick wrote, so a ticker that fires
	// twice inside one minute does not spend an INSERT that ON CONFLICT would
	// only discard — which would silently drop the egress bytes it carried.
	lastBucket time.Time

	// prevBytes holds the cumulative viewer bytes per telemetry session and
	// transfer at the previous tick; lastEgressAt is when it was taken.
	prevBytes    map[string]int64
	lastEgressAt time.Time

	stopOnce sync.Once
	stop     chan struct{}
}

// NewSampler builds a sampler for this process. Optional inputs simply leave
// their metric absent. NodeID identifies this process among replicas and falls
// back to the hostname when empty.
func NewSampler(opts Options) *Sampler {
	nodeID := opts.NodeID
	if nodeID == "" {
		nodeID, _ = os.Hostname()
	}
	if nodeID == "" {
		nodeID = "unknown"
	}
	return &Sampler{
		pool:      opts.Pool,
		telemetry: opts.Telemetry,
		resources: opts.Resources,
		redis:     opts.Redis,
		nodes:     opts.Nodes,
		source:    "proc:" + nodeID,
		interval:  sampleInterval,
		stop:      make(chan struct{}),
	}
}

// Start samples once immediately — which also establishes the egress baseline —
// and then every minute until ctx is canceled or Stop is called.
func (s *Sampler) Start(ctx context.Context) {
	if s == nil || s.pool == nil {
		return
	}
	go func() {
		s.sampleOnce(ctx, time.Now())

		ticker := time.NewTicker(s.interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-s.stop:
				return
			case at := <-ticker.C:
				s.sampleOnce(ctx, at)
			}
		}
	}()
}

// Stop ends the sampling goroutine. It is safe to call more than once.
func (s *Sampler) Stop() {
	if s == nil {
		return
	}
	s.stopOnce.Do(func() {
		close(s.stop)
	})
}

// sampleOnce writes this minute's rows and, once an hour, prunes expired ones.
//
// Every tick's database work runs under its own deadline: the sampler is one
// goroutine, and an Exec left on the lifetime context during a wedged pool
// would block it — and with it every later sample and the retention prune —
// for as long as the outage lasts. A bounded tick turns that into a bounded
// gap in the chart instead.
func (s *Sampler) sampleOnce(ctx context.Context, at time.Time) {
	bucket := sampleBucket(at)
	if bucket.Equal(s.lastBucket) {
		return
	}
	s.lastBucket = bucket

	ctx, cancel := context.WithTimeout(ctx, sampleTickTimeout)
	defer cancel()

	s.sampleShared(ctx)
	s.sampleProcessEgress(ctx, at)
	s.sampleProcessSystem(ctx, at)

	// Retention runs in-band rather than as its own timer: the table is tiny
	// and one cleanup pass an hour costs less than another goroutine.
	if at.Minute() == 0 {
		s.pruneExpired(ctx)
	}
}

// sampleShared records the cluster-wide stream counts and node egress. Counting
// and inserting happen in one statement so no replica can read one minute's
// state and write it into another's bucket.
func (s *Sampler) sampleShared(ctx context.Context) {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO dashboard_metric_samples
			(bucket, source, streams_total, streams_direct, streams_remux, streams_transcode, egress_kbps)
		SELECT date_trunc('minute', now()), 'shared',
			(SELECT COUNT(*) FROM playback_sessions_sync),
			(SELECT COUNT(*) FROM playback_sessions_sync WHERE play_method = 'direct'),
			(SELECT COUNT(*) FROM playback_sessions_sync WHERE play_method = 'remux'),
			(SELECT COUNT(*) FROM playback_sessions_sync WHERE play_method = 'transcode'),
			(SELECT COALESCE(SUM(egress_kbps), 0) FROM stream_nodes WHERE enabled AND healthy)
		ON CONFLICT (bucket, source) DO NOTHING
	`)
	if err != nil {
		slog.WarnContext(ctx, "failed to sample shared dashboard metrics", "component", component, "error", err)
	}
}

// sampleProcessEgress records the viewer egress this process served since the
// previous tick. The row is bucketed on the database clock — the same clock the
// shared row and the read window use — so a skewed host cannot land streams and
// their egress in adjacent minutes, or write a "future" row the dashboard's
// server-anchored grid would drop. Two ticks that map onto one DB minute merge
// by GREATEST, which keeps the peak (the read side is peak-preserving anyway)
// instead of silently discarding the second delta; taking each column's max
// independently preserves download <= total because it holds per row.
func (s *Sampler) sampleProcessEgress(ctx context.Context, at time.Time) {
	if s.telemetry == nil {
		return
	}

	// Sweep rather than Snapshot: Snapshot reports byte totals as of the last
	// telemetry sweep, and a sweep interval configured above one minute would
	// make ticks in between read zero growth and the next one attribute
	// several minutes of bytes to a single minute — a spike that never
	// happened. Sweep collects the live counters now.
	delta, next := computeEgressDelta(s.prevBytes, s.telemetry.Sweep())
	previous, previousAt := s.prevBytes, s.lastEgressAt
	s.prevBytes, s.lastEgressAt = next, at

	// The very first snapshot carries every byte served since the process
	// started. Charting that as one minute of egress would draw a spike that
	// never happened, so the first tick only establishes the baseline.
	if previous == nil || previousAt.IsZero() {
		return
	}

	// Zero minutes are written too: an idle server should draw a line along the
	// baseline, not a gap that reads as "no data". egress_kbps stays the total
	// this process served (its pre-split meaning), while download_egress_kbps
	// carries the file-transfer subset. The subset is clamped under the total
	// after rounding so a reader deriving playback as total - download can
	// never see a negative minute from two independent roundings.
	elapsed := at.Sub(previousAt)
	totalKbps := egressKbps(delta.Total, elapsed)
	downloadKbps := min(egressKbps(delta.Download, elapsed), totalKbps)
	_, err := s.pool.Exec(ctx, `
		INSERT INTO dashboard_metric_samples (bucket, source, egress_kbps, download_egress_kbps)
		VALUES (date_trunc('minute', now()), $1, $2, $3)
		ON CONFLICT (bucket, source) DO UPDATE
		SET egress_kbps = GREATEST(dashboard_metric_samples.egress_kbps, EXCLUDED.egress_kbps),
		    download_egress_kbps = GREATEST(dashboard_metric_samples.download_egress_kbps, EXCLUDED.download_egress_kbps)
	`, s.source, totalKbps, downloadKbps)
	if err != nil {
		slog.WarnContext(ctx, "failed to sample process egress", "component", component, "source", s.source, "error", err)
	}
}

// pruneExpired clears short-lived system readings, then drops rows after the
// longer playback and egress retention window.
func (s *Sampler) pruneExpired(ctx context.Context) {
	if err := pruneExpiredDashboardMetrics(ctx, s.pool); err != nil {
		slog.WarnContext(ctx, "failed to prune dashboard metric samples", "component", component, "error", err)
	}
}

// pruneExpiredDashboardMetrics applies the two independent retention windows
// without letting one failed operation prevent the other from running.
func pruneExpiredDashboardMetrics(ctx context.Context, store metricStore) error {
	var pruneErrors []error

	_, err := store.Exec(ctx, `
		UPDATE dashboard_metric_samples
		SET cpu_pct = NULL,
		    memory_pct = NULL,
		    gpu_pct = NULL,
		    net_rx_bps = NULL,
		    net_tx_bps = NULL,
		    postgres_latency_ms = NULL,
		    redis_latency_ms = NULL,
		    node_latency_ms = NULL
		WHERE bucket < now() - make_interval(hours => $1)
		  AND (cpu_pct IS NOT NULL
		    OR memory_pct IS NOT NULL
		    OR gpu_pct IS NOT NULL
		    OR net_rx_bps IS NOT NULL
		    OR net_tx_bps IS NOT NULL
		    OR postgres_latency_ms IS NOT NULL
		    OR redis_latency_ms IS NOT NULL
		    OR node_latency_ms IS NOT NULL)
	`, systemMetricRetentionHours)
	if err != nil {
		pruneErrors = append(pruneErrors, fmt.Errorf("clear expired system metrics: %w", err))
	}

	_, err = store.Exec(ctx, `
		DELETE FROM dashboard_metric_samples
		WHERE bucket < now() - make_interval(days => $1)
	`, sampleRetentionDays)
	if err != nil {
		pruneErrors = append(pruneErrors, fmt.Errorf("delete expired samples: %w", err))
	}

	return errors.Join(pruneErrors...)
}

// sampleBucket truncates a sample time to the minute it belongs to, in UTC.
func sampleBucket(at time.Time) time.Time {
	return at.UTC().Truncate(time.Minute)
}

// egressKbps converts a byte delta over an elapsed period into kilobits per
// second. A non-positive delta or elapsed period is reported as zero rather
// than as a negative rate.
func egressKbps(deltaBytes int64, elapsed time.Duration) int64 {
	if deltaBytes <= 0 || elapsed <= 0 {
		return 0
	}
	return int64(math.Round(float64(deltaBytes) * 8 / 1000 / elapsed.Seconds()))
}
