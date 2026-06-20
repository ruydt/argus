package handler_test

import (
	"path/filepath"
	"testing"
)

// These tests lock in fixes for data-loss bugs found in adversarial review of
// the hook-config adapter engine. Each maps to a concrete corruption scenario.

// #1 Editing only the matcher of a nested group must preserve inner agent
// fields (Augment metadata) and group-level extras (Qwen sequential).
func TestRegression_NestedMatcherEditPreservesExtras(t *testing.T) {
	home := t.TempDir()
	path := filepath.Join(home, ".augment", "settings.json")
	seedFile(t, path, `{"hooks":{"PreToolUse":[{"matcher":"launch-process","hooks":[{"type":"command","command":"v.sh","metadata":{"includeUserContext":true}}]}]}}`)
	// Change ONLY the matcher; command stays v.sh.
	putHooks(t, home, "augment", `{"hooks":{"PreToolUse":[{"matcher":"launch-process|run","hooks":[{"type":"command","command":"v.sh"}]}]}}`)
	raw := readRawFile(t, path)
	g := raw["hooks"].(map[string]any)["PreToolUse"].([]any)[0].(map[string]any)
	if g["matcher"] != "launch-process|run" {
		t.Errorf("matcher = %v, want edited", g["matcher"])
	}
	e := g["hooks"].([]any)[0].(map[string]any)
	if _, ok := e["metadata"].(map[string]any); !ok {
		t.Errorf("metadata dropped on matcher edit: %#v", e)
	}
}

func TestRegression_QwenSequentialSurvivesMatcherEdit(t *testing.T) {
	home := t.TempDir()
	path := filepath.Join(home, ".qwen", "settings.json")
	seedFile(t, path, `{"hooks":{"PreToolUse":[{"matcher":"x","sequential":true,"hooks":[{"type":"command","command":"a.sh","name":"n"}]}]}}`)
	putHooks(t, home, "qwen", `{"hooks":{"PreToolUse":[{"matcher":"y","hooks":[{"type":"command","command":"a.sh"}]}]}}`)
	g := readRawFile(t, path)["hooks"].(map[string]any)["PreToolUse"].([]any)[0].(map[string]any)
	if g["sequential"] != true {
		t.Errorf("group sequential dropped: %#v", g)
	}
	if g["hooks"].([]any)[0].(map[string]any)["name"] != "n" {
		t.Errorf("inner name dropped: %#v", g)
	}
}

// #3 Renaming a flat command must preserve that entry's agent-specific fields.
func TestRegression_FlatRenamePreservesExtras(t *testing.T) {
	home := t.TempDir()
	cur := filepath.Join(home, ".cursor", "hooks.json")
	seedFile(t, cur, `{"version":1,"hooks":{"beforeShellExecution":[{"command":"guard.sh","failClosed":true,"loop_limit":3}]}}`)
	putHooks(t, home, "cursor", `{"hooks":{"beforeShellExecution":[{"hooks":[{"type":"command","command":"./guard.sh"}]}]}}`)
	e := readRawFile(t, cur)["hooks"].(map[string]any)["beforeShellExecution"].([]any)[0].(map[string]any)
	if e["command"] != "./guard.sh" {
		t.Errorf("command not renamed: %#v", e)
	}
	if e["failClosed"] != true || e["loop_limit"].(float64) != 3 {
		t.Errorf("cursor guardrail fields lost on rename: %#v", e)
	}

	win := filepath.Join(home, ".codeium", "windsurf", "hooks.json")
	seedFile(t, win, `{"hooks":{"pre_run_command":[{"command":"check.sh","powershell":"check.ps1","show_output":true}]}}`)
	putHooks(t, home, "windsurf", `{"hooks":{"pre_run_command":[{"hooks":[{"type":"command","command":"./check.sh"}]}]}}`)
	w := readRawFile(t, win)["hooks"].(map[string]any)["pre_run_command"].([]any)[0].(map[string]any)
	if w["command"] != "./check.sh" || w["powershell"] != "check.ps1" || w["show_output"] != true {
		t.Errorf("windsurf fields lost on rename: %#v", w)
	}
}

// #4 Two flat entries with the same command but different matchers must keep
// their own per-entry fields on a no-op save.
func TestRegression_FlatDuplicateCommandNoOpKeepsPerEntryFields(t *testing.T) {
	home := t.TempDir()
	cur := filepath.Join(home, ".cursor", "hooks.json")
	seedFile(t, cur, `{"version":1,"hooks":{"beforeShellExecution":[{"command":"g.sh","matcher":"rm","loop_limit":3},{"command":"g.sh","matcher":"sudo","loop_limit":9}]}}`)
	// Echo the canonical GET body back unchanged (two single-hook groups).
	putHooks(t, home, "cursor", `{"hooks":{"beforeShellExecution":[{"matcher":"rm","hooks":[{"type":"command","command":"g.sh"}]},{"matcher":"sudo","hooks":[{"type":"command","command":"g.sh"}]}]}}`)
	entries := readRawFile(t, cur)["hooks"].(map[string]any)["beforeShellExecution"].([]any)
	got := map[string]float64{}
	for _, e := range entries {
		m := e.(map[string]any)
		got[m["matcher"].(string)] = m["loop_limit"].(float64)
	}
	if got["rm"] != 3 || got["sudo"] != 9 {
		t.Errorf("per-entry loop_limit collapsed: %#v", got)
	}
}

// #5 Two nested inner entries with the same command but different unmodeled
// fields must not collapse onto the first.
func TestRegression_NestedDuplicateInnerKeepsMetadata(t *testing.T) {
	home := t.TempDir()
	path := filepath.Join(home, ".augment", "settings.json")
	seedFile(t, path, `{"hooks":{"PreToolUse":[{"matcher":"x","hooks":[{"type":"command","command":"v.sh","metadata":{"id":1}},{"type":"command","command":"v.sh","metadata":{"id":2}}]}]}}`)
	putHooks(t, home, "augment", `{"hooks":{"PreToolUse":[{"matcher":"x","hooks":[{"type":"command","command":"v.sh"},{"type":"command","command":"v.sh"}]}]}}`)
	inner := readRawFile(t, path)["hooks"].(map[string]any)["PreToolUse"].([]any)[0].(map[string]any)["hooks"].([]any)
	ids := []float64{
		inner[0].(map[string]any)["metadata"].(map[string]any)["id"].(float64),
		inner[1].(map[string]any)["metadata"].(map[string]any)["id"].(float64),
	}
	if ids[0] != 1 || ids[1] != 2 {
		t.Errorf("duplicate-command metadata collapsed: %v", ids)
	}
}

// #7 / #8 / #9 Entries argus cannot model as a string command (command-less,
// alternate key, array command) must be preserved verbatim, never dropped.
func TestRegression_UnmodelableEntriesPreserved(t *testing.T) {
	home := t.TempDir()

	// Windsurf powershell-only (no "command") alongside a normal entry.
	win := filepath.Join(home, ".codeium", "windsurf", "hooks.json")
	seedFile(t, win, `{"hooks":{"pre_run_command":[{"powershell":"only.ps1","show_output":true},{"command":"check.sh"}]}}`)
	putHooks(t, home, "windsurf", `{"hooks":{"pre_run_command":[{"hooks":[{"type":"command","command":"check.sh"}]}]}}`)
	wEntries := readRawFile(t, win)["hooks"].(map[string]any)["pre_run_command"].([]any)
	if len(wEntries) != 2 {
		t.Fatalf("windsurf command-less entry dropped: %#v", wEntries)
	}

	// Claude array-command + alternate-key entries under events the editor never
	// surfaces; an unrelated edit must not delete them.
	cl := filepath.Join(home, ".claude", "settings.json")
	seedFile(t, cl, `{"hooks":{"PreToolUse":[{"matcher":"x","hooks":[{"type":"command","command":["docker","run"]}]}],"SessionStart":[{"hooks":[{"type":"command","run":"startup.sh"}]}]}}`)
	putHooks(t, home, "claudecode", `{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"s.sh"}]}]}}`)
	clHooks := readRawFile(t, cl)["hooks"].(map[string]any)
	pre := clHooks["PreToolUse"].([]any)[0].(map[string]any)["hooks"].([]any)[0].(map[string]any)
	if arr, ok := pre["command"].([]any); !ok || len(arr) != 2 {
		t.Errorf("array command not preserved verbatim: %#v", pre)
	}
	ss := clHooks["SessionStart"].([]any)[0].(map[string]any)["hooks"].([]any)[0].(map[string]any)
	if ss["run"] != "startup.sh" {
		t.Errorf("alternate-key entry dropped: %#v", ss)
	}
}

// Removing a MIDDLE group must not migrate the next group's agent fields onto
// the wrong command (base recovered by command identity, not array index).
func TestRegression_NestedRemoveMiddleKeepsIdentity(t *testing.T) {
	home := t.TempDir()
	path := filepath.Join(home, ".qwen", "settings.json")
	seedFile(t, path, `{"hooks":{"PreToolUse":[
      {"matcher":"m0","hooks":[{"type":"command","command":"c0.sh","name":"N0"}]},
      {"matcher":"m1","hooks":[{"type":"command","command":"c1.sh","name":"N1"}]},
      {"matcher":"m2","hooks":[{"type":"command","command":"c2.sh","name":"N2"}]}]}}`)
	// Remove the middle group; PUT the remaining two.
	putHooks(t, home, "qwen", `{"hooks":{"PreToolUse":[
      {"matcher":"m0","hooks":[{"type":"command","command":"c0.sh"}]},
      {"matcher":"m2","hooks":[{"type":"command","command":"c2.sh"}]}]}}`)
	groups := readRawFile(t, path)["hooks"].(map[string]any)["PreToolUse"].([]any)
	names := map[string]string{}
	for _, g := range groups {
		inner := g.(map[string]any)["hooks"].([]any)[0].(map[string]any)
		names[inner["command"].(string)] = inner["name"].(string)
	}
	if names["c0.sh"] != "N0" || names["c2.sh"] != "N2" {
		t.Errorf("agent fields migrated onto wrong command after middle remove: %#v", names)
	}
}

// Reordering inner hooks must keep each hook's agent fields with its command.
func TestRegression_NestedInnerReorderKeepsIdentity(t *testing.T) {
	home := t.TempDir()
	path := filepath.Join(home, ".claude", "settings.json")
	seedFile(t, path, `{"hooks":{"PreToolUse":[{"matcher":"x","hooks":[
      {"type":"command","command":"a.sh","name":"NA"},
      {"type":"command","command":"b.sh","name":"NB"}]}]}}`)
	// Swap the two inner hooks.
	putHooks(t, home, "claudecode", `{"hooks":{"PreToolUse":[{"matcher":"x","hooks":[
      {"type":"command","command":"b.sh"},
      {"type":"command","command":"a.sh"}]}]}}`)
	inner := readRawFile(t, path)["hooks"].(map[string]any)["PreToolUse"].([]any)[0].(map[string]any)["hooks"].([]any)
	got := map[string]string{}
	for _, e := range inner {
		m := e.(map[string]any)
		got[m["command"].(string)] = m["name"].(string)
	}
	if got["a.sh"] != "NA" || got["b.sh"] != "NB" {
		t.Errorf("inner agent fields swapped onto wrong command on reorder: %#v", got)
	}
}

// Removing the FIRST flat entry must not shift the next entry's per-entry fields.
func TestRegression_FlatRemoveFirstKeepsIdentity(t *testing.T) {
	home := t.TempDir()
	path := filepath.Join(home, ".cursor", "hooks.json")
	seedFile(t, path, `{"version":1,"hooks":{"beforeShellExecution":[
      {"command":"a.sh","matcher":"ma","loop_limit":1},
      {"command":"b.sh","matcher":"mb","loop_limit":2}]}}`)
	// Remove the first entry; PUT only b.sh.
	putHooks(t, home, "cursor", `{"hooks":{"beforeShellExecution":[{"matcher":"mb","hooks":[{"type":"command","command":"b.sh"}]}]}}`)
	entries := readRawFile(t, path)["hooks"].(map[string]any)["beforeShellExecution"].([]any)
	if len(entries) != 1 {
		t.Fatalf("entries = %d, want 1", len(entries))
	}
	e := entries[0].(map[string]any)
	if e["command"] != "b.sh" || e["loop_limit"].(float64) != 2 {
		t.Errorf("per-entry field shifted onto wrong command after remove-first: %#v", e)
	}
}

// #2 Flat adapters must write a new/edited statusMessage.
func TestRegression_FlatStatusMessageWritten(t *testing.T) {
	home := t.TempDir()
	cur := filepath.Join(home, ".cursor", "hooks.json")
	seedFile(t, cur, `{"version":1,"hooks":{"beforeShellExecution":[{"command":"g.sh","statusMessage":"old"}]}}`)
	putHooks(t, home, "cursor", `{"hooks":{"beforeShellExecution":[{"hooks":[{"type":"command","command":"g.sh","statusMessage":"new"}]}]}}`)
	e := readRawFile(t, cur)["hooks"].(map[string]any)["beforeShellExecution"].([]any)[0].(map[string]any)
	if e["statusMessage"] != "new" {
		t.Errorf("flat statusMessage edit lost: %#v", e)
	}
}

// #10 / #11 String- and fraction-encoded timeouts must survive a no-op save.
func TestRegression_TimeoutEncodingPreserved(t *testing.T) {
	home := t.TempDir()
	cl := filepath.Join(home, ".claude", "settings.json")

	seedFile(t, cl, `{"hooks":{"PreToolUse":[{"matcher":"x","hooks":[{"type":"command","command":"a.sh","timeout":"60"}]}]}}`)
	got := getHooks(t, home, "claudecode")
	if cmd := firstHookCommand(t, got, "PreToolUse"); cmd != "a.sh" {
		t.Fatalf("GET command = %q", cmd)
	}
	putHooks(t, home, "claudecode", `{"hooks":{"PreToolUse":[{"matcher":"x","hooks":[{"type":"command","command":"a.sh","timeout":60}]}]}}`)
	e := readRawFile(t, cl)["hooks"].(map[string]any)["PreToolUse"].([]any)[0].(map[string]any)["hooks"].([]any)[0].(map[string]any)
	if _, ok := e["timeout"]; !ok {
		t.Errorf("string timeout dropped: %#v", e)
	}

	seedFile(t, cl, `{"hooks":{"PreToolUse":[{"matcher":"x","hooks":[{"type":"command","command":"a.sh","timeout":5.9}]}]}}`)
	putHooks(t, home, "claudecode", `{"hooks":{"PreToolUse":[{"matcher":"x","hooks":[{"type":"command","command":"a.sh","timeout":5}]}]}}`)
	e2 := readRawFile(t, cl)["hooks"].(map[string]any)["PreToolUse"].([]any)[0].(map[string]any)["hooks"].([]any)[0].(map[string]any)
	if e2["timeout"].(float64) != 5.9 {
		t.Errorf("fractional timeout narrowed on no-op save: %v", e2["timeout"])
	}
}
