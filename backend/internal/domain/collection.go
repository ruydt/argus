package domain

// CollectionScript is one script in the user's GitHub-backed collection,
// plus its local install state.
type CollectionScript struct {
	ID        string   `json:"id"` // stable key (filename without extension)
	Filename  string   `json:"filename"`
	Title     string   `json:"title"`
	Author    string   `json:"author,omitempty"`
	Purpose   string   `json:"purpose,omitempty"`
	Events    []string `json:"events,omitempty"` // one or more hook events
	Agents    []string `json:"agents,omitempty"` // agent ids the script supports
	Matcher   string   `json:"matcher,omitempty"`
	Runtime   string   `json:"runtime,omitempty"`
	OS        string   `json:"os,omitempty"` // comma list of linux | macos | windows (legacy both/posix still read)
	Origin    string   `json:"origin"`       // "bundled" | "local"
	Body      string   `json:"body"`
	Installed bool     `json:"installed"`
}

// Collection is the user's full collection.
type Collection struct {
	Scripts []CollectionScript `json:"scripts"`
	GistURL string             `json:"gist_url,omitempty"` // link to the gist on GitHub
}

// GitHubAuthStatus is what the SPA learns about the session (never the token).
type GitHubAuthStatus struct {
	Authenticated bool   `json:"authenticated"`
	Login         string `json:"login,omitempty"`
}

// DeviceCodeResponse drives the SPA device-flow modal.
type DeviceCodeResponse struct {
	UserCode        string `json:"user_code"`
	VerificationURI string `json:"verification_uri"`
	ExpiresIn       int    `json:"expires_in"`
	Interval        int    `json:"interval"`
}

// CollectionEntry is one row in the unified collection view: a script that is
// installed locally and/or saved in the gist.
type CollectionEntry struct {
	ID       string   `json:"id"`
	Filename string   `json:"filename"`
	Title    string   `json:"title"`
	Author   string   `json:"author,omitempty"`
	Events   []string `json:"events,omitempty"` // one or more hook events
	Agents   []string `json:"agents,omitempty"` // agent ids the script supports
	Runtime  string   `json:"runtime,omitempty"`
	OS       string   `json:"os,omitempty"` // comma list of linux | macos | windows (legacy both/posix still read)
	Local    bool     `json:"local"`
	Gist     bool     `json:"gist"`
}

// CollectionView is the unified collection response: local ∪ gist.
type CollectionView struct {
	Authenticated bool              `json:"authenticated"`
	Login         string            `json:"login,omitempty"`
	GistURL       string            `json:"gist_url,omitempty"`
	Entries       []CollectionEntry `json:"entries"`
}
