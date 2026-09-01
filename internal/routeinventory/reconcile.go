package routeinventory

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"

	"github.com/go-chi/chi/v5"
)

// Observed lists the method+path variants a live chi router registers.
//
// chi reports a Handle/HandleFunc registration as the single method "*"; the
// inventory enumerates the nine methods that wildcard covers, so the walk
// expands it the same way. The result is directly comparable to an inventory
// row.
func Observed(router chi.Routes) ([]string, error) {
	var observed []string
	err := chi.Walk(router, func(method, pattern string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		if method == "*" {
			for _, expanded := range handleAllMethods {
				observed = append(observed, expanded+" "+pattern)
			}
			return nil
		}
		observed = append(observed, method+" "+pattern)
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Strings(observed)
	return observed, nil
}

// Reconcile reports every route a live router registers that the inventory does
// not claim, sorted. An empty result means the running router is fully
// accounted for.
//
// The check is deliberately one-directional. The inventory is expected to hold
// more routes than any single wiring registers — that is the point of building
// it from source — so an inventory row with no runtime counterpart is not an
// error.
func (inv *Inventory) Reconcile(listener string, observed []string) []string {
	claimed := inv.RuntimeKeys(listener)
	var missing []string
	for _, entry := range observed {
		if _, ok := claimed[listener+" "+entry]; !ok {
			missing = append(missing, entry)
		}
	}
	sort.Strings(missing)
	return missing
}

// LoadArtifact reads the committed inventory. dir is any directory inside the
// repository; the repository root is located from it.
func LoadArtifact(dir string) (*Inventory, error) {
	root, err := FindRepoRoot(dir)
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(ArtifactPath)))
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", ArtifactPath, err)
	}
	return Load(data)
}
