// Package scriptmeta parses the `// @argus-meta` … `// @end` header that argus
// scripts carry, so saved copies keep their title/events/agents/runtime. The
// format mirrors the frontend's argusMeta.ts exactly.
package scriptmeta

import (
	"regexp"
	"strings"
)

// @argus-meta uses `//` comments in JS scripts and `#` comments in py/sh. Both
// marker styles are accepted on read.
const (
	metaTag = "@argus-meta"
	endTag  = "@end"
)

// findTag returns the earliest index of `// <tag>` or `# <tag>`, or -1.
func findTag(body, tag string) int {
	i1 := strings.Index(body, "// "+tag)
	i2 := strings.Index(body, "# "+tag)
	switch {
	case i1 == -1:
		return i2
	case i2 == -1:
		return i1
	default:
		return min(i1, i2)
	}
}

// Meta holds the recognised header fields. Absent fields stay empty.
//
// Events and Agents are lists: a script may hook several events and target
// several agents. The legacy singular `event:` header still parses (folded into
// Events) so older scripts and gist copies keep working.
type Meta struct {
	Title   string
	Author  string
	Events  []string // one or more hook events
	Agents  []string // agent ids the script supports (claudecode, codex, …)
	Runtime string   // kept for backward compat with old scripts that declare // runtime:
	Matcher string
	Purpose string
	Command string // full invocation e.g. "node hook.js --flag"
	OS      string // comma list of linux | macos | windows (legacy both/posix still parsed)
}

// SplitCSV parses a comma-separated header value into trimmed, de-duplicated,
// order-preserving tokens. Empty input yields nil.
func SplitCSV(s string) []string {
	var out []string
	seen := map[string]bool{}
	for _, part := range strings.Split(s, ",") {
		v := strings.TrimSpace(part)
		if v == "" || seen[v] {
			continue
		}
		seen[v] = true
		out = append(out, v)
	}
	return out
}

var fieldLine = regexp.MustCompile(`^(?://|#)\s*(\w+):\s*(.*)$`)

// EnsureAuthor stamps `<prefix> author: <author>` into the meta block when the
// script doesn't already declare one — used on publish so a shared script always
// carries attribution (the publisher's GitHub login). The comment prefix matches
// the existing meta block (// for JS, # for py/sh). Scripts with an author, or
// with no meta block at all, are returned unchanged.
func EnsureAuthor(body, author string) string {
	if author == "" || Parse(body).Author != "" {
		return body
	}
	start := findTag(body, metaTag)
	if start == -1 {
		return body
	}
	prefix := "//"
	if strings.HasPrefix(body[start:], "# ") {
		prefix = "#"
	}
	nl := strings.Index(body[start:], "\n")
	if nl == -1 {
		return body
	}
	at := start + nl + 1
	return body[:at] + prefix + " author: " + author + "\n" + body[at:]
}

// Parse extracts the argus-meta header from a script body. Returns a zero Meta
// when the header is missing or malformed.
func Parse(body string) Meta {
	start := findTag(body, metaTag)
	end := findTag(body, endTag)
	if start == -1 || end == -1 || end < start {
		return Meta{}
	}
	var m Meta
	for _, line := range strings.Split(body[start:end], "\n") {
		match := fieldLine.FindStringSubmatch(strings.TrimSpace(line))
		if match == nil {
			continue
		}
		value := strings.TrimSpace(match[2])
		switch match[1] {
		case "title":
			m.Title = value
		case "author":
			m.Author = value
		case "events", "event": // `event` is the legacy singular form
			m.Events = append(m.Events, SplitCSV(value)...)
		case "agents":
			m.Agents = append(m.Agents, SplitCSV(value)...)
		case "runtime":
			m.Runtime = value
		case "matcher":
			m.Matcher = value
		case "purpose":
			m.Purpose = value
		case "command":
			m.Command = value
		case "os":
			m.OS = value
		}
	}
	m.Events = SplitCSV(strings.Join(m.Events, ","))
	m.Agents = SplitCSV(strings.Join(m.Agents, ","))
	return m
}
