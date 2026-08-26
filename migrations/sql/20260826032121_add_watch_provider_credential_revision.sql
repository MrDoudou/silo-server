-- +goose Up
ALTER TABLE watch_provider_connections
    ADD COLUMN credential_revision bigint NOT NULL DEFAULT 0;

-- Reject credential/account writes from replicas that predate the revision
-- protocol. Older binaries re-encrypt the credential bundle on every routine
-- connection upsert, so allowing an unchanged revision here would let a stale
-- replica overwrite a reconnect completed by a newer one during a rolling
-- deployment. New binaries either advance the revision for connect/rotation or
-- preserve every protected field for routine state updates.
-- +goose StatementBegin
CREATE FUNCTION public.fence_watch_provider_plugin_credentials()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT'
       AND NEW.provider LIKE 'plugin:%'
       AND NEW.credential_revision = 0 THEN
        RAISE EXCEPTION 'plugin credential insert requires initialized revision'
            USING ERRCODE = '40001';
    END IF;

    IF OLD.provider LIKE 'plugin:%'
       AND NEW.credential_revision = OLD.credential_revision
       AND (
           NEW.provider_account_id IS DISTINCT FROM OLD.provider_account_id
           OR NEW.provider_username IS DISTINCT FROM OLD.provider_username
           OR NEW.access_token IS DISTINCT FROM OLD.access_token
           OR NEW.refresh_token IS DISTINCT FROM OLD.refresh_token
           OR NEW.token_expires_at IS DISTINCT FROM OLD.token_expires_at
           OR NEW.plugin_credentials IS DISTINCT FROM OLD.plugin_credentials
       ) THEN
        RAISE EXCEPTION 'plugin credential write requires credential revision advance'
            USING ERRCODE = '40001';
    END IF;
    RETURN NEW;
END;
$$;
-- +goose StatementEnd

CREATE TRIGGER watch_provider_plugin_credentials_insert_fence
BEFORE INSERT
ON public.watch_provider_connections
FOR EACH ROW
EXECUTE FUNCTION public.fence_watch_provider_plugin_credentials();

CREATE TRIGGER watch_provider_plugin_credentials_revision_fence
BEFORE UPDATE OF provider_account_id, provider_username, access_token,
    refresh_token, token_expires_at, plugin_credentials, credential_revision
ON public.watch_provider_connections
FOR EACH ROW
EXECUTE FUNCTION public.fence_watch_provider_plugin_credentials();

-- +goose Down
DROP TRIGGER IF EXISTS watch_provider_plugin_credentials_insert_fence
    ON public.watch_provider_connections;
DROP TRIGGER IF EXISTS watch_provider_plugin_credentials_revision_fence
    ON public.watch_provider_connections;
DROP FUNCTION IF EXISTS public.fence_watch_provider_plugin_credentials();

ALTER TABLE watch_provider_connections
    DROP COLUMN credential_revision;
