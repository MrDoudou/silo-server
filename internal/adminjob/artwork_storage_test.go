package adminjob

import (
	"encoding/json"
	"testing"
)

func TestDecodeArtworkPurgeRequestNormalizesMode(t *testing.T) {
	req, err := decodeArtworkPurgeRequest(json.RawMessage(`{"scope":{"server":true},"mode":"Edge_Only","dry_run":false}`))
	if err != nil {
		t.Fatalf("decodeArtworkPurgeRequest: %v", err)
	}
	if req.Mode != ArtworkPurgeModeEdgeOnly {
		t.Fatalf("mode = %q, want %q", req.Mode, ArtworkPurgeModeEdgeOnly)
	}
}
