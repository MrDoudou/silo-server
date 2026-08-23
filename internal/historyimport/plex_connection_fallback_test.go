package historyimport

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
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
