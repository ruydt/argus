package sqlite_test

import (
	"testing"

	"argus/internal/repository/sqlite"
)

func TestMigration018DropsUsageSchema(t *testing.T) {
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	// session_model_usage must not exist.
	var n int
	if err := db.RawDB().QueryRow(
		`SELECT count(*) FROM sqlite_master WHERE type='table' AND name='session_model_usage'`,
	).Scan(&n); err != nil {
		t.Fatalf("query master: %v", err)
	}
	if n != 0 {
		t.Fatalf("session_model_usage table still present")
	}

	// sessions must not have a turns column.
	rows, err := db.RawDB().Query(`SELECT name FROM pragma_table_info('sessions')`)
	if err != nil {
		t.Fatalf("pragma: %v", err)
	}
	defer rows.Close()
	for rows.Next() {
		var col string
		if err := rows.Scan(&col); err != nil {
			t.Fatalf("scan: %v", err)
		}
		if col == "turns" || col == "input_tokens" {
			t.Fatalf("usage column %q still present on sessions", col)
		}
	}
}
