// Package listener is an analyzer fixture, not shipped code. It stands in for
// a chi constructor the walk does not model — a future release adding one, or
// an existing helper nobody taught the analyzer about.
package listener

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

func handler(w http.ResponseWriter, r *http.Request) {}

// NewRouter is the fixture listener entry point.
func NewRouter() chi.Router {
	r := chi.NewRouter()
	r.Get("/visible", handler)

	alt := chi.NewRouterFromSomewhereElse()
	alt.Get("/hidden", handler)
	return r
}
