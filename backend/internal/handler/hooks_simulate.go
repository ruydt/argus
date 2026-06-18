package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os/exec"
	"strconv"
	"time"
)

type simulateRequest struct {
	Command        string          `json:"command"`
	Payload        json.RawMessage `json:"payload"`
	TimeoutSeconds *int            `json:"timeout_seconds,omitempty"`
}

type simulateResponse struct {
	Stdout     string `json:"stdout"`
	Stderr     string `json:"stderr"`
	ExitCode   int    `json:"exit_code"`
	DurationMs int64  `json:"duration_ms"`
}

// runHookCommand executes `sh -c command` with payload on stdin under a timeout.
// The hook simulator runs user-typed shell commands, so a shell is intentional.
func runHookCommand(ctx context.Context, command string, payload []byte, timeoutSeconds int) simulateResponse {
	cctx, cancel := withTimeout(ctx, timeoutSeconds)
	defer cancel()
	return runCmd(cctx, exec.CommandContext(cctx, "sh", "-c", command), payload, timeoutSeconds)
}

// runHookExec executes name with args directly (NO shell) under a timeout. Used
// for the community sandbox so attacker-controlled filenames/args can never be
// reinterpreted by a shell.
func runHookExec(ctx context.Context, name string, args []string, payload []byte, timeoutSeconds int) simulateResponse {
	cctx, cancel := withTimeout(ctx, timeoutSeconds)
	defer cancel()
	return runCmd(cctx, exec.CommandContext(cctx, name, args...), payload, timeoutSeconds)
}

func withTimeout(ctx context.Context, timeoutSeconds int) (context.Context, context.CancelFunc) {
	if timeoutSeconds <= 0 {
		timeoutSeconds = 10
	}
	return context.WithTimeout(ctx, time.Duration(timeoutSeconds)*time.Second)
}

// maxCaptureBytes caps stdout/stderr captured from a simulated hook so a runaway
// command that floods output can't OOM the backend or freeze the simulator panel.
const maxCaptureBytes = 1 << 20 // 1 MiB

// cappedBuffer collects up to limit bytes, then drops the rest and flags truncation.
// Write always reports the full length so the child process is never killed by a
// short-write error.
type cappedBuffer struct {
	buf       bytes.Buffer
	limit     int
	truncated bool
}

func (c *cappedBuffer) Write(p []byte) (int, error) {
	if remaining := c.limit - c.buf.Len(); remaining > 0 {
		if len(p) > remaining {
			c.buf.Write(p[:remaining])
			c.truncated = true
		} else {
			c.buf.Write(p)
		}
	} else if len(p) > 0 {
		c.truncated = true
	}
	return len(p), nil
}

func (c *cappedBuffer) WriteString(s string) { c.buf.WriteString(s) }
func (c *cappedBuffer) Len() int             { return c.buf.Len() }

func (c *cappedBuffer) String() string {
	if c.truncated {
		return c.buf.String() + "\n…output truncated (1 MiB cap)…"
	}
	return c.buf.String()
}

// runCmd runs cmd with payload on stdin, capturing (capped) stdout/stderr/exit code.
func runCmd(cctx context.Context, cmd *exec.Cmd, payload []byte, timeoutSeconds int) simulateResponse {
	cmd.Stdin = bytes.NewReader(payload)

	stdout := &cappedBuffer{limit: maxCaptureBytes}
	stderr := &cappedBuffer{limit: maxCaptureBytes}
	cmd.Stdout = stdout
	cmd.Stderr = stderr

	start := time.Now()
	runErr := cmd.Run()
	durationMs := time.Since(start).Milliseconds()

	exitCode := 0
	if runErr != nil {
		var exitErr *exec.ExitError
		switch {
		case cctx.Err() == context.DeadlineExceeded:
			// Genuine timeout — the only case that should say "timed out".
			exitCode = -1
			if stderr.Len() == 0 {
				stderr.WriteString("hook timed out after " + strconv.Itoa(timeoutSeconds) + "s")
			}
		case errors.As(runErr, &exitErr):
			exitCode = exitErr.ExitCode()
		default:
			// sh-not-found, missing binary, permission denied, client disconnect, etc.
			exitCode = -1
			if stderr.Len() == 0 {
				stderr.WriteString(runErr.Error())
			}
		}
	}

	return simulateResponse{
		Stdout:     stdout.String(),
		Stderr:     stderr.String(),
		ExitCode:   exitCode,
		DurationMs: durationMs,
	}
}

func HooksSimulate() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req simulateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}
		if req.Command == "" {
			http.Error(w, "command is required", http.StatusBadRequest)
			return
		}
		if len(req.Payload) == 0 || !json.Valid(req.Payload) {
			http.Error(w, "payload must be valid JSON", http.StatusBadRequest)
			return
		}

		timeoutSeconds := 10
		if req.TimeoutSeconds != nil && *req.TimeoutSeconds > 0 {
			timeoutSeconds = *req.TimeoutSeconds
		}

		resp := runHookCommand(r.Context(), req.Command, req.Payload, timeoutSeconds)

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	})
}
