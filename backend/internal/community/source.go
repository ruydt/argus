// Package community reads the public hook-script registry (a static index.json
// served from raw.githubusercontent.com) and verifies script bodies on fetch.
package community

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"argus/internal/domain"
)

// Source fetches and caches the registry index. It is safe for concurrent use.
type Source struct {
	baseURL string
	client  *http.Client
	ttl     time.Duration

	mu        sync.Mutex
	cached    []domain.CommunityScript
	fetchedAt time.Time
	hasCache  bool
}

// NewSource builds a Source reading from baseURL (e.g.
// https://raw.githubusercontent.com/argus-hooks/registry/main).
func NewSource(baseURL string, client *http.Client) *Source {
	if client == nil {
		client = http.DefaultClient
	}
	return &Source{baseURL: baseURL, client: client, ttl: 15 * time.Minute}
}

type indexFile struct {
	SchemaVersion int                      `json:"schema_version"`
	Scripts       []domain.CommunityScript `json:"scripts"`
}

// Catalog returns the registry scripts, cached for ttl. On a fetch error it
// serves the last good cache (offline tolerance); only a cold-cache error
// propagates.
func (s *Source) Catalog(ctx context.Context) ([]domain.CommunityScript, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.hasCache && time.Since(s.fetchedAt) < s.ttl {
		return s.snapshot(), nil
	}
	scripts, err := s.fetchIndex(ctx)
	if err != nil {
		if s.hasCache {
			return s.snapshot(), nil // serve stale
		}
		return nil, err
	}
	s.cached = scripts
	s.fetchedAt = time.Now()
	s.hasCache = true
	return s.snapshot(), nil
}

// snapshot returns a copy of the cached slice so callers can't mutate the cache.
func (s *Source) snapshot() []domain.CommunityScript {
	out := make([]domain.CommunityScript, len(s.cached))
	copy(out, s.cached)
	return out
}

func (s *Source) fetchIndex(ctx context.Context) ([]domain.CommunityScript, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.baseURL+"/index.json", nil)
	if err != nil {
		return nil, err
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("registry index status %d", resp.StatusCode)
	}
	var idx indexFile
	if err := json.NewDecoder(resp.Body).Decode(&idx); err != nil {
		return nil, fmt.Errorf("parse index: %w", err)
	}
	return idx.Scripts, nil
}

// validateSourcePath rejects registry-supplied body paths that could escape the
// configured base URL (traversal, absolute path, scheme, or backslash).
func validateSourcePath(p string) error {
	if p == "" ||
		strings.HasPrefix(p, "/") ||
		strings.Contains(p, "..") ||
		strings.Contains(p, "://") ||
		strings.Contains(p, "\\") {
		return fmt.Errorf("invalid registry source path %q", p)
	}
	return nil
}

func (s *Source) lookup(ctx context.Context, id string) (domain.CommunityScript, error) {
	scripts, err := s.Catalog(ctx)
	if err != nil {
		return domain.CommunityScript{}, err
	}
	for _, c := range scripts {
		if c.ID == id {
			return c, nil
		}
	}
	return domain.CommunityScript{}, fmt.Errorf("unknown community script %q", id)
}

// ScriptBody fetches the raw body for id and verifies its sha256 against the
// index entry. Returns the entry metadata alongside the verified body.
func (s *Source) ScriptBody(ctx context.Context, id string) (domain.CommunityScript, []byte, error) {
	cs, err := s.lookup(ctx, id)
	if err != nil {
		return cs, nil, err
	}
	// cs.Source comes from the remote index.json (a trust boundary). The body is
	// sha256-verified below, but constrain the path first so a compromised index
	// can't redirect the fetch via traversal, an absolute path, or a scheme.
	if err := validateSourcePath(cs.Source); err != nil {
		return cs, nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.baseURL+"/"+cs.Source, nil)
	if err != nil {
		return cs, nil, err
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return cs, nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return cs, nil, fmt.Errorf("registry body status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return cs, nil, err
	}
	sum := sha256.Sum256(body)
	if got := hex.EncodeToString(sum[:]); got != cs.SHA256 {
		return cs, nil, fmt.Errorf("integrity check failed for %q", id)
	}
	return cs, body, nil
}
