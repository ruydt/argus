package sqlite

import (
	"strings"
	"testing"
)

func TestExplainCreatedAtPredicate(t *testing.T) {
	d, err := New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = d.Close() }()

	rows, err := d.db.Query("EXPLAIN QUERY PLAN SELECT COUNT(*) FROM hook_events WHERE created_at >= ?", "2026-01-01T00:00:00Z")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = rows.Close() }()

	var plans []string
	for rows.Next() {
		var id, parent, notused int
		var detail string
		if err := rows.Scan(&id, &parent, &notused, &detail); err != nil {
			t.Fatal(err)
		}
		t.Logf("plan: %s", detail)
		plans = append(plans, detail)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}

	for _, p := range plans {
		if strings.Contains(strings.ToUpper(p), "INDEX") {
			return
		}
	}
	t.Errorf("expected index usage for created_at predicate, got plans: %v", plans)
}
