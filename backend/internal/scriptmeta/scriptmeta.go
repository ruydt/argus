// Package scriptmeta parses the `// @argus-meta` … `// @end` header that argus
// scripts carry, so saved copies keep their title/events/agents/runtime. The
// format mirrors the frontend's argusMeta.ts exactly.
package scriptmeta

import (
	"regexp"
	"strings"
)

const (
	metaStart = "// @argus-meta"
	metaEnd   = "// @end"
)

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

var fieldLine = regexp.MustCompile(`^//\s*(\w+):\s*(.*)$`)

// EnsureAuthor stamps `// author: <author>` into the meta block when the script
// doesn't already declare one — used on publish so a shared script always
// carries attribution (the publisher's GitHub login). Scripts with an author,
// or with no meta block at all, are returned unchanged.
func EnsureAuthor(body, author string) string {
	if author == "" || Parse(body).Author != "" {
		return body
	}
	start := strings.Index(body, metaStart)
	if start == -1 {
		return body
	}
	nl := strings.Index(body[start:], "\n")
	if nl == -1 {
		return body
	}
	at := start + nl + 1
	return body[:at] + "// author: " + author + "\n" + body[at:]
}

// Parse extracts the argus-meta header from a script body. Returns a zero Meta
// when the header is missing or malformed.
func Parse(body string) Meta {
	start := strings.Index(body, metaStart)
	end := strings.Index(body, metaEnd)
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
