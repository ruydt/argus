package github

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// DeviceFlow runs GitHub's OAuth device flow (no client secret).
type DeviceFlow struct {
	clientID   string
	httpClient *http.Client
	baseURL    string // https://github.com; overridden in tests
}

func NewDeviceFlow(clientID string, httpClient *http.Client) *DeviceFlow {
	return &DeviceFlow{clientID: clientID, httpClient: httpClient, baseURL: "https://github.com"}
}

// DeviceCode is the response from Start.
type DeviceCode struct {
	DeviceCode      string `json:"device_code"`
	UserCode        string `json:"user_code"`
	VerificationURI string `json:"verification_uri"`
	ExpiresIn       int    `json:"expires_in"`
	Interval        int    `json:"interval"`
}

func (d *DeviceFlow) post(ctx context.Context, path string, form url.Values, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, d.baseURL+path, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	resp, err := d.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("github %s: status %d", path, resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// Start requests a device + user code for the given OAuth scope string.
func (d *DeviceFlow) Start(ctx context.Context, scope string) (DeviceCode, error) {
	var dc DeviceCode
	form := url.Values{"client_id": {d.clientID}, "scope": {scope}}
	if err := d.post(ctx, "/login/device/code", form, &dc); err != nil {
		return DeviceCode{}, err
	}
	if dc.Interval == 0 {
		dc.Interval = 5
	}
	return dc, nil
}

// Poll exchanges the device code for a token. Returns (token, pending, slowDown,
// error): pending=true means the user has not authorized yet (keep polling);
// slowDown=true means GitHub wants a longer interval (back off +5s).
func (d *DeviceFlow) Poll(ctx context.Context, deviceCode string) (string, bool, bool, error) {
	var body struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
	}
	form := url.Values{
		"client_id":   {d.clientID},
		"device_code": {deviceCode},
		"grant_type":  {"urn:ietf:params:oauth:grant-type:device_code"},
	}
	if err := d.post(ctx, "/login/oauth/access_token", form, &body); err != nil {
		return "", false, false, err
	}
	if body.AccessToken != "" {
		return body.AccessToken, false, false, nil
	}
	switch body.Error {
	case "authorization_pending":
		return "", true, false, nil
	case "slow_down":
		return "", true, true, nil
	default:
		return "", false, false, fmt.Errorf("device flow: %s", body.Error)
	}
}
