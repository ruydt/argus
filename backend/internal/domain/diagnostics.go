package domain

type Diagnostics struct {
	Version DiagnosticsVersion `json:"version"`
	Health  DiagnosticsHealth  `json:"health"`
	Storage DiagnosticsStorage `json:"storage"`
	Agents  []DiagnosticsAgent `json:"agents"`
}

type DiagnosticsVersion struct {
	Version   string `json:"version"`
	Commit    string `json:"commit"`
	BuildDate string `json:"buildDate"`
}

type DiagnosticsHealth struct {
	Live   bool   `json:"live"`
	Ready  bool   `json:"ready"`
	Reason string `json:"reason,omitempty"`
}

type DiagnosticsStorage struct {
	DBPath        string  `json:"dbPath"`
	DBSizeBytes   *int64  `json:"dbSizeBytes"`
	DBSizeReason  string  `json:"dbSizeReason,omitempty"`
	TotalEvents   int     `json:"totalEvents"`
	TotalSessions int     `json:"totalSessions"`
	LatestEventAt *string `json:"latestEventAt"`
}

type DiagnosticsStorageStats struct {
	TotalEvents   int
	TotalSessions int
	LatestEventAt *string
}

type DiagnosticsAgent struct {
	ID                string   `json:"id"`
	Label             string   `json:"label"`
	EventCount        int      `json:"eventCount"`
	LastSeenAt        *string  `json:"lastSeenAt"`
	DegradedCount     int      `json:"degradedCount"`
	NormalizerVersion *string  `json:"normalizerVersion"`
	HookConfigStatus  string   `json:"hookConfigStatus"`
	HookConfigReason  string   `json:"hookConfigReason,omitempty"`
	Status            string   `json:"status"`
	Warnings          []string `json:"warnings"`
}

type DiagnosticsAgentStats struct {
	Agent             string
	EventCount        int
	LastSeenAt        *string
	DegradedCount     int
	NormalizerVersion *string
}

type DiagnosticsHookConfig struct {
	Agent  string
	Path   string
	Status string
	Reason string
}
