package github

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestServiceStatusUnauthenticated(t *testing.T) {
	s := NewService("c", t.TempDir())
	if st := s.Status(context.Background()); st.Authenticated {
		t.Fatal("unauthenticated Status returned Authenticated=true")
	}
	if _, err := s.Collection(context.Background()); err != ErrNotAuthenticated {
		t.Fatalf("Collection err = %v, want ErrNotAuthenticated", err)
	}
}

func TestServiceDeviceFlowToAuthenticated(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/login/device/code":
			_, _ = w.Write([]byte(`{"device_code":"dev","user_code":"AAAA-BBBB","verification_uri":"u","interval":5}`))
		case "/login/oauth/access_token":
			_, _ = w.Write([]byte(`{"access_token":"gho_x"}`))
		case "/user":
			_, _ = w.Write([]byte(`{"login":"ruy"}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	s := NewService("c", t.TempDir())
	s.httpClient = srv.Client()
	s.deviceCodeBase = srv.URL
	s.apiBase = srv.URL

	if _, err := s.StartDevice(context.Background(), false); err != nil {
		t.Fatalf("StartDevice: %v", err)
	}
	st := s.Status(context.Background())
	if !st.Authenticated || st.Login != "ruy" {
		t.Fatalf("Status after auth = %+v, want authenticated ruy", st)
	}
	// A second Status uses the saved token (no pending device flow needed).
	if st2 := s.Status(context.Background()); !st2.Authenticated {
		t.Fatal("second Status lost authentication")
	}
}
