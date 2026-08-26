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
		AccessToken:         "token-a",
		PluginConfigValues:  map[string]string{"endpoint": "https://a.example.com"},
		PluginConfigSecrets: map[string]string{"secret": "secret-a"},
	})
	if err != nil {
		t.Fatalf("connect plugin: %v", err)
	}
	requestSnapshot := connected

	stateOnly := connected
	stateOnly.LastError = "routine state update"
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

	reconnected := rotated
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
		persisted.PluginConfigValues["endpoint"] != "https://b.example.com" ||
		persisted.PluginConfigSecrets["secret"] != "secret-b" ||
		persisted.CredentialRevision != reconnected.CredentialRevision {
		t.Fatalf("newer reconnect was overwritten: %#v", persisted)
	}
}
