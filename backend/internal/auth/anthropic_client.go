package auth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	anthropic "github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
)

const (
	defaultModel     = "claude-sonnet-4-6"
	defaultMaxTokens = 4096
)

// AuthMode controls which header is used for authentication.
type AuthMode int

const (
	AuthModeAPIKey    AuthMode = iota // x-api-key: <key>
	AuthModeOAuth                     // Authorization: Bearer <token>
	AuthModeAutoOAuth                 // read fresh OAuth token from keychain at each call
)

// ClientConfig configures the Anthropic client.
type ClientConfig struct {
	// Exactly one of APIKey / OAuthToken must be set, OR set Mode=AuthModeAutoOAuth
	// to have the client read a fresh OAuth token from the keychain on every call.
	APIKey     string
	OAuthToken string
	Mode       AuthMode

	Model      string
	MaxTokens  int
	HTTPClient *http.Client // nil = SDK default; override for testing
}

// Message is a single turn in the Anthropic Messages API.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// MessagesResponse is the subset of the Anthropic response we care about.
type MessagesResponse struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	Usage struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
}

// AnthropicError is returned for non-2xx responses or API-level errors.
type AnthropicError struct {
	StatusCode int
	Kind       string // "auth_invalid", "rate_limit", "quota_exhausted", "transient", "unrecoverable"
	Message    string
	RetryAfter time.Duration // non-zero for rate_limit responses
}

func (e *AnthropicError) Error() string {
	return fmt.Sprintf("anthropic %s (status %d): %s", e.Kind, e.StatusCode, e.Message)
}

// AnthropicClient sends requests to the Anthropic Messages API.
type AnthropicClient struct {
	cfg      ClientConfig
	baseOpts []option.RequestOption
}

// NewAnthropicClient creates a client. Returns error if config is invalid.
func NewAnthropicClient(cfg ClientConfig) (*AnthropicClient, error) {
	if cfg.Mode != AuthModeAutoOAuth && cfg.APIKey == "" && cfg.OAuthToken == "" {
		return nil, fmt.Errorf("anthropic client: APIKey or OAuthToken required (or use AuthModeAutoOAuth)")
	}
	if cfg.Mode == AuthModeAPIKey && cfg.APIKey == "" {
		return nil, fmt.Errorf("anthropic client: APIKey required for AuthModeAPIKey")
	}
	if cfg.Mode == AuthModeOAuth && cfg.OAuthToken == "" {
		return nil, fmt.Errorf("anthropic client: OAuthToken required for AuthModeOAuth")
	}
	if cfg.Model == "" {
		cfg.Model = defaultModel
	}
	if cfg.MaxTokens == 0 {
		cfg.MaxTokens = defaultMaxTokens
	}

	var opts []option.RequestOption
	switch cfg.Mode {
	case AuthModeAPIKey:
		opts = append(opts, option.WithAPIKey(cfg.APIKey))
	case AuthModeOAuth:
		opts = append(opts, option.WithAuthToken(cfg.OAuthToken))
	case AuthModeAutoOAuth:
		// token resolved per-call in Send()
	}
	if cfg.HTTPClient != nil {
		opts = append(opts, option.WithHTTPClient(cfg.HTTPClient))
	}

	return &AnthropicClient{cfg: cfg, baseOpts: opts}, nil
}

// Model returns the resolved model used for requests.
func (c *AnthropicClient) Model() string {
	return c.cfg.Model
}

// Send sends a messages request and returns the response.
// For AuthModeAutoOAuth the OAuth token is read fresh from the keychain on every call.
func (c *AnthropicClient) Send(ctx context.Context, messages []Message) (*MessagesResponse, error) {
	opts := make([]option.RequestOption, len(c.baseOpts))
	copy(opts, c.baseOpts)

	if c.cfg.Mode == AuthModeAutoOAuth {
		result, err := ReadClaudeOAuthToken()
		if err != nil {
			return nil, fmt.Errorf("anthropic client: read keychain: %w", err)
		}
		switch result.Kind {
		case TokenPresent:
			opts = append(opts, option.WithAuthToken(result.Token))
		case TokenExpired:
			return nil, &AnthropicError{
				Kind:    "auth_invalid",
				Message: "OAuth token expired — re-login via Claude Desktop",
			}
		case TokenAbsent:
			return nil, &AnthropicError{
				Kind:    "auth_invalid",
				Message: "no OAuth token available; set CLAUDE_CODE_OAUTH_TOKEN or log in via Claude Desktop",
			}
		}
	}

	client := anthropic.NewClient(opts...)

	params := anthropic.MessageNewParams{
		Model:     c.cfg.Model,
		MaxTokens: int64(c.cfg.MaxTokens),
		Messages:  buildMessages(messages),
	}

	msg, err := client.Messages.New(ctx, params)
	if err != nil {
		return nil, classifySDKError(err)
	}

	return convertResponse(msg), nil
}

func buildMessages(messages []Message) []anthropic.MessageParam {
	params := make([]anthropic.MessageParam, len(messages))
	for i, m := range messages {
		if m.Role == "assistant" {
			params[i] = anthropic.NewAssistantMessage(anthropic.NewTextBlock(m.Content))
		} else {
			params[i] = anthropic.NewUserMessage(anthropic.NewTextBlock(m.Content))
		}
	}
	return params
}

func convertResponse(msg *anthropic.Message) *MessagesResponse {
	resp := &MessagesResponse{}
	resp.Usage.InputTokens = int(msg.Usage.InputTokens)
	resp.Usage.OutputTokens = int(msg.Usage.OutputTokens)
	for _, block := range msg.Content {
		if block.Type == "text" {
			resp.Content = append(resp.Content, struct {
				Type string `json:"type"`
				Text string `json:"text"`
			}{Type: "text", Text: block.Text})
		}
	}
	return resp
}

func classifySDKError(err error) *AnthropicError {
	var apiErr *anthropic.Error
	if !errors.As(err, &apiErr) {
		return &AnthropicError{Kind: "transient", Message: err.Error()}
	}

	status := apiErr.StatusCode
	errType := string(apiErr.Type())

	var retryAfter time.Duration
	if apiErr.Response != nil {
		retryAfter = parseRetryAfter(apiErr.Response.Header.Get("Retry-After"))
	}

	switch errType {
	case "rate_limit_error":
		return &AnthropicError{StatusCode: status, Kind: "rate_limit", Message: "rate limited", RetryAfter: retryAfter}
	case "authentication_error":
		return &AnthropicError{StatusCode: status, Kind: "auth_invalid", Message: apiErr.Error()}
	case "permission_error":
		if strings.Contains(strings.ToLower(apiErr.RawJSON()), "quota exceeded") {
			return &AnthropicError{StatusCode: status, Kind: "quota_exhausted", Message: apiErr.Error()}
		}
		return &AnthropicError{StatusCode: status, Kind: "auth_invalid", Message: apiErr.Error()}
	case "overloaded_error":
		return &AnthropicError{StatusCode: status, Kind: "transient", Message: "Anthropic overloaded"}
	case "billing_error":
		return &AnthropicError{StatusCode: status, Kind: "quota_exhausted", Message: apiErr.Error()}
	case "invalid_request_error":
		return &AnthropicError{StatusCode: status, Kind: "unrecoverable", Message: apiErr.Error()}
	}

	switch {
	case status == 429:
		return &AnthropicError{StatusCode: status, Kind: "rate_limit", Message: "rate limited", RetryAfter: retryAfter}
	case status == 401 || status == 403:
		return &AnthropicError{StatusCode: status, Kind: "auth_invalid", Message: apiErr.Error()}
	case status >= 500:
		return &AnthropicError{StatusCode: status, Kind: "transient", Message: apiErr.Error()}
	default:
		return &AnthropicError{StatusCode: status, Kind: "unrecoverable", Message: apiErr.Error()}
	}
}

func parseRetryAfter(v string) time.Duration {
	if v == "" {
		return 0
	}
	if secs, err := strconv.ParseFloat(v, 64); err == nil {
		return time.Duration(secs * float64(time.Second))
	}
	return 0
}
