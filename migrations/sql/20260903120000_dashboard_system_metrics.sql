-- +goose Up
-- Extend the existing minute samples with the API host's resource pressure and
-- dependency round-trip times. These values are nullable because sampling is
-- Linux-only, Redis is optional, and an individual probe can fail without
-- invalidating the stream and egress sample for that minute.
ALTER TABLE dashboard_metric_samples
    ADD COLUMN IF NOT EXISTS cpu_pct double precision,
    ADD COLUMN IF NOT EXISTS memory_pct double precision,
    ADD COLUMN IF NOT EXISTS gpu_pct double precision,
    ADD COLUMN IF NOT EXISTS net_rx_bps bigint,
    ADD COLUMN IF NOT EXISTS net_tx_bps bigint,
    ADD COLUMN IF NOT EXISTS postgres_latency_ms double precision,
    ADD COLUMN IF NOT EXISTS redis_latency_ms double precision,
    ADD COLUMN IF NOT EXISTS node_latency_ms double precision;

-- +goose Down
ALTER TABLE dashboard_metric_samples
    DROP COLUMN IF EXISTS node_latency_ms,
    DROP COLUMN IF EXISTS redis_latency_ms,
    DROP COLUMN IF EXISTS postgres_latency_ms,
    DROP COLUMN IF EXISTS net_tx_bps,
    DROP COLUMN IF EXISTS net_rx_bps,
    DROP COLUMN IF EXISTS gpu_pct,
    DROP COLUMN IF EXISTS memory_pct,
    DROP COLUMN IF EXISTS cpu_pct;
