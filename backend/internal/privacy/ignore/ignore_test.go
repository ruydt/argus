package ignore_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"hooker/internal/domain"
	"hooker/internal/privacy/ignore"
)

// writeIgnoreFile writes content to a temp file and returns its path.
func writeIgnoreFile(t *testing.T, content string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "ignore")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	return path
}

// TestLoad_MissingDefaultFile verifies that a missing default ignore file
// returns an empty matcher (D-01: missing default does not fail startup).
func TestLoad_MissingDefaultFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nonexistent-ignore")
	m, err := ignore.Load(path)
	if err != nil {
		t.Fatalf("Load missing default: got error %v, want nil", err)
	}
	e := domain.NormalizedEvent{CWD: "/home/user/project"}
	matched, _ := m.MatchEvent(e)
	if matched {
		t.Fatal("empty matcher should not match any event")
	}
}

// TestLoad_EmptyFile verifies that an empty file matches nothing.
func TestLoad_EmptyFile(t *testing.T) {
	path := writeIgnoreFile(t, "")
	m, err := ignore.Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	e := domain.NormalizedEvent{CWD: "/home/user/project", Path: "/home/user/project/main.go"}
	matched, _ := m.MatchEvent(e)
	if matched {
		t.Fatal("empty file should not match any event")
	}
}

// TestLoad_BlankLinesIgnored verifies blank lines do not match events (D-05).
func TestLoad_BlankLinesIgnored(t *testing.T) {
	path := writeIgnoreFile(t, "\n\n   \n\t\n")
	m, err := ignore.Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	e := domain.NormalizedEvent{CWD: "/home/user/project"}
	matched, _ := m.MatchEvent(e)
	if matched {
		t.Fatal("blank-only file should not match any event")
	}
}

// TestLoad_CommentsIgnored verifies # comments do not match events (D-05).
func TestLoad_CommentsIgnored(t *testing.T) {
	path := writeIgnoreFile(t, "# this is a comment\n# another comment\n")
	m, err := ignore.Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	e := domain.NormalizedEvent{CWD: "/home/user/project"}
	matched, _ := m.MatchEvent(e)
	if matched {
		t.Fatal("comment-only file should not match any event")
	}
}

// TestMatchEvent_CWDLiteralMatch verifies a literal CWD pattern matches (D-02).
func TestMatchEvent_CWDLiteralMatch(t *testing.T) {
	path := writeIgnoreFile(t, "/home/user/secret\n")
	m, err := ignore.Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	e := domain.NormalizedEvent{CWD: "/home/user/secret"}
	matched, reason := m.MatchEvent(e)
	if !matched {
		t.Fatal("expected CWD to match pattern /home/user/secret")
	}
	if reason == "" {
		t.Fatal("reason must be non-empty for a matched event")
	}
}

// TestMatchEvent_PathLiteralMatch verifies a literal Path pattern matches (D-02).
func TestMatchEvent_PathLiteralMatch(t *testing.T) {
	path := writeIgnoreFile(t, "/home/user/secret/file.go\n")
	m, err := ignore.Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	e := domain.NormalizedEvent{CWD: "/home/user/project", Path: "/home/user/secret/file.go"}
	matched, reason := m.MatchEvent(e)
	if !matched {
		t.Fatal("expected Path to match pattern /home/user/secret/file.go")
	}
	if reason == "" {
		t.Fatal("reason must be non-empty for a matched event")
	}
}

// TestMatchEvent_DoesNotMatchOtherFields verifies only CWD and Path are checked (D-02).
func TestMatchEvent_DoesNotMatchOtherFields(t *testing.T) {
	path := writeIgnoreFile(t, "/secret\n")
	m, err := ignore.Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	// Prompt and Command contain /secret but CWD and Path do not.
	e := domain.NormalizedEvent{
		CWD:     "/home/user/safe",
		Path:    "/home/user/safe/main.go",
		Prompt:  "please edit /secret/file.txt for me",
		Command: "cat /secret/private.key",
	}
	matched, _ := m.MatchEvent(e)
	if matched {
		t.Fatal("matcher must not inspect Prompt or Command — only CWD and Path")
	}
}

// TestMatchEvent_DirectoryPattern verifies node_modules/ matches any path containing that segment (D-05).
func TestMatchEvent_DirectoryPattern(t *testing.T) {
	path := writeIgnoreFile(t, "node_modules/\n")
	m, err := ignore.Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	cases := []struct {
		name    string
		event   domain.NormalizedEvent
		want    bool
	}{
		{
			name:  "CWD ends with node_modules",
			event: domain.NormalizedEvent{CWD: "/home/user/project/node_modules"},
			want:  true,
		},
		{
			name:  "Path contains node_modules",
			event: domain.NormalizedEvent{CWD: "/home/user/project", Path: "/home/user/project/node_modules/lodash/index.js"},
			want:  true,
		},
		{
			name:  "no match for unrelated path",
			event: domain.NormalizedEvent{CWD: "/home/user/project", Path: "/home/user/project/src/main.go"},
			want:  false,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, _ := m.MatchEvent(c.event)
			if got != c.want {
				t.Errorf("MatchEvent() = %v, want %v", got, c.want)
			}
		})
	}
}

// TestMatchEvent_DoubleStarPattern verifies ** glob matching (D-05).
func TestMatchEvent_DoubleStarPattern(t *testing.T) {
	path := writeIgnoreFile(t, "frontend/**/dist/\n")
	m, err := ignore.Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	cases := []struct {
		name  string
		event domain.NormalizedEvent
		want  bool
	}{
		{
			name:  "CWD matches double star",
			event: domain.NormalizedEvent{CWD: "/home/user/project/frontend/app/dist"},
			want:  true,
		},
		{
			name:  "Path matches double star",
			event: domain.NormalizedEvent{CWD: "/home/user", Path: "/home/user/project/frontend/nested/dist/bundle.js"},
			want:  true,
		},
		{
			name:  "no match for backend dist",
			event: domain.NormalizedEvent{CWD: "/home/user/project/backend/dist"},
			want:  false,
		},
		{
			name:  "CWD matches double star with zero intermediates",
			event: domain.NormalizedEvent{CWD: "/home/user/project/frontend/dist"},
			want:  true,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, _ := m.MatchEvent(c.event)
			if got != c.want {
				t.Errorf("MatchEvent() = %v, want %v", got, c.want)
			}
		})
	}
}

// TestMatchEvent_NegationPattern verifies ! negation un-matches previously matched paths (D-05).
func TestMatchEvent_NegationPattern(t *testing.T) {
	// Match /secret but not /secret/public
	path := writeIgnoreFile(t, "/secret\n!/secret/public\n")
	m, err := ignore.Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	cases := []struct {
		name  string
		event domain.NormalizedEvent
		want  bool
	}{
		{
			name:  "base secret path is matched",
			event: domain.NormalizedEvent{CWD: "/secret"},
			want:  true,
		},
		{
			name:  "negated path is not matched",
			event: domain.NormalizedEvent{CWD: "/secret/public"},
			want:  false,
		},
		{
			name:  "unrelated path is not matched",
			event: domain.NormalizedEvent{CWD: "/home/user"},
			want:  false,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, _ := m.MatchEvent(c.event)
			if got != c.want {
				t.Errorf("MatchEvent() = %v, want %v", got, c.want)
			}
		})
	}
}

// TestMatchEvent_ReasonDoesNotContainSensitiveFields verifies the reason string
// is metadata-only: no Prompt, ToolResultStdout, OldString, NewString, or RawPayload (D-04).
func TestMatchEvent_ReasonDoesNotContainSensitiveFields(t *testing.T) {
	path := writeIgnoreFile(t, "/secret\n")
	m, err := ignore.Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	e := domain.NormalizedEvent{
		CWD:              "/secret",
		Prompt:           "super secret prompt text",
		ToolResultStdout: "tool output data",
		OldString:        "old code string",
		NewString:        "new code string",
	}
	matched, reason := m.MatchEvent(e)
	if !matched {
		t.Fatal("expected match")
	}
	// Reason must not contain any sensitive field values.
	for _, sensitive := range []string{
		"super secret prompt text",
		"tool output data",
		"old code string",
		"new code string",
	} {
		if strings.Contains(reason, sensitive) {
			t.Errorf("reason contains sensitive data: %q", reason)
		}
	}
	// Reason must contain the pattern that matched (safe metadata).
	if reason == "" {
		t.Fatal("reason must identify the matched pattern")
	}
}

// TestMatchEvent_EmptyCWDAndPath verifies events with no CWD or Path don't panic.
func TestMatchEvent_EmptyCWDAndPath(t *testing.T) {
	path := writeIgnoreFile(t, "/secret\n")
	m, err := ignore.Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	e := domain.NormalizedEvent{}
	matched, _ := m.MatchEvent(e)
	if matched {
		t.Fatal("empty CWD and Path should never match")
	}
}

// TestLoad_HOOKER_IGNORE verifies that HOOKER_IGNORE env var controls the path
// (config-level behavior is tested in config_test; this exercises the Load function directly).
func TestLoad_ExplicitPathTakesEffect(t *testing.T) {
	// Write two different ignore files.
	path1 := writeIgnoreFile(t, "/secret-a\n")
	path2 := writeIgnoreFile(t, "/secret-b\n")

	m1, err := ignore.Load(path1)
	if err != nil {
		t.Fatalf("Load path1: %v", err)
	}
	m2, err := ignore.Load(path2)
	if err != nil {
		t.Fatalf("Load path2: %v", err)
	}

	e1 := domain.NormalizedEvent{CWD: "/secret-a"}
	e2 := domain.NormalizedEvent{CWD: "/secret-b"}

	if matched, _ := m1.MatchEvent(e1); !matched {
		t.Fatal("m1 should match /secret-a")
	}
	if matched, _ := m1.MatchEvent(e2); matched {
		t.Fatal("m1 should not match /secret-b")
	}
	if matched, _ := m2.MatchEvent(e2); !matched {
		t.Fatal("m2 should match /secret-b")
	}
	if matched, _ := m2.MatchEvent(e1); matched {
		t.Fatal("m2 should not match /secret-a")
	}
}

// TestMatchEvent_WildcardPattern verifies * single-segment glob (e.g., /home/*/secret).
func TestMatchEvent_WildcardPattern(t *testing.T) {
	path := writeIgnoreFile(t, "/home/*/secret\n")
	m, err := ignore.Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	cases := []struct {
		name  string
		cwd   string
		want  bool
	}{
		{"/home/alice/secret", "/home/alice/secret", true},
		{"/home/bob/secret", "/home/bob/secret", true},
		{"/home/alice/public", "/home/alice/public", false},
		{"/other/alice/secret", "/other/alice/secret", false},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			e := domain.NormalizedEvent{CWD: c.cwd}
			got, _ := m.MatchEvent(e)
			if got != c.want {
				t.Errorf("MatchEvent(%q) = %v, want %v", c.cwd, got, c.want)
			}
		})
	}
}
