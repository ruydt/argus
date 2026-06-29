package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"argus/internal/config"
	"argus/internal/domain"
	"argus/internal/privacy/ignore"
	"argus/internal/repository/sqlite"
	"argus/internal/server"
	"argus/internal/service"
	"argus/internal/version"
)

func main() {
	os.Exit(run())
}

func run() int {
	cfg := config.Load()

	subcommand := ""
	if len(os.Args) > 1 {
		subcommand = os.Args[1]
	}

	home, _ := os.UserHomeDir()
	pidFile := filepath.Join(home, ".argus", "argus.pid")

	// `argus stop` signals a running server (from its pidfile) to shut down and exits.
	if subcommand == "stop" {
		return stopServer(pidFile)
	}

	// `argus start` runs the server and opens the dashboard in a browser once it
	// is reachable. Bare `argus` (any other / no arg) just runs the server.
	openBrowser := subcommand == "start"

	// Pre-check: verify the DB path is writable before attempting open/migrate.
	// This produces an actionable fatal message instead of an opaque sqlite error.
	if cfg.DBPath != ":memory:" {
		if err := os.MkdirAll(filepath.Dir(cfg.DBPath), 0o755); err != nil {
			slog.Error("db dir not creatable", "path", cfg.DBPath, "err", err)
			return 1
		}
		f, err := os.OpenFile(cfg.DBPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
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

	// Reject non-loopback bind unless ARGUS_ALLOW_REMOTE=1 (D-07, D-08).
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

	// Load ignore matcher. A missing default file returns an empty matcher (safe).
	// An unreadable explicit ARGUS_IGNORE path exits with an actionable error (T-03-02-04).
	matcher, ignoreStatus, err := ignore.LoadWithStatus(cfg.IgnorePath)
	if err != nil {
		slog.Error("load ignore file", "path", cfg.IgnorePath, "err", err)
		return 1
	}

	h := server.NewRouter(svc, repo, repo.Ready, server.Options{
		Matcher:            matcher,
		CORSOrigins:        cfg.CORSOrigins,
		DBPath:             cfg.DBPath,
		IgnoreFile:         domainIgnoreFile(ignoreStatus, matcher),
		Addr:               cfg.Addr,
		AllowRemote:        cfg.AllowRemote,
		Home:               home,
		ArgusDir:           filepath.Join(home, ".argus"),
	})

	slog.Info("argus", "version", version.Version, "commit", version.Commit)
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

	// Stale session sweep: sessions with no ended_at whose last_seen_at is >30m ago get ended_at = last_seen_at.
	// Handles sessions that end via cancel/config/prompt events which emit no terminal hook.
	go func() {
		const staleness = 30 * time.Minute
		sweep := func() {
			if err := svc.SweepStaleSessions(time.Now().Add(-staleness)); err != nil {
				slog.Warn("stale session sweep", "err", err)
			}
		}
		sweep()
		t := time.NewTicker(time.Hour)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				sweep()
			}
		}
	}()

	// Optional retention sweep: prune old events when ARGUS_RETENTION_DAYS or
	// ARGUS_MAX_EVENTS is set. Disabled by default — nothing is ever deleted
	// unless the operator opts in.
	if cfg.RetentionDays > 0 || cfg.MaxEvents > 0 {
		slog.Info("event retention enabled", "days", cfg.RetentionDays, "max_events", cfg.MaxEvents)
		go func() {
			prune := func() {
				before := ""
				if cfg.RetentionDays > 0 {
					before = time.Now().AddDate(0, 0, -cfg.RetentionDays).UTC().Format(time.RFC3339)
				}
				n, err := svc.PruneEvents(ctx, before, cfg.MaxEvents)
				if err != nil {
					slog.Warn("event retention prune", "err", err)
					return
				}
				if n > 0 {
					slog.Info("pruned old events", "deleted", n)
				}
			}
			prune()
			t := time.NewTicker(6 * time.Hour)
			defer t.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-t.C:
					prune()
				}
			}
		}()
	}

	// Bind first so we only write the pidfile after a successful bind — a
	// second instance that loses the port race must not clobber the live
	// server's pidfile (which `argus stop` relies on).
	ln, err := net.Listen("tcp", cfg.Addr)
	if err != nil {
		stop()
		if isAddrInUse(err) {
			slog.Error("port already in use", "addr", cfg.Addr, "err", err)
			return 1
		}
		slog.Error("listen", "err", err)
		return 1
	}
	if err := writePIDFile(pidFile, cfg.Addr); err != nil {
		slog.Warn("could not write pidfile", "path", pidFile, "err", err)
	}
	defer removePIDFile(pidFile)

	if openBrowser {
		go openWhenReady(ctx, cfg.Addr)
	}

	if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
		stop()
		slog.Error("serve", "err", err)
		return 1
	}
	stop()
	return 0
}

// writePIDFile records this process's PID and listen address so `argus stop`
// can both find the server and verify the PID still belongs to a live argus
// (guarding against a stale pidfile whose PID the OS recycled).
func writePIDFile(path, addr string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(fmt.Sprintf("%d\n%s\n", os.Getpid(), addr)), 0o644)
}

// readPIDFile parses the pid and recorded listen address from the pidfile.
func readPIDFile(path string) (pid int, addr string, err error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0, "", err
	}
	lines := strings.SplitN(strings.TrimSpace(string(data)), "\n", 2)
	pid, err = strconv.Atoi(strings.TrimSpace(lines[0]))
	if err != nil {
		return 0, "", err
	}
	if len(lines) > 1 {
		addr = strings.TrimSpace(lines[1])
	}
	return pid, addr, nil
}

// removePIDFile deletes the pidfile only if it still holds our PID, so a newer
// server's pidfile is never removed by this (older) process shutting down.
func removePIDFile(path string) {
	if pid, _, err := readPIDFile(path); err == nil && pid == os.Getpid() {
		_ = os.Remove(path)
	}
}

// argusAlive reports whether a live argus server answers at addr. Used as the
// identity check before signaling a PID and as the liveness probe while waiting
// for graceful shutdown — portable (no /proc, no signal(0)) and it confirms the
// process is actually argus, not an unrelated process that reused the PID.
func argusAlive(addr string) bool {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return false
	}
	if host == "" || host == "0.0.0.0" || host == "::" {
		host = "127.0.0.1"
	}
	client := &http.Client{Timeout: 800 * time.Millisecond}
	resp, err := client.Get("http://" + net.JoinHostPort(host, port) + "/api/version")
	if err != nil {
		return false
	}
	_ = resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// stopServer reads the pidfile, confirms a live argus is actually serving at the
// recorded address, then asks that process to shut down gracefully — escalating
// to a hard kill if it does not exit. Returns a process exit code.
func stopServer(pidFile string) int {
	pid, addr, err := readPIDFile(pidFile)
	if err != nil {
		if os.IsNotExist(err) {
			slog.Info("argus is not running", "pidfile", pidFile)
			return 0
		}
		slog.Error("invalid pidfile", "path", pidFile, "err", err)
		return 1
	}

	// Identity guard: only signal the PID when an argus server actually answers
	// at the recorded address. A stale pidfile (PID recycled for an unrelated
	// process) fails this check, so we never SIGTERM/Kill an innocent process.
	if addr == "" || !argusAlive(addr) {
		slog.Info("argus is not running (clearing stale pidfile)", "pid", pid, "addr", addr)
		_ = os.Remove(pidFile)
		return 0
	}

	proc, err := os.FindProcess(pid)
	if err != nil {
		slog.Error("find process", "pid", pid, "err", err)
		return 1
	}
	if err := terminate(proc); err != nil {
		slog.Error("stop argus", "pid", pid, "err", err)
		return 1
	}

	// Wait up to ~5s for the server to stop serving, then hard-kill.
	for i := 0; i < 25; i++ {
		if !argusAlive(addr) {
			_ = os.Remove(pidFile)
			slog.Info("argus stopped", "pid", pid)
			return 0
		}
		time.Sleep(200 * time.Millisecond)
	}
	_ = proc.Kill()
	_ = os.Remove(pidFile)
	slog.Info("argus force-stopped", "pid", pid)
	return 0
}

// terminate requests a graceful shutdown (SIGTERM on Unix; hard kill on Windows,
// which has no portable graceful signal via os.Process).
func terminate(p *os.Process) error {
	if runtime.GOOS == "windows" {
		return p.Kill()
	}
	return p.Signal(syscall.SIGTERM)
}

// openWhenReady polls the listen address until the server accepts connections,
// then opens the dashboard in the default browser. Best-effort: any failure
// (browser missing, headless host) is logged and ignored — the server runs on.
func openWhenReady(ctx context.Context, addr string) {
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return
		default:
		}
		conn, err := net.DialTimeout("tcp", addr, 500*time.Millisecond)
		if err == nil {
			_ = conn.Close()
			url := "http://" + addr
			if err := openBrowserURL(url); err != nil {
				slog.Warn("could not open browser", "url", url, "err", err)
			} else {
				slog.Info("opened dashboard", "url", url)
			}
			return
		}
		time.Sleep(200 * time.Millisecond)
	}
	slog.Warn("server not ready in time; not opening browser", "addr", addr)
}

// openBrowserURL launches the OS default handler for url. Detached so it does
// not block or get killed with this process.
func openBrowserURL(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default: // linux, *bsd
		cmd = exec.Command("xdg-open", url)
	}
	return cmd.Start()
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
	return fmt.Errorf("refusing non-loopback ADDR %q — set ARGUS_ALLOW_REMOTE=1 to enable", cfg.Addr)
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
	slog.Warn("REMOTE BIND ACTIVE — argus is reachable beyond localhost",
		"addr", cfg.Addr,
		"captures", "prompts, diffs, file paths, tool outputs, raw payloads, exports",
		"command_execution", "the hook simulator (/api/hooks/simulate) and reveal (/api/collection/reveal) run local commands — exposing these beyond localhost is dangerous",
		"note", "public internet exposure is unsupported",
	)
}

func domainIgnoreFile(status ignore.LoadStatus, matcher *ignore.Matcher) domain.DiagnosticsIgnoreFile {
	rules := make([]domain.DiagnosticsIgnoreRule, 0)
	for _, r := range matcher.Rules() {
		rules = append(rules, domain.DiagnosticsIgnoreRule{
			Pattern: r.Pattern,
			Line:    r.Line,
			Negate:  r.Negate,
		})
	}
	return domain.DiagnosticsIgnoreFile{
		Path:               status.Path,
		Status:             status.Status,
		ActivePatternCount: status.ActivePatternCount,
		Rules:              rules,
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
