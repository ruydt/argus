// Package ignore provides gitignore-style privacy exclusions for hook ingestion.
//
// Matching applies only to domain.NormalizedEvent.CWD and domain.NormalizedEvent.Path.
// Sensitive fields (Prompt, ToolResultStdout, OldString, NewString, RawPayload, Command)
// are never read by the matcher. Reasons returned from MatchEvent identify only the
// matched pattern line.
package ignore

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"argus/internal/domain"
)

// rule represents a single parsed pattern line from the ignore file.
type rule struct {
	pattern  string   // the original pattern text (for reason messages)
	lineNum  int      // 1-based line number (for reason messages)
	negate   bool     // true when the pattern starts with !
	dirOnly  bool     // true when the pattern ends with /
	segments []string // path segments after splitting on /
}

// Matcher holds the parsed set of ignore rules loaded from a file.
type Matcher struct {
	rules []rule
}

type LoadStatus struct {
	Path               string
	Status             string
	ActivePatternCount int
}

// Load parses the ignore file at path and returns a Matcher.
// If path does not exist, Load returns an empty Matcher (no error) — a missing
// default file is treated as no rules (D-01 / T-03-02-04: missing default is safe).
// If path is provided but cannot be read (permissions, I/O error), Load returns an error
// so the caller can fail with an actionable message.
func Load(path string) (*Matcher, error) {
	m, _, err := LoadWithStatus(path)
	return m, err
}

func LoadWithStatus(path string) (*Matcher, LoadStatus, error) {
	f, err := os.Open(path) //nolint:gosec // user-supplied ignore file path is intentional
	if err != nil {
		if os.IsNotExist(err) {
			return &Matcher{}, LoadStatus{Path: path, Status: "missing_ok"}, nil
		}
		return nil, LoadStatus{Path: path, Status: "error"}, fmt.Errorf("open ignore file %q: %w", path, err)
	}
	defer f.Close()

	var rules []rule
	scanner := bufio.NewScanner(f)
	lineNum := 0
	for scanner.Scan() {
		lineNum++
		line := scanner.Text()

		// Skip blank lines and comments (D-05).
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}

		r := parseRule(trimmed, lineNum)
		rules = append(rules, r)
	}
	if err := scanner.Err(); err != nil {
		return nil, LoadStatus{Path: path, Status: "error"}, fmt.Errorf("read ignore file %q: %w", path, err)
	}

	matcher := &Matcher{rules: rules}
	return matcher, LoadStatus{Path: path, Status: "loaded", ActivePatternCount: matcher.RuleCount()}, nil
}

func (m *Matcher) RuleCount() int {
	if m == nil {
		return 0
	}
	return len(m.rules)
}

// parseRule converts a trimmed, non-comment pattern line into a rule.
func parseRule(pattern string, lineNum int) rule {
	r := rule{pattern: pattern, lineNum: lineNum}

	// Negation (D-05).
	if strings.HasPrefix(pattern, "!") {
		r.negate = true
		pattern = pattern[1:]
	}

	// Directory-only pattern (D-05): trailing slash.
	if strings.HasSuffix(pattern, "/") {
		r.dirOnly = true
		pattern = strings.TrimSuffix(pattern, "/")
	}

	r.segments = splitPath(pattern)
	return r
}

// MatchEvent reports whether the event's CWD or Path is matched by any rule.
// Last-match-wins semantics apply: negation rules can un-match an earlier positive rule.
// Only CWD and Path are inspected — no other fields are read (D-02).
// The returned reason identifies the matching pattern line without including any raw
// payload, prompt text, tool output, diffs, or command output (D-04).
func (m *Matcher) MatchEvent(e domain.NormalizedEvent) (bool, string) {
	if len(m.rules) == 0 {
		return false, ""
	}

	// Collect the candidate strings: non-empty CWD and Path only.
	var candidates []string
	if e.CWD != "" {
		candidates = append(candidates, e.CWD)
	}
	if e.Path != "" {
		candidates = append(candidates, e.Path)
	}
	if len(candidates) == 0 {
		return false, ""
	}

	matched := false
	var matchedReason string

	for _, r := range m.rules {
		for _, candidate := range candidates {
			if matchesPath(r, candidate) {
				if r.negate {
					matched = false
					matchedReason = ""
				} else {
					matched = true
					matchedReason = fmt.Sprintf("pattern %q (line %d)", r.pattern, r.lineNum)
				}
				// A match on any candidate counts; continue to apply later negation rules.
				break
			}
		}
	}

	return matched, matchedReason
}

// matchesPath reports whether rule r matches candidate (a file path string).
func matchesPath(r rule, candidate string) bool {
	// Clean the candidate to a consistent slash-separated form.
	candidate = filepath.ToSlash(filepath.Clean(candidate))
	patternSegs := r.segments

	if len(patternSegs) == 0 {
		return false
	}

	// For directory-only patterns, match if the candidate path contains the directory
	// component, handling both exact matches and prefix matches.
	// e.g. "node_modules/" matches:
	//   /home/user/project/node_modules
	//   /home/user/project/node_modules/lodash/index.js
	if r.dirOnly {
		return matchDirPattern(patternSegs, candidate)
	}

	// For regular patterns, match against the full candidate path.
	return matchGlob(patternSegs, splitPath(candidate))
}

// matchDirPattern matches a directory-only pattern against a candidate path.
// It checks whether any path prefix or infix matches the pattern segments.
func matchDirPattern(patternSegs []string, candidate string) bool {
	candidateSegs := splitPath(candidate)
	if len(candidateSegs) == 0 {
		return false
	}

	// Check if the pattern matches a contiguous slice of the candidate segments.
	// For absolute patterns (starting with /), require prefix match.
	if len(patternSegs) > 0 && patternSegs[0] == "" {
		// Absolute pattern: match from start.
		return matchGlob(patternSegs[1:], candidateSegs)
	}

	// Relative pattern: try anchoring the pattern at every start offset.
	// Use matchGlobPrefix so ** correctly matches zero or more intermediate
	// segments (e.g. frontend/**/dist matches frontend/dist) and so the
	// pattern does not need to consume the full remaining candidate
	// (directory pattern "node_modules" matches a prefix of any deeper path).
	for start := 0; start < len(candidateSegs); start++ {
		if matchGlobPrefix(patternSegs, candidateSegs[start:]) {
			return true
		}
	}
	return false
}

// matchGlobPrefix reports whether pattern matches a *prefix* of candidate
// (i.e. the pattern is fully consumed, and zero or more candidate segments
// may remain after the match). This is used for directory-only patterns where
// the matched directory may have descendants.
func matchGlobPrefix(pattern, candidate []string) bool {
	return matchGlobPrefixRec(pattern, candidate, 0, 0)
}

func matchGlobPrefixRec(pattern, candidate []string, pi, ci int) bool {
	for pi < len(pattern) {
		if ci >= len(candidate) {
			// Pattern not exhausted but candidate is — only succeeds if remaining
			// pattern is all **.
			for pi < len(pattern) {
				if pattern[pi] != "**" {
					return false
				}
				pi++
			}
			return true
		}
		if pattern[pi] == "**" {
			// ** matches zero or more candidate segments.
			for skip := 0; ci+skip <= len(candidate); skip++ {
				if matchGlobPrefixRec(pattern, candidate, pi+1, ci+skip) {
					return true
				}
			}
			return false
		}
		if !matchSegment(pattern[pi], candidate[ci]) {
			return false
		}
		pi++
		ci++
	}
	// Pattern fully consumed — candidate may have remaining segments (prefix match OK).
	return true
}

// matchGlob matches pattern segments against candidate segments, supporting ** for
// zero or more path segments and * for any single-segment substring.
func matchGlob(patternSegs, candidateSegs []string) bool {
	return matchGlobDP(patternSegs, candidateSegs)
}

// matchGlobDP uses dynamic programming to match pattern segments that may contain **
// against candidate segments.
func matchGlobDP(pattern, candidate []string) bool {
	// dp[i][j] = can pattern[:i] match candidate[:j]?
	// We use a simple recursive approach with memoization via a closure.
	return matchGlobRec(pattern, candidate, 0, 0)
}

func matchGlobRec(pattern, candidate []string, pi, ci int) bool {
	for pi < len(pattern) && ci < len(candidate) {
		if pattern[pi] == "**" {
			// ** can match zero or more path segments.
			// Try consuming 0, 1, 2, ... candidate segments.
			for skip := 0; ci+skip <= len(candidate); skip++ {
				if matchGlobRec(pattern, candidate, pi+1, ci+skip) {
					return true
				}
			}
			return false
		}
		if !matchSegment(pattern[pi], candidate[ci]) {
			return false
		}
		pi++
		ci++
	}
	// Consume any trailing ** patterns (** matches zero segments).
	for pi < len(pattern) && pattern[pi] == "**" {
		pi++
	}
	return pi == len(pattern) && ci == len(candidate)
}


// matchSegment matches a single path segment against a glob pattern that may
// contain * (zero or more non-slash characters).
func matchSegment(pattern, segment string) bool {
	// Empty pattern only matches empty segment.
	if pattern == "" {
		return segment == ""
	}
	// No wildcard: exact match.
	if !strings.Contains(pattern, "*") {
		return pattern == segment
	}
	// Split on * and check prefix/infix/suffix.
	parts := strings.Split(pattern, "*")
	pos := 0
	for i, part := range parts {
		if i == 0 {
			// First part must be a prefix.
			if !strings.HasPrefix(segment[pos:], part) {
				return false
			}
			pos += len(part)
			continue
		}
		if i == len(parts)-1 {
			// Last part must be a suffix.
			return strings.HasSuffix(segment, part)
		}
		// Middle part: find next occurrence.
		idx := strings.Index(segment[pos:], part)
		if idx < 0 {
			return false
		}
		pos += idx + len(part)
	}
	return true
}

// splitPath splits a slash-separated path into segments, preserving a leading empty
// string for absolute paths so callers can detect absolute vs. relative patterns.
func splitPath(path string) []string {
	path = filepath.ToSlash(path)
	parts := strings.Split(path, "/")
	// Remove trailing empty segment that results from a trailing slash.
	if len(parts) > 0 && parts[len(parts)-1] == "" {
		parts = parts[:len(parts)-1]
	}
	return parts
}
