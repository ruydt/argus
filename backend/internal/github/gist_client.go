package github

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"argus/internal/domain"
)

var (
	ErrAlreadyInCollection = fmt.Errorf("script already in collection")
	ErrNotInCollection     = fmt.Errorf("script not in collection")
)

const collectionMarker = "[argus-collection]"
const manifestFile = "manifest.json"

// GistClient talks to the GitHub Gist API on behalf of one authenticated user.
type GistClient struct {
	token      string
	httpClient *http.Client
	baseURL    string // https://api.github.com; overridden in tests
}

func NewGistClient(token string, httpClient *http.Client) *GistClient {
	return &GistClient{token: token, httpClient: httpClient, baseURL: "https://api.github.com"}
}

func (g *GistClient) do(ctx context.Context, method, path string, payload any) (*http.Response, error) {
	var body io.Reader
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return nil, err
		}
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, g.baseURL+path, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+g.token)
	req.Header.Set("Accept", "application/vnd.github+json")
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return g.httpClient.Do(req)
}

// Login returns the authenticated user's login.
func (g *GistClient) Login(ctx context.Context) (string, error) {
	resp, err := g.do(ctx, http.MethodGet, "/user", nil)
	if err != nil {
		return "", err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("github /user: status %d", resp.StatusCode)
	}
	var u struct {
		Login string `json:"login"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&u); err != nil {
		return "", err
	}
	return u.Login, nil
}

type gistFileIn struct {
	Content string `json:"content"`
}
type gistFileOut struct {
	Filename string `json:"filename"`
	Content  string `json:"content"`
}
type gistIn struct {
	// omitempty so AddScript/RemoveScript (which PATCH only Files) don't send
	// description:"" — GitHub would otherwise wipe the [argus-collection] marker
	// the collection is discovered by, breaking cross-machine portability.
	Description string                 `json:"description,omitempty"`
	Public      bool                   `json:"public,omitempty"`
	Files       map[string]*gistFileIn `json:"files"`
}
type gistOut struct {
	ID          string                 `json:"id"`
	Description string                 `json:"description"`
	Files       map[string]gistFileOut `json:"files"`
}

// manifestEntry is one script's metadata stored in manifest.json.
type manifestEntry struct {
	ID       string `json:"id"`
	Filename string `json:"filename"`
	Title    string `json:"title"`
	Purpose  string `json:"purpose,omitempty"`
	Event    string `json:"event,omitempty"`
	Matcher  string `json:"matcher,omitempty"`
	Runtime  string `json:"runtime,omitempty"`
	Origin   string `json:"origin"`
}
type manifest struct {
	Version int             `json:"version"`
	Scripts []manifestEntry `json:"scripts"`
}

// FindOrCreateCollection returns the id of the user's collection gist, creating
// it if absent. It pages through all of the user's gists so the collection is
// found even for users with more than 100 gists (else a duplicate would be made).
func (g *GistClient) FindOrCreateCollection(ctx context.Context) (string, error) {
	for page := 1; ; page++ {
		id, more, err := g.findCollectionPage(ctx, page)
		if err != nil {
			return "", err
		}
		if id != "" {
			return id, nil
		}
		if !more {
			break
		}
	}
	// Not found on any page — create it.
	emptyManifest, err := json.Marshal(manifest{Version: 1, Scripts: []manifestEntry{}})
	if err != nil {
		return "", err
	}
	created, err := g.patchOrCreate(ctx, "", gistIn{
		Description: collectionMarker + " argus hook script collection",
		Public:      false,
		Files:       map[string]*gistFileIn{manifestFile: {Content: string(emptyManifest)}},
	})
	if err != nil {
		return "", err
	}
	return created.ID, nil
}

// findCollectionPage scans one page of the user's gists. Returns the matching
// gist id (or ""), whether another page may exist, and any error.
func (g *GistClient) findCollectionPage(ctx context.Context, page int) (id string, more bool, err error) {
	resp, err := g.do(ctx, http.MethodGet, fmt.Sprintf("/gists?per_page=100&page=%d", page), nil)
	if err != nil {
		return "", false, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return "", false, fmt.Errorf("github list gists: status %d", resp.StatusCode)
	}
	var gists []gistOut
	if err := json.NewDecoder(resp.Body).Decode(&gists); err != nil {
		return "", false, err
	}
	for _, gi := range gists {
		if len(gi.Description) >= len(collectionMarker) && gi.Description[:len(collectionMarker)] == collectionMarker {
			return gi.ID, false, nil
		}
	}
	return "", len(gists) == 100, nil
}

func (g *GistClient) patchOrCreate(ctx context.Context, gistID string, in gistIn) (gistOut, error) {
	method, path := http.MethodPost, "/gists"
	if gistID != "" {
		method, path = http.MethodPatch, "/gists/"+gistID
	}
	resp, err := g.do(ctx, method, path, in)
	if err != nil {
		return gistOut{}, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return gistOut{}, fmt.Errorf("github write gist: status %d", resp.StatusCode)
	}
	var out gistOut
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return gistOut{}, err
	}
	return out, nil
}

func (g *GistClient) readRaw(ctx context.Context, gistID string) (gistOut, manifest, error) {
	resp, err := g.do(ctx, http.MethodGet, "/gists/"+gistID, nil)
	if err != nil {
		return gistOut{}, manifest{}, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return gistOut{}, manifest{}, fmt.Errorf("github read gist: status %d", resp.StatusCode)
	}
	var out gistOut
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return gistOut{}, manifest{}, err
	}
	var m manifest
	if mf, ok := out.Files[manifestFile]; ok && mf.Content != "" {
		if err := json.Unmarshal([]byte(mf.Content), &m); err != nil {
			// Refuse to operate on a corrupt manifest rather than silently
			// overwriting it (and losing every entry) on the next write.
			return gistOut{}, manifest{}, fmt.Errorf("parse collection manifest: %w", err)
		}
	}
	return out, m, nil
}

// ReadCollection returns the collection scripts (metadata from manifest, body from files).
func (g *GistClient) ReadCollection(ctx context.Context, gistID string) (domain.Collection, error) {
	out, m, err := g.readRaw(ctx, gistID)
	if err != nil {
		return domain.Collection{}, err
	}
	scripts := make([]domain.CollectionScript, 0, len(m.Scripts))
	for _, e := range m.Scripts {
		f, ok := out.Files[e.Filename]
		if !ok {
			continue // manifest references a file the user deleted; skip
		}
		scripts = append(scripts, domain.CollectionScript{
			ID: e.ID, Filename: e.Filename, Title: e.Title, Purpose: e.Purpose,
			Event: e.Event, Matcher: e.Matcher, Runtime: e.Runtime, Origin: e.Origin,
			Body: f.Content,
		})
	}
	return domain.Collection{Scripts: scripts}, nil
}

// AddScript writes a script file + updates the manifest. Returns ErrAlreadyInCollection
// if the id already exists.
func (g *GistClient) AddScript(ctx context.Context, gistID string, s domain.CollectionScript) error {
	_, m, err := g.readRaw(ctx, gistID)
	if err != nil {
		return err
	}
	for _, e := range m.Scripts {
		if e.ID == s.ID {
			return ErrAlreadyInCollection
		}
	}
	m.Scripts = append(m.Scripts, manifestEntry{
		ID: s.ID, Filename: s.Filename, Title: s.Title, Purpose: s.Purpose,
		Event: s.Event, Matcher: s.Matcher, Runtime: s.Runtime, Origin: s.Origin,
	})
	mb, err := json.Marshal(m)
	if err != nil {
		return err
	}
	_, err = g.patchOrCreate(ctx, gistID, gistIn{Files: map[string]*gistFileIn{
		s.Filename:   {Content: s.Body},
		manifestFile: {Content: string(mb)},
	}})
	return err
}

// RemoveScript deletes a script file + manifest entry by id.
func (g *GistClient) RemoveScript(ctx context.Context, gistID, id string) error {
	_, m, err := g.readRaw(ctx, gistID)
	if err != nil {
		return err
	}
	var filename string
	kept := m.Scripts[:0]
	for _, e := range m.Scripts {
		if e.ID == id {
			filename = e.Filename
			continue
		}
		kept = append(kept, e)
	}
	if filename == "" {
		return ErrNotInCollection
	}
	m.Scripts = kept
	mb, err := json.Marshal(m)
	if err != nil {
		return err
	}
	// A nil file entry in the PATCH payload deletes that file.
	files := map[string]*gistFileIn{manifestFile: {Content: string(mb)}}
	files[filename] = nil
	_, err = g.patchOrCreate(ctx, gistID, gistIn{Files: files})
	return err
}
