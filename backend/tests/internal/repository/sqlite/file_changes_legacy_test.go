package sqlite_test

import (
	"testing"
	"time"

	"hooker/internal/domain"
)

func TestGetFileChangesBackfillsLegacyCodexApplyPatchCommand(t *testing.T) {
	db := newTestDB(t)
	addEvent(t, db, domain.NormalizedEvent{
		Time:          time.Date(2026, 6, 1, 11, 27, 35, 0, time.UTC).Format(time.RFC3339),
		Agent:         "codex",
		Session:       "sess-legacy-codex-patch",
		HookEventName: "PostToolUse",
		Tool:          "apply_patch",
		Action:        "EDIT",
		Path:          "/tmp/app.ts",
		Command:       "*** Begin Patch\n*** Update File: app.ts\n@@ -1 +1 @@\n-const title = \"Trace\"\n+const title = \"File changes\"\n*** End Patch\n",
	})

	groups, err := db.GetFileChanges("sess-legacy-codex-patch")
	if err != nil {
		t.Fatalf("GetFileChanges: %v", err)
	}
	if len(groups) != 1 {
		t.Fatalf("groups len = %d, want 1; groups: %+v", len(groups), groups)
	}
	if groups[0].Path != "/tmp/app.ts" {
		t.Fatalf("path = %q, want /tmp/app.ts", groups[0].Path)
	}
	change := groups[0].Changes[0]
	if change.Tool != "apply_patch" {
		t.Fatalf("tool = %q, want apply_patch", change.Tool)
	}
	if change.OldString != "const title = \"Trace\"" {
		t.Fatalf("old_string = %q", change.OldString)
	}
	if change.NewString != "const title = \"File changes\"" {
		t.Fatalf("new_string = %q", change.NewString)
	}

	counts, err := db.GetSessionFileChangeCounts([]string{"sess-legacy-codex-patch"})
	if err != nil {
		t.Fatalf("GetSessionFileChangeCounts: %v", err)
	}
	if counts["sess-legacy-codex-patch"] != 1 {
		t.Fatalf("file change count = %d, want 1", counts["sess-legacy-codex-patch"])
	}
}
