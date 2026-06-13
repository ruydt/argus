package scriptcatalog

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"path"

	"argus/internal/domain"
)

// ScriptSource provides a catalog of hook scripts and their bodies.
// v1 ships one implementation (BundledSource); remote sources plug in later.
type ScriptSource interface {
	Catalog(ctx context.Context) (domain.ScriptCatalog, error)
	ReadScript(ctx context.Context, id string) ([]byte, error)
	Tier() string
}

// BundledSource serves scripts embedded in the binary.
type BundledSource struct{}

func NewBundledSource() *BundledSource { return &BundledSource{} }

func (BundledSource) Tier() string { return "official" }

// manifest mirrors files/catalog.json. Packages decode straight into
// domain.ScriptPackage (Body/Checksum/Installed/RuntimeAvailable stay zero
// and are filled by the loader / handler).
type manifest struct {
	SchemaVersion int                    `json:"schema_version"`
	Packages      []domain.ScriptPackage `json:"packages"`
	Bundles       []domain.ScriptBundle  `json:"bundles"`
}

func (s BundledSource) loadManifest() (manifest, error) {
	raw, err := bundledFS.ReadFile("files/catalog.json")
	if err != nil {
		return manifest{}, fmt.Errorf("read manifest: %w", err)
	}
	var m manifest
	if err := json.Unmarshal(raw, &m); err != nil {
		return manifest{}, fmt.Errorf("parse manifest: %w", err)
	}
	return m, nil
}

// Catalog returns every package (with Body + loader-computed Checksum) and bundle.
func (s BundledSource) Catalog(_ context.Context) (domain.ScriptCatalog, error) {
	m, err := s.loadManifest()
	if err != nil {
		return domain.ScriptCatalog{}, err
	}
	pkgs := make([]domain.ScriptPackage, 0, len(m.Packages))
	for _, p := range m.Packages {
		body, err := bundledFS.ReadFile(path.Join("files", p.Filename))
		if err != nil {
			return domain.ScriptCatalog{}, fmt.Errorf("read script %s: %w", p.ID, err)
		}
		p.Body = string(body)
		p.Checksum = checksum(body)
		pkgs = append(pkgs, p)
	}
	return domain.ScriptCatalog{Packages: pkgs, Bundles: m.Bundles}, nil
}

// ReadScript returns the embedded body for one package id.
func (s BundledSource) ReadScript(_ context.Context, id string) ([]byte, error) {
	m, err := s.loadManifest()
	if err != nil {
		return nil, err
	}
	for _, p := range m.Packages {
		if p.ID == id {
			return bundledFS.ReadFile(path.Join("files", p.Filename))
		}
	}
	return nil, fmt.Errorf("unknown script id %q", id)
}

func checksum(b []byte) string {
	sum := sha256.Sum256(b)
	return "sha256:" + hex.EncodeToString(sum[:])
}
