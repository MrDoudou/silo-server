package naming

import (
	"path/filepath"
	"strings"
)

// extraSuffixKinds maps the Jellyfin/Plex filename-suffix convention onto the
// shared extra-kind vocabulary (models.ExtraKind values). The suffix is the
// final "-token" (or, for unambiguous tokens only, ".token") of the stem:
// "Movie (2020)-trailer.mkv".
var extraSuffixKinds = map[string]string{
	"trailer":         "trailer",
	"teaser":          "teaser",
	"featurette":      "featurette",
	"clip":            "clip",
	"behindthescenes": "behind_the_scenes",
	"bloopers":        "bloopers",
	"deleted":         "deleted_scene",
	"deletedscene":    "deleted_scene",
	"interview":       "other",
	"scene":           "other",
	"short":           "other",
	"extra":           "other",
	"other":           "other",
}

// dashOnlyExtraSuffixes are tokens that also appear as ordinary title words.
// Dot-separated release names ("Life.Is.Short.mkv", "Cut.Scene.mkv") must not
// be classified as extras; only an explicit "-token" suffix counts for these.
var dashOnlyExtraSuffixes = map[string]struct{}{
	"clip":      {},
	"deleted":   {},
	"extra":     {},
	"interview": {},
	"other":     {},
	"scene":     {},
	"short":     {},
}

// ParseExtraSuffix reports whether the file name (or stem) carries a
// Jellyfin/Plex-style extras suffix, returning the mapped extra kind. Only
// the exact final token after the last '-' or '.' separator counts, so titles
// merely containing words like "scene" do not misclassify. Ambiguous tokens
// (short, scene, clip, ...) additionally require a '-' separator so dotted
// title stems are not treated as extras.
func ParseExtraSuffix(fileName string) (kind string, ok bool) {
	stem := strings.TrimSuffix(filepath.Base(fileName), filepath.Ext(fileName))
	idx := strings.LastIndexAny(stem, "-.")
	if idx <= 0 || idx == len(stem)-1 {
		return "", false
	}
	sep := stem[idx]
	token := strings.ToLower(strings.TrimSpace(stem[idx+1:]))
	mapped, found := extraSuffixKinds[token]
	if !found {
		return "", false
	}
	if _, dashOnly := dashOnlyExtraSuffixes[token]; dashOnly && sep != '-' {
		return "", false
	}
	// A bare suffix with no title ("trailer.mkv" handled by ExtraTitleFromFile
	// callers via directory classification) still counts: idx>0 ensures some
	// title text precedes the separator.
	return mapped, true
}

// ExtraTitleFromFile derives a human-readable extra title from a file path,
// stripping a recognized extras suffix when present.
func ExtraTitleFromFile(filePath string) string {
	stem := strings.TrimSuffix(filepath.Base(filePath), filepath.Ext(filePath))
	if _, ok := ParseExtraSuffix(filePath); ok {
		if idx := strings.LastIndexAny(stem, "-."); idx > 0 {
			stem = stem[:idx]
		}
	}
	stem = strings.NewReplacer(".", " ", "_", " ").Replace(stem)
	return strings.Join(strings.Fields(stem), " ")
}
