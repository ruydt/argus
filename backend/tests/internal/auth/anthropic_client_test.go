package auth_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"hooker/internal/auth"
)

func makeTestServer(t *testing.T, statusCode int, body any) (*httptest.Server, *http.Client) {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		_ = json.NewEncoder(w).Encode(body)
	}))
	t.Cleanup(srv.Close)
	return srv, srv.Client()
}

func clientForTest(t *testing.T, mode auth.AuthMode, statusCode int, body any) *auth.AnthropicClient {
	t.Helper()
	srv, httpClient := makeTestServer(t, statusCode, body)

	cfg := auth.ClientConfig{
		Mode:       mode,
		Model:      "claude-test",
		MaxTokens:  100,
		HTTPClient: httpClient,
	}
	// Patch the URL via a round-tripper that rewrites the host.
	cfg.HTTPClient = &http.Client{
		Transport: &rewriteTransport{base: httpClient.Transport, target: srv.URL},
	}
	switch mode {
	case auth.AuthModeAPIKey:
		cfg.APIKey = "test-api-key"
	case auth.AuthModeOAuth:
		cfg.OAuthToken = "test-oauth-token"
	}

	c, err := auth.NewAnthropicClient(cfg)
	if err != nil {
		t.Fatalf("NewAnthropicClient: %v", err)
	}
	return c
}

// rewriteTransport redirects all requests to a test server URL.
type rewriteTransport struct {
	base   http.RoundTripper
	target string // e.g. "http://127.0.0.1:PORT"
}

func (rt *rewriteTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	clone := req.Clone(req.Context())
	clone.URL.Scheme = "http"
	clone.URL.Host = req.Host
	// Replace host with test server.
	parsed, _ := http.NewRequest("", rt.target, nil)
	clone.URL.Host = parsed.URL.Host
	clone.URL.Scheme = parsed.URL.Scheme
	base := rt.base
	if base == nil {
		base = http.DefaultTransport
	}
	return base.RoundTrip(clone)
}

var successBody = map[string]any{
	"content": []map[string]any{
		{"type": "text", "text": "hello from claude"},
	},
	"usage": map[string]any{"input_tokens": 10, "output_tokens": 5},
}

func TestAnthropicClient_APIKey_Success(t *testing.T) {
	c := clientForTest(t, auth.AuthModeAPIKey, http.StatusOK, successBody)
	resp, err := c.Send(context.Background(), []auth.Message{{Role: "user", Content: "hi"}})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(resp.Content) == 0 || resp.Content[0].Text != "hello from claude" {
		t.Errorf("unexpected content: %+v", resp.Content)
	}
}

func TestAnthropicClient_OAuth_Success(t *testing.T) {
	c := clientForTest(t, auth.AuthModeOAuth, http.StatusOK, successBody)
	resp, err := c.Send(context.Background(), []auth.Message{{Role: "user", Content: "hi"}})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(resp.Content) == 0 {
		t.Error("expected non-empty content")
	}
}

func TestAnthropicClient_401_AuthInvalid(t *testing.T) {
	c := clientForTest(t, auth.AuthModeAPIKey, http.StatusUnauthorized, map[string]any{
		"error": map[string]any{"type": "authentication_error", "message": "Invalid API Key"},
	})
	_, err := c.Send(context.Background(), []auth.Message{{Role: "user", Content: "hi"}})
	var ae *auth.AnthropicError
	if !errors.As(err, &ae) {
		t.Fatalf("expected *AnthropicError, got %T: %v", err, err)
	}
	if ae.Kind != "auth_invalid" {
		t.Errorf("want auth_invalid, got %s", ae.Kind)
	}
}

func TestAnthropicClient_ClassifiesMixedCaseQuotaExceeded(t *testing.T) {
	c := clientForTest(t, auth.AuthModeAPIKey, http.StatusForbidden, map[string]any{
		"error": map[string]any{"type": "permission_error", "message": "Quota Exceeded"},
	})
	_, err := c.Send(context.Background(), []auth.Message{{Role: "user", Content: "hi"}})
	var ae *auth.AnthropicError
	if !errors.As(err, &ae) {
		t.Fatalf("expected *AnthropicError, got %T: %v", err, err)
	}
	if ae.Kind != "quota_exhausted" {
		t.Errorf("want quota_exhausted, got %s", ae.Kind)
	}
}

func TestAnthropicClient_ModelReturnsConfiguredDefault(t *testing.T) {
	cfg := auth.ClientConfig{Mode: auth.AuthModeAPIKey, APIKey: "test-key", Model: "claude-custom"}
	c, err := auth.NewAnthropicClient(cfg)
	if err != nil {
		t.Fatalf("NewAnthropicClient: %v", err)
	}
	if got := c.Model(); got != "claude-custom" {
		t.Fatalf("Model() = %q, want claude-custom", got)
	}

	c, err = auth.NewAnthropicClient(auth.ClientConfig{Mode: auth.AuthModeAPIKey, APIKey: "test-key"})
	if err != nil {
		t.Fatalf("NewAnthropicClient default: %v", err)
	}
	if got := c.Model(); got == "" {
		t.Fatal("Model() should return the resolved default model")
	}
}

func TestAnthropicClient_429_RateLimit(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "30")
		w.WriteHeader(http.StatusTooManyRequests)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]any{"type": "rate_limit_error"}})
	}))
	t.Cleanup(srv.Close)

	cfg := auth.ClientConfig{
		Mode:      auth.AuthModeAPIKey,
		APIKey:    "test-key",
		MaxTokens: 100,
		HTTPClient: &http.Client{
			Transport: &rewriteTransport{base: srv.Client().Transport, target: srv.URL},
		},
	}
	c, _ := auth.NewAnthropicClient(cfg)
	_, err := c.Send(context.Background(), []auth.Message{{Role: "user", Content: "hi"}})
	var ae *auth.AnthropicError
	if !errors.As(err, &ae) {
		t.Fatalf("expected *AnthropicError, got %T", err)
	}
	if ae.Kind != "rate_limit" {
		t.Errorf("want rate_limit, got %s", ae.Kind)
	}
	if ae.RetryAfter == 0 {
		t.Error("expected non-zero RetryAfter")
	}
}

func TestAnthropicClient_NewClient_MissingAuth(t *testing.T) {
	_, err := auth.NewAnthropicClient(auth.ClientConfig{Mode: auth.AuthModeAPIKey})
	if err == nil {
		t.Error("expected error for missing APIKey")
	}
}

func TestAnthropicClient_AutoOAuth_NoToken(t *testing.T) {
	// Force keychain absent + no env token.
	t.Setenv("CLAUDE_CODE_OAUTH_TOKEN", "")

	result, _ := auth.ReadClaudeOAuthToken()
	if result.Kind == auth.TokenPresent {
		t.Skip("machine has valid keychain token — AutoOAuth absent path not testable here")
	}

	cfg := auth.ClientConfig{Mode: auth.AuthModeAutoOAuth, MaxTokens: 100}
	c, err := auth.NewAnthropicClient(cfg)
	if err != nil {
		t.Fatalf("NewAnthropicClient: %v", err)
	}
	_, err = c.Send(context.Background(), []auth.Message{{Role: "user", Content: "hi"}})
	var ae *auth.AnthropicError
	if !errors.As(err, &ae) {
		t.Fatalf("expected *AnthropicError, got %T: %v", err, err)
	}
	if ae.Kind != "auth_invalid" {
		t.Errorf("want auth_invalid, got %s", ae.Kind)
	}
}
