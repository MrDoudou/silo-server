-- +goose Up
CREATE TABLE public.download_artifact_local_orphans (
    id bigserial PRIMARY KEY,
    download_artifact_id text NOT NULL,
    output_path text NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    next_retry_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (output_path),
    CONSTRAINT download_artifact_local_orphans_locator_check
        CHECK (download_artifact_id <> '' AND output_path <> '')
);

CREATE INDEX download_artifact_local_orphans_due_idx
    ON public.download_artifact_local_orphans (next_retry_at, created_at);

-- +goose Down
DROP TABLE IF EXISTS public.download_artifact_local_orphans;
