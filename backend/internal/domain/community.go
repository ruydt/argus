package domain

import (
	"encoding/json"
	"strings"
)

// CommunityScript is one entry in the public registry's index.json, plus the
// per-request install/runtime state argus fills in. The registry is external
// and read-only; nothing here is persisted to SQLite.
type CommunityScript struct {
	ID               string   `json:"id"`
	Author           string   `json:"author"`
	Title            string   `json:"title"`
	Purpose          string   `json:"purpose,omitempty"`
	Events           []string `json:"events,omitempty"` // one or more hook events
	Agents           []string `json:"agents,omitempty"` // agent ids the script supports
	Matcher          string   `json:"matcher,omitempty"`
	Runtime          string   `json:"runtime,omitempty"` // node | python3 | sh — security gate
	Command          string   `json:"command,omitempty"` // full invocation e.g. "node hook.js --flag"
	OS               string   `json:"os,omitempty"`      // comma list of linux | macos | windows (legacy both/posix still read)
	Tier             string   `json:"tier"`              // always "community"
	SHA256           string   `json:"sha256"`            // bare hex of the file body
	Source           string   `json:"source"`            // path within the registry repo
	PublishedAt      string   `json:"published_at,omitempty"`
	Installed        bool     `json:"installed"`         // filled by handler
	RuntimeAvailable bool     `json:"runtime_available"` // filled by handler
}

// UnmarshalJSON keeps reading the legacy singular `event` field from older
// registry index.json entries, folding it into Events so the rest of the app
// only deals with the list form.
func (c *CommunityScript) UnmarshalJSON(b []byte) error {
	type alias CommunityScript
	aux := struct {
		*alias
		Event string `json:"event"`
	}{alias: (*alias)(c)}
	if err := json.Unmarshal(b, &aux); err != nil {
		return err
	}
	if len(c.Events) == 0 && aux.Event != "" {
		c.Events = SplitMetaCSV(aux.Event)
	}
	return nil
}

// SplitMetaCSV parses a comma-separated value into trimmed, de-duplicated,
// order-preserving tokens. It mirrors scriptmeta.SplitCSV but lives here so the
// dependency-free domain layer can normalise list fields on its own.
func SplitMetaCSV(s string) []string {
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
