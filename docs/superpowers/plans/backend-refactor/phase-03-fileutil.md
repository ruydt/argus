# Phase 3 — File Utilities Package

> **Status:** ⬜ Pending — update STATUS.md to ✅ when done

> **For agentic workers:** Use `superpowers:executing-plans` or `superpowers:subagent-driven-development`.

**Repo:** `/Users/duytran/GitHub/codex-test` | **Backend:** `backend/` | **Module:** `agent-monitor` | **Go:** 1.23

**Goal:** Extract path resolution, line-finding, and context utilities from the old `internal/events/events.go` into a dedicated `fileutil` package. These functions are used by both agent adapters and the hook handler.

**Depends on:** Phase 1 (domain types — `domain.CtxLine` is used here)

**Next phase:** [phase-04-repository-interface.md](phase-04-repository-interface.md)

---

## Files

| Action | Path |
|--------|------|
| Create | `backend/internal/fileutil/fileutil.go` |
| Create | `backend/internal/fileutil/fileutil_test.go` |

---

## Steps

- [ ] **Step 1: Write the failing tests**

```go
// backend/internal/fileutil/fileutil_test.go
package fileutil_test

import (
	"os"
	"path/filepath"
	"testing"

	"agent-monitor/internal/fileutil"
)

func TestResolvePath_absolute(t *testing.T) {
	got := fileutil.ResolvePath("/cwd", "/abs/path.go")
	if got != "/abs/path.go" {
		t.Errorf("got %q, want /abs/path.go", got)
	}
}

func TestResolvePath_relative(t *testing.T) {
	got := fileutil.ResolvePath("/cwd", "rel.go")
	if got != "/cwd/rel.go" {
		t.Errorf("got %q, want /cwd/rel.go", got)
	}
}

func TestResolvePath_empty(t *testing.T) {
	if got := fileutil.ResolvePath("/cwd", ""); got != "" {
		t.Errorf("got %q, want empty", got)
	}
}

func TestToolToAction(t *testing.T) {
	cases := []struct{ tool, want string }{
		{"bash", "BASH"},
		{"Bash", "BASH"},
		{"shell_exec", "BASH"},
		{"Edit", "EDIT"},
		{"str_replace_editor", "EDIT"},
	}
	for _, c := range cases {
		if got := fileutil.ToolToAction(c.tool); got != c.want {
			t.Errorf("ToolToAction(%q) = %q, want %q", c.tool, got, c.want)
		}
	}
}

func TestFindStartLine(t *testing.T) {
	f, _ := os.CreateTemp(t.TempDir(), "*.go")
	f.WriteString("package main\n\nfunc hello() {}\n")
	f.Close()

	line := fileutil.FindStartLine(f.Name(), "func hello() {}")
	if line != 3 {
		t.Errorf("got line %d, want 3", line)
	}
}

func TestExtractPathFromCommand(t *testing.T) {
	got := fileutil.ExtractPathFromCommand("cat /tmp/foo.go")
	if got != "/tmp/foo.go" {
		t.Errorf("got %q, want /tmp/foo.go", got)
	}
}

func TestExtractPathFromCommand_noPath(t *testing.T) {
	if got := fileutil.ExtractPathFromCommand("echo hello"); got != "" {
		t.Errorf("got %q, want empty", got)
	}
}

func TestComputeContext(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "f.go")
	os.WriteFile(path, []byte("a\nb\nc\nd\ne\n"), 0600)

	before, after := fileutil.ComputeContext(path, 3, 1, 1)
	if len(before) != 1 || before[0].Text != "b" {
		t.Errorf("before = %v", before)
	}
	if len(after) != 1 || after[0].Text != "d" {
		t.Errorf("after = %v", after)
	}
}
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && go test ./internal/fileutil/...
```

Expected: FAIL — `no Go files in .../fileutil`

- [ ] **Step 3: Create `backend/internal/fileutil/fileutil.go`**

```go
package fileutil

import (
	"os"
	"path/filepath"
	"strings"

	"agent-monitor/internal/domain"
)

func ResolvePath(cwd, path string) string {
	if path == "" {
		return ""
	}
	if filepath.IsAbs(path) {
		return path
	}
	return filepath.Join(cwd, path)
}

func ToolToAction(tool string) string {
	t := strings.ToLower(tool)
	switch {
	case strings.Contains(t, "bash") || strings.Contains(t, "shell"):
		return "BASH"
	default:
		return "EDIT"
	}
}

func ExtractPathFromCommand(cmd string) string {
	for _, tok := range strings.Fields(cmd) {
		tok = strings.Trim(tok, `"'`)
		if (strings.HasPrefix(tok, "/") || strings.HasPrefix(tok, "./")) &&
			strings.Contains(tok, ".") {
			return tok
		}
	}
	return ""
}

// FindStartLine returns the 1-based line number where oldStr begins in filePath.
// Comparison ignores leading/trailing whitespace per line.
func FindStartLine(filePath, oldStr string) int {
	if filePath == "" || oldStr == "" {
		return 0
	}
	data, err := os.ReadFile(filePath)
	if err != nil {
		return 0
	}
	fileLines := strings.Split(string(data), "\n")
	searchLines := strings.Split(strings.TrimRight(oldStr, "\n"), "\n")
	if len(searchLines) == 0 {
		return 0
	}
	for i := range len(fileLines) - len(searchLines) + 1 {
		match := true
		for j := range len(searchLines) {
			if strings.TrimSpace(fileLines[i+j]) != strings.TrimSpace(searchLines[j]) {
				match = false
				break
			}
		}
		if match {
			return i + 1
		}
	}
	return 0
}

// ComputeContext returns ctxLines lines before/after a changed region.
// changeStart is 1-based. changeLen is the number of lines in the changed block.
func ComputeContext(filePath string, changeStart, changeLen, ctxLines int) (before, after []domain.CtxLine) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return
	}
	lines := strings.Split(string(data), "\n")
	n := len(lines)
	start := changeStart - 1
	end := start + changeLen - 1
	for i := max(0, start-ctxLines); i < start && i < n; i++ {
		before = append(before, domain.CtxLine{Num: i + 1, Text: lines[i]})
	}
	for i := end + 1; i <= end+ctxLines && i < n; i++ {
		after = append(after, domain.CtxLine{Num: i + 1, Text: lines[i]})
	}
	return
}
```

- [ ] **Step 4: Run tests**

```bash
cd backend && go test ./internal/fileutil/...
```

Expected: `ok  agent-monitor/internal/fileutil`

- [ ] **Step 5: Commit**

```bash
git add backend/internal/fileutil/
git commit -m "feat(fileutil): extract path/context utilities from events package"
```

- [ ] **Step 6: Mark complete — update STATUS.md phase 3 to ✅**
