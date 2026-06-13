package sqlite

import (
	"slices"
	"strings"
	"testing"

	"argus/internal/domain"
)

// mergeChildProjectsQuadratic is the original O(n²) implementation kept
// verbatim as a reference for the equivalence test.
func mergeChildProjectsQuadratic(projects []domain.Project) []domain.Project {
	slices.SortStableFunc(projects, func(a, b domain.Project) int {
		return len(a.CWD) - len(b.CWD)
	})

	merged := make([]domain.Project, 0, len(projects))
	for _, p := range projects {
		parentIdx := -1
		for i := range merged {
			// Require parent to have ≥4 path components so home dirs like
			// /Users/foo don't absorb all projects as a side-effect of prefix matching.
			if merged[i].CWD != "" &&
				len(strings.Split(merged[i].CWD, "/")) >= 4 &&
				strings.HasPrefix(p.CWD, merged[i].CWD+"/") {
				parentIdx = i // keep updating to get deepest match
			}
		}
		if parentIdx >= 0 {
			par := &merged[parentIdx]
			par.SessionCount += p.SessionCount
			par.TotalTokens += p.TotalTokens
			par.LiveCount += p.LiveCount
			if p.LastActivity > par.LastActivity {
				par.LastActivity = p.LastActivity
			}
			seen := make(map[string]struct{}, len(par.Agents))
			for _, a := range par.Agents {
				seen[a] = struct{}{}
			}
			for _, a := range p.Agents {
				if _, ok := seen[a]; !ok {
					par.Agents = append(par.Agents, a)
				}
			}
		} else {
			merged = append(merged, p)
		}
	}

	slices.SortStableFunc(merged, func(a, b domain.Project) int {
		switch {
		case a.LastActivity > b.LastActivity:
			return -1
		case a.LastActivity < b.LastActivity:
			return 1
		default:
			return 0
		}
	})
	return merged
}

func TestMergeChildProjectsMatchesQuadratic(t *testing.T) {
	fixtures := [][]domain.Project{
		// nested chain with eligible (≥4 components) and ineligible parents
		{
			{CWD: "/Users/dev", SessionCount: 1, LastActivity: "2026-01-01T00:00:00Z", Agents: []string{"codex"}},
			{CWD: "/Users/dev/work/app", SessionCount: 2, LastActivity: "2026-01-03T00:00:00Z", Agents: []string{"claudecode"}},
			{CWD: "/Users/dev/work/app/frontend", SessionCount: 3, LastActivity: "2026-01-02T00:00:00Z", Agents: []string{"claudecode"}},
			{CWD: "/Users/dev/work/app/backend", SessionCount: 4, LastActivity: "2026-01-05T00:00:00Z", Agents: []string{"codex"}},
			{CWD: "/Users/dev/work/other", SessionCount: 5, LastActivity: "2026-01-04T00:00:00Z", Agents: []string{"codex"}},
		},
		// sibling prefixes that are NOT path parents (/foo vs /foobar)
		{
			{CWD: "/a/b/c/foo", SessionCount: 1, LastActivity: "2026-01-01T00:00:00Z"},
			{CWD: "/a/b/c/foobar", SessionCount: 2, LastActivity: "2026-01-02T00:00:00Z"},
			{CWD: "/a/b/c/foo/sub", SessionCount: 3, LastActivity: "2026-01-03T00:00:00Z"},
		},
		// deep nesting: grandchild merges into deepest eligible ancestor
		{
			{CWD: "/u/x/p/root", SessionCount: 1, LastActivity: "2026-01-01T00:00:00Z"},
			{CWD: "/u/x/p/root/mid", SessionCount: 2, LastActivity: "2026-01-02T00:00:00Z"},
			{CWD: "/u/x/p/root/mid/leaf", SessionCount: 3, LastActivity: "2026-01-03T00:00:00Z"},
		},
		{}, // empty
	}

	for fi, fixture := range fixtures {
		a := append([]domain.Project(nil), fixture...)
		b := append([]domain.Project(nil), fixture...)
		got := mergeChildProjects(a)
		want := mergeChildProjectsQuadratic(b)
		if len(got) != len(want) {
			t.Fatalf("fixture %d: len got=%d want=%d\ngot=%+v\nwant=%+v", fi, len(got), len(want), got, want)
		}
		for i := range got {
			g, w := got[i], want[i]
			if g.CWD != w.CWD || g.SessionCount != w.SessionCount ||
				g.TotalTokens != w.TotalTokens || g.LiveCount != w.LiveCount ||
				g.LastActivity != w.LastActivity || len(g.Agents) != len(w.Agents) {
				t.Errorf("fixture %d row %d:\ngot  %+v\nwant %+v", fi, i, g, w)
			}
		}
	}
}
