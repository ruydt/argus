package sqlite_test

import (
	"testing"

	"argus/internal/domain"
	"argus/internal/repository/sqlite"
)

func TestDeleteProjectByCWDCascades(t *testing.T) {
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
		if err := db.Add(domain.NormalizedEvent{
			Time:          ts,
			Agent:         "claudecode",
			Session:       session,
			CWD:           cwd,
			HookEventName: "SessionStart",
			RawPayload:    []byte(`{}`),
		}); err != nil {
			t.Fatalf("add event: %v", err)
		}
		if err := db.UpsertSession(session, "claudecode", "", "", cwd, "", ts, "", domain.SessionUsage{}); err != nil {
			t.Fatalf("upsert session: %v", err)
		}
	}

	seed("doomed-1", "/work/doomed", "2026-06-11T10:00:00Z")
	seed("doomed-2", "/work/doomed", "2026-06-11T10:05:00Z")
	seed("survivor", "/work/keep", "2026-06-11T10:10:00Z")

	sessionsDeleted, eventsDeleted, err := db.DeleteProjectByCWD("/work/doomed")
	if err != nil {
		t.Fatalf("DeleteProjectByCWD: %v", err)
	}
	if sessionsDeleted != 2 {
		t.Errorf("sessionsDeleted = %d, want 2", sessionsDeleted)
	}
	if eventsDeleted != 2 {
		t.Errorf("eventsDeleted = %d, want 2", eventsDeleted)
	}

	// Doomed project gone, survivor untouched.
	doomed, err := db.ListSessionsByCWD("/work/doomed", "")
	if err != nil {
		t.Fatalf("list doomed: %v", err)
	}
	if len(doomed) != 0 {
		t.Errorf("doomed sessions remaining = %d, want 0", len(doomed))
	}
	kept, err := db.ListSessionsByCWD("/work/keep", "")
	if err != nil {
		t.Fatalf("list kept: %v", err)
	}
	if len(kept) != 1 {
		t.Errorf("kept sessions = %d, want 1", len(kept))
	}
	keptEvents, err := db.ListBySession("survivor", 10)
	if err != nil {
		t.Fatalf("list survivor events: %v", err)
	}
	if len(keptEvents) != 1 {
		t.Errorf("survivor events = %d, want 1", len(keptEvents))
	}
}

func TestDeleteProjectByCWDNoMatch(t *testing.T) {
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			t.Errorf("close db: %v", err)
		}
	}()

	sessionsDeleted, eventsDeleted, err := db.DeleteProjectByCWD("/nope")
	if err != nil {
		t.Fatalf("DeleteProjectByCWD: %v", err)
	}
	if sessionsDeleted != 0 || eventsDeleted != 0 {
		t.Errorf("deleted = (%d, %d), want (0, 0)", sessionsDeleted, eventsDeleted)
	}
}
