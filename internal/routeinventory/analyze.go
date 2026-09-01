package routeinventory

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

// chiImportPath is the router library the native listeners use. The analyzer
// only trusts type syntax that names this package.
const chiImportPath = "github.com/go-chi/chi/v5"

// chiNewRouter is the only constructor a chi router can come from.
const chiNewRouter = "NewRouter"

// Listener IDs. They are the join key between the artifact and the
// per-listener reconciliation tests.
const (
	ListenerAPI           = "api"
	ListenerProxy         = "proxy"
	ListenerTranscodeNode = "transcode_node"
)

// handleAllMethods is what chi registers for Handle/HandleFunc (its mALL set),
// reported as "*" when walking the tree. The inventory enumerates the variants
// instead of hiding nine operations behind one wildcard row.
var handleAllMethods = []string{
	http.MethodConnect, http.MethodDelete, http.MethodGet, http.MethodHead,
	http.MethodOptions, http.MethodPatch, http.MethodPost, http.MethodPut, http.MethodTrace,
}

// verbMethods maps chi's per-verb registration helpers to their HTTP method.
var verbMethods = map[string]string{
	"Connect": http.MethodConnect,
	"Delete":  http.MethodDelete,
	"Get":     http.MethodGet,
	"Head":    http.MethodHead,
	"Options": http.MethodOptions,
	"Patch":   http.MethodPatch,
	"Post":    http.MethodPost,
	"Put":     http.MethodPut,
	"Trace":   http.MethodTrace,
}

// readOnlyRouterMethods are chi.Router methods that inspect a router without
// registering anything. They are listed so the analyzer can accept them
// explicitly rather than by falling through to a permissive default.
var readOnlyRouterMethods = map[string]bool{
	"Routes": true, "Middlewares": true, "Match": true, "ServeHTTP": true, "Find": true,
}

// ListenerSpec names one HTTP listener and the function that builds its router.
type ListenerSpec struct {
	ID          string
	Description string
	Dir         string // repo-relative package directory
	Recv        string // receiver type name, empty for a package-level function
	Func        string
}

// Entrypoint renders the listener's entry function for the artifact.
func (l ListenerSpec) Entrypoint() string {
	if l.Recv == "" {
		return l.Dir + "." + l.Func
	}
	return l.Dir + ".(*" + l.Recv + ")." + l.Func
}

// RouterExclusion declares a chi router that deliberately lives outside the
// native inventory. Every excluded router needs a reason in the artifact so
// "not inventoried" is a recorded decision rather than an oversight.
type RouterExclusion struct {
	File   string
	Reason string
}

// Config drives one inventory build.
type Config struct {
	Root       string
	ModulePath string
	Listeners  []ListenerSpec
	// AuditDirs are the package directories parsed and audited. Every listener
	// directory must appear here; add the packages that register routes on a
	// listener's behalf.
	AuditDirs []string
	// ScanRoots are the directory trees swept for chi routers constructed
	// outside the enumerated listeners.
	ScanRoots  []string
	Exclusions []RouterExclusion
}

// Analyzer enumerates route registrations from source.
type Analyzer struct {
	cfg  Config
	fset *token.FileSet
	set  *sourceSet

	routes []Route

	enteredFuncs map[*ast.FuncDecl]bool
	enteredLits  map[*ast.FuncLit]bool
	entryFuncs   map[*ast.FuncDecl]ListenerSpec

	classifier *classifier
}

// Analyze builds the inventory or fails. It never returns a partial result:
// an inventory that silently drops a route it could not understand is worse
// than no inventory at all.
func Analyze(cfg Config) (*Inventory, error) {
	fset := token.NewFileSet()
	dirs := append([]string{}, cfg.AuditDirs...)
	for _, listener := range cfg.Listeners {
		dirs = append(dirs, listener.Dir)
	}
	set, err := loadSources(fset, cfg.Root, cfg.ModulePath, dirs)
	if err != nil {
		return nil, err
	}
	a := &Analyzer{
		cfg:          cfg,
		fset:         fset,
		set:          set,
		enteredFuncs: map[*ast.FuncDecl]bool{},
		enteredLits:  map[*ast.FuncLit]bool{},
		entryFuncs:   map[*ast.FuncDecl]ListenerSpec{},
		classifier:   newClassifier(set),
	}
	a.classifier.owner = a
	for _, listener := range cfg.Listeners {
		if err := a.walkListener(listener); err != nil {
			return nil, err
		}
	}
	if err := a.audit(); err != nil {
		return nil, err
	}
	return a.build()
}

func (a *Analyzer) build() (*Inventory, error) {
	order := make([]string, 0, len(a.cfg.Listeners))
	counts := map[string]int{}
	totals := Totals{Routes: len(a.routes)}
	for _, route := range a.routes {
		counts[route.Listener]++
		if route.Conditional {
			totals.ConditionalRoutes++
		}
		if route.Streams {
			totals.StreamingRoutes++
		}
		if route.UpgradesWebSocket {
			totals.WebSocketRoutes++
		}
	}
	listeners := make([]Listener, 0, len(a.cfg.Listeners))
	for _, spec := range a.cfg.Listeners {
		order = append(order, spec.ID)
		listeners = append(listeners, Listener{
			ID:          spec.ID,
			Entrypoint:  spec.Entrypoint(),
			Description: spec.Description,
			RouteCount:  counts[spec.ID],
		})
	}
	exclusions := make([]string, 0, len(a.cfg.Exclusions))
	for _, exclusion := range a.cfg.Exclusions {
		exclusions = append(exclusions, exclusion.File+": "+exclusion.Reason)
	}
	sort.Strings(exclusions)

	inv := &Inventory{
		SchemaVersion: SchemaVersion,
		Generator:     "cmd/route-inventory",
		Description: "Every method+path variant the legacy native HTTP listeners register, " +
			"enumerated from registration source so conditionally wired routes cannot be omitted.",
		DeferredFields: []string{
			"success_statuses: not statically derivable from registration source; resolved in a later inventory stage",
			"error_codes: not statically derivable from registration source; resolved in a later inventory stage",
		},
		Exclusions:       exclusions,
		Listeners:        listeners,
		Totals:           totals,
		MiddlewareChains: internChains(a.routes),
		Routes:           a.routes,
	}
	inv.Sort(order)
	if err := inv.Validate(); err != nil {
		return nil, err
	}
	return inv, nil
}

// internChains collapses the repeated middleware chains into a shared,
// lexicographically ordered table and rewrites each route to reference it. IDs
// come from the sorted chain text, so they do not move when an unrelated route
// is added.
func internChains(routes []Route) []MiddlewareChain {
	unique := map[string][]string{}
	for _, route := range routes {
		unique[strings.Join(route.chain, "\x00")] = route.chain
	}
	keys := make([]string, 0, len(unique))
	for key := range unique {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	ids := make(map[string]int, len(keys))
	chains := make([]MiddlewareChain, 0, len(keys))
	for index, key := range keys {
		ids[key] = index
		middleware := unique[key]
		if middleware == nil {
			middleware = []string{}
		}
		chains = append(chains, MiddlewareChain{ID: index, Middleware: middleware})
	}
	for i := range routes {
		routes[i].MiddlewareChain = ids[strings.Join(routes[i].chain, "\x00")]
	}
	return chains
}

// ---------------------------------------------------------------------------
// Walk
// ---------------------------------------------------------------------------

// mwEntry is one middleware in a router's chain, together with the conditions
// that were active where it was installed. A middleware added under a narrower
// condition than the route itself (a demo guard behind `demoGuard != nil`) is
// rendered with that gate, so the inventory does not claim a route is always
// guarded when it is not.
type mwEntry struct {
	expr  string
	conds []string
}

// routerScope is the accumulated state of one chi router value: where it is
// mounted and what middleware runs before its handlers.
type routerScope struct {
	prefix string // full path prefix
	group  string // Route() chain only
	mw     []mwEntry
}

func (s *routerScope) clone() *routerScope {
	return &routerScope{prefix: s.prefix, group: s.group, mw: append([]mwEntry{}, s.mw...)}
}

// renderMiddleware flattens a chain against the conditions the route itself
// carries.
func renderMiddleware(chain []mwEntry, routeConds []string) []string {
	active := make(map[string]bool, len(routeConds))
	for _, cond := range routeConds {
		active[cond] = true
	}
	out := make([]string, 0, len(chain))
	for _, entry := range chain {
		var extra []string
		for _, cond := range entry.conds {
			if !active[cond] {
				extra = append(extra, cond)
			}
		}
		if len(extra) == 0 {
			out = append(out, entry.expr)
			continue
		}
		out = append(out, entry.expr+" [when "+strings.Join(extra, " && ")+"]")
	}
	return out
}

type walkEnv struct {
	pkg      *pkgSource
	file     *ast.File
	listener ListenerSpec
	routers  map[string]*routerScope
	conds    []string
	varTypes map[string]string
	depth    int
	entry    bool
}

func (e *walkEnv) child() *walkEnv {
	routers := make(map[string]*routerScope, len(e.routers))
	for name, scope := range e.routers {
		routers[name] = scope
	}
	return &walkEnv{
		pkg: e.pkg, file: e.file, listener: e.listener,
		routers: routers, conds: append([]string{}, e.conds...),
		varTypes: e.varTypes, depth: e.depth, entry: e.entry,
	}
}

func (a *Analyzer) walkListener(spec ListenerSpec) error {
	pkg := a.set.packages[spec.Dir]
	if pkg == nil {
		return fmt.Errorf("listener %s: package %s not loaded", spec.ID, spec.Dir)
	}
	key := spec.Func
	decl := pkg.funcs[key]
	if spec.Recv != "" {
		decl = pkg.methods[spec.Recv+"."+spec.Func]
	}
	if decl == nil {
		return fmt.Errorf("listener %s: entry function %s not found in %s", spec.ID, spec.Entrypoint(), spec.Dir)
	}
	a.entryFuncs[decl] = spec
	a.enteredFuncs[decl] = true

	file := pkg.fileOf[decl]
	env := &walkEnv{
		pkg:      pkg,
		file:     file,
		listener: spec,
		routers:  map[string]*routerScope{},
		varTypes: a.collectVarTypes(pkg, file, decl),
		entry:    true,
	}
	return a.walkStmts(decl.Body.List, env)
}

func (a *Analyzer) walkStmts(stmts []ast.Stmt, env *walkEnv) error {
	for _, stmt := range stmts {
		if err := a.walkStmt(stmt, env); err != nil {
			return err
		}
	}
	return nil
}

func (a *Analyzer) walkStmt(stmt ast.Stmt, env *walkEnv) error {
	switch typed := stmt.(type) {
	case *ast.ExprStmt:
		call, ok := typed.X.(*ast.CallExpr)
		if !ok {
			return a.leakCheck(typed, env)
		}
		handled, err := a.handleCall(call, env)
		if err != nil {
			return err
		}
		if handled {
			return nil
		}
		return a.leakCheck(typed, env)

	case *ast.BlockStmt:
		return a.walkStmts(typed.List, env.child())

	case *ast.IfStmt:
		if typed.Init != nil {
			if err := a.leakCheck(typed.Init, env); err != nil {
				return err
			}
		}
		if err := a.leakCheck(typed.Cond, env); err != nil {
			return err
		}
		cond := a.set.exprText(typed.Cond)
		body := env.child()
		body.conds = append(body.conds, cond)
		if err := a.walkStmts(typed.Body.List, body); err != nil {
			return err
		}
		if typed.Else == nil {
			return nil
		}
		alt := env.child()
		alt.conds = append(alt.conds, "!("+cond+")")
		return a.walkStmt(typed.Else, alt)

	case *ast.AssignStmt:
		if scope, name, ok := a.newRouterAssign(typed, env); ok {
			if !env.entry {
				return a.errorf(typed, "chi router constructed outside a declared listener entry point")
			}
			env.routers[name] = scope
			return nil
		}
		return a.leakCheck(typed, env)

	case *ast.ReturnStmt:
		if env.entry && env.depth == 0 && a.returnsBoundRouter(typed, env) {
			return nil
		}
		return a.leakCheck(typed, env)

	default:
		// Every other construct is legitimate application code as long as no
		// router value flows through it. A router inside a loop, switch,
		// goroutine, or channel send is exactly the shape that would let a
		// registration escape enumeration, so it is refused rather than
		// approximated.
		return a.leakCheck(stmt, env)
	}
}

func (a *Analyzer) newRouterAssign(stmt *ast.AssignStmt, env *walkEnv) (*routerScope, string, bool) {
	if len(stmt.Lhs) != 1 || len(stmt.Rhs) != 1 {
		return nil, "", false
	}
	call, ok := stmt.Rhs[0].(*ast.CallExpr)
	if !ok {
		return nil, "", false
	}
	sel, ok := call.Fun.(*ast.SelectorExpr)
	if !ok || sel.Sel.Name != chiNewRouter {
		return nil, "", false
	}
	ident, ok := sel.X.(*ast.Ident)
	if !ok || importPathFor(env.file, ident.Name) != chiImportPath {
		return nil, "", false
	}
	name, ok := stmt.Lhs[0].(*ast.Ident)
	if !ok {
		return nil, "", false
	}
	return &routerScope{}, name.Name, true
}

func (a *Analyzer) returnsBoundRouter(stmt *ast.ReturnStmt, env *walkEnv) bool {
	if len(stmt.Results) != 1 {
		return false
	}
	ident, ok := stmt.Results[0].(*ast.Ident)
	if !ok {
		return false
	}
	_, bound := env.routers[ident.Name]
	return bound
}

// resolveRouter maps an expression to the router scope it denotes, following
// With() chains. It never invents a scope: an expression it does not model
// returns false and the caller refuses the construct.
func (a *Analyzer) resolveRouter(expr ast.Expr, env *walkEnv) (*routerScope, bool, error) {
	switch typed := expr.(type) {
	case *ast.Ident:
		scope, ok := env.routers[typed.Name]
		return scope, ok, nil
	case *ast.CallExpr:
		sel, ok := typed.Fun.(*ast.SelectorExpr)
		if !ok || sel.Sel.Name != "With" {
			return nil, false, nil
		}
		base, ok, err := a.resolveRouter(sel.X, env)
		if err != nil || !ok {
			return nil, ok, err
		}
		derived := base.clone()
		for _, arg := range typed.Args {
			derived.mw = append(derived.mw, mwEntry{expr: a.set.exprText(arg), conds: append([]string{}, env.conds...)})
		}
		return derived, true, nil
	}
	return nil, false, nil
}

func (a *Analyzer) handleCall(call *ast.CallExpr, env *walkEnv) (bool, error) {
	if sel, ok := call.Fun.(*ast.SelectorExpr); ok {
		scope, isRouter, err := a.resolveRouter(sel.X, env)
		if err != nil {
			return false, err
		}
		if isRouter {
			return true, a.handleRouterMethod(call, sel, scope, env)
		}
	}
	// A router handed to another function: follow it, or fail.
	if a.callPassesRouter(call, env) {
		return true, a.followHelper(call, env)
	}
	return false, nil
}

func (a *Analyzer) callPassesRouter(call *ast.CallExpr, env *walkEnv) bool {
	for _, arg := range call.Args {
		if ident, ok := arg.(*ast.Ident); ok {
			if _, bound := env.routers[ident.Name]; bound {
				return true
			}
		}
	}
	return false
}

func (a *Analyzer) followHelper(call *ast.CallExpr, env *walkEnv) error {
	decl, declPkg := a.resolveFuncDecl(call.Fun, env)
	if decl == nil {
		return a.errorf(call, "a chi router is passed to %s, which the route inventory cannot follow; "+
			"register routes inside an enumerated listener or an analyzed helper", a.set.exprText(call.Fun))
	}
	if a.enteredFuncs[decl] {
		return a.errorf(call, "route registration helper %s is reached more than once; "+
			"the inventory would duplicate or lose its routes", decl.Name.Name)
	}
	a.enteredFuncs[decl] = true

	declFile := declPkg.fileOf[decl]
	child := &walkEnv{
		pkg:      declPkg,
		file:     declFile,
		listener: env.listener,
		routers:  map[string]*routerScope{},
		conds:    append([]string{}, env.conds...),
		varTypes: a.collectVarTypes(declPkg, declFile, decl),
		depth:    env.depth + 1,
	}
	params := flattenParams(decl.Type.Params)
	if len(params) != len(call.Args) {
		return a.errorf(call, "cannot map arguments onto %s (variadic or mismatched signature)", decl.Name.Name)
	}
	for i, arg := range call.Args {
		ident, ok := arg.(*ast.Ident)
		if !ok {
			if err := a.leakCheck(arg, env); err != nil {
				return err
			}
			continue
		}
		scope, bound := env.routers[ident.Name]
		if !bound {
			continue
		}
		if !isChiRouterType(params[i].typ, declFile) {
			return a.errorf(call, "argument %d of %s receives a chi router but is not declared chi.Router", i, decl.Name.Name)
		}
		child.routers[params[i].name] = scope
	}
	if decl.Body == nil {
		return a.errorf(call, "route registration helper %s has no body", decl.Name.Name)
	}
	return a.walkStmts(decl.Body.List, child)
}

type param struct {
	name string
	typ  ast.Expr
}

func flattenParams(fields *ast.FieldList) []param {
	var out []param
	if fields == nil {
		return out
	}
	for _, field := range fields.List {
		if len(field.Names) == 0 {
			out = append(out, param{name: "_", typ: field.Type})
			continue
		}
		for _, name := range field.Names {
			out = append(out, param{name: name.Name, typ: field.Type})
		}
	}
	return out
}

func (a *Analyzer) resolveFuncDecl(fun ast.Expr, env *walkEnv) (*ast.FuncDecl, *pkgSource) {
	switch typed := fun.(type) {
	case *ast.Ident:
		if decl := env.pkg.funcs[typed.Name]; decl != nil {
			return decl, env.pkg
		}
	case *ast.SelectorExpr:
		ident, ok := typed.X.(*ast.Ident)
		if !ok {
			return nil, nil
		}
		importPath := importPathFor(env.file, ident.Name)
		if importPath == "" {
			return nil, nil
		}
		pkg := a.set.byImport[importPath]
		if pkg == nil {
			return nil, nil
		}
		if decl := pkg.funcs[typed.Sel.Name]; decl != nil {
			return decl, pkg
		}
	}
	return nil, nil
}

func (a *Analyzer) handleRouterMethod(call *ast.CallExpr, sel *ast.SelectorExpr, scope *routerScope, env *walkEnv) error {
	name := sel.Sel.Name
	switch {
	case name == "Route":
		pattern, err := a.stringArg(call, 0)
		if err != nil {
			return err
		}
		lit, err := a.funcLitArg(call, 1)
		if err != nil {
			return err
		}
		child := scope.clone()
		child.prefix = joinPattern(scope.prefix, pattern)
		child.group = joinPattern(scope.group, pattern)
		return a.walkRouterLit(lit, child, env)

	case name == "Group":
		lit, err := a.funcLitArg(call, 0)
		if err != nil {
			return err
		}
		return a.walkRouterLit(lit, scope.clone(), env)

	case name == "Use":
		for _, arg := range call.Args {
			scope.mw = append(scope.mw, mwEntry{expr: a.set.exprText(arg), conds: append([]string{}, env.conds...)})
		}
		return nil

	case name == "With":
		return a.errorf(call, "With() result is discarded; it registers nothing")

	case name == "Mount":
		return a.errorf(call, "Mount() is not modeled by the route inventory; "+
			"the mounted handler's routes would be invisible. Add explicit support before mounting")

	case name == "NotFound" || name == "MethodNotAllowed":
		// Fallback handlers, not addressable method+path operations.
		return nil

	case readOnlyRouterMethods[name]:
		return nil

	case verbMethods[name] != "":
		pattern, err := a.stringArg(call, 0)
		if err != nil {
			return err
		}
		return a.emit(call, env, scope, []string{verbMethods[name]}, "explicit", pattern, argAt(call, 1))

	case name == "Method" || name == "MethodFunc":
		method, err := a.methodArg(call, 0, env)
		if err != nil {
			return err
		}
		pattern, err := a.stringArg(call, 1)
		if err != nil {
			return err
		}
		return a.emit(call, env, scope, []string{method}, "explicit", pattern, argAt(call, 2))

	case name == "Handle" || name == "HandleFunc":
		pattern, err := a.stringArg(call, 0)
		if err != nil {
			return err
		}
		return a.emit(call, env, scope, handleAllMethods, "handle_all", pattern, argAt(call, 1))
	}
	return a.errorf(call, "unknown chi router method %q", name)
}

func (a *Analyzer) walkRouterLit(lit *ast.FuncLit, scope *routerScope, env *walkEnv) error {
	params := flattenParams(lit.Type.Params)
	if len(params) != 1 || !isChiRouterType(params[0].typ, env.file) {
		return a.errorf(lit, "router closure must take exactly one chi.Router parameter")
	}
	a.enteredLits[lit] = true
	child := env.child()
	child.routers[params[0].name] = scope
	return a.walkStmts(lit.Body.List, child)
}

func argAt(call *ast.CallExpr, index int) ast.Expr {
	if index >= len(call.Args) {
		return nil
	}
	return call.Args[index]
}

func (a *Analyzer) stringArg(call *ast.CallExpr, index int) (string, error) {
	expr := argAt(call, index)
	lit, ok := expr.(*ast.BasicLit)
	if !ok || lit.Kind != token.STRING {
		return "", a.errorf(call, "route pattern must be a string literal, got %s", a.set.exprText(expr))
	}
	value, err := strconv.Unquote(lit.Value)
	if err != nil {
		return "", a.errorf(call, "unquote route pattern: %v", err)
	}
	return value, nil
}

// methodArg resolves r.Method's first argument: a string literal or an
// http.MethodX constant. Anything else is refused.
func (a *Analyzer) methodArg(call *ast.CallExpr, index int, env *walkEnv) (string, error) {
	expr := argAt(call, index)
	if lit, ok := expr.(*ast.BasicLit); ok && lit.Kind == token.STRING {
		value, err := strconv.Unquote(lit.Value)
		if err != nil {
			return "", a.errorf(call, "unquote method: %v", err)
		}
		return strings.ToUpper(value), nil
	}
	if sel, ok := expr.(*ast.SelectorExpr); ok {
		if ident, ok := sel.X.(*ast.Ident); ok && importPathFor(env.file, ident.Name) == "net/http" {
			if method, found := strings.CutPrefix(sel.Sel.Name, "Method"); found && method != "" {
				return strings.ToUpper(method), nil
			}
		}
	}
	return "", a.errorf(call, "HTTP method must be a literal or an http.MethodX constant, got %s", a.set.exprText(expr))
}

func (a *Analyzer) funcLitArg(call *ast.CallExpr, index int) (*ast.FuncLit, error) {
	expr := argAt(call, index)
	lit, ok := expr.(*ast.FuncLit)
	if !ok {
		return nil, a.errorf(call, "router sub-scope must be an inline closure, got %s", a.set.exprText(expr))
	}
	return lit, nil
}

func (a *Analyzer) emit(call *ast.CallExpr, env *walkEnv, scope *routerScope, methods []string, origin, pattern string, handler ast.Expr) error {
	if handler == nil {
		return a.errorf(call, "registration has no handler argument")
	}
	fullPath := joinPattern(scope.prefix, pattern)
	group := scope.group
	if group == "" {
		group = "/"
	}
	sourceFile := env.pkg.FileNames[env.pkg.fileFor(call)]

	for _, method := range methods {
		info := a.classifier.describe(handler, method, fullPath, env)
		mw := renderMiddleware(scope.mw, env.conds)
		route := Route{
			Listener:          env.listener.ID,
			Namespace:         namespaceFor(fullPath),
			Method:            method,
			Path:              fullPath,
			RouteGroup:        group,
			Handler:           info.identity,
			HandlerExpr:       info.expr,
			HandlerKind:       info.kind,
			HandlerResolved:   info.resolved,
			chain:             mw,
			Conditions:        append([]string{}, env.conds...),
			Conditional:       len(env.conds) > 0,
			RequestKind:       info.requestKind,
			ResponseMediaKind: info.responseKind,
			Streams:           info.streams,
			UpgradesWebSocket: info.websocket,
			MethodOrigin:      origin,
			SourceFile:        sourceFile,
		}
		if route.chain == nil {
			route.chain = []string{}
		}
		if route.Conditions == nil {
			route.Conditions = []string{}
		}
		route.AuthClass, route.AuthTraits = classifyAuth(route.chain)
		a.routes = append(a.routes, route)
	}
	return nil
}

func namespaceFor(path string) string {
	switch {
	case path == "/api/v1" || strings.HasPrefix(path, "/api/v1/"):
		return NamespaceAPIV1
	case path == "/metrics":
		return NamespaceOperational
	default:
		return NamespaceUnversioned
	}
}

func joinPattern(prefix, pattern string) string {
	joined := prefix + pattern
	for strings.Contains(joined, "//") {
		joined = strings.ReplaceAll(joined, "//", "/")
	}
	if joined == "" {
		return "/"
	}
	return joined
}

// ---------------------------------------------------------------------------
// Leak check
// ---------------------------------------------------------------------------

// leakCheck refuses any use of a bound router value the walk did not model.
// It is the property that makes the inventory complete: a registration can
// only happen through a chi router value, and every such value is either
// walked or reported here.
func (a *Analyzer) leakCheck(node ast.Node, env *walkEnv) error {
	if len(env.routers) == 0 {
		return nil
	}
	shadow := map[string]bool{}
	var found ast.Node
	var foundName string

	var visit func(ast.Node, map[string]bool)
	visit = func(n ast.Node, shadowed map[string]bool) {
		if n == nil || found != nil {
			return
		}
		switch typed := n.(type) {
		case *ast.Ident:
			if _, bound := env.routers[typed.Name]; bound && !shadowed[typed.Name] {
				found, foundName = typed, typed.Name
			}
			return
		case *ast.SelectorExpr:
			// Only the base of a selector can be a router value.
			visit(typed.X, shadowed)
			return
		case *ast.FuncLit:
			inner := cloneShadow(shadowed)
			for _, p := range flattenParams(typed.Type.Params) {
				inner[p.name] = true
			}
			for _, p := range flattenParams(typed.Type.Results) {
				inner[p.name] = true
			}
			ast.Inspect(typed.Body, func(child ast.Node) bool {
				if child == nil || found != nil {
					return false
				}
				if child == typed.Body {
					return true
				}
				visit(child, inner)
				return false
			})
			return
		case *ast.AssignStmt:
			if typed.Tok == token.DEFINE {
				// `r := ...` introduces a new binding; only the right-hand side
				// can still refer to the router.
				for _, rhs := range typed.Rhs {
					visit(rhs, shadowed)
				}
				return
			}
		case *ast.RangeStmt:
			inner := cloneShadow(shadowed)
			if typed.Tok == token.DEFINE {
				for _, key := range []ast.Expr{typed.Key, typed.Value} {
					if ident, ok := key.(*ast.Ident); ok {
						inner[ident.Name] = true
					}
				}
			}
			visit(typed.X, shadowed)
			if typed.Body != nil {
				for _, stmt := range typed.Body.List {
					visit(stmt, inner)
				}
			}
			return
		}
		ast.Inspect(n, func(child ast.Node) bool {
			if child == nil || found != nil {
				return false
			}
			if child == n {
				return true
			}
			visit(child, shadowed)
			return false
		})
	}
	visit(node, shadow)

	if found != nil {
		return a.errorf(found, "chi router %q escapes into a construct the route inventory does not model; "+
			"routes registered through it would not appear in the inventory", foundName)
	}
	return nil
}

func cloneShadow(in map[string]bool) map[string]bool {
	out := make(map[string]bool, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

// audit proves that no chi router value in the analyzed packages escaped the
// walk. Without it, adding a route-registering helper that nothing calls from
// an enumerated entry point would leave the inventory quietly short.
func (a *Analyzer) audit() error {
	for _, dir := range sortedKeys(a.set.packages) {
		pkg := a.set.packages[dir]
		for _, file := range pkg.Files {
			if err := a.auditFile(pkg, file); err != nil {
				return err
			}
		}
	}
	return a.auditStrayRouters()
}

func (a *Analyzer) auditFile(pkg *pkgSource, file *ast.File) error {
	var err error
	ast.Inspect(file, func(node ast.Node) bool {
		if err != nil {
			return false
		}
		switch typed := node.(type) {
		case *ast.FuncDecl:
			if !hasChiRouterParam(typed.Type, file) || a.enteredFuncs[typed] {
				return true
			}
			err = a.errorf(typed, "%s.%s takes a chi.Router but is never reached from a declared listener entry point; "+
				"any route it registers would be missing from the inventory", pkg.Name, typed.Name.Name)
			return false
		case *ast.FuncLit:
			if !hasChiRouterParam(typed.Type, file) || a.enteredLits[typed] {
				return true
			}
			err = a.errorf(typed, "a closure taking chi.Router in %s is never reached from a declared listener entry point", pkg.Name)
			return false
		case *ast.StructType:
			for _, field := range typed.Fields.List {
				if isChiRouterType(field.Type, file) {
					err = a.errorf(field, "a struct field of chi router type in %s would let a router escape enumeration", pkg.Name)
					return false
				}
			}
		case *ast.ValueSpec:
			if typed.Type != nil && isChiRouterType(typed.Type, file) {
				// A declared-but-unassigned local is harmless only if nothing
				// registers on it, which the walk cannot prove.
				err = a.errorf(typed, "a variable of chi router type in %s is declared outside the modeled walk", pkg.Name)
				return false
			}
		}
		return true
	})
	return err
}

// auditStrayRouters fails when a chi router is constructed anywhere in the
// scanned trees outside a declared listener or a declared exclusion. It is what
// stops a fourth listener from appearing without an inventory row.
func (a *Analyzer) auditStrayRouters() error {
	allowed := map[string]bool{}
	for _, exclusion := range a.cfg.Exclusions {
		allowed[exclusion.File] = true
	}
	entryDirs := map[string]bool{}
	for _, listener := range a.cfg.Listeners {
		entryDirs[listener.Dir] = true
	}

	var stray []string
	for _, root := range a.cfg.ScanRoots {
		walkRoot := filepath.Join(a.cfg.Root, filepath.FromSlash(root))
		err := filepath.WalkDir(walkRoot, func(path string, entry os.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.IsDir() {
				// testdata is not built, and vendor is not Silo's code.
				if entry.Name() == "testdata" || entry.Name() == "vendor" {
					return filepath.SkipDir
				}
				return nil
			}
			if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
				return nil
			}
			data, readErr := os.ReadFile(path)
			if readErr != nil {
				return readErr
			}
			if !strings.Contains(string(data), "NewRouter(") {
				return nil
			}
			constructs, parseErr := constructsChiRouter(path, data)
			if parseErr != nil {
				return parseErr
			}
			if !constructs {
				return nil
			}
			rel, relErr := filepath.Rel(a.cfg.Root, path)
			if relErr != nil {
				return relErr
			}
			rel = filepath.ToSlash(rel)
			if allowed[rel] || entryDirs[filepath.ToSlash(filepath.Dir(rel))] {
				return nil
			}
			stray = append(stray, rel)
			return nil
		})
		if err != nil {
			return err
		}
	}
	if len(stray) > 0 {
		sort.Strings(stray)
		return fmt.Errorf("chi router constructed outside the inventoried listeners in %s; "+
			"add it as a listener or record it as an explicit exclusion", strings.Join(stray, ", "))
	}
	return nil
}

// constructsChiRouter reports whether a file really calls chi.NewRouter, as
// opposed to merely mentioning it in a comment or a diagnostic string.
func constructsChiRouter(path string, data []byte) (bool, error) {
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, path, data, parser.SkipObjectResolution)
	if err != nil {
		return false, fmt.Errorf("parse %s: %w", path, err)
	}
	found := false
	ast.Inspect(file, func(node ast.Node) bool {
		if found {
			return false
		}
		call, ok := node.(*ast.CallExpr)
		if !ok {
			return true
		}
		sel, ok := call.Fun.(*ast.SelectorExpr)
		if !ok || sel.Sel.Name != chiNewRouter {
			return true
		}
		ident, ok := sel.X.(*ast.Ident)
		if !ok {
			return true
		}
		if importPathFor(file, ident.Name) == chiImportPath {
			found = true
			return false
		}
		return true
	})
	return found, nil
}

func sortedKeys[V any](in map[string]V) []string {
	out := make([]string, 0, len(in))
	for key := range in {
		out = append(out, key)
	}
	sort.Strings(out)
	return out
}

// ---------------------------------------------------------------------------
// Type syntax helpers
// ---------------------------------------------------------------------------

func isChiRouterType(expr ast.Expr, file *ast.File) bool {
	switch typed := expr.(type) {
	case *ast.StarExpr:
		return isChiRouterType(typed.X, file)
	case *ast.SelectorExpr:
		ident, ok := typed.X.(*ast.Ident)
		if !ok {
			return false
		}
		if importPathFor(file, ident.Name) != chiImportPath {
			return false
		}
		switch typed.Sel.Name {
		case "Router", "Routes", "Mux":
			return true
		}
	}
	return false
}

func hasChiRouterParam(sig *ast.FuncType, file *ast.File) bool {
	for _, p := range flattenParams(sig.Params) {
		if isChiRouterType(p.typ, file) {
			return true
		}
	}
	return false
}

func (a *Analyzer) errorf(node ast.Node, format string, args ...any) error {
	pos := a.set.position(node)
	rel := pos.Filename
	if trimmed, err := filepath.Rel(a.cfg.Root, pos.Filename); err == nil {
		rel = filepath.ToSlash(trimmed)
	}
	return fmt.Errorf("%s:%d: %s", rel, pos.Line, fmt.Sprintf(format, args...))
}
