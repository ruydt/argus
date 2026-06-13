package fileutil_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"argus/internal/fileutil"
)

func writeTempFile(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "f.txt")
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestReadFileLines(t *testing.T) {
	path := writeTempFile(t, "alpha\nbeta\ngamma")
	lines := fileutil.ReadFileLines(path)
	if len(lines) != 3 || lines[0] != "alpha" || lines[2] != "gamma" {
		t.Fatalf("unexpected lines: %#v", lines)
	}
	if fileutil.ReadFileLines("") != nil {
		t.Fatal("empty path should return nil")
	}
	if fileutil.ReadFileLines(filepath.Join(t.TempDir(), "missing")) != nil {
		t.Fatal("missing file should return nil")
	}
}

func TestReadFileLinesSizeCap(t *testing.T) {
	big := strings.Repeat("x", fileutil.MaxEnrichFileBytes+1)
	path := writeTempFile(t, big)
	if fileutil.ReadFileLines(path) != nil {
		t.Fatal("oversized file should be skipped")
	}
}

func TestFindStartLineInLinesMatchesFindStartLine(t *testing.T) {
	content := "package main\n\nfunc a() {\n\treturn\n}\n\nfunc b() {\n\treturn\n}\n"
	path := writeTempFile(t, content)
	lines := fileutil.ReadFileLines(path)
	for _, snippet := range []string{"func b() {\n\treturn\n}", "package main", "missing snippet"} {
		got := fileutil.FindStartLineInLines(lines, snippet)
		want := fileutil.FindStartLine(path, snippet)
		if got != want {
			t.Errorf("snippet %q: FindStartLineInLines=%d FindStartLine=%d", snippet, got, want)
		}
	}
}

func TestComputeContextFromLinesMatchesComputeContext(t *testing.T) {
	content := "l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\n"
	path := writeTempFile(t, content)
	lines := fileutil.ReadFileLines(path)
	gotB, gotA := fileutil.ComputeContextFromLines(lines, 4, 2, 3)
	wantB, wantA := fileutil.ComputeContext(path, 4, 2, 3)
	if len(gotB) != len(wantB) || len(gotA) != len(wantA) {
		t.Fatalf("context mismatch: got %v/%v want %v/%v", gotB, gotA, wantB, wantA)
	}
	for i := range gotB {
		if gotB[i] != wantB[i] {
			t.Errorf("before[%d]: got %v want %v", i, gotB[i], wantB[i])
		}
	}
	for i := range gotA {
		if gotA[i] != wantA[i] {
			t.Errorf("after[%d]: got %v want %v", i, gotA[i], wantA[i])
		}
	}
}
