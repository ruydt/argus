package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"argus/internal/agentspec"
)

// This file is the single translation layer between argus's canonical hook
// model (matcher-group JSON, see hooksConfigGroup/hooksConfigEntry) and each
// agent's real on-disk hook format. Every editable agent's ConfigKind maps to
// one adapterSpec; the read/write engine below uses that spec to losslessly
// surface the agent's command hooks for editing while PRESERVING everything
// argus does not model (sibling settings keys, non-command hook entries such as
// http/prompt/agent hooks, and agent-specific fields like Cursor's loop_limit,
// Augment's metadata, Windsurf's working_directory). Preservation is why writes
// re-read the file and merge rather than overwrite — corrupting a user's real
// agent config is unacceptable.
//
// Two structural families:
//   - nested  (Claude/Codex/Antigravity/Continue/Augment/Qwen/Goose): the on-disk
//     shape already nests event -> [ {matcher?, hooks:[entry]} ], matching the
//     canonical model. Only command-type inner entries are surfaced.
//   - flat    (Cursor/Copilot/Windsurf/Crush): the on-disk shape is one level
//     shallower — event -> [entry] with the matcher (if any) on each entry.
//     Each flat entry maps to a single-hook canonical group and back.

// adapterSpec describes one agent's on-disk hook encoding.
type adapterSpec struct {
	flat       bool     // true: flat per-event entry array; false: matcher-group nesting
	jsonc      bool     // tolerate // and /* */ comments + trailing commas on read
	commandKey string   // field argus writes the command into (default "command")
	readCmdKey []string // fields to read a command from, in priority order (default [commandKey])
	timeoutKey string   // timeout field name; "" = agent has no per-hook timeout
	matcherKey string   // matcher field name; "" = agent has no matcher concept
	writeType  string   // value written into "type" on argus-authored entries; "" = omit "type"
	ensureTop  map[string]any
	// foreign* mark an on-disk entry as something argus must preserve verbatim
	// (round-trip) rather than surface for editing — dropping it would delete a
	// working hook the editor cannot represent.
	foreignTypes []string // entry "type" in this set => foreign
	foreignKeys  []string // entry containing any of these keys => foreign
}

// adapterByKind maps every editable ConfigKind to its on-disk encoding. Kinds
// absent here are not editable in-app (plugin/script agents) and never reach
// this engine — HooksConfig rejects them with 409 first.
var adapterByKind = map[agentspec.ConfigKind]adapterSpec{
	// Claude Code: hooks block inside settings.json, canonical shape.
	agentspec.KindJSONHooksBlock: {
		commandKey: "command", timeoutKey: "timeout", matcherKey: "matcher", writeType: "command",
		foreignTypes: []string{"http", "prompt", "agent", "function"},
	},
	// Codex / Goose: whole-file {"hooks":{...}} payload, canonical shape.
	agentspec.KindJSONHooksFile: {
		commandKey: "command", timeoutKey: "timeout", matcherKey: "matcher", writeType: "command",
		foreignTypes: []string{"http", "prompt", "agent", "function"},
	},
	// Qwen: canonical shape but settings.json may carry JSONC comments.
	agentspec.KindJSONCHooksBlock: {
		jsonc:      true,
		commandKey: "command", timeoutKey: "timeout", matcherKey: "matcher", writeType: "command",
		foreignTypes: []string{"http", "prompt", "agent", "function"},
	},
	// Cursor: {"version":1,"hooks":{event:[ {command,matcher?,timeout?,...} ]}}.
	// loop_limit / failClosed ride along on the entry map and survive untouched.
	agentspec.KindCursorHooks: {
		flat:       true,
		commandKey: "command", timeoutKey: "timeout", matcherKey: "matcher",
		ensureTop:    map[string]any{"version": 1},
		foreignTypes: []string{"prompt"},
	},
	// GitHub Copilot: {"version":1,"hooks":{event:[ {type:"command",command,matcher?,timeoutSec?} ]}}.
	// Entries that use bash/powershell/cwd/env or http/prompt are preserved as foreign.
	agentspec.KindCopilotHooks: {
		flat:       true,
		commandKey: "command", timeoutKey: "timeoutSec", matcherKey: "matcher", writeType: "command",
		ensureTop:    map[string]any{"version": 1},
		foreignTypes: []string{"http", "prompt"},
		foreignKeys:  []string{"bash", "powershell", "cwd", "env", "url", "headers"},
	},
	// Windsurf: {"hooks":{event:[ {command,powershell?,show_output?,working_directory?} ]}}.
	// No matcher, no per-hook timeout, no type. Extra fields survive via the entry map.
	agentspec.KindWindsurfHooks: {
		flat:       true,
		commandKey: "command",
	},
	// Crush: hooks block inside crush.json; flat entries {name?,matcher?,command,timeout?}, no type.
	agentspec.KindCrushHooks: {
		flat:       true,
		commandKey: "command", timeoutKey: "timeout", matcherKey: "matcher",
	},
}

// readConfig loads an agent's hooks into the canonical model. A missing file is
// not an error — it yields an empty config so the editor shows "no hooks".
func readConfig(spec agentspec.Spec) (map[string][]hooksConfigGroup, error) {
	a, ok := adapterByKind[spec.ConfigKind]
	if !ok {
		return nil, fmt.Errorf("no adapter for config kind %q", spec.ConfigKind)
	}
	top, err := readTopObject(spec.HooksConfigPath, a.jsonc)
	if err != nil {
		return nil, err
	}
	hooksRaw, err := extractHooks(top)
	if err != nil {
		return nil, err
	}
	if a.flat {
		return readFlat(hooksRaw, a)
	}
	return readNested(hooksRaw, a)
}

// writeConfig persists the canonical model back to the agent's file, preserving
// every sibling key and every on-disk entry argus does not model. It re-reads
// the current file to recover that foreign data, so a present-but-unparseable
// file is refused rather than clobbered.
func writeConfig(spec agentspec.Spec, hooks map[string][]hooksConfigGroup) error {
	a, ok := adapterByKind[spec.ConfigKind]
	if !ok {
		return fmt.Errorf("no adapter for config kind %q", spec.ConfigKind)
	}
	top, err := readTopObject(spec.HooksConfigPath, a.jsonc)
	if err != nil {
		return err
	}
	existing, err := extractHooks(top)
	if err != nil {
		return err
	}
	var merged map[string][]json.RawMessage
	if a.flat {
		merged = writeFlat(existing, hooks, a)
	} else {
		merged = writeNested(existing, hooks, a)
	}
	hooksJSON, err := json.Marshal(merged)
	if err != nil {
		return err
	}
	top["hooks"] = hooksJSON
	for k, v := range a.ensureTop {
		if _, present := top[k]; !present {
			b, err := json.Marshal(v)
			if err != nil {
				return err
			}
			top[k] = b
		}
	}
	return writeTopObject(spec.HooksConfigPath, top)
}

// --- top-level object IO ----------------------------------------------------

// readTopObject reads the file as a JSON object preserving every top-level key
// as raw bytes. Missing file => empty object. Present-but-invalid => error.
func readTopObject(path string, jsonc bool) (map[string]json.RawMessage, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return map[string]json.RawMessage{}, nil
		}
		return nil, err
	}
	if len(bytes.TrimSpace(data)) == 0 {
		return map[string]json.RawMessage{}, nil
	}
	if jsonc {
		data = stripJSONC(data)
	}
	top := map[string]json.RawMessage{}
	if err := json.Unmarshal(data, &top); err != nil {
		return nil, fmt.Errorf("config file is not valid JSON: %w", err)
	}
	return top, nil
}

func writeTopObject(path string, top map[string]json.RawMessage) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(top, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

// extractHooks pulls the "hooks" object out of the top object as raw arrays per
// event. Absent => empty. Present-but-not-an-object => error.
func extractHooks(top map[string]json.RawMessage) (map[string][]json.RawMessage, error) {
	raw, ok := top["hooks"]
	if !ok || len(bytes.TrimSpace(raw)) == 0 {
		return map[string][]json.RawMessage{}, nil
	}
	hooks := map[string][]json.RawMessage{}
	if err := json.Unmarshal(raw, &hooks); err != nil {
		return nil, fmt.Errorf("hooks block is not valid JSON: %w", err)
	}
	return hooks, nil
}

// --- nested (matcher-group) family -----------------------------------------

func readNested(hooks map[string][]json.RawMessage, a adapterSpec) (map[string][]hooksConfigGroup, error) {
	out := map[string][]hooksConfigGroup{}
	for event, groups := range hooks {
		for _, groupRaw := range groups {
			group, ok := parseNestedGroup(groupRaw, a)
			if ok {
				out[event] = append(out[event], group)
			}
		}
	}
	return out, nil
}

// parseNestedGroup surfaces a group only when EVERY inner entry is a modelable
// command hook. A group holding any foreign entry is treated as fully foreign
// (not surfaced) so the writer can round-trip it verbatim without losing the
// foreign sibling.
func parseNestedGroup(groupRaw json.RawMessage, a adapterSpec) (hooksConfigGroup, bool) {
	var g struct {
		Matcher string            `json:"matcher"`
		Hooks   []json.RawMessage `json:"hooks"`
	}
	if err := json.Unmarshal(groupRaw, &g); err != nil || len(g.Hooks) == 0 {
		return hooksConfigGroup{}, false
	}
	entries := make([]hooksConfigEntry, 0, len(g.Hooks))
	for _, hraw := range g.Hooks {
		m := rawToMap(hraw)
		if m == nil || entryIsForeign(m, a) {
			return hooksConfigGroup{}, false
		}
		entries = append(entries, entryFromMap(m, a))
	}
	return hooksConfigGroup{Matcher: g.Matcher, Hooks: entries}, true
}

func writeNested(existing map[string][]json.RawMessage, hooks map[string][]hooksConfigGroup, a adapterSpec) map[string][]json.RawMessage {
	out := map[string][]json.RawMessage{}
	for event, groups := range hooks {
		surfaced, foreign := partitionNestedGroups(existing[event], a)
		built := make([]json.RawMessage, 0, len(groups)+len(foreign))
		// Pair each edited group with the on-disk surfaced group it came from so
		// group-level extras (e.g. a group's "sequential" flag) and per-entry agent
		// fields survive. Identity is recovered by command (matcher as tiebreak),
		// with a positional fallback for renames — never blindly by index, which
		// would migrate a sibling's fields onto the wrong group after a delete.
		// Known limit: merging two distinct on-disk groups into one in the editor
		// can only carry the fields of the group whose command identity matched;
		// the merged-away group's group-level extras are not recovered.
		oldKeys := make([]matchKey, len(surfaced))
		for i, m := range surfaced {
			oldKeys[i] = matchKey{cmd: groupFirstCommand(m, a), matcher: groupMatcher(m, a)}
		}
		editedKeys := make([]matchKey, len(groups))
		for i, g := range groups {
			editedKeys[i] = matchKey{cmd: groupHeadCommand(g), matcher: g.Matcher}
		}
		assign := assignBases(editedKeys, oldKeys)
		for i, g := range groups {
			var base map[string]any
			if assign[i] >= 0 {
				base = cloneMap(surfaced[assign[i]])
			}
			built = append(built, buildNestedGroup(g, base, a))
		}
		built = append(built, foreign...) // foreign groups round-tripped verbatim
		out[event] = built
	}
	// Events present on disk but absent from the edited config: keep only their
	// foreign groups so unmodellable hooks under an otherwise-removed event live.
	for event, old := range existing {
		if _, edited := hooks[event]; edited {
			continue
		}
		if _, foreign := partitionNestedGroups(old, a); len(foreign) > 0 {
			out[event] = foreign
		}
	}
	return out
}

// partitionNestedGroups splits an event's on-disk groups, in order, into the
// groups argus can fully model (returned as raw maps for base reuse) and the
// foreign groups it must preserve verbatim.
func partitionNestedGroups(old []json.RawMessage, a adapterSpec) (surfaced []map[string]any, foreign []json.RawMessage) {
	for _, groupRaw := range old {
		if _, ok := parseNestedGroup(groupRaw, a); ok {
			surfaced = append(surfaced, rawToMap(groupRaw))
		} else {
			foreign = append(foreign, groupRaw)
		}
	}
	return surfaced, foreign
}

// buildNestedGroup rebuilds one argus-owned group on top of an optional on-disk
// base map, preserving the base's group-level extras and pairing each inner
// entry positionally with the base's inner entries.
func buildNestedGroup(g hooksConfigGroup, base map[string]any, a adapterSpec) json.RawMessage {
	if base == nil {
		base = map[string]any{}
	}
	if a.matcherKey != "" {
		if g.Matcher != "" {
			base[a.matcherKey] = g.Matcher
		} else {
			delete(base, a.matcherKey)
		}
	}
	oldInner := oldInnerEntries(base)
	oldInnerKeys := make([]matchKey, len(oldInner))
	for i, m := range oldInner {
		oldInnerKeys[i] = matchKey{cmd: commandFromMap(m, a)}
	}
	editedInnerKeys := make([]matchKey, len(g.Hooks))
	for i, e := range g.Hooks {
		editedInnerKeys[i] = matchKey{cmd: e.Command}
	}
	assign := assignBases(editedInnerKeys, oldInnerKeys)
	inner := make([]json.RawMessage, 0, len(g.Hooks))
	for j, e := range g.Hooks {
		var ib map[string]any
		if assign[j] >= 0 {
			ib = cloneMap(oldInner[assign[j]])
		}
		inner = append(inner, buildEntry(e, ib, a))
	}
	base["hooks"] = inner
	b, err := json.Marshal(base)
	if err != nil {
		b, _ = json.Marshal(map[string]any{"hooks": inner})
	}
	return b
}

func oldInnerEntries(group map[string]any) []map[string]any {
	raw, ok := group["hooks"]
	if !ok {
		return nil
	}
	arr, ok := raw.([]any)
	if !ok {
		return nil
	}
	out := make([]map[string]any, 0, len(arr))
	for _, e := range arr {
		if m, ok := e.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

// --- flat family ------------------------------------------------------------

func readFlat(hooks map[string][]json.RawMessage, a adapterSpec) (map[string][]hooksConfigGroup, error) {
	out := map[string][]hooksConfigGroup{}
	for event, entries := range hooks {
		for _, eraw := range entries {
			m := rawToMap(eraw)
			if m == nil || entryIsForeign(m, a) {
				continue
			}
			matcher := ""
			if a.matcherKey != "" {
				matcher = stringField(m, a.matcherKey)
			}
			out[event] = append(out[event], hooksConfigGroup{
				Matcher: matcher,
				Hooks:   []hooksConfigEntry{entryFromMap(m, a)},
			})
		}
	}
	return out, nil
}

func writeFlat(existing map[string][]json.RawMessage, hooks map[string][]hooksConfigGroup, a adapterSpec) map[string][]json.RawMessage {
	out := map[string][]json.RawMessage{}
	for event, groups := range hooks {
		surfaced, foreign := partitionFlatEntries(existing[event], a)
		built := make([]json.RawMessage, 0, len(foreign))
		// Flatten the edited groups into entries, then pair each with the on-disk
		// surfaced entry it came from (by command, matcher as tiebreak, positional
		// fallback for renames) so agent fields like Cursor's loop_limit stay with
		// their command across a remove/reorder rather than shifting to a sibling.
		type flatEdit struct {
			matcher string
			entry   hooksConfigEntry
		}
		var flat []flatEdit
		for _, g := range groups {
			for _, e := range g.Hooks {
				flat = append(flat, flatEdit{matcher: g.Matcher, entry: e})
			}
		}
		oldKeys := make([]matchKey, len(surfaced))
		for i, m := range surfaced {
			oldKeys[i] = matchKey{cmd: commandFromMap(m, a), matcher: stringField(m, a.matcherKey)}
		}
		editedKeys := make([]matchKey, len(flat))
		for i, f := range flat {
			editedKeys[i] = matchKey{cmd: f.entry.Command, matcher: f.matcher}
		}
		assign := assignBases(editedKeys, oldKeys)
		for i, f := range flat {
			var base map[string]any
			if assign[i] >= 0 {
				base = cloneMap(surfaced[assign[i]])
			}
			built = append(built, buildFlatEntry(f.matcher, f.entry, base, a))
		}
		built = append(built, foreign...) // foreign entries round-tripped verbatim
		out[event] = built
	}
	for event, old := range existing {
		if _, edited := hooks[event]; edited {
			continue
		}
		if _, foreign := partitionFlatEntries(old, a); len(foreign) > 0 {
			out[event] = foreign
		}
	}
	return out
}

// partitionFlatEntries splits an event's flat on-disk entries, in order, into
// the entries argus can model (as raw maps for base reuse) and the foreign
// entries it must preserve verbatim.
func partitionFlatEntries(old []json.RawMessage, a adapterSpec) (surfaced []map[string]any, foreign []json.RawMessage) {
	for _, eraw := range old {
		if m := rawToMap(eraw); m != nil && !entryIsForeign(m, a) {
			surfaced = append(surfaced, m)
		} else {
			foreign = append(foreign, eraw)
		}
	}
	return surfaced, foreign
}

func buildFlatEntry(matcher string, e hooksConfigEntry, base map[string]any, a adapterSpec) json.RawMessage {
	if base == nil {
		base = map[string]any{}
	}
	applyModeledFields(base, e, a)
	if a.matcherKey != "" {
		if matcher != "" {
			base[a.matcherKey] = matcher
		} else {
			delete(base, a.matcherKey)
		}
	}
	b, err := json.Marshal(base)
	if err != nil {
		b, _ = json.Marshal(map[string]any{a.commandKey: e.Command})
	}
	return b
}

// --- base matching ----------------------------------------------------------

// matchKey identifies a hook by the fields argus uses to recover its on-disk
// base across an edit: the command and (where the agent has one) the matcher.
type matchKey struct {
	cmd     string
	matcher string
}

// assignBases pairs each edited item with the on-disk surfaced item it most
// likely came from, so unmodeled agent fields (loop_limit, metadata, ...) stay
// attached to their hook across remove/reorder/rename. Each old item is consumed
// at most once, in three passes: exact (command+matcher), then command-only,
// then positional fallback (covers a renamed command). An unmatched edited item
// returns -1 → a fresh base.
func assignBases(edited, old []matchKey) []int {
	assign := make([]int, len(edited))
	for i := range assign {
		assign[i] = -1
	}
	used := make([]bool, len(old))
	match := func(pred func(e, o matchKey) bool) {
		for i, e := range edited {
			if assign[i] >= 0 {
				continue
			}
			for j, o := range old {
				if !used[j] && pred(e, o) {
					assign[i], used[j] = j, true
					break
				}
			}
		}
	}
	match(func(e, o matchKey) bool { return e.cmd != "" && e.cmd == o.cmd && e.matcher == o.matcher })
	match(func(e, o matchKey) bool { return e.cmd != "" && e.cmd == o.cmd })
	match(func(matchKey, matchKey) bool { return true }) // positional: next unused
	return assign
}

func groupHeadCommand(g hooksConfigGroup) string {
	if len(g.Hooks) > 0 {
		return g.Hooks[0].Command
	}
	return ""
}

func groupFirstCommand(m map[string]any, a adapterSpec) string {
	for _, inner := range oldInnerEntries(m) {
		if c := commandFromMap(inner, a); c != "" {
			return c
		}
	}
	return ""
}

func groupMatcher(m map[string]any, a adapterSpec) string {
	if a.matcherKey == "" {
		return ""
	}
	return stringField(m, a.matcherKey)
}

// --- shared helpers ---------------------------------------------------------

func entryFromMap(m map[string]any, a adapterSpec) hooksConfigEntry {
	e := hooksConfigEntry{Type: "command", Command: commandFromMap(m, a)}
	if a.timeoutKey != "" {
		if t, ok := numField(m, a.timeoutKey); ok {
			ti := t
			e.Timeout = &ti
		}
	}
	if sm := stringField(m, "statusMessage"); sm != "" {
		e.StatusMessage = sm
	}
	return e
}

// buildEntry rebuilds one inner command entry on top of an optional on-disk base
// map (paired positionally by the caller) so agent-specific fields
// (name/description/metadata/...) survive command and matcher edits.
func buildEntry(e hooksConfigEntry, base map[string]any, a adapterSpec) json.RawMessage {
	if base == nil {
		base = map[string]any{}
	}
	applyModeledFields(base, e, a)
	b, err := json.Marshal(base)
	if err != nil {
		fallback := map[string]any{a.commandKey: e.Command}
		if a.writeType != "" {
			fallback["type"] = a.writeType
		}
		b, _ = json.Marshal(fallback)
	}
	return b
}

// applyModeledFields writes argus's modeled fields (type, command, timeout,
// statusMessage) onto an entry base, leaving every other base key untouched. An
// on-disk timeout the user did not change is kept verbatim, so a string- or
// fraction-encoded timeout is never silently narrowed.
func applyModeledFields(base map[string]any, e hooksConfigEntry, a adapterSpec) {
	if a.writeType != "" {
		base["type"] = a.writeType
	}
	base[a.commandKey] = e.Command
	if a.timeoutKey != "" {
		if e.Timeout == nil {
			delete(base, a.timeoutKey)
		} else if old, ok := numField(base, a.timeoutKey); !ok || old != *e.Timeout {
			// Absent or genuinely changed — write the new value. An unchanged
			// value is left verbatim (preserves a string/fractional encoding
			// argus's int model would otherwise narrow).
			base[a.timeoutKey] = *e.Timeout
		}
	}
	if e.StatusMessage != "" {
		base["statusMessage"] = e.StatusMessage
	} else {
		delete(base, "statusMessage")
	}
}

// entryIsForeign reports whether an on-disk entry is something argus cannot
// model and must preserve verbatim.
func entryIsForeign(m map[string]any, a adapterSpec) bool {
	t := stringField(m, "type")
	for _, ft := range a.foreignTypes {
		if t == ft {
			return true
		}
	}
	for _, fk := range a.foreignKeys {
		if _, ok := m[fk]; ok {
			return true
		}
	}
	// An entry argus cannot extract a string command from (missing/alternate
	// command key, or a non-string/array command value) is unmodelable —
	// preserve it verbatim rather than surface a blank hook a later write drops.
	return commandFromMap(m, a) == ""
}

func commandFromMap(m map[string]any, a adapterSpec) string {
	keys := a.readCmdKey
	if len(keys) == 0 {
		keys = []string{a.commandKey}
	}
	for _, k := range keys {
		if s := stringField(m, k); s != "" {
			return s
		}
	}
	return ""
}

func rawToMap(raw json.RawMessage) map[string]any {
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil
	}
	return m
}

func cloneMap(m map[string]any) map[string]any {
	b, err := json.Marshal(m)
	if err != nil {
		return map[string]any{}
	}
	var out map[string]any
	if err := json.Unmarshal(b, &out); err != nil {
		return map[string]any{}
	}
	return out
}

func stringField(m map[string]any, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func numField(m map[string]any, key string) (int, bool) {
	v, ok := m[key]
	if !ok {
		return 0, false
	}
	switch n := v.(type) {
	case float64:
		return int(n), true
	case int:
		return n, true
	case json.Number:
		i, err := n.Int64()
		if err != nil {
			return 0, false
		}
		return int(i), true
	case string:
		// Some configs encode timeouts as strings ("60"); accept them so the
		// value survives a round-trip instead of being dropped.
		i, err := strconv.Atoi(strings.TrimSpace(n))
		if err != nil {
			return 0, false
		}
		return i, true
	}
	return 0, false
}

// stripJSONC removes // line comments, /* */ block comments, and trailing
// commas from JSONC, leaving string contents untouched. Best-effort: it lets a
// settings.json that uses comments parse, but writes are re-emitted as strict
// JSON (comments are not restored).
func stripJSONC(data []byte) []byte {
	var out bytes.Buffer
	inString := false
	escaped := false
	for i := 0; i < len(data); i++ {
		c := data[i]
		if inString {
			out.WriteByte(c)
			switch {
			case escaped:
				escaped = false
			case c == '\\':
				escaped = true
			case c == '"':
				inString = false
			}
			continue
		}
		switch {
		case c == '"':
			inString = true
			out.WriteByte(c)
		case c == '/' && i+1 < len(data) && data[i+1] == '/':
			for i < len(data) && data[i] != '\n' {
				i++
			}
			if i < len(data) {
				out.WriteByte('\n')
			}
		case c == '/' && i+1 < len(data) && data[i+1] == '*':
			i += 2
			for i+1 < len(data) && (data[i] != '*' || data[i+1] != '/') {
				i++
			}
			i++ // skip the closing '/'
		default:
			out.WriteByte(c)
		}
	}
	return stripTrailingCommas(out.Bytes())
}

func stripTrailingCommas(data []byte) []byte {
	var out bytes.Buffer
	inString := false
	escaped := false
	for i := 0; i < len(data); i++ {
		c := data[i]
		if inString {
			out.WriteByte(c)
			switch {
			case escaped:
				escaped = false
			case c == '\\':
				escaped = true
			case c == '"':
				inString = false
			}
			continue
		}
		if c == '"' {
			inString = true
			out.WriteByte(c)
			continue
		}
		if c == ',' {
			j := i + 1
			for j < len(data) && (data[j] == ' ' || data[j] == '\t' || data[j] == '\n' || data[j] == '\r') {
				j++
			}
			if j < len(data) && (data[j] == '}' || data[j] == ']') {
				continue // drop the trailing comma
			}
		}
		out.WriteByte(c)
	}
	return out.Bytes()
}
