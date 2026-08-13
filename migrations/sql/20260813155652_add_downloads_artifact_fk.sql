-- +goose Up
-- Terminal rows must not pin an artifact: the eviction fence treats their links
-- as dead, so an ON DELETE RESTRICT reference from one would block cleanup forever.
UPDATE public.downloads
SET artifact_id = NULL
WHERE artifact_id IS NOT NULL AND status IN ('cancelled', 'failed', 'revoked');

-- Heal legacy dangling references left by the pre-fence check-then-delete race.
UPDATE public.downloads
SET artifact_id = NULL
WHERE artifact_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.download_artifacts a WHERE a.id = public.downloads.artifact_id);

-- The real referential-integrity check. Application-level EXISTS fences read
-- independent snapshots under READ COMMITTED and take no conflicting locks, so
-- a concurrent evict/link pair can both commit; the FK's RI trigger takes a
-- FOR KEY SHARE row lock and re-checks with a fresh snapshot after blocking,
-- which is what actually makes a dangling artifact_id impossible.
ALTER TABLE public.downloads
    ADD CONSTRAINT downloads_artifact_id_fkey
    FOREIGN KEY (artifact_id) REFERENCES public.download_artifacts(id) ON DELETE RESTRICT;

-- +goose Down
ALTER TABLE public.downloads
    DROP CONSTRAINT IF EXISTS downloads_artifact_id_fkey;
