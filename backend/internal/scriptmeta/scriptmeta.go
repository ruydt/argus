// Package scriptmeta parses the `// @argus-meta` … `// @end` header that argus
// scripts carry, so saved copies keep their title/event/runtime. The format
// mirrors the frontend's argusMeta.ts exactly.
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
type Meta struct {
	Title   string
	Author  string
	Event   string
	Runtime string // kept for backward compat with old scripts that declare // runtime:
	Matcher string
	Purpose string
	Command string // full invocation e.g. "node hook.js --flag"
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
		case "event":
			m.Event = value
		case "runtime":
			m.Runtime = value
		case "matcher":
			m.Matcher = value
		case "purpose":
			m.Purpose = value
		case "command":
			m.Command = value
		}
	}
	return m
}
