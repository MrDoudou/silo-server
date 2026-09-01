package routeinventory

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

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
// The check is one-directional because a listener with conditionally
// registered routes holds more rows than any single wiring can register — that
// is the point of building it from source. Use ReconcileExact for a listener
// whose rows are all unconditional, where a row with no runtime counterpart is
// a phantom.
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

// ReconcileExact compares a live router against the inventory in both
// directions: every observed route must have a row, and every row must be
// observed.
//
// It applies to a listener whose rows are all unconditional. For those, one
// wiring is the whole surface, so a row with no runtime counterpart is a
// phantom the one-directional check would let stand. Callers should assert
// ConditionalCount is zero before relying on it.
func (inv *Inventory) ReconcileExact(listener string, observed []string) (unledgered, unobserved []string) {
	unledgered = inv.Reconcile(listener, observed)

	seen := make(map[string]struct{}, len(observed))
	for _, entry := range observed {
		seen[listener+" "+entry] = struct{}{}
	}
	for key := range inv.RuntimeKeys(listener) {
		if _, ok := seen[key]; !ok {
			unobserved = append(unobserved, strings.TrimPrefix(key, listener+" "))
		}
	}
	sort.Strings(unobserved)
	return unledgered, unobserved
}

// ConditionalCount is how many of a listener's rows are registered under a
// condition. Zero means one wiring registers the listener's whole surface.
func (inv *Inventory) ConditionalCount(listener string) int {
	count := 0
	for _, route := range inv.Routes {
		if route.Listener == listener && route.Conditional {
			count++
		}
	}
	return count
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
