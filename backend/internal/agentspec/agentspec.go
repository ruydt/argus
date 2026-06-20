// Package agentspec is the single source of truth for the AI coding agents
// argus can manage hooks for. Each Spec describes how to detect an agent's
// installation on disk, where its hooks config lives, and whether argus can
// edit that config in-app (matcher-group JSON, like Claude Code / Codex) or
// can only offer guided setup (divergent formats and plugin-model agents).
//
// All paths are resolved against a home directory so the package is pure and
// testable: tests pass a temp dir as home, production passes os.UserHomeDir().
//
// OS note: paths use ~/.config and ~/.<dir> conventions, correct on macOS and
// Linux/WSL (argus's primary platforms). A few agents (Goose, Crush) use
// OS-specific roots on Windows (%APPDATA%); those variants are not yet probed.
package agentspec

import (
	"os"
	"path/filepath"
)

// ConfigKind describes the on-disk shape of an agent's hooks configuration.
type ConfigKind string

const (
	// KindJSONHooksBlock: hooks live under a top-level "hooks" key inside a
	// larger JSON settings file; argus merge-preserves all other keys on write.
	// Canonical matcher-group shape (Claude Code, Continue, Augment).
	KindJSONHooksBlock ConfigKind = "json-hooks-block"
	// KindJSONCHooksBlock: same as the block kind but the settings file may carry
	// // and /* */ comments (Qwen Code). Read tolerates comments;
	// writes re-emit strict JSON.
	KindJSONCHooksBlock ConfigKind = "jsonc-hooks-block"
	// KindJSONHooksFile: the whole file is the {"hooks": {...}} payload (Codex,
	// Goose per-plugin hooks.json).
	KindJSONHooksFile ConfigKind = "json-hooks-file"
	// KindCursorHooks: {"version":1,"hooks":{event:[ {command,matcher?,...} ]}}.
	KindCursorHooks ConfigKind = "cursor-hooks"
	// KindCopilotHooks: {"version":1,"hooks":{event:[ {type,command,timeoutSec?} ]}}.
	KindCopilotHooks ConfigKind = "copilot-hooks"
	// KindWindsurfHooks: {"hooks":{event:[ {command,powershell?,...} ]}} — no
	// matcher, no per-hook timeout.
	KindWindsurfHooks ConfigKind = "windsurf-hooks"
	// KindCrushHooks: flat hooks block inside crush.json {matcher?,command,...}.
	KindCrushHooks ConfigKind = "crush-hooks"
	// The kinds below are not editable in-app — argus shows guided setup.
	// Hooks are executable scripts or plugin code, with no JSON to edit.
	KindClineScripts ConfigKind = "cline-scripts"
	KindPlugin       ConfigKind = "plugin"
)

// Spec is one agent's metadata with all filesystem paths resolved against home.
type Spec struct {
	ID               string
	DisplayName      string
	DocsURL          string
	InstallPaths     []string // any existing path ⇒ the agent is installed
	HooksConfigPath  string   // file (block/file kinds) or directory argus reads/writes
	ConfigKind       ConfigKind
	EditingSupported bool   // true ⇒ in-app editor; false ⇒ guided setup only
	TimeoutUnit      string // "seconds" | "milliseconds" | "" (agent has no per-hook timeout)
	SupportsMatcher  bool   // false ⇒ agent has no matcher concept (e.g. Windsurf)
	Events           []string
}

// entry is the unresolved registry row: paths are stored as segments under home.
type entry struct {
	id, name, docs string
	install        [][]string
	hooksPath      []string
	kind           ConfigKind
	editable       bool
	timeoutUnit    string
	matcherless    bool // true ⇒ agent has no matcher field
	events         []string
}

func (e entry) resolve(home string) Spec {
	install := make([]string, len(e.install))
	for i, seg := range e.install {
		install[i] = filepath.Join(append([]string{home}, seg...)...)
	}
	return Spec{
		ID:               e.id,
		DisplayName:      e.name,
		DocsURL:          e.docs,
		InstallPaths:     install,
		HooksConfigPath:  filepath.Join(append([]string{home}, e.hooksPath...)...),
		ConfigKind:       e.kind,
		EditingSupported: e.editable,
		TimeoutUnit:      e.timeoutUnit,
		SupportsMatcher:  e.editable && !e.matcherless,
		Events:           e.events,
	}
}

// All returns every known agent spec with paths resolved against home.
func All(home string) []Spec {
	out := make([]Spec, 0, len(registry))
	for _, e := range registry {
		out = append(out, e.resolve(home))
	}
	return out
}

// ByID returns the resolved spec for id, or ok=false if unknown.
func ByID(home, id string) (Spec, bool) {
	for _, e := range registry {
		if e.id == id {
			return e.resolve(home), true
		}
	}
	return Spec{}, false
}

// IsKnown reports whether id is a registered agent. Home-independent so the
// ingest handler can validate an ?agent= param without resolving paths.
func IsKnown(id string) bool {
	for _, e := range registry {
		if e.id == id {
			return true
		}
	}
	return false
}

// registry is the canonical list. IDs for the two original agents are kept as
// "claudecode" and "codex" to stay compatible with the existing hooks-config
// API and frontend agent registry. Every JSON-config agent is editable: its
// ConfigKind selects an adapter in handler/hooks_config_adapters.go that maps
// the agent's real on-disk shape to/from argus's canonical matcher-group model
// while preserving everything argus does not model. Every agent currently in
// the registry is editable in-app; plugin-code and script-directory agents
// (which only support guided setup) are omitted for now.
//
// timeoutUnit records whether the agent's per-hook timeout field is seconds or
// milliseconds (argus stores the raw number; the UI labels the unit). matcherless
// marks agents (Windsurf) with no matcher concept at all.
var registry = []entry{
	{
		id: "claudecode", name: "Claude Code", docs: "https://code.claude.com/docs/en/hooks",
		install:   [][]string{{".claude", "settings.json"}, {".claude"}, {".claude.json"}},
		hooksPath: []string{".claude", "settings.json"},
		kind:      KindJSONHooksBlock, editable: true, timeoutUnit: "seconds",
		events: []string{
			"PreToolUse", "PostToolUse", "UserPromptSubmit", "Notification",
			"Stop", "SubagentStop", "SubagentStart", "SessionStart", "SessionEnd",
			"PreCompact", "PostCompact", "PermissionRequest",
		},
	},
	{
		id: "codex", name: "Codex", docs: "https://developers.openai.com/codex/hooks",
		install:   [][]string{{".codex", "config.toml"}, {".codex"}, {".codex", "hooks.json"}},
		hooksPath: []string{".codex", "hooks.json"},
		kind:      KindJSONHooksFile, editable: true, timeoutUnit: "seconds",
		events: []string{
			"SessionStart", "SubagentStart", "PreToolUse", "PermissionRequest",
			"PostToolUse", "PreCompact", "PostCompact", "UserPromptSubmit",
			"SubagentStop", "Stop",
		},
	},
	{
		id: "cursor", name: "Cursor", docs: "https://cursor.com/docs/hooks",
		install:   [][]string{{".cursor", "hooks.json"}, {".cursor"}},
		hooksPath: []string{".cursor", "hooks.json"},
		kind:      KindCursorHooks, editable: true, timeoutUnit: "seconds",
		events: []string{
			"beforeSubmitPrompt", "beforeShellExecution", "afterShellExecution",
			"beforeMCPExecution", "afterMCPExecution", "beforeReadFile", "afterFileEdit",
			"stop", "sessionStart", "sessionEnd", "preToolUse", "postToolUse",
			"postToolUseFailure", "subagentStart", "subagentStop", "preCompact",
		},
	},
	{
		// Antigravity CLI is Google's official successor to Gemini CLI. Hooks live
		// in a dedicated JSON file (global ~/.gemini/config/hooks.json; workspace
		// .agents/hooks.json takes precedence) in canonical matcher-group shape
		// with per-hook timeouts in seconds. argus edits the global file.
		id: "antigravity", name: "Antigravity CLI", docs: "https://antigravity.google/docs/cli-features",
		install:   [][]string{{".gemini", "config", "hooks.json"}, {".gemini", "config"}, {".gemini"}},
		hooksPath: []string{".gemini", "config", "hooks.json"},
		kind:      KindJSONHooksFile, editable: true, timeoutUnit: "seconds",
		events: []string{
			"PreToolUse", "PostToolUse", "PreInvocation", "PostInvocation",
			"SessionStart", "SessionEnd", "Stop", "Notification",
		},
	},
	{
		id: "copilot", name: "GitHub Copilot CLI", docs: "https://docs.github.com/en/copilot/reference/hooks-reference",
		install:   [][]string{{".copilot", "settings.json"}, {".copilot"}, {".copilot", "hooks"}},
		hooksPath: []string{".copilot", "hooks", "argus.json"},
		kind:      KindCopilotHooks, editable: true, timeoutUnit: "seconds",
		events: []string{
			"sessionStart", "sessionEnd", "userPromptSubmitted", "preToolUse",
			"postToolUse", "postToolUseFailure", "permissionRequest", "preCompact",
			"agentStop", "subagentStart", "subagentStop", "errorOccurred", "notification",
		},
	},
	{
		id: "qwen", name: "Qwen Code", docs: "https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/hooks.md",
		install:   [][]string{{".qwen", "settings.json"}, {".qwen"}},
		hooksPath: []string{".qwen", "settings.json"},
		kind:      KindJSONCHooksBlock, editable: true, timeoutUnit: "milliseconds",
		events: []string{
			"PreToolUse", "PostToolUse", "PostToolUseFailure", "UserPromptSubmit",
			"SessionStart", "SessionEnd", "Stop", "StopFailure", "SubagentStart",
			"SubagentStop", "PreCompact", "PostCompact", "Notification",
			"PermissionRequest", "TodoCreated", "TodoCompleted",
		},
	},
	{
		id: "continue", name: "Continue", docs: "https://github.com/continuedev/continue/blob/main/extensions/cli/src/hooks/types.ts",
		install:   [][]string{{".continue", "settings.json"}, {".continue"}},
		hooksPath: []string{".continue", "settings.json"},
		kind:      KindJSONHooksBlock, editable: true, timeoutUnit: "seconds",
		events: []string{
			"PreToolUse", "PostToolUse", "PostToolUseFailure", "PermissionRequest",
			"UserPromptSubmit", "SessionStart", "SessionEnd", "Stop", "Notification",
			"SubagentStart", "SubagentStop", "PreCompact", "ConfigChange",
			"TeammateIdle", "TaskCompleted", "WorktreeCreate", "WorktreeRemove",
		},
	},
	{
		id: "augment", name: "Augment / Auggie", docs: "https://docs.augmentcode.com/cli/hooks",
		install:   [][]string{{".augment", "settings.json"}, {".augment"}},
		hooksPath: []string{".augment", "settings.json"},
		kind:      KindJSONHooksBlock, editable: true, timeoutUnit: "milliseconds",
		events:    []string{"PreToolUse", "PostToolUse", "Stop", "SessionStart", "SessionEnd", "Notification"},
	},
	{
		id: "windsurf", name: "Windsurf (Cascade)", docs: "https://docs.devin.ai/desktop/cascade/hooks",
		install:   [][]string{{".codeium", "windsurf", "hooks.json"}, {".codeium", "windsurf"}, {".codeium", "hooks.json"}},
		hooksPath: []string{".codeium", "windsurf", "hooks.json"},
		kind:      KindWindsurfHooks, editable: true, matcherless: true,
		events: []string{
			"pre_read_code", "post_read_code", "pre_write_code", "post_write_code",
			"pre_run_command", "post_run_command", "pre_mcp_tool_use", "post_mcp_tool_use",
			"pre_user_prompt", "post_cascade_response", "post_setup_worktree",
		},
	},
	{
		id: "crush", name: "Crush", docs: "https://github.com/charmbracelet/crush",
		install:   [][]string{{".config", "crush", "crush.json"}, {".config", "crush"}},
		hooksPath: []string{".config", "crush", "crush.json"},
		kind:      KindCrushHooks, editable: true, timeoutUnit: "seconds",
		events:    []string{"PreToolUse"},
	},
	{
		// Goose hooks live in a per-plugin directory; argus owns an "argus"
		// plugin folder and edits ~/.agents/plugins/argus/hooks/hooks.json.
		id: "goose", name: "Goose", docs: "https://goose-docs.ai/blog/2026/05/14/goose-hooks/",
		install:   [][]string{{".config", "goose", "config.yaml"}, {".config", "goose"}, {".agents", "plugins"}},
		hooksPath: []string{".agents", "plugins", "argus", "hooks", "hooks.json"},
		kind:      KindJSONHooksFile, editable: true, timeoutUnit: "seconds",
		events: []string{
			"SessionStart", "SessionEnd", "Stop", "UserPromptSubmit", "PreToolUse",
			"PostToolUse", "PostToolUseFailure", "BeforeReadFile", "AfterFileEdit",
			"BeforeShellExecution", "AfterShellExecution",
		},
	},
}

// Status is the install/configuration state of one agent, for GET /api/agents.
type Status struct {
	ID               string   `json:"id"`
	DisplayName      string   `json:"display_name"`
	DocsURL          string   `json:"docs_url"`
	ConfigKind       string   `json:"config_kind"`
	HooksConfigPath  string   `json:"hooks_config_path"`
	EditingSupported bool     `json:"editing_supported"`
	TimeoutUnit      string   `json:"timeout_unit,omitempty"`
	SupportsMatcher  bool     `json:"supports_matcher"`
	Installed        bool     `json:"installed"`
	HooksConfigured  bool     `json:"hooks_configured"`
	Events           []string `json:"events,omitempty"`
}

// Detect reports per-agent install status by probing each spec's paths.
// stat defaults to os.Stat; tests inject a fake. Installed is true when any
// InstallPath exists; HooksConfigured is true when the hooks file/dir exists.
func Detect(home string, stat func(string) (os.FileInfo, error)) []Status {
	if stat == nil {
		stat = os.Stat
	}
	specs := All(home)
	out := make([]Status, 0, len(specs))
	for _, s := range specs {
		st := Status{
			ID:               s.ID,
			DisplayName:      s.DisplayName,
			DocsURL:          s.DocsURL,
			ConfigKind:       string(s.ConfigKind),
			HooksConfigPath:  s.HooksConfigPath,
			EditingSupported: s.EditingSupported,
			TimeoutUnit:      s.TimeoutUnit,
			SupportsMatcher:  s.SupportsMatcher,
			Events:           s.Events,
		}
		for _, p := range s.InstallPaths {
			if _, err := stat(p); err == nil {
				st.Installed = true
				break
			}
		}
		if _, err := stat(s.HooksConfigPath); err == nil {
			st.HooksConfigured = true
		}
		out = append(out, st)
	}
	return out
}
