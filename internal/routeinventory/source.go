package routeinventory

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/printer"
	"go/token"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
)

// pkgSource is one parsed package directory. Only non-test files are parsed:
// tests may build throwaway routers, and a test route is not part of the
// shipped surface.
type pkgSource struct {
	Dir        string // repo-relative
	ImportPath string
	Name       string
	Files      []*ast.File
	FileNames  map[*ast.File]string // repo-relative

	funcs   map[string]*ast.FuncDecl // package-level funcs by name
	methods map[string]*ast.FuncDecl // methods by "RecvType.Name"
	fileOf  map[ast.Node]*ast.File
}

// sourceSet is every package the analyzer parses.
type sourceSet struct {
	fset       *token.FileSet
	root       string
	modulePath string
	packages   map[string]*pkgSource // keyed by repo-relative dir
	byImport   map[string]*pkgSource
}

func loadSources(fset *token.FileSet, root, modulePath string, dirs []string) (*sourceSet, error) {
	set := &sourceSet{
		fset:       fset,
		root:       root,
		modulePath: modulePath,
		packages:   map[string]*pkgSource{},
		byImport:   map[string]*pkgSource{},
	}
	for _, dir := range dirs {
		if _, done := set.packages[dir]; done {
			continue
		}
		pkg, err := parsePackage(fset, root, modulePath, dir)
		if err != nil {
			return nil, err
		}
		set.packages[dir] = pkg
		set.byImport[pkg.ImportPath] = pkg
	}
	return set, nil
}

func parsePackage(fset *token.FileSet, root, modulePath, dir string) (*pkgSource, error) {
	abs := filepath.Join(root, filepath.FromSlash(dir))
	entries, err := os.ReadDir(abs)
	if err != nil {
		return nil, fmt.Errorf("read package %s: %w", dir, err)
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".go") || strings.HasSuffix(entry.Name(), "_test.go") {
			continue
		}
		names = append(names, entry.Name())
	}
	sort.Strings(names)

	pkg := &pkgSource{
		Dir:        dir,
		ImportPath: path.Join(modulePath, dir),
		FileNames:  map[*ast.File]string{},
		funcs:      map[string]*ast.FuncDecl{},
		methods:    map[string]*ast.FuncDecl{},
		fileOf:     map[ast.Node]*ast.File{},
	}
	for _, name := range names {
		file, err := parser.ParseFile(fset, filepath.Join(abs, name), nil, parser.SkipObjectResolution)
		if err != nil {
			return nil, fmt.Errorf("parse %s/%s: %w", dir, name, err)
		}
		pkg.Name = file.Name.Name
		pkg.Files = append(pkg.Files, file)
		pkg.FileNames[file] = path.Join(dir, name)
		for _, decl := range file.Decls {
			fn, ok := decl.(*ast.FuncDecl)
			if !ok {
				continue
			}
			pkg.fileOf[fn] = file
			if fn.Recv == nil || len(fn.Recv.List) == 0 {
				pkg.funcs[fn.Name.Name] = fn
				continue
			}
			pkg.methods[recvTypeName(fn.Recv.List[0].Type)+"."+fn.Name.Name] = fn
		}
	}
	if len(pkg.Files) == 0 {
		return nil, fmt.Errorf("package %s has no non-test Go files", dir)
	}
	return pkg, nil
}

func recvTypeName(expr ast.Expr) string {
	switch typed := expr.(type) {
	case *ast.StarExpr:
		return recvTypeName(typed.X)
	case *ast.IndexExpr:
		return recvTypeName(typed.X)
	case *ast.IndexListExpr:
		return recvTypeName(typed.X)
	case *ast.Ident:
		return typed.Name
	}
	return ""
}

// exprText renders an expression as normalized single-line source. Two
// registrations that read the same in the source produce the same text
// regardless of how the author wrapped the call across lines.
func (s *sourceSet) exprText(expr ast.Expr) string {
	var sb strings.Builder
	if err := printer.Fprint(&sb, s.fset, expr); err != nil {
		return "<unprintable>"
	}
	return normalizeSpace(sb.String())
}

func normalizeSpace(in string) string {
	return strings.Join(strings.Fields(in), " ")
}

func (s *sourceSet) position(node ast.Node) token.Position {
	return s.fset.Position(node.Pos())
}

// fileFor finds the parsed file containing a node.
func (p *pkgSource) fileFor(node ast.Node) *ast.File {
	for _, file := range p.Files {
		if node.Pos() >= file.FileStart && node.End() <= file.FileEnd {
			return file
		}
	}
	return nil
}

// importPathFor resolves a package identifier used in one file to its import
// path, honoring aliases.
// defaultPackageName is the identifier an unaliased import binds. A module
// major-version suffix is not a package name: `github.com/go-chi/chi/v5` binds
// `chi`, and treating it as `v5` silently unbinds every chi call.
func defaultPackageName(importPath string) string {
	base := path.Base(importPath)
	if len(base) > 1 && base[0] == 'v' && isAllDigits(base[1:]) {
		return path.Base(path.Dir(importPath))
	}
	return base
}

func isAllDigits(in string) bool {
	if in == "" {
		return false
	}
	for _, r := range in {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func importPathFor(file *ast.File, name string) string {
	if file == nil {
		return ""
	}
	for _, spec := range file.Imports {
		raw := strings.Trim(spec.Path.Value, `"`)
		alias := defaultPackageName(raw)
		if spec.Name != nil {
			alias = spec.Name.Name
		}
		if alias == name {
			return raw
		}
	}
	return ""
}
