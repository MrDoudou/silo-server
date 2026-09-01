package routeinventory

import (
	"path/filepath"
	"strings"
	"testing"
)

func fixtureConfig(name string) Config {
	return Config{
		Root:       filepath.Join("testdata", "fixtures", name),
		ModulePath: "example.test/fixture",
		Listeners: []ListenerSpec{{
			ID:          "fixture",
			Description: "analyzer fixture",
			Dir:         "listener",
			Func:        chiNewRouter,
		}},
		AuditDirs: []string{"listener"},
		ScanRoots: []string{"."},
	}
}

func analyzeFixture(t *testing.T, name string) *Inventory {
	t.Helper()
	inv, err := Analyze(fixtureConfig(name))
	if err != nil {
		t.Fatalf("analyze %s: %v", name, err)
	}
	return inv
}

func TestAnalyzeEnumeratesConditionalAndHelperRoutes(t *testing.T) {
	inv := analyzeFixture(t, "basic")

	// Both branches of the admin `if` are present: a runtime walk of one
	// wiring could only ever show one of them.
	want := map[string]struct {
		conditions []string
		middleware []string
		origin     string
	}{
		"GET /api/v1/health": {
			conditions: nil,
			middleware: []string{"baseMiddleware"},
			origin:     "explicit",
		},
		"POST /api/v1/admin/things|enableAdmin": {
			conditions: []string{"enableAdmin"},
			middleware: []string{"baseMiddleware", "requireAdmin"},
			origin:     "explicit",
		},
		"POST /api/v1/admin/things|!(enableAdmin)": {
			conditions: []string{"!(enableAdmin)"},
			middleware: []string{"baseMiddleware"},
			origin:     "explicit",
		},
		"GET /api/v1/extras": {
			conditions: nil,
			middleware: []string{"baseMiddleware"},
			origin:     "explicit",
		},
	}

	got := map[string]Route{}
	for _, route := range inv.Routes {
		key := route.Method + " " + route.Path
		if len(route.Conditions) > 0 {
			key += "|" + strings.Join(route.Conditions, "&&")
		}
		got[key] = route
	}
	for key, expected := range want {
		route, ok := got[key]
		if !ok {
			t.Fatalf("missing route %q; inventory has %d routes", key, len(inv.Routes))
		}
		if route.MethodOrigin != expected.origin {
			t.Errorf("%s: method_origin = %q, want %q", key, route.MethodOrigin, expected.origin)
		}
		middleware := inv.MiddlewareFor(route)
		if strings.Join(middleware, ",") != strings.Join(expected.middleware, ",") {
			t.Errorf("%s: middleware = %v, want %v", key, middleware, expected.middleware)
		}
	}

	// Handle/HandleFunc registers every method; the inventory enumerates them
	// instead of hiding nine operations behind a wildcard row.
	wildcard := map[string]bool{}
	for _, route := range inv.Routes {
		if route.Path == "/api/v1/wildcard" {
			if route.MethodOrigin != "handle_all" {
				t.Errorf("wildcard route has method_origin %q", route.MethodOrigin)
			}
			wildcard[route.Method] = true
		}
	}
	if len(wildcard) != len(handleAllMethods) {
		t.Errorf("wildcard expanded to %d methods, want %d", len(wildcard), len(handleAllMethods))
	}
}

func TestAnalyzeResolvesHandlerIdentityAndKinds(t *testing.T) {
	inv := analyzeFixture(t, "basic")
	for _, route := range inv.Routes {
		if route.Method != "POST" || route.Path != "/api/v1/admin/things" {
			continue
		}
		if !route.HandlerResolved {
			t.Fatalf("handler not resolved: %+v", route)
		}
		if !strings.HasSuffix(route.Handler, "listener.Handlers).Create") {
			t.Errorf("handler = %q, want the Create method identity", route.Handler)
		}
		if route.RequestKind != KindJSON {
			t.Errorf("request_kind = %q, want %q", route.RequestKind, KindJSON)
		}
		if route.ResponseMediaKind != KindJSON {
			t.Errorf("response_media_kind = %q, want %q", route.ResponseMediaKind, KindJSON)
		}
		if route.SuccessStatuses != nil || route.ErrorCodes != nil {
			t.Errorf("statuses must be explicitly absent, got %v / %v", route.SuccessStatuses, route.ErrorCodes)
		}
		return
	}
	t.Fatal("POST /api/v1/admin/things not found")
}

// TestAnalyzeRefusesHiddenRegistration is the structural guarantee: every way
// a route could be registered outside the enumerated walk has to fail the
// generator rather than quietly shrink the inventory.
func TestAnalyzeRefusesHiddenRegistration(t *testing.T) {
	cases := []struct {
		fixture string
		want    string
	}{
		{"unreachable_helper", "never reached from a declared listener entry point"},
		{"escaping_router", "cannot follow"},
		{"loop_registration", "does not model"},
		{"dynamic_pattern", "must be a string literal"},
		{"stray_router", "outside the inventoried listeners"},
	}
	for _, tc := range cases {
		t.Run(tc.fixture, func(t *testing.T) {
			inv, err := Analyze(fixtureConfig(tc.fixture))
			if err == nil {
				t.Fatalf("expected a failure, got an inventory with %d routes", len(inv.Routes))
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("error = %q, want it to mention %q", err.Error(), tc.want)
			}
		})
	}
}

func TestAnalyzeIsDeterministic(t *testing.T) {
	first := analyzeFixture(t, "basic")
	second := analyzeFixture(t, "basic")
	firstBytes, err := first.MarshalIndented()
	if err != nil {
		t.Fatal(err)
	}
	secondBytes, err := second.MarshalIndented()
	if err != nil {
		t.Fatal(err)
	}
	if string(firstBytes) != string(secondBytes) {
		t.Fatal("two runs over the same source produced different bytes")
	}
}

func TestClassifyAuthReportsUnknownMiddleware(t *testing.T) {
	class, traits := classifyAuth([]string{"middleware.RequestID", "somethingBrandNew"})
	if class != "public" {
		t.Errorf("class = %q, want public", class)
	}
	if !contains(traits, "unclassified_middleware") {
		t.Errorf("traits = %v, want unclassified_middleware", traits)
	}

	class, traits = classifyAuth([]string{"authMiddleware.RequireAuth", "requireActingAdmin", "deps.RateLimitMW.Handler"})
	if class != "acting_admin" {
		t.Errorf("class = %q, want acting_admin", class)
	}
	for _, want := range []string{"acting_admin", "authenticated", "rate_limited"} {
		if !contains(traits, want) {
			t.Errorf("traits = %v, want %q", traits, want)
		}
	}
}

func TestReconcileDetectsSeededDiscrepancy(t *testing.T) {
	inv := &Inventory{Routes: []Route{
		{Listener: ListenerAPI, Method: "GET", Path: "/api/v1/health"},
		{Listener: ListenerAPI, Method: "POST", Path: "/api/v1/auth/login"},
	}}
	observed := []string{"GET /api/v1/health", "POST /api/v1/auth/login"}
	if missing := inv.Reconcile(ListenerAPI, observed); len(missing) != 0 {
		t.Fatalf("clean reconciliation reported %v", missing)
	}

	// A route registered outside the enumerable structure shows up at runtime
	// with no inventory row behind it.
	observed = append(observed, "GET /api/v1/secretly-added")
	missing := inv.Reconcile(ListenerAPI, observed)
	if len(missing) != 1 || missing[0] != "GET /api/v1/secretly-added" {
		t.Fatalf("missing = %v, want the unledgered route", missing)
	}

	// Dropping a committed row is the same failure from the other side.
	inv.Routes = inv.Routes[:1]
	missing = inv.Reconcile(ListenerAPI, []string{"POST /api/v1/auth/login"})
	if len(missing) != 1 {
		t.Fatalf("missing = %v, want the dropped row to be reported", missing)
	}
}

func TestInventoryValidateRejectsDuplicates(t *testing.T) {
	inv := &Inventory{Routes: []Route{
		{Listener: ListenerAPI, Method: "GET", Path: "/x", HandlerExpr: "h"},
		{Listener: ListenerAPI, Method: "GET", Path: "/x", HandlerExpr: "h"},
	}}
	if err := inv.Validate(); err == nil {
		t.Fatal("expected duplicate rows to be rejected")
	}
}

func contains(haystack []string, needle string) bool {
	for _, candidate := range haystack {
		if candidate == needle {
			return true
		}
	}
	return false
}
