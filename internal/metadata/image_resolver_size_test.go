package metadata

import (
	"context"
	"strings"
	"testing"

	"github.com/Silo-Server/silo-server/internal/artworkkey"
	"github.com/Silo-Server/silo-server/internal/artworkstore"
	"github.com/Silo-Server/silo-server/internal/artworkurl"
	"github.com/Silo-Server/silo-server/internal/imagesize"
)

type directTargetResolver struct {
	requests []artworkurl.TargetRequest
}

func (*directTargetResolver) ResolveArtworkURLs(context.Context, []string) map[string]artworkstore.ResolvedURL {
	return nil
}

func (*directTargetResolver) ResolveTargetURLs(context.Context, []artworkurl.Target, string) map[string]artworkstore.ResolvedURL {
	return nil
}

func (r *directTargetResolver) ResolveTargetRequests(_ context.Context, requests []artworkurl.TargetRequest) map[string]artworkstore.ResolvedURL {
	r.requests = append(r.requests, requests...)
	return nil
}

func (*directTargetResolver) DeliveryPolicy() string { return artworkurl.DeliveryPolicyDirect }

func TestProviderVariantForTargetUsesImageTypeLadder(t *testing.T) {
	tests := []struct {
		imageType string
		variant   string
		want      string
	}{
		{artworkkey.ImageTypePoster, artworkkey.VariantW300, imagesize.PluginVariantCard},
		{artworkkey.ImageTypePoster, artworkkey.VariantW500, imagesize.PluginVariantFeatured},
		{artworkkey.ImageTypePoster, artworkkey.VariantW780, imagesize.PluginVariantLarge},
		{artworkkey.ImageTypeLogo, artworkkey.VariantW1280, imagesize.PluginVariantLarge},
		// w1280 is not intrinsically "large": it is an intermediate backdrop
		// rung, which is why target slot context is part of the translation.
		{artworkkey.ImageTypeBackdrop, artworkkey.VariantW1280, imagesize.PluginVariantFeatured},
		{artworkkey.ImageTypeBackdrop, artworkkey.VariantW1920, imagesize.PluginVariantFeatured},
		{artworkkey.ImageTypeProfile, artworkkey.VariantW500, imagesize.PluginVariantFeatured},
		{artworkkey.ImageTypeProfile, artworkkey.OriginalVariant, imagesize.PluginVariantOriginal},
	}
	for _, tt := range tests {
		if got := providerVariantForTarget(tt.imageType, tt.variant); got != tt.want {
			t.Errorf("providerVariantForTarget(%q, %q) = %q, want %q", tt.imageType, tt.variant, got, tt.want)
		}
	}
}

func TestDirectTargetRequestsKeepProviderImageSizeSemantics(t *testing.T) {
	resolver := NewPluginImageResolver()
	t.Cleanup(resolver.Close)
	resolver.RegisterSource("plug", &fakeExpiringImageSource{})
	direct := &directTargetResolver{}
	resolver.SetArtworkURLResolver(direct)

	requests := []artworkurl.TargetRequest{
		{Target: artworkurl.Target{Surface: artworkurl.SurfaceItemPosters, Keys: []string{"movie-1"}, Slot: artworkkey.ImageTypePoster}.WithReference("plug://poster.jpg"), Variant: artworkkey.VariantW780},
		{Target: artworkurl.Target{Surface: artworkurl.SurfaceItemLogos, Keys: []string{"movie-1"}, Slot: artworkkey.ImageTypeLogo}.WithReference("plug://logo.png"), Variant: artworkkey.VariantW1280},
	}
	resolved := resolver.ResolveArtworkTargetRequestsWithExpiry(t.Context(), requests)
	for _, request := range requests {
		if got := resolved[request.CacheKey()].URL; got != "plugin:large:"+strings.TrimPrefix(request.Target.Reference, "plug://") {
			t.Errorf("resolved %s = %q, want large provider hint", request.Target.Slot, got)
		}
	}
	if len(direct.requests) != 0 {
		t.Fatalf("provider references reached the raw-key resolver: %+v", direct.requests)
	}
}
