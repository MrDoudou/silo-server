// Package helperpkg is an analyzer fixture, not shipped code. It stands in for
// any package outside the audited set that registers on a router handed to it.
package helperpkg

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

func debug(w http.ResponseWriter, r *http.Request) {}

// AddDebugRoutes registers a route no listener walk can see: the router reached
// it after the entry point had already returned.
func AddDebugRoutes(r chi.Router) {
	r.Get("/hidden", debug)
}
