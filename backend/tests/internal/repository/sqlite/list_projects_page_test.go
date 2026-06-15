package sqlite_test

import (
	"testing"

	"argus/internal/domain"
	"argus/internal/repository/sqlite"
)

func TestListProjectsPage(t *testing.T) {
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			t.Errorf("close db: %v", err)
		}
	}()

	seed := func(session, cwd, ts string) {
		t.Helper()
		if err := db.UpsertSession(session, "claudecode", "", "", cwd, "", ts, "", domain.SessionUsage{}); err != nil {
			t.Fatalf("upsert session: %v", err)
		}
	}

	// 3 distinct projects; last_activity DESC => p3, p2, p1.
	seed("a", "/work/p1", "2026-06-11T10:00:00Z")
	seed("b", "/work/p2", "2026-06-11T11:00:00Z")
	seed("c", "/other/p3", "2026-06-11T12:00:00Z")

	t.Run("paginates by activity desc", func(t *testing.T) {
		page1, total, err := db.ListProjectsPage("", 1, 2)
		if err != nil {
			t.Fatalf("page1: %v", err)
		}
		if total != 3 {
			t.Fatalf("total = %d, want 3", total)
		}
		if len(page1) != 2 {
			t.Fatalf("page1 len = %d, want 2", len(page1))
		}
		if page1[0].CWD != "/other/p3" || page1[1].CWD != "/work/p2" {
			t.Fatalf("page1 order = %q,%q", page1[0].CWD, page1[1].CWD)
		}

		page2, _, err := db.ListProjectsPage("", 2, 2)
		if err != nil {
			t.Fatalf("page2: %v", err)
		}
		if len(page2) != 1 || page2[0].CWD != "/work/p1" {
			t.Fatalf("page2 = %+v, want only /work/p1", page2)
		}
	})

	t.Run("search filters by cwd substring, total reflects matches", func(t *testing.T) {
		got, total, err := db.ListProjectsPage("work", 1, 20)
		if err != nil {
			t.Fatalf("search: %v", err)
		}
		if total != 2 {
			t.Fatalf("total = %d, want 2", total)
		}
		if len(got) != 2 {
			t.Fatalf("len = %d, want 2", len(got))
		}
		for _, p := range got {
			if p.CWD != "/work/p1" && p.CWD != "/work/p2" {
				t.Fatalf("unexpected cwd %q", p.CWD)
			}
		}
	})

	t.Run("search is case-insensitive", func(t *testing.T) {
		got, total, err := db.ListProjectsPage("OTHER", 1, 20)
		if err != nil {
			t.Fatalf("search: %v", err)
		}
		if total != 1 || len(got) != 1 || got[0].CWD != "/other/p3" {
			t.Fatalf("got %+v total %d, want only /other/p3", got, total)
		}
	})
}
