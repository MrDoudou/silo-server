// Package root is an analyzer fixture, not shipped code. The mux is handed to a
// helper the walk does not follow, so its registrations would be invisible.
package root

import "net/http"

func hidden(w http.ResponseWriter, r *http.Request) {}

func install(mux *http.ServeMux) {
	mux.Handle("/hidden", http.HandlerFunc(hidden))
}

// newRootHandler is the fixture root listener entry point.
func newRootHandler() http.Handler {
	mux := http.NewServeMux()
	install(mux)
	return mux
}
