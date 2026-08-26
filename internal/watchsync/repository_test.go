package watchsync

import (
	"context"
	"errors"
	"fmt"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Silo-Server/silo-server/internal/secret"
)

func TestMediaDurationQueryUsesActiveMediaFilesPredicate(t *testing.T) {
	if !strings.Contains(mediaDurationQuery, "missing_since IS NULL") {
		t.Fatalf("media duration query must filter active files with missing_since IS NULL:\n%s", mediaDurationQuery)
	}
	if strings.Contains(mediaDurationQuery, "missing = false") {
		t.Fatalf("media duration query references removed media_files.missing column:\n%s", mediaDurationQuery)
	}
}

func TestPluginCredentialBundleRoundTrip(t *testing.T) {
	cipher, err := secret.New([]byte("01234567890123456789012345678901"))
	if err != nil {
		t.Fatal(err)
	}
	repository := NewPostgresRepository(nil, cipher)
	expiresAt := time.Now().UTC().Truncate(time.Second)
	input := Connection{
		Provider: "plugin:4:tracker", UserID: 7, ProfileID: "profile",
		AccessToken: testAccessToken, RefreshToken: testRefreshToken, TokenExpiresAt: &expiresAt,
		TokenType: testDPoPTokenType, Scopes: []string{testHistoryScope, "watchlist"},
		SecretAttributes:    map[string]string{"instance": testOneValue},
		PluginConfigValues:  map[string]string{"floppy.base_url": "https://personal.example.com"},
		PluginConfigSecrets: map[string]string{"floppy.token": "profile-secret"},
	}
	encoded, err := repository.encodePluginCredentials(input)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(encoded, input.AccessToken) || !strings.HasPrefix(encoded, "enc:v1:") {
		t.Fatalf("credential bundle was not encrypted: %q", encoded)
	}
	output := Connection{Provider: input.Provider, UserID: input.UserID, ProfileID: input.ProfileID}
	if err := repository.decodePluginCredentials(&output, encoded); err != nil {
		t.Fatal(err)
	}
	if output.AccessToken != input.AccessToken || output.RefreshToken != input.RefreshToken ||
		output.TokenType != input.TokenType || !output.TokenExpiresAt.Equal(expiresAt) ||
		!reflect.DeepEqual(output.Scopes, input.Scopes) || !reflect.DeepEqual(output.SecretAttributes, input.SecretAttributes) ||
		!reflect.DeepEqual(output.PluginConfigValues, input.PluginConfigValues) ||
		!reflect.DeepEqual(output.PluginConfigSecrets, input.PluginConfigSecrets) {
		t.Fatalf("decoded credentials = %#v", output)
	}
}

func TestPluginCredentialBundleUsesConnectionIdentityAsAAD(t *testing.T) {
	cipher, err := secret.New([]byte("01234567890123456789012345678901"))
	if err != nil {
		t.Fatal(err)
	}
	repository := NewPostgresRepository(nil, cipher)
	input := Connection{
		Provider: "plugin:4:tracker", UserID: 7, ProfileID: "profile-a",
		AccessToken: testAccessToken,
	}
	encoded, err := repository.encodePluginCredentials(input)
	if err != nil {
		t.Fatal(err)
	}
	wrongIdentity := Connection{Provider: input.Provider, UserID: input.UserID, ProfileID: "profile-b"}
	if err := repository.decodePluginCredentials(&wrongIdentity, encoded); err == nil {
		t.Fatal("decodePluginCredentials with different profile identity succeeded")
	}
}

func TestPluginCredentialBundleIsOnlyWrittenForPluginProviders(t *testing.T) {
	cipher, err := secret.New([]byte("01234567890123456789012345678901"))
	if err != nil {
		t.Fatal(err)
	}
	repository := NewPostgresRepository(nil, cipher)
	for _, provider := range []string{"trakt", "simkl", "mdblist"} {
		encoded, err := repository.pluginCredentialsForConnection(Connection{
			Provider: provider, UserID: 7, ProfileID: "profile", AccessToken: testAccessToken,
		})
		if err != nil {
			t.Fatalf("pluginCredentialsForConnection(%q): %v", provider, err)
		}
		if encoded != "" {
			t.Fatalf("pluginCredentialsForConnection(%q) = %q, want empty", provider, encoded)
		}
	}
	encoded, err := repository.pluginCredentialsForConnection(Connection{
		Provider: "plugin:4:tracker", UserID: 7, ProfileID: "profile", AccessToken: testAccessToken,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(encoded, "enc:v1:") {
		t.Fatalf("plugin credential bundle = %q, want encrypted value", encoded)
	}
}

func TestPluginCredentialRevisionMigrationFencesLegacyWriters(t *testing.T) {
	body, err := os.ReadFile("../../migrations/sql/20260826032121_add_watch_provider_credential_revision.sql")
	if err != nil {
		t.Fatal(err)
	}
	migration := string(body)
	for _, required := range []string{
		"watch_provider_plugin_credentials_insert_fence",
		"watch_provider_plugin_credentials_revision_fence",
		"TG_OP = 'INSERT'",
		"NEW.credential_revision = 0",
		"NEW.credential_revision = OLD.credential_revision",
		"NEW.provider_account_id IS DISTINCT FROM OLD.provider_account_id",
		"NEW.plugin_credentials IS DISTINCT FROM OLD.plugin_credentials",
		"ERRCODE = '40001'",
	} {
		if !strings.Contains(migration, required) {
			t.Fatalf("credential revision migration is missing %q", required)
		}
	}
}

func TestPluginCredentialWritesFenceReconnectsDB(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("SILO_TEST_DATABASE_URL"))
	if dsn == "" {
		t.Skip("SILO_TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("connect test database: %v", err)
	}
	t.Cleanup(pool.Close)
	var revisionColumn bool
	if err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_schema = 'public'
				AND table_name = 'watch_provider_connections'
				AND column_name = 'credential_revision'
		)
	`).Scan(&revisionColumn); err != nil {
		t.Fatalf("check credential revision migration: %v", err)
	}
	if !revisionColumn {
		t.Skip("test database has not applied the credential revision migration")
	}

	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	profileID := "watchsync-credential-test-" + suffix
	var userID int
	if err := pool.QueryRow(ctx, `INSERT INTO users (username) VALUES ($1) RETURNING id`, profileID).Scan(&userID); err != nil {
		t.Fatalf("insert test user: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO user_profiles (id, user_id, name) VALUES ($1, $2, $3)`, profileID, userID, "Watch Sync Credential Test"); err != nil {
		t.Fatalf("insert test profile: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM user_profiles WHERE user_id = $1 AND id = $2`, userID, profileID)
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	})

	cipher, err := secret.New([]byte("01234567890123456789012345678901"))
	if err != nil {
		t.Fatal(err)
	}
	repository := NewPostgresRepository(pool, cipher)
	connected, err := repository.UpsertPluginConnection(ctx, Connection{
		Provider: "plugin:4:tracker", UserID: userID, ProfileID: profileID,
		ProviderAccountID: "account-a", ProviderUsername: "alice",
		AccessToken:         "token-a",
		PluginConfigValues:  map[string]string{"endpoint": "https://a.example.com"},
		PluginConfigSecrets: map[string]string{"secret": "secret-a"},
	})
	if err != nil {
		t.Fatalf("connect plugin: %v", err)
	}
	requestSnapshot := connected

	stateOnly := connected
	stateOnly.LastError = "concurrent sync failure"
	if _, err := repository.UpsertConnection(ctx, stateOnly); err != nil {
		t.Fatalf("routine state update: %v", err)
	}
	requestSnapshot.AccessToken = "rotated-token"
	rotated, err := repository.UpdatePluginCredentials(ctx, requestSnapshot)
	if err != nil {
		t.Fatalf("rotation after routine state update: %v", err)
	}
	if rotated.CredentialRevision != connected.CredentialRevision+1 {
		t.Fatalf("rotation revision = %d, want %d", rotated.CredentialRevision, connected.CredentialRevision+1)
	}
	if rotated.LastError != "concurrent sync failure" {
		t.Fatalf("rotation overwrote concurrent LastError: %q", rotated.LastError)
	}

	reconnected := rotated
	reconnected.ProviderAccountID = "account-b"
	reconnected.ProviderUsername = "bob"
	reconnected.AccessToken = "token-b"
	reconnected.PluginConfigValues = map[string]string{"endpoint": "https://b.example.com"}
	reconnected.PluginConfigSecrets = map[string]string{"secret": "secret-b"}
	reconnected, err = repository.UpsertPluginConnection(ctx, reconnected)
	if err != nil {
		t.Fatalf("reconnect plugin: %v", err)
	}

	requestSnapshot.AccessToken = "stale-rotation"
	if _, err := repository.UpdatePluginCredentials(ctx, requestSnapshot); !errors.Is(err, errPluginCredentialUpdateConflict) {
		t.Fatalf("stale rotation error = %v, want credential conflict", err)
	}
	staleState := connected
	staleState.LastError = "late routine state update"
	persisted, err := repository.UpsertConnection(ctx, staleState)
	if err != nil {
		t.Fatalf("late routine state update: %v", err)
	}
	if persisted.AccessToken != "token-b" ||
		persisted.ProviderAccountID != "account-b" ||
		persisted.ProviderUsername != "bob" ||
		persisted.PluginConfigValues["endpoint"] != "https://b.example.com" ||
		persisted.PluginConfigSecrets["secret"] != "secret-b" ||
		persisted.CredentialRevision != reconnected.CredentialRevision {
		t.Fatalf("newer reconnect was overwritten: %#v", persisted)
	}

	_, err = pool.Exec(ctx, `
		UPDATE watch_provider_connections
		SET access_token = $2,
			plugin_credentials = $3,
			provider_account_id = $4
		WHERE id = $1::uuid
	`, persisted.ID, "legacy-token", "legacy-credential-bundle", "legacy-account")
	var postgresError *pgconn.PgError
	if !errors.As(err, &postgresError) || postgresError.Code != "40001" {
		t.Fatalf("legacy writer error = %#v, want SQLSTATE 40001", err)
	}

	if _, err := pool.Exec(ctx, `DELETE FROM watch_provider_connections WHERE id = $1::uuid`, persisted.ID); err != nil {
		t.Fatalf("delete reconnected row: %v", err)
	}
	_, err = pool.Exec(ctx, `
		INSERT INTO watch_provider_connections (
			provider, user_id, profile_id, provider_account_id, access_token, plugin_credentials
		) VALUES ($1, $2, $3, $4, $5, $6)
	`, persisted.Provider, userID, profileID, "legacy-account", "legacy-token", "legacy-credential-bundle")
	postgresError = nil
	if !errors.As(err, &postgresError) || postgresError.Code != "40001" {
		t.Fatalf("legacy insert error = %#v, want SQLSTATE 40001", err)
	}
}
