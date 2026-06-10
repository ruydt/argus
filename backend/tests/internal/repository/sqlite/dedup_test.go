package sqlite_test

import (
	"testing"

	"argus/internal/domain"
)

// TestDedupKeyStability verifies that adding the same NormalizedEvent twice
// results in only 1 stored event (INSERT OR IGNORE dedup behaviour).
func TestDedupKeyStability(t *testing.T) {
	db := newTestDB(t)

	e := domain.NormalizedEvent{
		Time:                "2025-01-01T00:00:00Z",
		Agent:               "claudecode",
		Session:             "sess-dedup-01",
		HookEventName:       "PreToolUse",
		TurnID:              "turn-1",
		ToolUseID:           "tuse-1",
		RawPayload:          []byte(`{}`),
		NormalizationStatus: "ok",
		NormalizerVersion:   "claudecode/1",
	}

	addEvent(t, db, e)
	// Second add must be silently ignored via INSERT OR IGNORE.
	addEvent(t, db, e)

	events, err := db.List(10)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 1 {
		t.Fatalf("expected 1 event after dedup, got %d", len(events))
	}
}

// TestDegradedEventDedup verifies that:
//   - Two degraded events with different Session values produce 2 stored rows.
//   - Two degraded events with identical Session and all other key fields produce 1 stored row.
func TestDegradedEventDedup(t *testing.T) {
	t.Run("DifferentSessionsProduceTwoRows", func(t *testing.T) {
		db := newTestDB(t)

		// Simulate what hook.go does: sha256-based Session prefix for degraded events.
		e1 := domain.NormalizedEvent{
			Time:                "2025-01-01T00:00:00Z",
			Agent:               "unknown",
			Session:             "degraded-aabbccdd00001111",
			HookEventName:       "",
			RawPayload:          []byte(`{"unknown_field":"value_one"}`),
			NormalizationStatus: "degraded",
		}
		e2 := domain.NormalizedEvent{
			Time:                "2025-01-01T00:00:01Z",
			Agent:               "unknown",
			Session:             "degraded-1122334455667788",
			HookEventName:       "",
			RawPayload:          []byte(`{"unknown_field":"value_two"}`),
			NormalizationStatus: "degraded",
		}

		addEvent(t, db, e1)
		addEvent(t, db, e2)

		events, err := db.List(10)
		if err != nil {
			t.Fatal(err)
		}
		if len(events) != 2 {
			t.Fatalf("expected 2 degraded events with different sessions, got %d", len(events))
		}
	})

	t.Run("IdenticalFieldsProduceOneRow", func(t *testing.T) {
		db := newTestDB(t)

		// Two NormalizedEvents with identical Session and all other key fields → 1 row.
		e := domain.NormalizedEvent{
			Time:                "2025-01-01T00:00:00Z",
			Agent:               "unknown",
			Session:             "degraded-ffffffffffffffff",
			HookEventName:       "",
			RawPayload:          []byte(`{"same_field":"same_value"}`),
			NormalizationStatus: "degraded",
		}

		addEvent(t, db, e)
		addEvent(t, db, e) // exact duplicate

		events, err := db.List(10)
		if err != nil {
			t.Fatal(err)
		}
		if len(events) != 1 {
			t.Fatalf("expected 1 event for identical degraded payloads, got %d", len(events))
		}
	})
}

// TestDedupKeyDifferentPromptProducesTwoRows verifies that two UserPromptSubmit
// events with the same session/turn/time but different Prompt values are stored
// as separate rows. This prevents live-vs-historical count mismatch where
// broadcast fires for both events but INSERT OR IGNORE silently drops the second.
func TestDedupKeyDifferentPromptProducesTwoRows(t *testing.T) {
	db := newTestDB(t)

	base := domain.NormalizedEvent{
		Time:                "2025-01-01T00:00:00Z",
		Agent:               "claudecode",
		Session:             "sess-prompt-01",
		HookEventName:       "UserPromptSubmit",
		TurnID:              "turn-1",
		ToolUseID:           "",
		RawPayload:          []byte(`{}`),
		NormalizationStatus: "ok",
		NormalizerVersion:   "claudecode/1",
	}

	e1 := base
	e1.Prompt = "first prompt"

	e2 := base
	e2.Prompt = "second prompt"

	addEvent(t, db, e1)
	addEvent(t, db, e2)

	events, err := db.List(10)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 2 {
		t.Fatalf("expected 2 events for different prompts, got %d", len(events))
	}
}
