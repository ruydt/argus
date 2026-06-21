package handler

import (
	"bufio"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
)

// LogTailOptions configures the log-tail handler.
type LogTailOptions struct {
	ArgusDir string
}

// resolveLogFile maps the whitelisted ?file= param to its on-disk filename.
func resolveLogFile(fileParam string) (string, bool) {
	switch fileParam {
	case "argus":
		return "argus.log", true
	case "hook-scripts":
		return "hook-scripts.log", true
	default:
		return "", false
	}
}

// LogTail serves the last N lines of a whitelisted log file in ~/.argus.
func LogTail(opts LogTailOptions) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		filename, ok := resolveLogFile(r.URL.Query().Get("file"))
		if !ok {
			http.Error(w, "invalid file param: must be 'argus' or 'hook-scripts'", http.StatusBadRequest)
			return
		}

		n := 50
		if raw := r.URL.Query().Get("lines"); raw != "" {
			if v, err := strconv.Atoi(raw); err == nil {
				if v < 1 {
					v = 1
				}
				if v > 200 {
					v = 200
				}
				n = v
			}
		}

		path := filepath.Join(opts.ArgusDir, filename)
		lines, err := tailLines(path, n)
		if err != nil {
			lines = []string{}
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(map[string]any{
			"file":  filename,
			"lines": lines,
		}); err != nil {
			log.Printf("[handler] encode log-tail: %v", err)
		}
	})
}

// LogClear truncates a whitelisted log file in ~/.argus to zero bytes,
// reclaiming the disk space its contents occupied. A missing file is a no-op
// (nothing to clear), so the endpoint is idempotent.
func LogClear(opts LogTailOptions) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		filename, ok := resolveLogFile(r.URL.Query().Get("file"))
		if !ok {
			http.Error(w, "invalid file param: must be 'argus' or 'hook-scripts'", http.StatusBadRequest)
			return
		}

		path := filepath.Join(opts.ArgusDir, filename)
		if err := os.Truncate(path, 0); err != nil && !os.IsNotExist(err) {
			log.Printf("[handler] clear log %s: %v", filename, err)
			http.Error(w, "clear log failed", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(map[string]any{"file": filename, "cleared": true}); err != nil {
			log.Printf("[handler] encode log-clear: %v", err)
		}
	})
}

func tailLines(path string, n int) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var all []string
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		all = append(all, sc.Text())
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}

	if len(all) <= n {
		return all, nil
	}
	return all[len(all)-n:], nil
}
