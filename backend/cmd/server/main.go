package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"hooker/internal/config"
	"hooker/internal/domain"
	"hooker/internal/privacy/ignore"
	"hooker/internal/repository/sqlite"
	"hooker/internal/server"
	"hooker/internal/service"
	"hooker/internal/version"
)

func main() {
	os.Exit(run())
}

func run() int {
	cfg := config.Load()

	// Pre-check: verify the DB path is writable before attempting open/migrate.
	// This produces an actionable fatal message instead of an opaque sqlite error.
	if cfg.DBPath != ":memory:" {
		f, err := os.OpenFile(cfg.DBPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
		if err != nil {
			slog.Error("db not writable", "path", cfg.DBPath, "err", err)
			return 1
		}
		_ = f.Close()
	}

	// Validate ADDR format — net.Listen returns an opaque error for bad formats.
	if _, _, err := net.SplitHostPort(cfg.Addr); err != nil {
		slog.Error("invalid ADDR", "addr", cfg.Addr, "err", err)
		return 1
	}

	// Reject non-loopback bind unless HOOKER_ALLOW_REMOTE=1 (D-07, D-08).
	if err := validateBind(cfg); err != nil {
		slog.Error(err.Error())
		return 1
	}
	if cfg.AllowRemote {
		warnRemoteBind(cfg)
	}

	repo, err := sqlite.New(cfg.DBPath)
	if err != nil {
		slog.Error("open db", "err", err)
		return 1
	}
	defer func() {
		if err := repo.Close(); err != nil {
			slog.Error("close db", "err", err)
		}
	}()

	svc := service.New(repo)

	home, _ := os.UserHomeDir()

	// Load ignore matcher. A missing default file returns an empty matcher (safe).
	// An unreadable explicit HOOKER_IGNORE path exits with an actionable error (T-03-02-04).
	matcher, ignoreStatus, err := ignore.LoadWithStatus(cfg.IgnorePath)
	if err != nil {
		slog.Error("load ignore file", "path", cfg.IgnorePath, "err", err)
		return 1
	}

	h := server.NewRouter(svc, repo, repo.Ready, server.Options{
		Matcher:     matcher,
		CORSOrigins: cfg.CORSOrigins,
		DBPath:      cfg.DBPath,
		IgnoreFile:  domainIgnoreFile(ignoreStatus),
		Addr:        cfg.Addr,
		AllowRemote:        cfg.AllowRemote,
		ClaudeSettingsPath: filepath.Join(home, ".claude", "settings.json"),
		CodexHooksPath:     filepath.Join(home, ".codex", "hooks.json"),
	})

	slog.Info("hooker", "version", version.Version, "commit", version.Commit)
	slog.Info("hook endpoint", "url", "POST http://"+cfg.Addr+"/api/hook")
	slog.Info("events SSE", "url", "GET http://"+cfg.Addr+"/api/events/stream")
	slog.Info("db", "path", cfg.DBPath)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           h,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		IdleTimeout:       120 * time.Second,
		// WriteTimeout: 0 — intentionally omitted; SSE streams have no write deadline
	}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			slog.Error("graceful shutdown", "err", err)
		}
	}()

	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		if isAddrInUse(err) {
			stop()
			slog.Error("port already in use", "addr", cfg.Addr, "err", err)
			return 1
		}
		stop()
		slog.Error("listen", "err", err)
		return 1
	}
	stop()
	return 0
}

// validateBind rejects non-loopback ADDR unless AllowRemote is explicitly set (D-07, D-08).
func validateBind(cfg config.Config) error {
	host, _, err := net.SplitHostPort(cfg.Addr)
	if err != nil {
		return nil // malformed ADDR is caught by the earlier SplitHostPort check
	}
	if isLoopbackHost(host) {
		return nil
	}
	if cfg.AllowRemote {
		return nil
	}
	return fmt.Errorf("refusing non-loopback ADDR %q — set HOOKER_ALLOW_REMOTE=1 to enable", cfg.Addr)
}

// isLoopbackHost reports whether host is a known loopback address.
func isLoopbackHost(host string) bool {
	switch host {
	case "localhost", "127.0.0.1", "::1":
		return true
	}
	return false
}

// warnRemoteBind emits a prominent startup warning when remote bind is explicitly enabled (D-09).
func warnRemoteBind(cfg config.Config) {
	slog.Warn("REMOTE BIND ACTIVE — hooker is reachable beyond localhost",
		"addr", cfg.Addr,
		"captures", "prompts, diffs, file paths, tool outputs, raw payloads, exports",
		"note", "public internet exposure is unsupported",
	)
}

func domainIgnoreFile(status ignore.LoadStatus) domain.DiagnosticsIgnoreFile {
	return domain.DiagnosticsIgnoreFile{
		Path:               status.Path,
		Status:             status.Status,
		ActivePatternCount: status.ActivePatternCount,
	}
}

// isAddrInUse reports whether err indicates the port is already bound.
func isAddrInUse(err error) bool {
	var opErr *net.OpError
	if errors.As(err, &opErr) {
		var syscallErr *os.SyscallError
		if errors.As(opErr.Err, &syscallErr) {
			return syscallErr.Err == syscall.EADDRINUSE
		}
	}
	return false
}
