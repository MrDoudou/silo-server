package proxy

import (
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/Silo-Server/silo-server/internal/nodeconfig"
	"github.com/Silo-Server/silo-server/internal/nodesessions"
	"github.com/Silo-Server/silo-server/internal/routeinventory"
)

// TestRouteInventoryCoversRuntimeRouter proves the source-built inventory
// accounts for every route the real proxy listener registers.
func TestRouteInventoryCoversRuntimeRouter(t *testing.T) {
	inventory, err := routeinventory.LoadArtifact(".")
	if err != nil {
		t.Fatal(err)
	}
	router := NewServer(
		nodeconfig.NewWatcher(nil, nil, nil, nodeconfig.BootstrapOverrides{}),
		nodesessions.NewTracker(nil, "", "", ""),
	).Handler().(chi.Routes)

	observed, err := routeinventory.Observed(router)
	if err != nil {
		t.Fatal(err)
	}
	if len(observed) == 0 {
		t.Fatal("no routes observed; the fixture no longer builds a real router")
	}
	if missing := inventory.Reconcile(routeinventory.ListenerProxy, observed); len(missing) > 0 {
		t.Fatalf("the proxy listener registers %d route(s) with no inventory row; run `make route-inventory`:\n  %v",
			len(missing), missing)
	}
}
