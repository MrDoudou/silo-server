package dashmetrics

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/Silo-Server/silo-server/internal/nodemetrics"
	"github.com/Silo-Server/silo-server/internal/streamtelemetry"
	"github.com/jackc/pgx/v5/pgconn"
)

type metricStoreCall struct {
	query string
	args  []any
}

type recordingMetricStore struct {
	calls  []metricStoreCall
	errors []error
}

func (s *recordingMetricStore) Exec(_ context.Context, query string, args ...any) (pgconn.CommandTag, error) {
	callIndex := len(s.calls)
	s.calls = append(s.calls, metricStoreCall{query: query, args: args})
	if callIndex < len(s.errors) {
		return pgconn.CommandTag{}, s.errors[callIndex]
	}
	return pgconn.CommandTag{}, nil
}

type fixedResourceSampler struct {
	snapshot nodemetrics.Snapshot
}

func (s fixedResourceSampler) Snapshot() nodemetrics.Snapshot { return s.snapshot }

func viewerSession(id string, bytes int64) streamtelemetry.SessionView {
	return streamtelemetry.SessionView{
		SessionID: id,
		Routes: []streamtelemetry.RouteActivityView{
			{Method: "GET", Pattern: "/stream", Role: streamtelemetry.RoleViewerEgress, BytesAccepted: bytes},
		},
	}
}

func TestComputeEgressDelta(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		prev      map[string]int64
		snapshot  streamtelemetry.Snapshot
		wantDelta egressDelta
		wantNext  map[string]int64
	}{
		{
			name:      "empty snapshot yields nothing",
			prev:      map[string]int64{},
			snapshot:  streamtelemetry.Snapshot{},
			wantDelta: egressDelta{},
			wantNext:  map[string]int64{},
		},
		{
			name: "a new session contributes all of its bytes",
			prev: map[string]int64{},
			snapshot: streamtelemetry.Snapshot{
				Sessions: []streamtelemetry.SessionView{viewerSession("s1", 4_000)},
			},
			wantDelta: egressDelta{Total: 4_000},
			wantNext:  map[string]int64{"session:s1": 4_000},
		},
		{
			name: "a grown session contributes only the growth",
			prev: map[string]int64{"session:s1": 4_000},
			snapshot: streamtelemetry.Snapshot{
				Sessions: []streamtelemetry.SessionView{viewerSession("s1", 6_500)},
			},
			wantDelta: egressDelta{Total: 2_500},
			wantNext:  map[string]int64{"session:s1": 6_500},
		},
		{
			name: "a pruned session leaves the map and adds nothing",
			prev: map[string]int64{"session:s1": 4_000, "session:s2": 1_000},
			snapshot: streamtelemetry.Snapshot{
				Sessions: []streamtelemetry.SessionView{viewerSession("s2", 1_000)},
			},
			wantDelta: egressDelta{},
			wantNext:  map[string]int64{"session:s2": 1_000},
		},
		{
			name: "a counter regression clamps at zero instead of going negative",
			prev: map[string]int64{"session:s1": 9_000},
			snapshot: streamtelemetry.Snapshot{
				Sessions: []streamtelemetry.SessionView{viewerSession("s1", 500)},
			},
			wantDelta: egressDelta{},
			wantNext:  map[string]int64{"session:s1": 500},
		},
		{
			name: "a regressing session does not cancel out a growing one",
			prev: map[string]int64{"session:s1": 9_000, "session:s2": 100},
			snapshot: streamtelemetry.Snapshot{
				Sessions: []streamtelemetry.SessionView{
					viewerSession("s1", 500),
					viewerSession("s2", 900),
				},
			},
			wantDelta: egressDelta{Total: 800},
			wantNext:  map[string]int64{"session:s1": 500, "session:s2": 900},
		},
		{
			name: "relay routes are excluded so relayed bytes are not counted twice",
			prev: map[string]int64{},
			snapshot: streamtelemetry.Snapshot{
				Sessions: []streamtelemetry.SessionView{{
					SessionID: "s1",
					Routes: []streamtelemetry.RouteActivityView{
						{Role: streamtelemetry.RoleViewerEgress, BytesAccepted: 700},
						{Role: streamtelemetry.RoleInternalRelay, BytesAccepted: 50_000},
						{Role: streamtelemetry.RoleProducer, BytesAccepted: 900},
					},
				}},
			},
			wantDelta: egressDelta{Total: 700},
			wantNext:  map[string]int64{"session:s1": 700},
		},
		{
			name: "viewer transfers count as download egress and other transfer roles do not",
			prev: map[string]int64{"transfer:t1": 200},
			snapshot: streamtelemetry.Snapshot{
				Transfers: []streamtelemetry.TransferView{
					{ID: "t1", Role: streamtelemetry.RoleViewerEgress, BytesAccepted: 1_200},
					{ID: "t2", Role: streamtelemetry.RoleInternalRelay, BytesAccepted: 8_000},
				},
			},
			wantDelta: egressDelta{Total: 1_000, Download: 1_000},
			wantNext:  map[string]int64{"transfer:t1": 1_200},
		},
		{
			name: "sessions and transfers with the same id stay separate",
			prev: map[string]int64{},
			snapshot: streamtelemetry.Snapshot{
				Sessions:  []streamtelemetry.SessionView{viewerSession("x", 10)},
				Transfers: []streamtelemetry.TransferView{{ID: "x", Role: streamtelemetry.RoleViewerEgress, BytesAccepted: 20}},
			},
			wantDelta: egressDelta{Total: 30, Download: 20},
			wantNext:  map[string]int64{"session:x": 10, "transfer:x": 20},
		},
		{
			name: "session growth stays out of the download subset",
			prev: map[string]int64{"session:s1": 100, "transfer:t1": 100},
			snapshot: streamtelemetry.Snapshot{
				Sessions:  []streamtelemetry.SessionView{viewerSession("s1", 700)},
				Transfers: []streamtelemetry.TransferView{{ID: "t1", Role: streamtelemetry.RoleViewerEgress, BytesAccepted: 350}},
			},
			wantDelta: egressDelta{Total: 850, Download: 250},
			wantNext:  map[string]int64{"session:s1": 700, "transfer:t1": 350},
		},
		{
			name:      "a nil previous map behaves like an empty one",
			prev:      nil,
			snapshot:  streamtelemetry.Snapshot{Sessions: []streamtelemetry.SessionView{viewerSession("s1", 42)}},
			wantDelta: egressDelta{Total: 42},
			wantNext:  map[string]int64{"session:s1": 42},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			delta, next := computeEgressDelta(tt.prev, tt.snapshot)
			if delta != tt.wantDelta {
				t.Fatalf("delta = %+v, want %+v", delta, tt.wantDelta)
			}
			if len(next) != len(tt.wantNext) {
				t.Fatalf("next = %v, want %v", next, tt.wantNext)
			}
			for key, want := range tt.wantNext {
				if got, ok := next[key]; !ok || got != want {
					t.Fatalf("next[%q] = %d (present %t), want %d", key, got, ok, want)
				}
			}
		})
	}
}

func TestSampleBucket(t *testing.T) {
	t.Parallel()

	newYork, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Skipf("timezone database unavailable: %v", err)
	}

	tests := []struct {
		name string
		at   time.Time
		want time.Time
	}{
		{
			name: "seconds and nanoseconds are dropped",
			at:   time.Date(2026, 8, 26, 11, 58, 43, 987_654_321, time.UTC),
			want: time.Date(2026, 8, 26, 11, 58, 0, 0, time.UTC),
		},
		{
			name: "a minute boundary is already its own bucket",
			at:   time.Date(2026, 8, 26, 11, 59, 0, 0, time.UTC),
			want: time.Date(2026, 8, 26, 11, 59, 0, 0, time.UTC),
		},
		{
			name: "local times truncate on the UTC minute",
			at:   time.Date(2026, 8, 26, 7, 58, 43, 0, newYork),
			want: time.Date(2026, 8, 26, 11, 58, 0, 0, time.UTC),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := sampleBucket(tt.at)
			if !got.Equal(tt.want) {
				t.Fatalf("sampleBucket(%s) = %s, want %s", tt.at, got, tt.want)
			}
			if got.Location() != time.UTC {
				t.Fatalf("bucket location = %s, want UTC", got.Location())
			}
		})
	}
}

func TestSampleBucketDetectsRepeatedMinutes(t *testing.T) {
	t.Parallel()

	first := time.Date(2026, 8, 26, 11, 58, 1, 0, time.UTC)
	again := time.Date(2026, 8, 26, 11, 58, 59, 0, time.UTC)
	later := time.Date(2026, 8, 26, 11, 59, 0, 0, time.UTC)

	if !sampleBucket(first).Equal(sampleBucket(again)) {
		t.Fatal("two ticks inside one minute produced different buckets")
	}
	if sampleBucket(first).Equal(sampleBucket(later)) {
		t.Fatal("ticks in different minutes produced the same bucket")
	}
}

func TestEgressKbps(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		deltaBytes int64
		elapsed    time.Duration
		want       int64
	}{
		{name: "no bytes is zero", deltaBytes: 0, elapsed: time.Minute, want: 0},
		{name: "a negative delta never reports a negative rate", deltaBytes: -5, elapsed: time.Minute, want: 0},
		{name: "a zero elapsed period cannot divide", deltaBytes: 1_000, elapsed: 0, want: 0},
		{name: "a backwards clock cannot divide", deltaBytes: 1_000, elapsed: -time.Second, want: 0},
		{name: "one megabyte a second is 8000 kbps", deltaBytes: 1_000_000, elapsed: time.Second, want: 8_000},
		{name: "a minute of bytes spreads over the minute", deltaBytes: 60_000_000, elapsed: time.Minute, want: 8_000},
		{name: "sub-kilobit rates round rather than truncate to zero", deltaBytes: 100, elapsed: time.Second, want: 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			if got := egressKbps(tt.deltaBytes, tt.elapsed); got != tt.want {
				t.Fatalf("egressKbps(%d, %s) = %d, want %d", tt.deltaBytes, tt.elapsed, got, tt.want)
			}
		})
	}
}

func TestNewSamplerSourceKey(t *testing.T) {
	t.Parallel()

	if got := NewSampler(Options{NodeID: "api-2"}).source; got != "proc:api-2" {
		t.Fatalf("source = %q, want %q", got, "proc:api-2")
	}
	if got := NewSampler(Options{}).source; got == "proc:" {
		t.Fatal("an empty node id must fall back to a host identity, not an empty source key")
	}
}

func TestSamplerStopIsIdempotent(t *testing.T) {
	t.Parallel()

	sampler := NewSampler(Options{NodeID: "api-1"})
	sampler.Stop()
	sampler.Stop()
}

func TestPruneExpiredDashboardMetricsKeepsLongTermPlaybackHistory(t *testing.T) {
	t.Parallel()

	store := &recordingMetricStore{}
	if err := pruneExpiredDashboardMetrics(context.Background(), store); err != nil {
		t.Fatalf("pruneExpiredDashboardMetrics() error = %v", err)
	}
	if len(store.calls) != 2 {
		t.Fatalf("calls = %d, want 2", len(store.calls))
	}

	clearSystem := store.calls[0]
	if !strings.Contains(clearSystem.query, "UPDATE dashboard_metric_samples") {
		t.Fatalf("system retention query = %s, want UPDATE", clearSystem.query)
	}
	for _, column := range []string{
		"cpu_pct",
		"memory_pct",
		"gpu_pct",
		"net_rx_bps",
		"net_tx_bps",
		"postgres_latency_ms",
		"redis_latency_ms",
		"node_latency_ms",
	} {
		if !strings.Contains(clearSystem.query, column+" = NULL") {
			t.Errorf("system retention query does not clear %s", column)
		}
	}
	if len(clearSystem.args) != 1 || clearSystem.args[0] != systemMetricRetentionHours {
		t.Fatalf("system retention args = %v, want [%d]", clearSystem.args, systemMetricRetentionHours)
	}

	deleteSamples := store.calls[1]
	if !strings.Contains(deleteSamples.query, "DELETE FROM dashboard_metric_samples") {
		t.Fatalf("sample retention query = %s, want DELETE", deleteSamples.query)
	}
	if len(deleteSamples.args) != 1 || deleteSamples.args[0] != sampleRetentionDays {
		t.Fatalf("sample retention args = %v, want [%d]", deleteSamples.args, sampleRetentionDays)
	}
}

func TestPruneExpiredDashboardMetricsStillDeletesRowsWhenClearingFails(t *testing.T) {
	t.Parallel()

	clearError := errors.New("clear failed")
	store := &recordingMetricStore{errors: []error{clearError}}
	err := pruneExpiredDashboardMetrics(context.Background(), store)

	if !errors.Is(err, clearError) {
		t.Fatalf("error = %v, want clear failure", err)
	}
	if len(store.calls) != 2 {
		t.Fatalf("calls = %d, want delete attempted after clear failure", len(store.calls))
	}
}

func TestSystemMetricsUsesFreshSnapshot(t *testing.T) {
	t.Parallel()

	at := time.Date(2026, 9, 3, 12, 0, 0, 0, time.UTC)
	videoBusy := 72
	totalBusy := 91
	metrics := systemMetrics(fixedResourceSampler{snapshot: nodemetrics.Snapshot{
		Available: true,
		SampledAt: at.Add(-5 * time.Second),
		System: &nodemetrics.SystemStats{
			CPUPct:     43,
			MemUsedMB:  3_072,
			MemTotalMB: 8_192,
			NetRxBps:   12_000,
			NetTxBps:   34_000,
		},
		GPU: []nodemetrics.GPUStats{
			{VideoBusyPct: &videoBusy},
			{TotalBusyPct: &totalBusy},
		},
	}}, at)

	if metrics.CPUPercent == nil || *metrics.CPUPercent != 43 {
		t.Fatalf("cpu = %v, want 43", metrics.CPUPercent)
	}
	if metrics.MemoryPercent == nil || *metrics.MemoryPercent != 37.5 {
		t.Fatalf("memory = %v, want 37.5", metrics.MemoryPercent)
	}
	if metrics.GPUPercent == nil || *metrics.GPUPercent != 91 {
		t.Fatalf("gpu = %v, want 91", metrics.GPUPercent)
	}
	if metrics.NetworkReceiveBPS == nil || *metrics.NetworkReceiveBPS != 12_000 {
		t.Fatalf("rx = %v, want 12000", metrics.NetworkReceiveBPS)
	}
	if metrics.NetworkSendBPS == nil || *metrics.NetworkSendBPS != 34_000 {
		t.Fatalf("tx = %v, want 34000", metrics.NetworkSendBPS)
	}
}

func TestSystemMetricsRejectsStaleSnapshot(t *testing.T) {
	t.Parallel()

	at := time.Date(2026, 9, 3, 12, 0, 0, 0, time.UTC)
	metrics := systemMetrics(fixedResourceSampler{snapshot: nodemetrics.Snapshot{
		Available: true,
		SampledAt: at.Add(-resourceSampleMaxAge - time.Second),
		System:    &nodemetrics.SystemStats{CPUPct: 80},
	}}, at)

	if metrics != (processSystemSample{}) {
		t.Fatalf("stale metrics = %+v, want empty sample", metrics)
	}
}
