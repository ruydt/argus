package github

import (
	"context"
	"net/http"
	"sync"
	"time"

	"argus/internal/domain"
)

// Service orchestrates auth + collection access. It holds the transient
// device-flow state and the cached gist id. Safe for concurrent use.
type Service struct {
	clientID   string
	httpClient *http.Client
	tokens     *TokenStore

	// Test-only base-URL overrides (empty in production = real GitHub URLs).
	deviceCodeBase string
	apiBase        string

	mu         sync.Mutex
	deviceCode string // pending device flow, "" when none
	gistID     string // cached after first resolve
	// pollEvery is the minimum spacing between real GitHub token-poll calls; it
	// grows on slow_down. lastPollAt is when we last actually hit GitHub. These
	// let the backend own the device-flow cadence regardless of how fast the SPA
	// polls /api/github/status (prevents slow_down spirals → "waiting forever").
	pollEvery  time.Duration
	lastPollAt time.Time
}

func NewService(clientID, argusDir string) *Service {
	return &Service{
		clientID:   clientID,
		httpClient: &http.Client{},
		tokens:     NewTokenStore(argusDir),
	}
}

func (s *Service) deviceFlow() *DeviceFlow {
	d := NewDeviceFlow(s.clientID, s.httpClient)
	if s.deviceCodeBase != "" {
		d.baseURL = s.deviceCodeBase
	}
	return d
}

func (s *Service) newGist(token string) *GistClient {
	c := NewGistClient(token, s.httpClient)
	if s.apiBase != "" {
		c.baseURL = s.apiBase
	}
	return c
}

func (s *Service) gist() (*GistClient, bool) {
	tok, _, ok := s.tokens.Load()
	if !ok {
		return nil, false
	}
	return s.newGist(tok), true
}

// StartDevice begins a device flow and stores the pending device code. When
// share is true the broader `gist public_repo` scope is requested (needed to
// fork the registry and open a PR); otherwise only `gist` is requested so a
// plain login never asks for write access to the user's public repos.
func (s *Service) StartDevice(ctx context.Context, share bool) (domain.DeviceCodeResponse, error) {
	scope := "gist"
	if share {
		scope = "gist public_repo"
	}
	dc, err := s.deviceFlow().Start(ctx, scope)
	if err != nil {
		return domain.DeviceCodeResponse{}, err
	}
	every := time.Duration(dc.Interval) * time.Second
	if every < 5*time.Second {
		every = 5 * time.Second
	}
	s.mu.Lock()
	s.deviceCode = dc.DeviceCode
	s.pollEvery = every
	s.lastPollAt = time.Time{}
	s.mu.Unlock()
	return domain.DeviceCodeResponse{
		UserCode: dc.UserCode, VerificationURI: dc.VerificationURI,
		ExpiresIn: dc.ExpiresIn, Interval: dc.Interval,
	}, nil
}

// Status advances a pending device flow one step and reports auth state.
func (s *Service) Status(ctx context.Context) domain.GitHubAuthStatus {
	if _, login, ok := s.tokens.Load(); ok {
		return domain.GitHubAuthStatus{Authenticated: true, Login: login}
	}
	s.mu.Lock()
	dc := s.deviceCode
	every := s.pollEvery
	last := s.lastPollAt
	s.mu.Unlock()
	if dc == "" {
		return domain.GitHubAuthStatus{}
	}
	if every <= 0 {
		every = 5 * time.Second
	}
	// Throttle: never hit GitHub's token endpoint faster than the interval,
	// regardless of how often the SPA calls Status. Otherwise GitHub returns
	// slow_down indefinitely and the token never arrives.
	if !last.IsZero() && time.Since(last) < every {
		return domain.GitHubAuthStatus{}
	}
	s.mu.Lock()
	s.lastPollAt = time.Now()
	s.mu.Unlock()
	tok, pending, slowDown, err := s.deviceFlow().Poll(ctx, dc)
	if slowDown {
		s.mu.Lock()
		s.pollEvery = every + 5*time.Second
		s.mu.Unlock()
	}
	if err != nil || pending || tok == "" {
		if err != nil {
			s.mu.Lock()
			s.deviceCode = ""
			s.mu.Unlock()
		}
		return domain.GitHubAuthStatus{}
	}
	login, _ := s.newGist(tok).Login(ctx)
	_ = s.tokens.Save(tok, login)
	s.mu.Lock()
	s.deviceCode = ""
	s.mu.Unlock()
	return domain.GitHubAuthStatus{Authenticated: true, Login: login}
}

// Logout clears the token + cached state.
func (s *Service) Logout() error {
	s.mu.Lock()
	s.gistID = ""
	s.deviceCode = ""
	s.pollEvery = 0
	s.lastPollAt = time.Time{}
	s.mu.Unlock()
	return s.tokens.Delete()
}

func (s *Service) collectionGist(ctx context.Context, gc *GistClient) (string, error) {
	s.mu.Lock()
	id := s.gistID
	s.mu.Unlock()
	if id != "" {
		return id, nil
	}
	id, err := gc.FindOrCreateCollection(ctx)
	if err != nil {
		return "", err
	}
	s.mu.Lock()
	s.gistID = id
	s.mu.Unlock()
	return id, nil
}

// ErrNotAuthenticated is returned when no token is present.
var ErrNotAuthenticated = errString("not authenticated")

type errString string

func (e errString) Error() string { return string(e) }

// Collection returns the user's collection (caller fills Installed).
func (s *Service) Collection(ctx context.Context) (domain.Collection, error) {
	gc, ok := s.gist()
	if !ok {
		return domain.Collection{}, ErrNotAuthenticated
	}
	id, err := s.collectionGist(ctx, gc)
	if err != nil {
		return domain.Collection{}, err
	}
	return gc.ReadCollection(ctx, id)
}

// AddScript adds a script to the collection gist.
func (s *Service) AddScript(ctx context.Context, script domain.CollectionScript) error {
	gc, ok := s.gist()
	if !ok {
		return ErrNotAuthenticated
	}
	id, err := s.collectionGist(ctx, gc)
	if err != nil {
		return err
	}
	return gc.AddScript(ctx, id, script)
}

// RemoveScript removes a script from the collection gist.
func (s *Service) RemoveScript(ctx context.Context, scriptID string) error {
	gc, ok := s.gist()
	if !ok {
		return ErrNotAuthenticated
	}
	id, err := s.collectionGist(ctx, gc)
	if err != nil {
		return err
	}
	return gc.RemoveScript(ctx, id, scriptID)
}

// PublishToRegistry forks + commits + opens a PR for the given files.
func (s *Service) PublishToRegistry(ctx context.Context, files []PublishFile, description string) (string, error) {
	gc, ok := s.gist()
	if !ok {
		return "", ErrNotAuthenticated
	}
	return gc.PublishRegistry(ctx, files, description)
}
