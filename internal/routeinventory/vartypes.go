package routeinventory

import (
	"go/ast"
	"strings"
)

// collectVarTypes resolves the declared type of every local handler variable in
// a function body, so `authHandler.HandleLogin` becomes the stable identity
// `(*.../internal/api/handlers.AuthHandler).HandleLogin` rather than a local
// variable name that a rename would churn.
//
// Only two shapes are resolved, both syntactic: an explicit `var x *pkg.T` and
// a `x := pkg.NewT(...)` whose constructor is in an analyzed package. Anything
// else leaves the variable unresolved, and the route row records the verbatim
// registration expression instead of an invented identity.
func (a *Analyzer) collectVarTypes(pkg *pkgSource, file *ast.File, decl *ast.FuncDecl) map[string]string {
	types := map[string]string{}
	if decl == nil {
		return types
	}
	// The receiver and parameters name handlers too: a node listener registers
	// `s.handleHealth`, where `s` is the *Server receiver.
	for _, field := range append(fieldsOf(decl.Recv), fieldsOf(decl.Type.Params)...) {
		rendered := a.typeIdentity(field.typ, pkg, file)
		if rendered == "" {
			continue
		}
		types[field.name] = rendered
	}
	body := decl.Body
	if body == nil {
		return types
	}
	ast.Inspect(body, func(node ast.Node) bool {
		switch typed := node.(type) {
		case *ast.ValueSpec:
			if typed.Type == nil {
				return true
			}
			rendered := a.typeIdentity(typed.Type, pkg, file)
			if rendered == "" {
				return true
			}
			for _, name := range typed.Names {
				if _, exists := types[name.Name]; !exists {
					types[name.Name] = rendered
				}
			}
		case *ast.AssignStmt:
			if len(typed.Lhs) != 1 || len(typed.Rhs) != 1 {
				return true
			}
			name, ok := typed.Lhs[0].(*ast.Ident)
			if !ok {
				return true
			}
			if _, exists := types[name.Name]; exists {
				return true
			}
			if rendered := a.valueIdentity(typed.Rhs[0], pkg, file); rendered != "" {
				types[name.Name] = rendered
			}
		}
		return true
	})
	return types
}

func fieldsOf(fields *ast.FieldList) []param {
	return flattenParams(fields)
}

// valueIdentity resolves the type produced by an initializer expression.
func (a *Analyzer) valueIdentity(expr ast.Expr, pkg *pkgSource, file *ast.File) string {
	switch typed := expr.(type) {
	case *ast.UnaryExpr:
		composite, ok := typed.X.(*ast.CompositeLit)
		if !ok || composite.Type == nil {
			return ""
		}
		inner := a.typeIdentity(composite.Type, pkg, file)
		if inner == "" {
			return ""
		}
		return "*" + inner
	case *ast.CompositeLit:
		if typed.Type == nil {
			return ""
		}
		return a.typeIdentity(typed.Type, pkg, file)
	case *ast.CallExpr:
		decl, declPkg := a.resolveFuncDeclIn(typed.Fun, pkg, file)
		if decl == nil || decl.Type.Results == nil || len(decl.Type.Results.List) == 0 {
			return ""
		}
		declFile := declPkg.fileOf[decl]
		return a.typeIdentity(decl.Type.Results.List[0].Type, declPkg, declFile)
	}
	return ""
}

func (a *Analyzer) resolveFuncDeclIn(fun ast.Expr, pkg *pkgSource, file *ast.File) (*ast.FuncDecl, *pkgSource) {
	switch typed := fun.(type) {
	case *ast.Ident:
		if decl := pkg.funcs[typed.Name]; decl != nil {
			return decl, pkg
		}
	case *ast.SelectorExpr:
		ident, ok := typed.X.(*ast.Ident)
		if !ok {
			return nil, nil
		}
		importPath := importPathFor(file, ident.Name)
		if importPath == "" {
			return nil, nil
		}
		target := a.set.byImport[importPath]
		if target == nil {
			return nil, nil
		}
		if decl := target.funcs[typed.Sel.Name]; decl != nil {
			return decl, target
		}
	}
	return nil, nil
}

// typeIdentity renders a type expression with fully qualified package paths.
func (a *Analyzer) typeIdentity(expr ast.Expr, pkg *pkgSource, file *ast.File) string {
	switch typed := expr.(type) {
	case *ast.StarExpr:
		inner := a.typeIdentity(typed.X, pkg, file)
		if inner == "" {
			return ""
		}
		return "*" + inner
	case *ast.Ident:
		if isPredeclared(typed.Name) {
			return ""
		}
		return pkg.ImportPath + "." + typed.Name
	case *ast.SelectorExpr:
		ident, ok := typed.X.(*ast.Ident)
		if !ok {
			return ""
		}
		importPath := importPathFor(file, ident.Name)
		if importPath == "" {
			return ""
		}
		return importPath + "." + typed.Sel.Name
	}
	return ""
}

var predeclared = strings.Fields("bool byte complex64 complex128 error float32 float64 int int8 int16 " +
	"int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr any comparable")

func isPredeclared(name string) bool {
	for _, candidate := range predeclared {
		if candidate == name {
			return true
		}
	}
	return false
}
