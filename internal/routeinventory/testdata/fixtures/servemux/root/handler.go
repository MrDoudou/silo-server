// Package root is an analyzer fixture, not shipped code. It stands in for the
// process root listener: an http.ServeMux that answers some paths itself and
// delegates a subtree to another inventoried listener.
package root

import "net/http"

func metrics(w http.ResponseWriter, r *http.Request) {}
func health(w http.ResponseWriter, r *http.Request)  {}

// newRootHandler is the fixture root listener entry point.
func newRootHandler(apiRouter http.Handler) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/metrics", http.HandlerFunc(metrics))
	mux.Handle("/api/", apiRouter)
	mux.HandleFunc("/health", health)
	return mux
}
