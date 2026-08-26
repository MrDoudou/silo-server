-- +goose Up
ALTER TABLE watch_provider_connections
    ADD COLUMN credential_revision bigint NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE watch_provider_connections
    DROP COLUMN credential_revision;
