package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"hooker/internal/config"
	"hooker/internal/privacy/ignore"
	"hooker/internal/repository/sqlite"
	"hooker/internal/server"
	"hooker/internal/service"
	"hooker/internal/version"
)

func main() {
	cfg := config.Load()

	// Pre-check: verify the DB path is writable before attempting open/migrate.
	// This produces an actionable fatal message instead of an opaque sqlite error.
	if cfg.DBPath != ":memory:" {
		f, err := os.OpenFile(cfg.DBPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
		if err != nil {
			slog.Error("db not writable", "path", cfg.DBPath, "err", err)
			os.Exit(1)
		}
		_ = f.Close()
	}

	// Validate ADDR format — net.Listen returns an opaque error for bad formats.
	if _, _, err := net.SplitHostPort(cfg.Addr); err != nil {
		slog.Error("invalid ADDR", "addr", cfg.Addr, "err", err)
		os.Exit(1)
	}

	repo, err := sqlite.New(cfg.DBPath)
	if err != nil {
		slog.Error("open db", "err", err)
		os.Exit(1)
	}
	defer func() {
		if err := repo.Close(); err != nil {
			slog.Error("close db", "err", err)
		}
	}()

	svc := service.New(repo)

	// Load ignore matcher. A missing default file returns an empty matcher (safe).
	// An unreadable explicit HOOKER_IGNORE path exits with an actionable error (T-03-02-04).
	matcher, err := ignore.Load(cfg.IgnorePath)
	if err != nil {
		slog.Error("load ignore file", "path", cfg.IgnorePath, "err", err)
		os.Exit(1)
	}

	h := server.NewRouter(svc, repo, repo.Ready, server.Options{Matcher: matcher})

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
			os.Exit(1)
		}
		stop()
		slog.Error("listen", "err", err)
		os.Exit(1)
	}
	stop()
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
