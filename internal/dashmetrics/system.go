package dashmetrics

import (
	"context"
	"log/slog"
	"math"
	"time"

	"github.com/Silo-Server/silo-server/internal/nodemetrics"
)

const (
	dependencyProbeTimeout = 2 * time.Second
	resourceSampleMaxAge   = 3 * nodemetrics.DefaultInterval
)

type processSystemSample struct {
	CPUPercent        *float64
	MemoryPercent     *float64
	GPUPercent        *float64
	NetworkReceiveBPS *int64
	NetworkSendBPS    *int64
}

// sampleProcessSystem records the already-collected local snapshot and the
// dependency round trips. This adds no /proc or GPU work to the minute tick.
func (s *Sampler) sampleProcessSystem(ctx context.Context, at time.Time) {
	metrics := systemMetrics(s.resources, at)
	postgresLatency := measureLatency(ctx, s.pool.Ping)

	var redisLatency *float64
	if s.redis != nil {
		redisLatency = measureLatency(ctx, func(probeCtx context.Context) error {
			return s.redis.Ping(probeCtx).Err()
		})
	}
	var nodeLatency *float64
	if s.nodes != nil {
		nodeLatency = s.nodes.MaxHealthyLatencyMS()
	}

	_, err := s.pool.Exec(ctx, `
		INSERT INTO dashboard_metric_samples
			(bucket, source, cpu_pct, memory_pct, gpu_pct, net_rx_bps, net_tx_bps,
			 postgres_latency_ms, redis_latency_ms, node_latency_ms)
		VALUES (date_trunc('minute', now()), $1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (bucket, source) DO UPDATE
		SET cpu_pct = GREATEST(dashboard_metric_samples.cpu_pct, EXCLUDED.cpu_pct),
		    memory_pct = GREATEST(dashboard_metric_samples.memory_pct, EXCLUDED.memory_pct),
		    gpu_pct = GREATEST(dashboard_metric_samples.gpu_pct, EXCLUDED.gpu_pct),
		    net_rx_bps = GREATEST(dashboard_metric_samples.net_rx_bps, EXCLUDED.net_rx_bps),
		    net_tx_bps = GREATEST(dashboard_metric_samples.net_tx_bps, EXCLUDED.net_tx_bps),
		    postgres_latency_ms = GREATEST(dashboard_metric_samples.postgres_latency_ms, EXCLUDED.postgres_latency_ms),
		    redis_latency_ms = GREATEST(dashboard_metric_samples.redis_latency_ms, EXCLUDED.redis_latency_ms),
		    node_latency_ms = GREATEST(dashboard_metric_samples.node_latency_ms, EXCLUDED.node_latency_ms)
	`, s.source, metrics.CPUPercent, metrics.MemoryPercent, metrics.GPUPercent,
		metrics.NetworkReceiveBPS, metrics.NetworkSendBPS, postgresLatency, redisLatency, nodeLatency)
	if err != nil {
		slog.WarnContext(ctx, "failed to sample process system metrics",
			"component", component, "source", s.source, "error", err)
	}
}

func systemMetrics(sampler resourceSnapshotter, at time.Time) processSystemSample {
	if sampler == nil {
		return processSystemSample{}
	}
	snapshot := sampler.Snapshot()
	if !snapshot.Available || snapshot.System == nil || snapshot.SampledAt.IsZero() ||
		at.Sub(snapshot.SampledAt) > resourceSampleMaxAge {
		return processSystemSample{}
	}

	system := snapshot.System
	cpuPercent := float64(system.CPUPct)
	metrics := processSystemSample{
		CPUPercent:        &cpuPercent,
		NetworkReceiveBPS: int64Pointer(system.NetRxBps),
		NetworkSendBPS:    int64Pointer(system.NetTxBps),
	}
	if system.MemTotalMB > 0 {
		memoryPercent := roundedPercent(float64(system.MemUsedMB), float64(system.MemTotalMB))
		metrics.MemoryPercent = &memoryPercent
	}
	metrics.GPUPercent = busiestGPUPercent(snapshot.GPU)
	return metrics
}

func busiestGPUPercent(gpus []nodemetrics.GPUStats) *float64 {
	var busiest *float64
	for _, gpu := range gpus {
		reading := gpu.VideoBusyPct
		if reading == nil {
			reading = gpu.TotalBusyPct
		}
		if reading == nil {
			continue
		}
		value := float64(*reading)
		if busiest == nil || value > *busiest {
			busiest = &value
		}
	}
	return busiest
}

func measureLatency(ctx context.Context, probe func(context.Context) error) *float64 {
	probeCtx, cancel := context.WithTimeout(ctx, dependencyProbeTimeout)
	defer cancel()

	startedAt := time.Now()
	if err := probe(probeCtx); err != nil {
		return nil
	}
	milliseconds := math.Round(float64(time.Since(startedAt).Microseconds())/10) / 100
	return &milliseconds
}

func roundedPercent(used, total float64) float64 {
	if total <= 0 {
		return 0
	}
	return math.Round(used/total*10_000) / 100
}

func int64Pointer(value int64) *int64 {
	return &value
}
