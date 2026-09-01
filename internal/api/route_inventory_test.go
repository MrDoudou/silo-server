package api

import (
	"context"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Silo-Server/silo-server/internal/catalog"
	"github.com/Silo-Server/silo-server/internal/config"
	"github.com/Silo-Server/silo-server/internal/playback"
	"github.com/Silo-Server/silo-server/internal/routeinventory"
	"github.com/Silo-Server/silo-server/internal/scanner"
)

// TestRouteInventoryCoversRuntimeRouter is the runtime half of the inventory
// gate. `make verify-route-inventory` proves the committed artifact matches the
// source analysis; this proves the source analysis matches a router that
// actually runs, so an analyzer bug cannot quietly drop a live route.
//
// The comparison is one-directional on purpose: the inventory is expected to
// hold more routes than any single wiring registers. That surplus is the whole
// reason the inventory is built from source — the maximal fixture below cannot
// see routes behind dependencies it does not construct.
func TestRouteInventoryCoversRuntimeRouter(t *testing.T) {
	inventory, err := routeinventory.LoadArtifact(".")
	if err != nil {
		t.Fatal(err)
	}

	cfg, err := config.LoadFromDB(map[string]string{})
	if err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(context.Background(), "postgres://nobody:nobody@127.0.0.1:1/none?sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	fixtures := map[string]chi.Routes{
		"minimal": NewRouter(Dependencies{Config: cfg}),
		"maximal": NewRouter(Dependencies{
			DB:         pool,
			Config:     cfg,
			FileRepo:   scanner.NewFileRepository(pool),
			FolderRepo: catalog.NewFolderRepository(pool),
			SessionMgr: playback.NewSessionManager(0, 0),
		}),
	}

	total := 0
	for name, router := range fixtures {
		observed, err := routeinventory.Observed(router)
		if err != nil {
			t.Fatalf("%s: walk router: %v", name, err)
		}
		total += len(observed)
		if missing := inventory.Reconcile(routeinventory.ListenerAPI, observed); len(missing) > 0 {
			t.Errorf("%s fixture registers %d route(s) with no inventory row; run `make route-inventory`:\n  %v",
				name, len(missing), missing)
		}
	}
	if total == 0 {
		t.Fatal("no routes observed; the fixtures no longer build a real router")
	}
}
