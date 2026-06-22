package ignore_test

import (
	"testing"

	"argus/internal/privacy/ignore"
)

// TestRules_ReturnsActivePatternsInOrder verifies Rules() exposes the active
// patterns in file order with 1-based source line numbers, excluding comments and
// blank lines (which are dropped at parse time).
func TestRules_ReturnsActivePatternsInOrder(t *testing.T) {
	content := "# comment\nnode_modules/\n\n*.env\n!important.env\n"
	m, err := ignore.Load(writeIgnoreFile(t, content))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	rules := m.Rules()
	if len(rules) != 3 {
		t.Fatalf("Rules() len = %d, want 3 (comments/blank lines excluded)", len(rules))
	}
	if rules[0].Pattern != "node_modules/" || rules[0].Line != 2 || rules[0].Negate {
		t.Errorf("rule[0] = %+v, want {node_modules/ line 2 negate false}", rules[0])
	}
	if rules[1].Pattern != "*.env" || rules[1].Line != 4 || rules[1].Negate {
		t.Errorf("rule[1] = %+v, want {*.env line 4 negate false}", rules[1])
	}
	if rules[2].Pattern != "!important.env" || rules[2].Line != 5 || !rules[2].Negate {
		t.Errorf("rule[2] = %+v, want {!important.env line 5 negate true}", rules[2])
	}
}

// TestRules_EmptyMatcher verifies an empty/missing ignore file yields no rules.
func TestRules_EmptyMatcher(t *testing.T) {
	m, err := ignore.Load(writeIgnoreFile(t, ""))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got := m.Rules(); len(got) != 0 {
		t.Errorf("Rules() on empty matcher = %v, want empty", got)
	}
}
