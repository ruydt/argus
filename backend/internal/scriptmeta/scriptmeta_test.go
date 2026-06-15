package scriptmeta_test

import (
	"testing"

	"argus/internal/scriptmeta"
)

func TestParseExtractsFields(t *testing.T) {
	body := "// @argus-meta\n" +
		"// title: Block dangerous commands\n" +
		"// author: argus\n" +
		"// event: PreToolUse\n" +
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
	if m.Event != "PreToolUse" {
		t.Errorf("Event = %q", m.Event)
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
	if (m != scriptmeta.Meta{}) {
		t.Errorf("expected zero Meta, got %+v", m)
	}
}
