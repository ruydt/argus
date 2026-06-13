package handler

import (
	"bytes"
	"context"
	"encoding/json"
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

// runCmd runs cmd with payload on stdin, capturing stdout/stderr/exit code.
func runCmd(cctx context.Context, cmd *exec.Cmd, payload []byte, timeoutSeconds int) simulateResponse {
	cmd.Stdin = bytes.NewReader(payload)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	start := time.Now()
	runErr := cmd.Run()
	durationMs := time.Since(start).Milliseconds()

	exitCode := 0
	if runErr != nil {
		if exitErr, ok := runErr.(*exec.ExitError); ok && cctx.Err() != context.DeadlineExceeded {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = -1
			if stderr.Len() == 0 {
				stderr.WriteString("hook timed out after " + strconv.Itoa(timeoutSeconds) + "s")
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
