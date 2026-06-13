package domain

// ScriptCatalog is what a ScriptSource offers, plus per-request install state.
type ScriptCatalog struct {
	Packages []ScriptPackage `json:"packages"`
	Bundles  []ScriptBundle  `json:"bundles"`
}

// ScriptPackage is one hook script's metadata, body, and install state.
type ScriptPackage struct {
	ID               string   `json:"id"`
	Filename         string   `json:"filename"`
	Version          string   `json:"version"`
	Title            string   `json:"title"`
	Purpose          string   `json:"purpose"`
	Event            string   `json:"event"`
	Matcher          string   `json:"matcher,omitempty"`
	Runtime          string   `json:"runtime"` // node | python3 | sh
	Agents           []string `json:"agents"`
	Author           string   `json:"author"`
	Source           string   `json:"source"`   // provenance URL
	Tier             string   `json:"tier"`     // official | community
	Checksum         string   `json:"checksum"` // sha256:<hex> of Body (loader-computed)
	Body             string   `json:"body"`     // full script text (read-only display)
	Installed        bool     `json:"installed"`
	RuntimeAvailable bool     `json:"runtime_available"`
}

// ScriptBundle is a named set of package ids installed together.
type ScriptBundle struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Packages    []string `json:"packages"`
}
