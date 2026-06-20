package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"argus/internal/handler"
)

// put/get exercise the real handler against a temp home and return the decoded
// canonical payload (for GET) so adapter round-trips can be asserted end-to-end.
func putHooks(t *testing.T, home, agent, body string) {
	t.Helper()
	h := handler.HooksConfig(home)
	req := httptest.NewRequest(http.MethodPut, "/api/hooks-config?agent="+agent, bytes.NewBufferString(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("agent=%s PUT status=%d body=%s", agent, rec.Code, rec.Body.String())
	}
}

func getHooks(t *testing.T, home, agent string) map[string]any {
	t.Helper()
	h := handler.HooksConfig(home)
	req := httptest.NewRequest(http.MethodGet, "/api/hooks-config?agent="+agent, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("agent=%s GET status=%d", agent, rec.Code)
	}
	var out map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&out); err != nil {
		t.Fatalf("agent=%s decode: %v", agent, err)
	}
	return out
}

func seedFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("write: %v", err)
	}
}

func readRawFile(t *testing.T, path string) map[string]any {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	var out map[string]any
	if err := json.Unmarshal(data, &out); err != nil {
		t.Fatalf("unmarshal %s: %v\n%s", path, err, data)
	}
	return out
}

// firstHookCommand digs out hooks[event][0].hooks[0].command from a canonical
// GET payload.
func firstHookCommand(t *testing.T, payload map[string]any, event string) string {
	t.Helper()
	hooks, _ := payload["hooks"].(map[string]any)
	groups, _ := hooks[event].([]any)
	if len(groups) == 0 {
		t.Fatalf("no groups for event %s in %#v", event, hooks)
	}
	g0, _ := groups[0].(map[string]any)
	inner, _ := g0["hooks"].([]any)
	if len(inner) == 0 {
		t.Fatalf("no inner hooks for event %s", event)
	}
	e0, _ := inner[0].(map[string]any)
	return e0["command"].(string)
}

// --- Cursor: flat per-entry matcher, version:1, preserves loop_limit/failClosed/prompt ---

func TestCursorAdapterPreservesForeignAndExtras(t *testing.T) {
	home := t.TempDir()
	path := filepath.Join(home, ".cursor", "hooks.json")
	seedFile(t, path, `{
      "version": 1,
      "hooks": {
        "beforeShellExecution": [
          { "command": "guard.sh", "failClosed": true, "loop_limit": 3 },
          { "type": "prompt", "prompt": "are you sure?" }
        ]
      }
    }`)

	got := getHooks(t, home, "cursor")
	if cmd := firstHookCommand(t, got, "beforeShellExecution"); cmd != "guard.sh" {
		t.Fatalf("GET command = %q, want guard.sh", cmd)
	}

	// Re-write the command hook with a new matcher; the prompt entry and the
	// command's failClosed/loop_limit must survive.
	putHooks(t, home, "cursor", `{"hooks":{"beforeShellExecution":[{"matcher":"rm","hooks":[{"type":"command","command":"guard.sh"}]}]}}`)

	raw := readRawFile(t, path)
	if v, _ := raw["version"].(float64); v != 1 {
		t.Errorf("version = %v, want 1", raw["version"])
	}
	hooks := raw["hooks"].(map[string]any)
	entries := hooks["beforeShellExecution"].([]any)
	if len(entries) != 2 {
		t.Fatalf("entries = %d, want 2 (command + preserved prompt)", len(entries))
	}
	cmd := entries[0].(map[string]any)
	if cmd["command"] != "guard.sh" || cmd["matcher"] != "rm" {
		t.Errorf("command entry = %#v", cmd)
	}
	if cmd["failClosed"] != true {
		t.Errorf("failClosed not preserved: %#v", cmd)
	}
	if cmd["loop_limit"].(float64) != 3 {
		t.Errorf("loop_limit not preserved: %#v", cmd)
	}
	if _, ok := cmd["type"]; ok {
		t.Errorf("cursor entries must not carry a type field: %#v", cmd)
	}
	foreign := entries[1].(map[string]any)
	if foreign["type"] != "prompt" {
		t.Errorf("foreign prompt entry lost: %#v", foreign)
	}
}

// --- Qwen: JSONC settings block, preserves sibling keys, http hook, entry name ---

func TestQwenAdapterPreservesSiblingsForeignAndComments(t *testing.T) {
	home := t.TempDir()
	path := filepath.Join(home, ".qwen", "settings.json")
	seedFile(t, path, `{
      // user comment
      "theme": "dark",
      "hooks": {
        "BeforeTool": [
          { "matcher": "write_file", "hooks": [
            { "type": "command", "command": "scan.sh", "name": "scanner", "timeout": 5000 },
            { "type": "http", "url": "https://x" }
          ] }
        ]
      }
    }`)

	// The mixed group (command + http) is foreign as a whole, so GET surfaces it
	// as non-editable; assert it parses without error and keeps theme on write.
	got := getHooks(t, home, "qwen")
	if got["hooks"] == nil {
		t.Fatal("hooks missing")
	}

	putHooks(t, home, "qwen", `{"hooks":{"AfterTool":[{"matcher":".*","hooks":[{"type":"command","command":"log.sh","timeout":3000}]}]}}`)
	raw := readRawFile(t, path)
	if raw["theme"] != "dark" {
		t.Errorf("theme sibling lost: %#v", raw["theme"])
	}
	hooks := raw["hooks"].(map[string]any)
	// Original BeforeTool group (command+http) preserved verbatim.
	bt, ok := hooks["BeforeTool"].([]any)
	if !ok || len(bt) == 0 {
		t.Fatalf("BeforeTool group lost: %#v", hooks)
	}
	g0 := bt[0].(map[string]any)
	inner := g0["hooks"].([]any)
	if len(inner) != 2 {
		t.Errorf("BeforeTool inner entries = %d, want 2 (command+http preserved)", len(inner))
	}
	// New AfterTool command hook with ms timeout passed through unchanged.
	at := hooks["AfterTool"].([]any)
	ae := at[0].(map[string]any)["hooks"].([]any)[0].(map[string]any)
	if ae["timeout"].(float64) != 3000 {
		t.Errorf("ms timeout = %v, want 3000", ae["timeout"])
	}
}

// --- Windsurf: no matcher, no timeout; drops matcher, preserves powershell ---

func TestWindsurfAdapterDropsMatcherKeepsExtras(t *testing.T) {
	home := t.TempDir()
	path := filepath.Join(home, ".codeium", "windsurf", "hooks.json")
	seedFile(t, path, `{"hooks":{"pre_run_command":[{"command":"check.sh","powershell":"check.ps1","show_output":true}]}}`)

	putHooks(t, home, "windsurf", `{"hooks":{"pre_run_command":[{"matcher":"ignored","hooks":[{"type":"command","command":"check.sh","timeout":9}]}]}}`)

	raw := readRawFile(t, path)
	entry := raw["hooks"].(map[string]any)["pre_run_command"].([]any)[0].(map[string]any)
	if entry["command"] != "check.sh" {
		t.Errorf("command = %#v", entry)
	}
	if _, ok := entry["matcher"]; ok {
		t.Error("windsurf must not write a matcher field")
	}
	if _, ok := entry["timeout"]; ok {
		t.Error("windsurf must not write a timeout field")
	}
	if entry["powershell"] != "check.ps1" || entry["show_output"] != true {
		t.Errorf("windsurf extras lost: %#v", entry)
	}
}

// --- Copilot: dedicated argus.json, version+type:command+timeoutSec; preserves bash-only foreign ---

func TestCopilotAdapterShapeAndForeign(t *testing.T) {
	home := t.TempDir()
	path := filepath.Join(home, ".copilot", "hooks", "argus.json")
	seedFile(t, path, `{"version":1,"hooks":{"preToolUse":[{"type":"command","bash":"native.sh","powershell":"native.ps1"}]}}`)

	putHooks(t, home, "copilot", `{"hooks":{"preToolUse":[{"matcher":"shell","hooks":[{"type":"command","command":"argus.sh","timeout":15}]}]}}`)

	raw := readRawFile(t, path)
	if v, _ := raw["version"].(float64); v != 1 {
		t.Errorf("version = %v, want 1", raw["version"])
	}
	entries := raw["hooks"].(map[string]any)["preToolUse"].([]any)
	if len(entries) != 2 {
		t.Fatalf("entries = %d, want 2 (argus + preserved bash hook)", len(entries))
	}
	ae := entries[0].(map[string]any)
	if ae["type"] != "command" || ae["command"] != "argus.sh" || ae["matcher"] != "shell" {
		t.Errorf("argus entry = %#v", ae)
	}
	if ae["timeoutSec"].(float64) != 15 {
		t.Errorf("timeoutSec = %v, want 15", ae["timeoutSec"])
	}
	if _, ok := ae["timeout"]; ok {
		t.Error("copilot must use timeoutSec, not timeout")
	}
	foreign := entries[1].(map[string]any)
	if foreign["bash"] != "native.sh" {
		t.Errorf("bash-only foreign hook lost: %#v", foreign)
	}
}

// --- Crush: flat in crush.json, preserves $schema sibling + name field ---

func TestCrushAdapterPreservesSchemaAndName(t *testing.T) {
	home := t.TempDir()
	path := filepath.Join(home, ".config", "crush", "crush.json")
	seedFile(t, path, `{"$schema":"https://x/schema.json","models":{"large":"gpt"},"hooks":{"PreToolUse":[{"name":"guard","matcher":"^bash$","command":"g.sh"}]}}`)

	got := getHooks(t, home, "crush")
	if cmd := firstHookCommand(t, got, "PreToolUse"); cmd != "g.sh" {
		t.Fatalf("GET command = %q", cmd)
	}

	putHooks(t, home, "crush", `{"hooks":{"PreToolUse":[{"matcher":"^bash$","hooks":[{"type":"command","command":"g.sh","timeout":20}]}]}}`)
	raw := readRawFile(t, path)
	if raw["$schema"] != "https://x/schema.json" {
		t.Errorf("$schema lost: %#v", raw["$schema"])
	}
	if raw["models"] == nil {
		t.Errorf("models sibling lost")
	}
	entry := raw["hooks"].(map[string]any)["PreToolUse"].([]any)[0].(map[string]any)
	if entry["command"] != "g.sh" || entry["matcher"] != "^bash$" {
		t.Errorf("entry = %#v", entry)
	}
	if entry["name"] != "guard" {
		t.Errorf("crush name field lost: %#v", entry)
	}
	if _, ok := entry["type"]; ok {
		t.Error("crush entries must not carry a type field")
	}
	if entry["timeout"].(float64) != 20 {
		t.Errorf("timeout = %v, want 20", entry["timeout"])
	}
}

// --- Goose: whole-file payload written into a per-plugin dir argus creates ---

func TestGooseAdapterCreatesPluginDir(t *testing.T) {
	home := t.TempDir()
	putHooks(t, home, "goose", `{"hooks":{"PostToolUse":[{"matcher":"developer__shell","hooks":[{"type":"command","command":"${PLUGIN_ROOT}/log.sh"}]}]}}`)

	path := filepath.Join(home, ".agents", "plugins", "argus", "hooks", "hooks.json")
	raw := readRawFile(t, path)
	entry := raw["hooks"].(map[string]any)["PostToolUse"].([]any)[0].(map[string]any)["hooks"].([]any)[0].(map[string]any)
	if entry["command"] != "${PLUGIN_ROOT}/log.sh" {
		t.Errorf("PLUGIN_ROOT token not preserved verbatim: %#v", entry)
	}
	if entry["type"] != "command" {
		t.Errorf("goose entry must keep type:command: %#v", entry)
	}
}

// --- Augment: millisecond timeout passes through unchanged, metadata preserved ---

func TestAugmentAdapterPreservesMetadataAndMsTimeout(t *testing.T) {
	home := t.TempDir()
	path := filepath.Join(home, ".augment", "settings.json")
	seedFile(t, path, `{"hooks":{"PreToolUse":[{"matcher":"launch-process","hooks":[{"type":"command","command":"v.sh","timeout":5000,"metadata":{"includeUserContext":true}}]}]}}`)

	putHooks(t, home, "augment", `{"hooks":{"PreToolUse":[{"matcher":"launch-process","hooks":[{"type":"command","command":"v.sh","timeout":8000}]}]}}`)
	raw := readRawFile(t, path)
	entry := raw["hooks"].(map[string]any)["PreToolUse"].([]any)[0].(map[string]any)["hooks"].([]any)[0].(map[string]any)
	if entry["timeout"].(float64) != 8000 {
		t.Errorf("ms timeout = %v, want 8000 (no unit conversion)", entry["timeout"])
	}
	meta, ok := entry["metadata"].(map[string]any)
	if !ok || meta["includeUserContext"] != true {
		t.Errorf("augment metadata lost: %#v", entry)
	}
}

// --- Empty PUT on a missing file creates a clean file and round-trips empty ---

func TestAdapterEmptyConfigRoundTrip(t *testing.T) {
	for _, agent := range []string{"cursor", "antigravity", "windsurf", "copilot", "crush", "goose", "continue", "qwen"} {
		home := t.TempDir()
		putHooks(t, home, agent, `{"hooks":{}}`)
		got := getHooks(t, home, agent)
		hooks, ok := got["hooks"].(map[string]any)
		if !ok || len(hooks) != 0 {
			t.Errorf("agent=%s: hooks = %#v, want empty object", agent, got["hooks"])
		}
	}
}
