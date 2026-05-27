package main

import (
	"strings"
	"testing"

	"hooker/internal/config"
)

func TestValidateBind_LoopbackPasses(t *testing.T) {
	cases := []struct {
		addr string
	}{
		{"127.0.0.1:8765"},
		{"localhost:8765"},
		{"[::1]:8765"},
	}
	for _, tc := range cases {
		cfg := config.Config{Addr: tc.addr}
		if err := validateBind(cfg); err != nil {
			t.Errorf("validateBind(%q) = %v, want nil", tc.addr, err)
		}
	}
}

func TestValidateBind_RemoteWithoutFlagFails(t *testing.T) {
	cases := []struct {
		addr string
	}{
		{"0.0.0.0:8765"},
		{":8765"},
		{"192.168.1.1:8765"},
	}
	for _, tc := range cases {
		cfg := config.Config{Addr: tc.addr, AllowRemote: false}
		err := validateBind(cfg)
		if err == nil {
			t.Errorf("validateBind(%q) = nil, want error", tc.addr)
			continue
		}
		if !strings.Contains(err.Error(), "refusing non-loopback ADDR") {
			t.Errorf("validateBind(%q) error = %q, want to contain 'refusing non-loopback ADDR'", tc.addr, err.Error())
		}
		if !strings.Contains(err.Error(), "HOOKER_ALLOW_REMOTE=1") {
			t.Errorf("validateBind(%q) error = %q, want to contain 'HOOKER_ALLOW_REMOTE=1'", tc.addr, err.Error())
		}
	}
}

func TestValidateBind_RemoteWithFlagPasses(t *testing.T) {
	cfg := config.Config{Addr: "0.0.0.0:8765", AllowRemote: true}
	if err := validateBind(cfg); err != nil {
		t.Errorf("validateBind(0.0.0.0:8765, AllowRemote=true) = %v, want nil", err)
	}
}

func TestIsLoopbackHost(t *testing.T) {
	// isLoopbackHost is only called after net.SplitHostPort strips brackets,
	// so "::1" (bare) is the correct loopback form; "[::1]" never appears.
	loopback := []string{"localhost", "127.0.0.1", "::1"}
	for _, h := range loopback {
		if !isLoopbackHost(h) {
			t.Errorf("isLoopbackHost(%q) = false, want true", h)
		}
	}
	remote := []string{"0.0.0.0", "", "192.168.1.1", "example.com", "[::1]"}
	for _, h := range remote {
		if isLoopbackHost(h) {
			t.Errorf("isLoopbackHost(%q) = true, want false", h)
		}
	}
}
