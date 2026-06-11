package service

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestScanFileSystemPopulatesEntries(t *testing.T) {
	dir := t.TempDir()

	binDir := filepath.Join(dir, "bin")
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(binDir, "argus"), []byte("binary"), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(dir, "argus.log"), []byte("log line\n"), 0o644); err != nil {
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

	if fs.ArgusDir != dir {
		t.Errorf("argusDir = %q, want %q", fs.ArgusDir, dir)
	}
	if !fs.Binary.Exists {
		t.Error("binary.exists = false, want true")
	}
	if fs.Binary.SizeBytes == nil || *fs.Binary.SizeBytes != 6 {
		t.Errorf("binary.sizeBytes = %v, want 6", fs.Binary.SizeBytes)
	}
	if len(fs.Logs) != 3 {
		t.Fatalf("len(logs) = %d, want 3", len(fs.Logs))
	}
	if !fs.Logs[0].Exists {
		t.Error("logs[0] (argus.log) exists = false, want true")
	}
	if fs.Logs[1].Exists {
		t.Error("logs[1] (build.log) exists = true, want false")
	}
	if fs.Logs[2].Exists {
		t.Error("logs[2] (hook-scripts.log) exists = true, want false")
	}
	if len(fs.Hooks) != 1 {
		t.Fatalf("len(hooks) = %d, want 1", len(fs.Hooks))
	}
	if fs.Hooks[0].Name != "myhook.sh" {
		t.Errorf("hooks[0].name = %q, want myhook.sh", fs.Hooks[0].Name)
	}
}

func TestScanDirCapsEntriesNewestFirst(t *testing.T) {
	dir := t.TempDir()
	// maxDirEntries+50 files with strictly increasing mtimes.
	base := time.Now().Add(-24 * time.Hour)
	for i := 0; i < maxDirEntries+50; i++ {
		path := filepath.Join(dir, fmt.Sprintf("f%04d.txt", i))
		if err := os.WriteFile(path, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
		mtime := base.Add(time.Duration(i) * time.Second)
		if err := os.Chtimes(path, mtime, mtime); err != nil {
			t.Fatal(err)
		}
	}

	entries, total := scanDir(dir)
	if total != maxDirEntries+50 {
		t.Errorf("total = %d, want %d", total, maxDirEntries+50)
	}
	if len(entries) != maxDirEntries {
		t.Fatalf("len(entries) = %d, want %d", len(entries), maxDirEntries)
	}
	// Newest file (highest index) must be first; oldest 50 must be dropped.
	if entries[0].Name != fmt.Sprintf("f%04d.txt", maxDirEntries+49) {
		t.Errorf("entries[0].name = %q, want newest file", entries[0].Name)
	}
	last := entries[len(entries)-1].Name
	if last != "f0050.txt" {
		t.Errorf("entries[last].name = %q, want f0050.txt (oldest 50 dropped)", last)
	}
}

func TestScanDirUnderCapReturnsAll(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"a.txt", "b.txt"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	entries, total := scanDir(dir)
	if total != 2 || len(entries) != 2 {
		t.Errorf("entries=%d total=%d, want 2/2", len(entries), total)
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
