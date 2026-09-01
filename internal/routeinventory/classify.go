package routeinventory

import (
	"go/ast"
	"go/token"
	"net/http"
	"sort"
	"strconv"
	"strings"
)

// Request and response kinds. `unknown` is a deliberate value: the analyzer
// reports what the source proves and refuses to invent the rest.
const (
	KindNone      = "none"
	KindJSON      = "json"
	KindForm      = "form"
	KindMultipart = "multipart"
	KindBinary    = "binary"
	KindRedirect  = "redirect"
	KindWebSocket = "websocket"
	KindHTML      = "html"
	KindCSS       = "css"
	KindText      = "text"
	KindEventSt   = "event_stream"
)

// Handler identity kinds.
const (
	handlerKindMethod     = "method"
	handlerKindFunc       = "func"
	handlerKindLiteral    = "literal"
	handlerKindExpression = "expression"
	// handlerKindDelegation is a registration that hands a whole path subtree
	// to another inventoried listener.
	handlerKindDelegation = "delegation"
)

// Auth classes, from least to most privileged.
const (
	authPublic          = "public"
	authOptional        = "optional_auth"
	authAuthenticated   = "authenticated"
	authNodeBearer      = "node_bearer"
	authProfileScoped   = "profile_scoped"
	authPermissionGated = "permission_gated"
	authActingAdmin     = "acting_admin"
	// authDelegated marks a registration that forwards a subtree to another
	// listener. The auth that applies is the delegated listener's own, so
	// calling the delegation public would be a claim about routes it does not
	// own.
	authDelegated = "delegated"
)

// Auth traits.
const (
	traitAuthenticated = "authenticated"
	traitActingAdmin   = "acting_admin"
	traitRateLimited   = "rate_limited"
)

// streamObservers are the registration-site wrappers that enroll a route in
// stream telemetry. The repository already declares which routes carry media
// bytes there, so the inventory reads that declaration instead of guessing.
var streamObservers = map[string]bool{
	"observeNative": true,
	"observeProxy":  true,
	"observeNode":   true,
}

type handlerInfo struct {
	expr         string
	identity     string
	kind         string
	resolved     bool
	requestKind  string
	responseKind string
	streams      bool
	websocket    bool
}

type classifier struct {
	set   *sourceSet
	owner *Analyzer
	cache map[*ast.FuncDecl]*bodyEvidence
}

func newClassifier(set *sourceSet) *classifier {
	return &classifier{set: set, cache: map[*ast.FuncDecl]*bodyEvidence{}}
}

// inlineReceiverType resolves the type of a handler constructed inline at the
// registration site, e.g. `(&handlers.Thing{...}).Handle`.
func (c *classifier) inlineReceiverType(expr ast.Expr, env *walkEnv) string {
	if c.owner == nil {
		return ""
	}
	if paren, ok := expr.(*ast.ParenExpr); ok {
		expr = paren.X
	}
	return c.owner.valueIdentity(expr, env.pkg, env.file)
}

func (c *classifier) describe(handler ast.Expr, method, fullPath string, env *walkEnv) handlerInfo {
	info := handlerInfo{expr: c.set.exprText(handler)}
	inner, streams := unwrapHandler(handler)
	info.streams = streams

	var body *ast.BlockStmt
	var decl *ast.FuncDecl

	switch typed := inner.(type) {
	case *ast.FuncLit:
		info.kind = handlerKindLiteral
		info.identity = "literal:" + env.listener.ID + ":" + fullPath
		info.resolved = true
		body = typed.Body
	case *ast.SelectorExpr:
		base, ok := typed.X.(*ast.Ident)
		if !ok {
			// An inline `(&handlers.Thing{...}).Handle` still names a type.
			if recvType := c.inlineReceiverType(typed.X, env); recvType != "" {
				info.kind = handlerKindMethod
				info.identity = "(" + recvType + ")." + typed.Sel.Name
				info.resolved = true
				decl = c.methodDecl(recvType, typed.Sel.Name)
				break
			}
			info.kind = handlerKindExpression
			info.identity = c.set.exprText(inner)
			break
		}
		if importPath := importPathFor(env.file, base.Name); importPath != "" {
			info.kind = handlerKindFunc
			info.identity = importPath + "." + typed.Sel.Name
			info.resolved = true
			if pkg := c.set.byImport[importPath]; pkg != nil {
				decl = pkg.funcs[typed.Sel.Name]
			}
			break
		}
		if recvType := env.varTypes[base.Name]; recvType != "" {
			info.kind = handlerKindMethod
			info.identity = "(" + recvType + ")." + typed.Sel.Name
			info.resolved = true
			decl = c.methodDecl(recvType, typed.Sel.Name)
			break
		}
		info.kind = handlerKindExpression
		info.identity = c.set.exprText(inner)
	case *ast.Ident:
		info.kind = handlerKindFunc
		info.identity = env.pkg.ImportPath + "." + typed.Name
		info.resolved = true
		decl = env.pkg.funcs[typed.Name]
	default:
		info.kind = handlerKindExpression
		info.identity = c.set.exprText(inner)
	}

	var evidence *bodyEvidence
	switch {
	case decl != nil:
		evidence = c.evidenceForDecl(decl)
	case body != nil:
		evidence = c.evidenceForBody(body, env.pkg, env.file, 0)
	}
	info.requestKind, info.responseKind, info.websocket = resolveKinds(evidence, method)
	info.identity = c.short(info.identity)
	return info
}

// short drops the module prefix so identities read as `internal/api/handlers.X`.
func (c *classifier) short(identity string) string {
	if c.owner == nil || c.owner.cfg.ModulePath == "" {
		return identity
	}
	return strings.ReplaceAll(identity, c.owner.cfg.ModulePath+"/", "")
}

func (c *classifier) methodDecl(recvType, name string) *ast.FuncDecl {
	trimmed := strings.TrimPrefix(recvType, "*")
	dot := strings.LastIndex(trimmed, ".")
	if dot < 0 {
		return nil
	}
	pkg := c.set.byImport[trimmed[:dot]]
	if pkg == nil {
		return nil
	}
	return pkg.methods[trimmed[dot+1:]+"."+name]
}

// unwrapHandler strips the wrappers a registration site puts around a handler
// so the identity is the handler itself, and reports whether the route is
// enrolled in stream telemetry.
func unwrapHandler(expr ast.Expr) (ast.Expr, bool) {
	streams := false
	for {
		call, ok := expr.(*ast.CallExpr)
		if !ok || len(call.Args) == 0 {
			return expr, streams
		}
		switch fun := call.Fun.(type) {
		case *ast.Ident:
			if streamObservers[fun.Name] {
				streams = true
				expr = call.Args[len(call.Args)-1]
				continue
			}
			return expr, streams
		case *ast.SelectorExpr:
			// http.HandlerFunc(x) and friends: a conversion, not a wrapper.
			if fun.Sel.Name == "HandlerFunc" && len(call.Args) == 1 {
				expr = call.Args[0]
				continue
			}
			return expr, streams
		default:
			return expr, streams
		}
	}
}

// ---------------------------------------------------------------------------
// Body evidence
// ---------------------------------------------------------------------------

type bodyEvidence struct {
	requestJSON      bool
	requestForm      bool
	requestMultipart bool
	requestBinary    bool

	responseJSON     bool
	responseRedirect bool
	responseBinary   bool
	websocket        bool
	contentTypes     []string
}

const evidenceMaxDepth = 2

func (c *classifier) evidenceForDecl(decl *ast.FuncDecl) *bodyEvidence {
	if cached, ok := c.cache[decl]; ok {
		return cached
	}
	if decl.Body == nil {
		c.cache[decl] = &bodyEvidence{}
		return c.cache[decl]
	}
	// Seed the cache first so mutual recursion terminates.
	c.cache[decl] = &bodyEvidence{}
	pkg, file := c.declContext(decl)
	evidence := c.evidenceForBody(decl.Body, pkg, file, 0)
	c.cache[decl] = evidence
	return evidence
}

func (c *classifier) declContext(decl *ast.FuncDecl) (*pkgSource, *ast.File) {
	for _, dir := range sortedKeys(c.set.packages) {
		pkg := c.set.packages[dir]
		if file, ok := pkg.fileOf[decl]; ok {
			return pkg, file
		}
	}
	return nil, nil
}

func (c *classifier) evidenceForBody(body *ast.BlockStmt, pkg *pkgSource, file *ast.File, depth int) *bodyEvidence {
	evidence := &bodyEvidence{}
	if body == nil {
		return evidence
	}
	ast.Inspect(body, func(node ast.Node) bool {
		call, ok := node.(*ast.CallExpr)
		if !ok {
			return true
		}
		name := calleeName(call.Fun)
		qualified := qualifiedCallee(call.Fun, file)
		args := callArgText(c.set, call)

		switch {
		case qualified == "encoding/json.NewDecoder" || qualified == "encoding/json.Unmarshal":
			if strings.Contains(args, ".Body") || strings.Contains(args, "body") {
				evidence.requestJSON = true
			}
		case name == "ParseMultipartForm" || name == "FormFile" || name == "MultipartReader":
			evidence.requestMultipart = true
		case name == "ParseForm" || name == "PostFormValue" || name == "FormValue":
			evidence.requestForm = true
		case qualified == "io.ReadAll" && strings.Contains(args, ".Body"):
			evidence.requestBinary = true
		case qualified == "io.Copy" && strings.Contains(args, ".Body"):
			evidence.requestBinary = true
		}

		switch {
		case qualified == "encoding/json.NewEncoder", name == "writeJSON", name == "writeError",
			name == "respondJSON", name == "WriteJSON", name == "writeJSONError":
			evidence.responseJSON = true
		case qualified == "net/http.Redirect":
			evidence.responseRedirect = true
		case qualified == "net/http.ServeContent", qualified == "net/http.ServeFile":
			evidence.responseBinary = true
		case name == methodServeHTTP && strings.Contains(args, "w,"):
			// Reverse proxies and embedded handlers write their own bodies.
			evidence.responseBinary = true
		case name == "Upgrade" || name == "Accept":
			if strings.Contains(qualified, "websocket") || strings.Contains(c.set.exprText(call.Fun), "grade") {
				evidence.websocket = true
			}
		}

		if name == "Set" && len(call.Args) == 2 {
			if header, ok := stringLiteral(call.Args[0]); ok && strings.EqualFold(header, "Content-Type") {
				if value, ok := stringLiteral(call.Args[1]); ok {
					evidence.contentTypes = append(evidence.contentTypes, value)
				}
			}
		}

		if depth < evidenceMaxDepth && pkg != nil {
			if ident, ok := call.Fun.(*ast.Ident); ok {
				if inner := pkg.funcs[ident.Name]; inner != nil && inner.Body != nil {
					merge(evidence, c.evidenceForDecl(inner))
				}
			}
		}
		return true
	})
	sort.Strings(evidence.contentTypes)
	return evidence
}

func merge(into, from *bodyEvidence) {
	if from == nil {
		return
	}
	into.requestJSON = into.requestJSON || from.requestJSON
	into.requestForm = into.requestForm || from.requestForm
	into.requestMultipart = into.requestMultipart || from.requestMultipart
	into.requestBinary = into.requestBinary || from.requestBinary
	into.responseJSON = into.responseJSON || from.responseJSON
	into.responseRedirect = into.responseRedirect || from.responseRedirect
	into.responseBinary = into.responseBinary || from.responseBinary
	into.websocket = into.websocket || from.websocket
	into.contentTypes = append(into.contentTypes, from.contentTypes...)
}

func resolveKinds(evidence *bodyEvidence, method string) (request, response string, websocket bool) {
	if evidence == nil {
		return unknownClassification, unknownClassification, false
	}
	switch {
	case evidence.requestMultipart:
		request = KindMultipart
	case evidence.requestForm:
		request = KindForm
	case evidence.requestJSON:
		request = KindJSON
	case evidence.requestBinary:
		request = KindBinary
	case method == http.MethodGet || method == http.MethodHead || method == http.MethodOptions:
		request = KindNone
	default:
		request = unknownClassification
	}

	switch {
	case evidence.websocket:
		response = KindWebSocket
	case evidence.responseRedirect:
		response = KindRedirect
	case len(evidence.contentTypes) > 0:
		response = mediaKind(evidence.contentTypes)
	case evidence.responseJSON:
		response = KindJSON
	case evidence.responseBinary:
		response = KindBinary
	default:
		response = unknownClassification
	}
	return request, response, evidence.websocket
}

func mediaKind(contentTypes []string) string {
	for _, value := range contentTypes {
		media := strings.ToLower(strings.TrimSpace(strings.SplitN(value, ";", 2)[0]))
		switch {
		case strings.HasSuffix(media, "json"):
			return KindJSON
		case media == "text/html":
			return KindHTML
		case media == "text/css":
			return KindCSS
		case media == "text/event-stream":
			return KindEventSt
		case strings.HasPrefix(media, "text/"):
			return KindText
		case strings.HasPrefix(media, "video/"), strings.HasPrefix(media, "audio/"),
			strings.HasPrefix(media, "image/"), strings.HasPrefix(media, "font/"),
			strings.HasPrefix(media, "application/octet-stream"),
			strings.Contains(media, "mpegurl"):
			return KindBinary
		}
	}
	return unknownClassification
}

func calleeName(fun ast.Expr) string {
	switch typed := fun.(type) {
	case *ast.Ident:
		return typed.Name
	case *ast.SelectorExpr:
		return typed.Sel.Name
	case *ast.CallExpr:
		return calleeName(typed.Fun)
	}
	return ""
}

// qualifiedCallee renders `pkgimportpath.Func` when the callee is a plain
// package-level call, so `json.NewDecoder` cannot be confused with a method
// named NewDecoder on some other type.
func qualifiedCallee(fun ast.Expr, file *ast.File) string {
	sel, ok := unwrapParen(fun).(*ast.SelectorExpr)
	if !ok {
		return ""
	}
	ident, ok := unwrapParen(sel.X).(*ast.Ident)
	if !ok {
		return ""
	}
	importPath := importPathFor(file, ident.Name)
	if importPath == "" {
		return ""
	}
	return importPath + "." + sel.Sel.Name
}

func callArgText(set *sourceSet, call *ast.CallExpr) string {
	parts := make([]string, 0, len(call.Args))
	for _, arg := range call.Args {
		parts = append(parts, set.exprText(arg))
	}
	return strings.Join(parts, ",") + ","
}

func stringLiteral(expr ast.Expr) (string, bool) {
	lit, ok := expr.(*ast.BasicLit)
	if !ok || lit.Kind != token.STRING {
		return "", false
	}
	value, err := strconv.Unquote(lit.Value)
	if err != nil {
		return "", false
	}
	return value, true
}

// ---------------------------------------------------------------------------
// Auth classification
// ---------------------------------------------------------------------------

type authRule struct {
	marker string
	class  string
	trait  string
	rank   int
}

// authRules maps middleware source expressions to the auth class they impose.
// An unmatched middleware is reported as `unclassified_middleware` rather than
// being silently treated as public.
var authRules = []authRule{
	{marker: "requireActingAdmin", class: authActingAdmin, trait: traitActingAdmin, rank: 60},
	{marker: "markerEditAccess", class: authPermissionGated, trait: "marker_edit", rank: 50},
	{marker: "metadataItemAccess", class: authPermissionGated, trait: "metadata_curation", rank: 50},
	{marker: "metadataCurationAccess", class: authPermissionGated, trait: "metadata_curation", rank: 50},
	{marker: "RequireViewerAccess", class: authProfileScoped, trait: "viewer_access", rank: 40},
	{marker: "RequireProfile", class: authProfileScoped, trait: "profile_required", rank: 40},
	{marker: "RequireAuth", class: authAuthenticated, trait: traitAuthenticated, rank: 30},
	{marker: "requireBearer", class: authNodeBearer, trait: "node_bearer", rank: 30},
	{marker: "OptionalAuth", class: authOptional, trait: "optional_auth", rank: 20},
}

// traitOnlyRules are middleware that qualify a route without setting its auth
// class.
var traitOnlyRules = []authRule{
	{marker: "RateLimitMW", trait: traitRateLimited},
	{marker: "AuthEndpointHandler", trait: traitRateLimited},
	{marker: "demoGuard", trait: "demo_guarded"},
	{marker: "meterEgress", trait: "egress_metered"},
	{marker: "cors.Handler", trait: "cors"},
	{marker: "optionalProfileViewerAccess", trait: "optional_viewer_access"},
}

// infrastructureMiddleware is the base stack every request passes through. It
// is listed so a genuinely new middleware stands out as unclassified.
var infrastructureMiddleware = []string{
	"middleware.RequestID", "middleware.Recoverer", "apimw.RequestLogger", "apimw.Metrics",
	"httpstream.CompressExcept", "clientip.Middleware", "activitylog.NewMiddleware",
}

func classifyAuth(middleware []string) (string, []string) {
	class := authPublic
	rank := 0
	traits := map[string]bool{}

	for _, mw := range middleware {
		matched := false
		for _, rule := range authRules {
			if !strings.Contains(mw, rule.marker) {
				continue
			}
			matched = true
			traits[rule.trait] = true
			if rule.rank > rank {
				rank, class = rule.rank, rule.class
			}
		}
		for _, rule := range traitOnlyRules {
			if strings.Contains(mw, rule.marker) {
				matched = true
				traits[rule.trait] = true
			}
		}
		if matched {
			continue
		}
		for _, known := range infrastructureMiddleware {
			if strings.Contains(mw, known) {
				matched = true
				break
			}
		}
		if !matched {
			traits["unclassified_middleware"] = true
		}
	}

	out := make([]string, 0, len(traits))
	for trait := range traits {
		out = append(out, trait)
	}
	sort.Strings(out)
	return class, out
}
