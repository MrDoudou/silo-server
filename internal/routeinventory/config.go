package routeinventory

import (
	"errors"
	"os"
	"path/filepath"
)

// ModulePath is this repository's Go module path.
const ModulePath = "github.com/Silo-Server/silo-server"

// ArtifactPath is the committed inventory, relative to the repository root.
const ArtifactPath = "contracts/api/v2/route-inventory.json"

// DefaultConfig describes the legacy native HTTP surface: the three listeners
// Silo serves natively, the packages that register on them, and the routers
// that are deliberately out of scope.
//
// The compatibility listeners below are excluded on purpose. Jellyfin and
// Audiobookshelf are external wire contracts Silo implements, not Silo's own
// API, and the v2 program leaves them untouched. They still need an explicit
// entry: without one, the stray-router audit would fail, which is the point —
// a new listener has to be classified rather than ignored.
func DefaultConfig(root string) Config {
	return Config{
		Root:       root,
		ModulePath: ModulePath,
		Listeners: []ListenerSpec{
			{
				ID:          ListenerAPI,
				Description: "Main Silo API listener: the /api/v1 namespace and the routes mounted beside it.",
				Dir:         "internal/api",
				Func:        chiNewRouter,
			},
			{
				ID:          ListenerProxy,
				Description: "Proxy node listener: media relay, node control, and its own health/metrics probes.",
				Dir:         "internal/proxy",
				Recv:        "Server",
				Func:        "Handler",
			},
			{
				ID:          ListenerTranscodeNode,
				Description: "Transcode node listener: transcode/remux session control, artifacts, and probes.",
				Dir:         "internal/transcodenode",
				Recv:        "Server",
				Func:        "Handler",
			},
		},
		AuditDirs: []string{
			"internal/api",
			"internal/api/handlers",
			"internal/proxy",
			"internal/transcodenode",
		},
		ScanRoots: []string{"internal", "cmd"},
		Exclusions: []RouterExclusion{
			{
				File:   "internal/jellycompat/router.go",
				Reason: "Jellyfin-protocol compatibility listener; an external wire contract, out of scope for the native v2 migration",
			},
			{
				File:   "cmd/silo/main.go",
				Reason: "Audiobookshelf-protocol compatibility listener; an external wire contract, out of scope for the native v2 migration",
			},
		},
	}
}

// FindRepoRoot walks up from dir until it finds the module's go.mod.
func FindRepoRoot(dir string) (string, error) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return "", err
	}
	for {
		if _, err := os.Stat(filepath.Join(abs, "go.mod")); err == nil {
			return abs, nil
		}
		parent := filepath.Dir(abs)
		if parent == abs {
			return "", errors.New("no go.mod found above " + dir)
		}
		abs = parent
	}
}
