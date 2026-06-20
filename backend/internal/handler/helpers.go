package handler

import (
	"path/filepath"
)

// runtimeExtensions is the single source of truth for the script runtime <-> file
// extension correspondence. Two views derive from it: runtimeFromExt (used for
// trusted, locally-installed scripts) and runtimeExt (used to derive a sandbox
// temp-file extension from an already-allowlisted runtime). Keep additions here so
// the two directions can never drift.
var runtimeExtensions = []struct{ runtime, ext string }{
	{"node", ".js"},
	{"python3", ".py"},
	{"sh", ".sh"},
}

// runtimeFromExt infers the interpreter from a filename's extension. Unknown
// extensions default to "sh" (preserving prior behavior).
func runtimeFromExt(filename string) string {
	ext := filepath.Ext(filename)
	for _, m := range runtimeExtensions {
		if m.ext == ext {
			return m.runtime
		}
	}
	return "sh"
}

// runtimeExt maps an (already allowlisted) runtime to its sandbox temp-file
// extension. Unknown runtimes default to ".sh". Callers MUST validate the runtime
// against allowedRuntimes before calling this — the input is otherwise untrusted.
func runtimeExt(runtime string) string {
	for _, m := range runtimeExtensions {
		if m.runtime == runtime {
			return m.ext
		}
	}
	return ".sh"
}

