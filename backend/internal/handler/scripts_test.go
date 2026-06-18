package handler

import (
	"os"
	"path/filepath"
	"testing"
)

func TestHookTargetRejectsTraversal(t *testing.T) {
	dir := t.TempDir()
	for _, bad := range []string{"", "../evil.sh", "/etc/passwd", "sub/dir.sh"} {
		if _, err := hookTarget(dir, bad); err == nil {
			t.Errorf("hookTarget(%q) = nil error, want rejection", bad)
		}
	}
	got, err := hookTarget(dir, "ok.sh")
	if err != nil {
		t.Fatalf("hookTarget(ok.sh) error: %v", err)
	}
	if want := filepath.Join(dir, "hooks", "ok.sh"); got != want {
		t.Errorf("hookTarget = %q, want %q", got, want)
	}
}

func TestWriteHookScriptCreatesFile(t *testing.T) {
	dir := t.TempDir()
	body := []byte("#!/bin/sh\necho hello\n")
	if err := writeHookScript(dir, "test.sh", body); err != nil {
		t.Fatalf("writeHookScript: %v", err)
	}

	target := filepath.Join(dir, "hooks", "test.sh")
	info, err := os.Stat(target)
	if err != nil {
		t.Fatalf("stat %s: %v", target, err)
	}
	if mode := info.Mode().Perm(); mode != 0o700 {
		t.Errorf("file mode = %o, want 700", mode)
	}
	got, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("read %s: %v", target, err)
	}
	if string(got) != string(body) {
		t.Errorf("body = %q, want %q", got, body)
	}
}

func TestWriteHookScriptRejectsSecondWrite(t *testing.T) {
	dir := t.TempDir()
	body := []byte("#!/bin/sh\n")
	if err := writeHookScript(dir, "once.sh", body); err != nil {
		t.Fatalf("first write: %v", err)
	}
	if err := writeHookScript(dir, "once.sh", body); err == nil {
		t.Fatal("second write with same filename: want error (O_EXCL), got nil")
	}
}

func TestWriteHookScriptRejectsTraversalFilename(t *testing.T) {
	dir := t.TempDir()
	if err := writeHookScript(dir, "../evil.sh", []byte("x")); err == nil {
		t.Fatal("writeHookScript(../evil.sh): want rejection, got nil error")
	}
}
