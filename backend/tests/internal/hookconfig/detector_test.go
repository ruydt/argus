package hookconfig_test

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"argus/internal/hookconfig"
)

func TestDetectReportsConfiguredClaudeAndCodex(t *testing.T) {
	home := t.TempDir()
	writeFile(t, home, ".claude/settings.json", `{"hooks":{"PreToolUse":[{"hooks":[{"command":"curl http://127.0.0.1:10804/api/hook"}]}]}}`)
	writeFile(t, home, ".codex/hooks.json", `{"hooks":{"SessionStart":[{"hooks":[{"command":"curl http://127.0.0.1:10804/api/hook"}]}]}}`)

	got := hookconfig.Detector{HomeDir: home}.Detect()

	if len(got) != 2 {
		t.Fatalf("len(results) = %d, want 2", len(got))
	}
	for _, result := range got {
		if result.Status != "configured" {
			t.Fatalf("%s status = %q, want configured", result.Agent, result.Status)
		}
		if result.Reason != "" {
			t.Fatalf("%s reason = %q, want empty", result.Agent, result.Reason)
		}
	}
}

func TestDetectReportsMissingWhenFileMissingOrEndpointAbsent(t *testing.T) {
	home := t.TempDir()
	writeFile(t, home, ".claude/settings.json", `{"hooks":{}}`)

	got := hookconfig.Detector{HomeDir: home}.Detect()
	byAgent := resultsByAgent(got)

	if byAgent["claudecode"].Status != "missing" {
		t.Fatalf("Claude status = %q, want missing", byAgent["claudecode"].Status)
	}
	if byAgent["codex"].Status != "missing" {
		t.Fatalf("Codex status = %q, want missing", byAgent["codex"].Status)
	}
}

func TestDetectReportsUnknownForInvalidJSONAndReadError(t *testing.T) {
	home := t.TempDir()
	writeFile(t, home, ".claude/settings.json", `{not-json`)
	readErr := errors.New("permission denied: /secret/path")
	detector := hookconfig.Detector{
		HomeDir: home,
		ReadFile: func(path string) ([]byte, error) {
			if filepath.Base(path) == "hooks.json" {
				return nil, readErr
			}
			return os.ReadFile(path)
		},
	}

	got := detector.Detect()
	byAgent := resultsByAgent(got)

	if byAgent["claudecode"].Status != "unknown" || byAgent["claudecode"].Reason != "invalid_json" {
		t.Fatalf("Claude result = %+v, want unknown invalid_json", byAgent["claudecode"])
	}
	if byAgent["codex"].Status != "unknown" || byAgent["codex"].Reason != "read_error" {
		t.Fatalf("Codex result = %+v, want unknown read_error", byAgent["codex"])
	}
	if byAgent["codex"].Reason == readErr.Error() {
		t.Fatalf("reason leaked raw error: %q", byAgent["codex"].Reason)
	}
}

// An agent the user enabled (in agents.json) is detected too — proving an agent
// added on the Hooks page shows up on the diagnostics board.
func TestDetectIncludesEnabledAgents(t *testing.T) {
	home := t.TempDir()
	argusDir := t.TempDir()
	if err := os.WriteFile(
		filepath.Join(argusDir, "agents.json"),
		[]byte(`{"enabled":["claudecode","codex","cursor"]}`),
		0o600,
	); err != nil {
		t.Fatalf("write agents.json: %v", err)
	}
	writeFile(t, home, ".cursor/hooks.json",
		`{"hooks":{"preToolUse":[{"command":"curl http://127.0.0.1:10804/api/hook?agent=cursor"}]}}`)

	got := hookconfig.Detector{HomeDir: home, ArgusDir: argusDir}.Detect()
	if len(got) != 3 {
		t.Fatalf("len(results) = %d, want 3: %+v", len(got), got)
	}
	cursor := resultsByAgent(got)["cursor"]
	if cursor.Status != "configured" {
		t.Fatalf("cursor status = %q, want configured", cursor.Status)
	}
	if cursor.Label != "Cursor" {
		t.Fatalf("cursor label = %q, want Cursor", cursor.Label)
	}
}

func writeFile(t *testing.T, home, rel, content string) {
	t.Helper()
	path := filepath.Join(home, rel)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
}

func resultsByAgent(results []hookconfig.Result) map[string]hookconfig.Result {
	out := map[string]hookconfig.Result{}
	for _, result := range results {
		out[result.Agent] = result
	}
	return out
}
