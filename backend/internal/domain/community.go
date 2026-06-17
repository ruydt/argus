package domain

// CommunityScript is one entry in the public registry's index.json, plus the
// per-request install/runtime state argus fills in. The registry is external
// and read-only; nothing here is persisted to SQLite.
type CommunityScript struct {
	ID               string `json:"id"`
	Author           string `json:"author"`
	Title            string `json:"title"`
	Purpose          string `json:"purpose,omitempty"`
	Event            string `json:"event,omitempty"`
	Matcher          string `json:"matcher,omitempty"`
	Runtime          string `json:"runtime,omitempty"` // node | python3 | sh — security gate
	Command          string `json:"command,omitempty"` // full invocation e.g. "node hook.js --flag"
	OS               string `json:"os,omitempty"`      // both | macos | windows — platform support
	Tier             string `json:"tier"`              // always "community"
	SHA256           string `json:"sha256"`            // bare hex of the file body
	Source           string `json:"source"`            // path within the registry repo
	PublishedAt      string `json:"published_at,omitempty"`
	Installed        bool   `json:"installed"`         // filled by handler
	RuntimeAvailable bool   `json:"runtime_available"` // filled by handler
}
