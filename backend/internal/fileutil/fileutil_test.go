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
		{"apply_patch", "EDIT"},
		{"Write", "EDIT"},
		{"create_file", "EDIT"},
		{"Read", "READ"},
		{"Grep", "READ"},
		{"LS", "READ"},
		{"list_directory", "READ"},
		{"Glob", "READ"},
		{"view_file", "READ"},
		{"mcp_tool", "TOOL"},
		{"", ""},
	}
	for _, c := range cases {
		if got := fileutil.ToolToAction(c.tool); got != c.want {
			t.Errorf("ToolToAction(%q) = %q, want %q", c.tool, got, c.want)
		}
	}
}

func TestFindStartLine(t *testing.T) {
	f, err := os.CreateTemp(t.TempDir(), "*.go")
	if err != nil {
		t.Fatalf("CreateTemp: %v", err)
	}
	if _, err := f.WriteString("package main\n\nfunc hello() {}\n"); err != nil {
		t.Fatalf("WriteString: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

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

func TestExtractPathFromCommand_directory(t *testing.T) {
	got := fileutil.ExtractPathFromCommand("mkdir -p /home/user/project")
	if got != "/home/user/project" {
		t.Errorf("got %q, want /home/user/project", got)
	}
}

func TestComputeContext(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "f.go")
	if err := os.WriteFile(path, []byte("a\nb\nc\nd\ne\n"), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	before, after := fileutil.ComputeContext(path, 3, 1, 1)
	if len(before) != 1 || before[0].Text != "b" {
		t.Errorf("before = %v", before)
	}
	if len(after) != 1 || after[0].Text != "d" {
		t.Errorf("after = %v", after)
	}
}
