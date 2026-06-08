package service

import (
	"os"
	"path/filepath"
	"testing"
)

func TestScanFileSystemPopulatesEntries(t *testing.T) {
	dir := t.TempDir()

	binDir := filepath.Join(dir, "bin")
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(binDir, "hooker"), []byte("binary"), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(dir, "hooker.log"), []byte("log line\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	hooksDir := filepath.Join(dir, "hooks")
	if err := os.MkdirAll(hooksDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(hooksDir, "myhook.sh"), []byte("#!/bin/sh"), 0o755); err != nil {
		t.Fatal(err)
	}

	fs := scanFileSystem(dir)

	if fs.HookerDir != dir {
		t.Errorf("hookerDir = %q, want %q", fs.HookerDir, dir)
	}
	if !fs.Binary.Exists {
		t.Error("binary.exists = false, want true")
	}
	if fs.Binary.SizeBytes == nil || *fs.Binary.SizeBytes != 6 {
		t.Errorf("binary.sizeBytes = %v, want 6", fs.Binary.SizeBytes)
	}
	if len(fs.Logs) != 2 {
		t.Fatalf("len(logs) = %d, want 2", len(fs.Logs))
	}
	if !fs.Logs[0].Exists {
		t.Error("logs[0] (hooker.log) exists = false, want true")
	}
	if fs.Logs[1].Exists {
		t.Error("logs[1] (build.log) exists = true, want false")
	}
	if len(fs.Hooks) != 1 {
		t.Fatalf("len(hooks) = %d, want 1", len(fs.Hooks))
	}
	if fs.Hooks[0].Name != "myhook.sh" {
		t.Errorf("hooks[0].name = %q, want myhook.sh", fs.Hooks[0].Name)
	}
}

func TestStatEntryMissingFile(t *testing.T) {
	entry := statEntry("missing", "/nonexistent/path/file")
	if entry.Exists {
		t.Error("exists = true, want false for missing file")
	}
	if entry.SizeBytes != nil {
		t.Error("sizeBytes should be nil for missing file")
	}
	if entry.Name != "missing" {
		t.Errorf("name = %q, want missing", entry.Name)
	}
}
