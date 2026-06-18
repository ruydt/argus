package handler

import (
	"fmt"
	"os"
	"path/filepath"
)

// hooksDir returns ~/.argus/hooks for the given argus home dir.
func hooksDir(argusDir string) string { return filepath.Join(argusDir, "hooks") }

// hookTarget resolves the on-disk path for a script filename, rejecting any
// filename that is not a flat basename (defense-in-depth against traversal).
func hookTarget(argusDir, filename string) (string, error) {
	if filename == "" || filepath.Base(filename) != filename {
		return "", fmt.Errorf("invalid script filename %q", filename)
	}
	return filepath.Join(hooksDir(argusDir), filename), nil
}

// writeHookScript writes body to <argusDir>/hooks/<filename> atomically.
func writeHookScript(argusDir, filename string, body []byte) error {
	target, err := hookTarget(argusDir, filename)
	if err != nil {
		return err
	}
	// 0o700 dir / 0o700 file: argus captures privacy-sensitive data and the hook
	// runner executes as the same user, so scripts start owner-private (not world-readable).
	if err := os.MkdirAll(hooksDir(argusDir), 0o700); err != nil {
		return err
	}
	f, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o700)
	if err != nil {
		return err
	}
	_, writeErr := f.Write(body)
	closeErr := f.Close()
	if writeErr != nil {
		return writeErr
	}
	return closeErr
}

type scriptIDRequest struct {
	ID string `json:"id"`
}
