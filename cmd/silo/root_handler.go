package main

import (
	"net/http"

	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/Silo-Server/silo-server/internal/server"
)

// newRootHandler builds the handler the primary port serves.
//
// The API router is not the process's outermost handler: this http.ServeMux is.
// It answers /metrics itself, hands /api/ to the API listener, and serves the
// frontend everywhere else. Those registrations are routes like any other, so
// they are enumerated here — in one small function the route inventory can walk
// — rather than inline in main(), where nothing would notice a fourth
// registration appearing beside them.
//
// ABS-compat is deliberately absent: it binds its own port so its discovery
// probes (/ping, /healthcheck, /status, /init, /login, /socket.io) own the URL
// space without colliding with silo's SPA fallback. See
// newAudiobookshelfListener.
func newRootHandler(apiRouter http.Handler) http.Handler {
	mux := http.NewServeMux()
	// Prometheus metrics are not behind auth.
	mux.Handle("/metrics", promhttp.Handler())
	mux.Handle("/api/", apiRouter)
	mux.Handle("/", server.FrontendHandler())
	return mux
}
