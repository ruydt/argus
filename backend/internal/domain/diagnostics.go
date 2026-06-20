package domain

type DiagnosticsVersion struct {
	Version         string `json:"version"`
	Commit          string `json:"commit"`
	BuildDate       string `json:"buildDate"`
	BinarySizeBytes *int64 `json:"binarySizeBytes"`
}

type DiagnosticsHealth struct {
	Live   bool   `json:"live"`
	Ready  bool   `json:"ready"`
	Reason string `json:"reason,omitempty"`
}

type DiagnosticsStorageStats struct {
	TotalEvents   int
	TotalSessions int
	LatestEventAt *string
}

type DiagnosticsStorage struct {
	DBPath        string  `json:"dbPath"`
	DBSizeBytes   *int64  `json:"dbSizeBytes"`
	DBSizeReason  string  `json:"dbSizeReason,omitempty"`
	TotalEvents   int     `json:"totalEvents"`
	TotalSessions int     `json:"totalSessions"`
	LatestEventAt *string `json:"latestEventAt"`
}

type DiagnosticsRuntime struct {
	StartedAt       string `json:"startedAt"`
	UptimeSeconds   int64  `json:"uptimeSeconds"`
	HookRequests    int64  `json:"hookRequests"`
	IngestionErrors int64  `json:"ingestionErrors"`
}

type DiagnosticsDBHealth struct {
	JournalMode      string `json:"journalMode"`
	PageCount        int64  `json:"pageCount"`
	PageSizeBytes    int64  `json:"pageSizeBytes"`
	WALSizeBytes     *int64 `json:"walSizeBytes"`
	MigrationVersion int    `json:"migrationVersion"`
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
	EventsLastHour    int      `json:"eventsLastHour"`
	EventsLast24h     int      `json:"eventsLast24h"`
}

type DiagnosticsAgentStats struct {
	Agent             string
	EventCount        int
	LastSeenAt        *string
	DegradedCount     int
	NormalizerVersion *string
	EventsLastHour    int
	EventsLast24h     int
}

type DiagnosticsHookConfig struct {
	Agent  string
	Label  string
	Path   string
	Status string
	Reason string
}

type DiagnosticsPrivacy struct {
	IgnoreFile    DiagnosticsIgnoreFile `json:"ignoreFile"`
	ExportWarning string                `json:"exportWarning"`
}

type DiagnosticsIgnoreFile struct {
	Path               string `json:"path"`
	Status             string `json:"status"`
	ActivePatternCount int    `json:"activePatternCount"`
}

type DiagnosticsRemoteBind struct {
	Addr        string `json:"addr"`
	Status      string `json:"status"`
	AllowRemote bool   `json:"allowRemote"`
}

type DiagnosticsCORS struct {
	TotalOrigins int `json:"totalOrigins"`
	LocalOrigins int `json:"localOrigins"`
	ExtraOrigins int `json:"extraOrigins"`
}

type DiagnosticsSecurity struct {
	RemoteBind DiagnosticsRemoteBind `json:"remoteBind"`
	CORS       DiagnosticsCORS       `json:"cors"`
}

type DiagnosticsFileEntry struct {
	Name         string  `json:"name"`
	Path         string  `json:"path"`
	SizeBytes    *int64  `json:"sizeBytes"`
	LastModified *string `json:"lastModified"`
	Exists       bool    `json:"exists"`
	LineCount    *int64  `json:"lineCount,omitempty"`
}

type DiagnosticsFileSystem struct {
	ArgusDir             string                 `json:"argusDir"`
	Binary               DiagnosticsFileEntry   `json:"binary"`
	Logs                 []DiagnosticsFileEntry `json:"logs"`
	Hooks                []DiagnosticsFileEntry `json:"hooks"`
	HooksTotal           int                    `json:"hooksTotal"`
	ClaudeDir            string                 `json:"claudeDir"`
	ClaudeDirExists      bool                   `json:"claudeDirExists"`
	ClaudeHooks          []DiagnosticsFileEntry `json:"claudeHooks"`
	ClaudeHooksTotal     int                    `json:"claudeHooksTotal"`
	ClaudeHooksDirExists bool                   `json:"claudeHooksDirExists"`
	ClaudeHistory        DiagnosticsFileEntry   `json:"claudeHistory"`
	CodexDir             string                 `json:"codexDir"`
	CodexDirExists       bool                   `json:"codexDirExists"`
	CodexHooks           []DiagnosticsFileEntry `json:"codexHooks"`
	CodexHooksTotal      int                    `json:"codexHooksTotal"`
	CodexHooksDirExists  bool                   `json:"codexHooksDirExists"`
	CodexDBs             []DiagnosticsFileEntry `json:"codexDBs"`
	CodexDBsTotal        int                    `json:"codexDBsTotal"`
	CodexDBsDirExists    bool                   `json:"codexDBsDirExists"`
}

type Diagnostics struct {
	Version    DiagnosticsVersion    `json:"version"`
	Health     DiagnosticsHealth     `json:"health"`
	Storage    DiagnosticsStorage    `json:"storage"`
	Agents     []DiagnosticsAgent    `json:"agents"`
	Privacy    DiagnosticsPrivacy    `json:"privacy"`
	Security   DiagnosticsSecurity   `json:"security"`
	FileSystem DiagnosticsFileSystem `json:"fileSystem"`
	Runtime    DiagnosticsRuntime    `json:"runtime"`
	DBHealth   DiagnosticsDBHealth   `json:"dbHealth"`
}
