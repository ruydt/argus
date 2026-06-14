package github

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDeviceFlowStartAndPoll(t *testing.T) {
	poll := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/login/device/code":
			_, _ = w.Write([]byte(`{"device_code":"dev","user_code":"WDJB-MJHT","verification_uri":"https://github.com/login/device","expires_in":900,"interval":5}`))
		case "/login/oauth/access_token":
			poll++
			if poll == 1 {
				_, _ = w.Write([]byte(`{"error":"authorization_pending"}`))
			} else {
				_, _ = w.Write([]byte(`{"access_token":"gho_abc"}`))
			}
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	d := NewDeviceFlow("client123", srv.Client())
	d.baseURL = srv.URL

	dc, err := d.Start(context.Background())
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	if dc.UserCode != "WDJB-MJHT" || dc.DeviceCode != "dev" {
		t.Fatalf("unexpected device code %+v", dc)
	}

	tok, pending, _, err := d.Poll(context.Background(), dc.DeviceCode)
	if err != nil || !pending || tok != "" {
		t.Fatalf("first Poll = %q %v %v, want pending", tok, pending, err)
	}
	tok, pending, _, err = d.Poll(context.Background(), dc.DeviceCode)
	if err != nil || pending || tok != "gho_abc" {
		t.Fatalf("second Poll = %q %v %v, want token", tok, pending, err)
	}
}

func TestDeviceFlowPollSlowDown(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"error":"slow_down"}`))
	}))
	defer srv.Close()
	d := NewDeviceFlow("c", srv.Client())
	d.baseURL = srv.URL
	tok, pending, slowDown, err := d.Poll(context.Background(), "dev")
	if err != nil || !pending || !slowDown || tok != "" {
		t.Fatalf("slow_down Poll = %q pending=%v slow=%v err=%v, want pending+slowDown", tok, pending, slowDown, err)
	}
}

func TestDeviceFlowPollError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"error":"expired_token"}`))
	}))
	defer srv.Close()
	d := NewDeviceFlow("c", srv.Client())
	d.baseURL = srv.URL
	if _, pending, _, err := d.Poll(context.Background(), "dev"); err == nil || pending {
		t.Fatalf("expected hard error, got pending=%v err=%v", pending, err)
	}
}
