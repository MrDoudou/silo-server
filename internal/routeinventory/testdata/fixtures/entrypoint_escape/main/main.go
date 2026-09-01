// Package main is an analyzer fixture, not shipped code. The route below is
// registered after the listener entry point returned, so the walk of that entry
// point cannot see it. Nothing but the scanned-tree audit can.
package main

import (
	"net/http"

	"example.test/fixture/listener"
)

func extra(w http.ResponseWriter, r *http.Request) {}

func main() {
	router := listener.NewRouter()
	router.Get("/registered-after-construction", extra)
	_ = http.ListenAndServe(":8080", router)
}
