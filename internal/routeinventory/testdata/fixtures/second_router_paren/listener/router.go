// Package listener is an analyzer fixture, not shipped code. The second
// construction is wrapped in parentheses, which changes nothing at runtime and
// used to be enough to slip past a walk that asserted a bare call expression.
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

	sub := (chi.NewRouter())
	sub.Get("/inner", handler)
	r.Handle("/prefix/*", sub)
	return r
}
