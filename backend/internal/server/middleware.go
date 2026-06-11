package server

import (
	"log/slog"
	"net"
	"net/http"
	"runtime/debug"
	"time"
)

// panicRecovery catches panics from any handler, logs the stack trace, and returns 500.
// It must be the outermost middleware so it catches panics from all inner middleware too.
func panicRecovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				slog.Error("panic recovered", "panic", rec, "stack", string(debug.Stack()))
				http.Error(w, "internal server error", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// secFetchSite rejects browser-originated cross-site requests (D-07, SEC-05).
// Absent header = allowed: curl, wget, and CLI tools do not send Sec-Fetch-Site.
// Present and cross-site = 403: prevents browser-based CSRF data exfiltration.
func secFetchSite(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if v := r.Header.Get("Sec-Fetch-Site"); v == "cross-site" {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		slog.Info("request", "method", r.Method, "path", r.URL.Path, "duration", time.Since(start))
	})
}

// corsAllowlist returns a middleware that echoes only origins present in the allowed set.
// It never reflects wildcard or arbitrary origins. Allowed origins get Vary: Origin.
// Disallowed CORS preflights (Origin header present but not in set) receive 403.
func corsAllowlist(origins []string) func(http.Handler) http.Handler {
	set := make(map[string]bool, len(origins))
	for _, o := range origins {
		if o != "" {
			set[o] = true
		}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin == "" {
				// No Origin header: non-CORS request (curl, CLI, same-origin implicit).
				if r.Method == http.MethodOptions {
					w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
					w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
					w.WriteHeader(http.StatusNoContent)
					return
				}
				next.ServeHTTP(w, r)
				return
			}
			if set[origin] {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
				if r.Method == http.MethodOptions {
					w.WriteHeader(http.StatusNoContent)
					return
				}
				next.ServeHTTP(w, r)
				return
			}
			// Origin present but not in allowlist — reject regardless of method.
			http.Error(w, "forbidden", http.StatusForbidden)
		})
	}
}

// hostHeader rejects requests whose Host header is not an explicit localhost
// value. This prevents DNS rebinding attacks regardless of bind address.
// Port is stripped before comparison: "localhost:10804" → "localhost".
func hostHeader(next http.Handler) http.Handler {
	allowed := map[string]bool{
		"localhost": true,
		"127.0.0.1": true,
		"::1":       true,
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := r.Host
		if h, _, err := net.SplitHostPort(host); err == nil {
			host = h
		}
		if !allowed[host] {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}
