package scriptcatalog

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestCatalogLoadsAllPackagesAndBundles(t *testing.T) {
	cat, err := NewBundledSource().Catalog(context.Background())
	if err != nil {
		t.Fatalf("Catalog() error = %v", err)
	}
	if len(cat.Packages) != 12 {
		t.Fatalf("packages = %d, want 12", len(cat.Packages))
	}
	if len(cat.Bundles) != 2 {
		t.Fatalf("bundles = %d, want 2", len(cat.Bundles))
	}
	for _, p := range cat.Packages {
		if p.ID == "" || p.Filename == "" || p.Body == "" {
			t.Errorf("package %+v missing id/filename/body", p)
		}
		if len(p.Checksum) != len("sha256:")+64 {
			t.Errorf("package %s checksum = %q, want sha256:<64 hex>", p.ID, p.Checksum)
		}
	}
}

func TestReadScriptKnownAndUnknown(t *testing.T) {
	src := NewBundledSource()
	body, err := src.ReadScript(context.Background(), "block-dangerous")
	if err != nil {
		t.Fatalf("ReadScript(known) error = %v", err)
	}
	if len(body) == 0 {
		t.Fatal("ReadScript(known) returned empty body")
	}
	if _, err := src.ReadScript(context.Background(), "does-not-exist"); err == nil {
		t.Fatal("ReadScript(unknown) error = nil, want error")
	}
}

// TestEmbedMatchesSourceCollection is the drift guard: every embedded .js must
// byte-match the repo-root source, and every bundle package id must resolve.
func TestEmbedMatchesSourceCollection(t *testing.T) {
	cat, err := NewBundledSource().Catalog(context.Background())
	if err != nil {
		t.Fatalf("Catalog() error = %v", err)
	}
	ids := map[string]bool{}
	for _, p := range cat.Packages {
		ids[p.ID] = true
		srcPath := filepath.Join("..", "..", "..", "my-custom-hook-scripts", p.Filename)
		want, err := os.ReadFile(srcPath)
		if err != nil {
			t.Fatalf("read source %s: %v (run `make sync-scripts`)", srcPath, err)
		}
		if string(want) != p.Body {
			t.Errorf("embedded %s differs from source — run `make sync-scripts`", p.Filename)
		}
	}
	for _, b := range cat.Bundles {
		for _, pid := range b.Packages {
			if !ids[pid] {
				t.Errorf("bundle %s references unknown package %q", b.ID, pid)
			}
		}
	}
}
