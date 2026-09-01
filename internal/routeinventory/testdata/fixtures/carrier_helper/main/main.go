// Package main is an analyzer fixture, not shipped code. The listener handler
// is never the receiver of a registration method here — it is asserted back to
// a chi.Router and passed to a helper, which registers on it out of sight.
package main

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"example.test/fixture/helperpkg"
	"example.test/fixture/listener"
)

func main() {
	h := listener.NewRouter()
	if r, ok := h.(chi.Router); ok {
		helperpkg.AddDebugRoutes(r)
	}
	_ = http.ListenAndServe(":8080", h)
}
