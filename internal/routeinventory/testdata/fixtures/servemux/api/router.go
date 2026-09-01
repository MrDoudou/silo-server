// Package api is an analyzer fixture, not shipped code.
package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

func handler(w http.ResponseWriter, r *http.Request) {}

// NewRouter is the fixture API listener entry point.
func NewRouter() http.Handler {
	r := chi.NewRouter()
	r.Get("/api/v1/thing", handler)
	return r
}
