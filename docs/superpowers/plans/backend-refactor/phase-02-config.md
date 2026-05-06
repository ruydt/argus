# Phase 2 — Config Package

> **Status:** ⬜ Pending — update STATUS.md to ✅ when done

> **For agentic workers:** Use `superpowers:executing-plans` or `superpowers:subagent-driven-development`.

**Repo:** `/Users/duytran/GitHub/codex-test` | **Backend:** `backend/` | **Module:** `agent-monitor` | **Go:** 1.23

**Goal:** Config loaded from env vars. No flags library needed — env is sufficient.

**Depends on:** Phase 1 (domain types)

**Next phase:** [phase-03-fileutil.md](phase-03-fileutil.md)

---

## Files

| Action | Path |
|--------|------|
| Create | `backend/internal/config/config.go` |
| Create | `backend/internal/config/config_test.go` |

---

## Steps

- [ ] **Step 1: Write the failing test**

```go
// backend/internal/config/config_test.go
package config_test

import (
	"os"
	"testing"

	"agent-monitor/internal/config"
)

func TestLoad_defaults(t *testing.T) {
	os.Unsetenv("ADDR")
	os.Unsetenv("DB_PATH")
	cfg := config.Load()
	if cfg.Addr != "127.0.0.1:8765" {
		t.Errorf("Addr = %q, want 127.0.0.1:8765", cfg.Addr)
	}
	if cfg.DBPath != "agent-monitor.db" {
		t.Errorf("DBPath = %q, want agent-monitor.db", cfg.DBPath)
	}
}

func TestLoad_env(t *testing.T) {
	t.Setenv("ADDR", "0.0.0.0:9000")
	t.Setenv("DB_PATH", "/tmp/test.db")
	cfg := config.Load()
	if cfg.Addr != "0.0.0.0:9000" {
		t.Errorf("Addr = %q, want 0.0.0.0:9000", cfg.Addr)
	}
	if cfg.DBPath != "/tmp/test.db" {
		t.Errorf("DBPath = %q, want /tmp/test.db", cfg.DBPath)
	}
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd backend && go test ./internal/config/...
```

Expected: FAIL — `no Go files in .../config`

- [ ] **Step 3: Create `backend/internal/config/config.go`**

```go
package config

import "os"

type Config struct {
	Addr   string
	DBPath string
}

func Load() Config {
	return Config{
		Addr:   envOr("ADDR", "127.0.0.1:8765"),
		DBPath: envOr("DB_PATH", "agent-monitor.db"),
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
```

- [ ] **Step 4: Run tests**

```bash
cd backend && go test ./internal/config/...
```

Expected: `ok  agent-monitor/internal/config`

- [ ] **Step 5: Commit**

```bash
git add backend/internal/config/
git commit -m "feat(config): add Config and Load() from env"
```

- [ ] **Step 6: Mark complete — update STATUS.md phase 2 to ✅**
