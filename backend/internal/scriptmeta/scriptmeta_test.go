package scriptmeta_test

import (
	"reflect"
	"testing"

	"argus/internal/scriptmeta"
)

func TestParseExtractsFields(t *testing.T) {
	body := "// @argus-meta\n" +
		"// title: Block dangerous commands\n" +
		"// author: argus\n" +
		"// events: PreToolUse, PostToolUse\n" +
		"// agents: claudecode, codex\n" +
		"// runtime: node\n" +
		"// matcher: Bash\n" +
		"// purpose: deny rm -rf\n" +
		"// @end\n\n#!/usr/bin/env node\nconsole.log('x')\n"

	m := scriptmeta.Parse(body)
	if m.Title != "Block dangerous commands" {
		t.Errorf("Title = %q", m.Title)
	}
	if m.Author != "argus" {
		t.Errorf("Author = %q", m.Author)
	}
	if want := []string{"PreToolUse", "PostToolUse"}; !reflect.DeepEqual(m.Events, want) {
		t.Errorf("Events = %v, want %v", m.Events, want)
	}
	if want := []string{"claudecode", "codex"}; !reflect.DeepEqual(m.Agents, want) {
		t.Errorf("Agents = %v, want %v", m.Agents, want)
	}
	if m.Runtime != "node" {
		t.Errorf("Runtime = %q", m.Runtime)
	}
	if m.Matcher != "Bash" {
		t.Errorf("Matcher = %q", m.Matcher)
	}
	if m.Purpose != "deny rm -rf" {
		t.Errorf("Purpose = %q", m.Purpose)
	}
}

// Legacy singular `event:` still folds into Events for older scripts.
func TestParseLegacyEventField(t *testing.T) {
	body := "// @argus-meta\n// title: x\n// event: PreToolUse\n// @end\n\nbody\n"
	m := scriptmeta.Parse(body)
	if want := []string{"PreToolUse"}; !reflect.DeepEqual(m.Events, want) {
		t.Errorf("Events = %v, want %v", m.Events, want)
	}
}

func TestEnsureAuthor(t *testing.T) {
	withMeta := "#!/usr/bin/env node\n// @argus-meta\n// title: x\n// event: Stop\n// @end\n\nbody\n"
	got := scriptmeta.EnsureAuthor(withMeta, "octocat")
	if scriptmeta.Parse(got).Author != "octocat" {
		t.Errorf("author not stamped: %q", got)
	}

	// Already has an author → unchanged.
	hasAuthor := "// @argus-meta\n// title: x\n// author: alice\n// @end\n"
	if scriptmeta.EnsureAuthor(hasAuthor, "octocat") != hasAuthor {
		t.Error("overwrote existing author")
	}

	// No meta block / empty login → unchanged.
	if scriptmeta.EnsureAuthor("plain body", "octocat") != "plain body" {
		t.Error("modified body without meta block")
	}
	if scriptmeta.EnsureAuthor(withMeta, "") != withMeta {
		t.Error("stamped empty author")
	}
}

func TestParseMissingHeaderReturnsZero(t *testing.T) {
	m := scriptmeta.Parse("#!/usr/bin/env node\nconsole.log('no meta')\n")
	if !reflect.DeepEqual(m, scriptmeta.Meta{}) {
		t.Errorf("expected zero Meta, got %+v", m)
	}
}

func TestParseExtractsCommandField(t *testing.T) {
	body := "// @argus-meta\n" +
		"// title: My hook\n" +
		"// event: PreToolUse\n" +
		"// command: node hook.js --strict\n" +
		"// matcher: Bash\n" +
		"// @end\n\nbody\n"

	m := scriptmeta.Parse(body)
	if m.Command != "node hook.js --strict" {
		t.Errorf("Command = %q", m.Command)
	}
	if m.Runtime != "" {
		t.Errorf("Runtime = %q, want empty", m.Runtime)
	}
}

func TestParseBackwardCompatRuntimeField(t *testing.T) {
	body := "// @argus-meta\n" +
		"// title: Old script\n" +
		"// event: Stop\n" +
		"// runtime: node\n" +
		"// @end\n\nbody\n"

	m := scriptmeta.Parse(body)
	if m.Runtime != "node" {
		t.Errorf("Runtime = %q, want node", m.Runtime)
	}
	if m.Command != "" {
		t.Errorf("Command = %q, want empty", m.Command)
	}
}
