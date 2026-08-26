package subdl

import (
	"archive/zip"
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestResolveDownloadURLAcceptsRelativePaths(t *testing.T) {
	t.Parallel()
	tests := []struct {
		id   string
		want string
	}{
		{id: "/subtitle/abc.zip", want: "https://dl.subdl.com/subtitle/abc.zip"},
		{id: "subtitle/abc.zip", want: "https://dl.subdl.com/subtitle/abc.zip"},
		{id: "/subtitle/abc.zip?token=1", want: "https://dl.subdl.com/subtitle/abc.zip?token=1"},
	}
	for _, tt := range tests {
		got, err := resolveDownloadURL(defaultDLBaseURL, tt.id)
		if err != nil {
			t.Fatalf("resolveDownloadURL(%q) error: %v", tt.id, err)
		}
		if got != tt.want {
			t.Fatalf("resolveDownloadURL(%q) = %q, want %q", tt.id, got, tt.want)
		}
	}
}

func TestResolveDownloadURLRejectsHostOverride(t *testing.T) {
	t.Parallel()
	ids := []string{
		"@127.0.0.1:8096/",
		"@127.0.0.1:6379/",
		"@localhost/",
		"//127.0.0.1/x",
		"https://evil.example/x",
		"http://127.0.0.1:8096/",
		"https://dl.subdl.com@127.0.0.1:8096/",
		"  @127.0.0.1:8096/  ",
		"",
		"subtitle with space.zip",
	}
	for _, id := range ids {
		got, err := resolveDownloadURL(defaultDLBaseURL, id)
		if err == nil {
			t.Fatalf("resolveDownloadURL(%q) = %q, want error", id, got)
		}
		if strings.Contains(got, "127.0.0.1") || strings.Contains(got, "evil.example") {
			t.Fatalf("resolveDownloadURL(%q) leaked off-origin URL %q despite error %v", id, got, err)
		}
	}
}

func TestDownloadUsesResolvedPathNotConcatenation(t *testing.T) {
	t.Parallel()
	var gotPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		_, _ = w.Write(minimalSubtitleZip(t))
	}))
	t.Cleanup(server.Close)

	provider := New(Config{DLBaseURL: server.URL, APIKey: "test"})
	data, format, err := provider.Download(context.Background(), "/subtitle/abc.zip")
	if err != nil {
		t.Fatalf("Download relative path: %v", err)
	}
	if gotPath != "/subtitle/abc.zip" {
		t.Fatalf("request path = %q, want /subtitle/abc.zip", gotPath)
	}
	if format != "srt" || !bytes.Contains(data, []byte("hello")) {
		t.Fatalf("downloaded subtitle format=%q data=%q", format, data)
	}
}

func TestDownloadRejectsUserinfoHostOverrideBeforeDial(t *testing.T) {
	t.Parallel()
	var dialed bool
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		dialed = true
	}))
	t.Cleanup(server.Close)

	provider := New(Config{DLBaseURL: server.URL, APIKey: "test"})
	_, _, err := provider.Download(context.Background(), "@127.0.0.1:1/")
	if err == nil {
		t.Fatal("Download(@127.0.0.1:1/) succeeded, want rejection")
	}
	if dialed {
		t.Fatal("Download dialed the download origin for a host-override id")
	}
	if !strings.Contains(err.Error(), "invalid download path") && !strings.Contains(err.Error(), "must be relative") {
		t.Fatalf("error = %v, want a path rejection", err)
	}
}

func TestDownloadRefusesOffHostRedirect(t *testing.T) {
	t.Parallel()
	loopback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		t.Fatal("loopback server must not be fetched")
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(loopback.Close)

	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, loopback.URL+"/secret", http.StatusFound)
	}))
	t.Cleanup(origin.Close)

	provider := New(Config{DLBaseURL: origin.URL, APIKey: "test"})
	_, _, err := provider.Download(context.Background(), "/subtitle/abc.zip")
	if err == nil {
		t.Fatal("Download followed an off-host redirect")
	}
	if !strings.Contains(err.Error(), "refusing redirect") && !strings.Contains(err.Error(), "download request") {
		t.Fatalf("error = %v, want redirect refusal", err)
	}
}

func minimalSubtitleZip(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	w, err := zw.Create("movie.srt")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := io.WriteString(w, "1\n00:00:01,000 --> 00:00:02,000\nhello\n"); err != nil {
		t.Fatal(err)
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}
