package historyimport

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type plexTestRoundTripFunc func(*http.Request) (*http.Response, error)

func (f plexTestRoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestPlexServerProviderFallsBackToReachableConnection(t *testing.T) {
	t.Parallel()

	unreachable := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	unreachableURL := unreachable.URL
	unreachable.Close()

	var workingRequests atomic.Int32
	working := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		workingRequests.Add(1)
		if got := r.Header.Get("X-Plex-Token"); got != "server-token" {
			t.Errorf("X-Plex-Token = %q, want server-token", got)
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(map[string]any{"MediaContainer": map[string]any{}}); err != nil {
			t.Errorf("encode response: %v", err)
		}
	}))
	defer working.Close()

	provider := NewPlexServerProvider(NewPlexClient(), []string{unreachableURL, working.URL}, "server-token")
	records, warnings, err := provider.Fetch(context.Background())
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if len(records) != 0 || len(warnings) != 0 {
		t.Fatalf("records = %v, warnings = %v; want both empty", records, warnings)
	}
	if got := workingRequests.Load(); got != 2 {
		t.Fatalf("working connection requests = %d, want library sections and on-deck", got)
	}
}

func TestPlexServerProviderUsesFirstRespondingConnection(t *testing.T) {
	t.Parallel()

	slowStarted := make(chan struct{})
	client := NewPlexClient()
	client.httpClient = &http.Client{Transport: plexTestRoundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.URL.Host == "slow-plex.example" {
			close(slowStarted)
			<-req.Context().Done()
			return nil, req.Context().Err()
		}
		<-slowStarted
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(`{"MediaContainer":{}}`)),
			Request:    req,
		}, nil
	})}
	provider := NewPlexServerProvider(client, []string{
		"https://slow-plex.example",
		"https://fast-plex.example",
	}, "server-token")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() {
		_, err := provider.fetchLibrarySections(ctx)
		done <- err
	}()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("fetchLibrarySections: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("fetchLibrarySections waited for the slow connection instead of using the first response")
	}
	if provider.baseURL != "https://fast-plex.example" {
		t.Fatalf("selected base URL = %q, want fast connection", provider.baseURL)
	}
}

func TestPlexServerProviderPublicConnectionsBlockPrivateDestinations(t *testing.T) {
	t.Parallel()

	var requests atomic.Int32
	privateServer := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"MediaContainer":{}}`))
	}))
	defer privateServer.Close()

	provider := NewPlexServerProvider(NewPlexClient(), []string{privateServer.URL}, "server-token").
		WithPublicConnectionsOnly()
	_, _, err := provider.Fetch(context.Background())
	if !errors.Is(err, errPrivatePlexDestination) {
		t.Fatalf("Fetch error = %v, want private destination rejection", err)
	}
	if got := requests.Load(); got != 0 {
		t.Fatalf("private destination received %d requests, want 0", got)
	}
}

func TestPlexServerProviderPublicConnectionsRejectCleartextHTTP(t *testing.T) {
	t.Parallel()

	var requests atomic.Int32
	cleartextServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"MediaContainer":{}}`))
	}))
	defer cleartextServer.Close()

	provider := NewPlexServerProvider(NewPlexClient(), []string{cleartextServer.URL}, "server-token").
		WithPublicConnectionsOnly()
	_, _, err := provider.Fetch(context.Background())
	if err == nil || !strings.Contains(err.Error(), "HTTPS") {
		t.Fatalf("Fetch error = %v, want cleartext HTTP rejection", err)
	}
	if got := requests.Load(); got != 0 {
		t.Fatalf("cleartext destination received %d requests, want 0", got)
	}
}

func TestFetchPlexLibrarySectionsRejectsMissingMediaContainer(t *testing.T) {
	t.Parallel()

	notPlex := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{}`))
	}))
	defer notPlex.Close()

	_, err := NewPlexClient().FetchLibrarySections(context.Background(), notPlex.URL, "server-token")
	if err == nil || !strings.Contains(err.Error(), "MediaContainer") {
		t.Fatalf("FetchLibrarySections error = %v, want missing MediaContainer rejection", err)
	}
}

func TestFetchPlexSectionItemsAcceptsVideoAndPaginates(t *testing.T) {
	t.Parallel()

	plexServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch got := r.URL.Query().Get("X-Plex-Container-Start"); got {
		case "0":
			_, _ = w.Write([]byte(`{"MediaContainer":{"totalSize":2,"Video":[{"ratingKey":"movie-1","type":"movie","title":"First"}]}}`))
		case "1":
			_, _ = w.Write([]byte(`{"MediaContainer":{"totalSize":2,"Video":[{"ratingKey":"movie-2","type":"movie","title":"Second"}]}}`))
		default:
			t.Errorf("X-Plex-Container-Start = %q, want 0 or 1", got)
			http.Error(w, "unexpected offset", http.StatusBadRequest)
		}
	}))
	defer plexServer.Close()

	items, err := NewPlexClient().FetchSectionItems(context.Background(), plexServer.URL, "server-token", "1", 1)
	if err != nil {
		t.Fatalf("FetchSectionItems: %v", err)
	}
	if len(items) != 2 || items[0].RatingKey != "movie-1" || items[1].RatingKey != "movie-2" {
		t.Fatalf("items = %+v, want both Video pages", items)
	}
}

func TestNewPlexRunProviderRestrictsOnlyProfileOAuth(t *testing.T) {
	t.Parallel()

	client := NewPlexClient()
	auth := &plexAuth{BaseURLs: []string{"http://192.168.1.10:32400"}, Token: "server-token"}

	oauthProvider := newPlexRunProvider(client, auth, ConnectionModePlexOAuth)
	if oauthProvider.client == client || oauthProvider.client.httpClient == client.httpClient {
		t.Fatal("profile OAuth provider did not install the public-only HTTP client")
	}

	predefinedProvider := newPlexRunProvider(client, auth, ConnectionModePredefined)
	if predefinedProvider.client != client || predefinedProvider.client.httpClient != client.httpClient {
		t.Fatal("administrator-defined provider unexpectedly restricted private destinations")
	}
}

func TestPublicPlexAddress(t *testing.T) {
	t.Parallel()

	tests := []struct {
		address string
		want    bool
	}{
		{address: "8.8.8.8", want: true},
		{address: "2606:4700:4700::1111", want: true},
		{address: "10.0.0.1", want: false},
		{address: "100.64.0.1", want: false},
		{address: "127.0.0.1", want: false},
		{address: "169.254.169.254", want: false},
		{address: "192.0.2.1", want: false},
		{address: "192.168.1.10", want: false},
		{address: "::1", want: false},
		{address: "::10.0.0.1", want: false},
		{address: "::ffff:10.0.0.1", want: false},
		{address: "::ffff:8.8.8.8", want: true},
		{address: "64:ff9b:1::10.0.0.1", want: false},
		{address: "100::1", want: false},
		{address: "2001::1", want: false},
		{address: "2001:10::1", want: false},
		{address: "2002::1", want: false},
		{address: "fc00::1", want: false},
		{address: "fe80::1", want: false},
	}
	for _, test := range tests {
		t.Run(test.address, func(t *testing.T) {
			address := netip.MustParseAddr(test.address)
			if got := publicPlexAddress(address); got != test.want {
				t.Fatalf("publicPlexAddress(%s) = %v, want %v", address, got, test.want)
			}
		})
	}
}

func TestPlexBaseURLCandidatesPreservesPrimaryAndBoundsFallbacks(t *testing.T) {
	t.Parallel()

	got := plexBaseURLCandidates(" https://preferred.example/ ", []string{
		"https://preferred.example",
		"https://fallback-1.example/",
		"",
		"https://fallback-2.example",
		"https://fallback-3.example",
		"https://fallback-4.example",
		"https://fallback-5.example",
		"https://fallback-6.example",
		"https://fallback-7.example",
		"https://fallback-8.example",
	})

	if len(got) != maxPlexConnectionCandidates {
		t.Fatalf("candidate count = %d, want %d: %v", len(got), maxPlexConnectionCandidates, got)
	}
	if got[0] != "https://preferred.example" || got[1] != "https://fallback-1.example" {
		t.Fatalf("candidate order = %v, want preferred then advertised fallbacks", got)
	}
}
