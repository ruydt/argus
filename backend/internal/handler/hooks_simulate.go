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

// runHookCommand executes `sh -c command` with payload on stdin under a timeout,
// capturing stdout/stderr/exit code. Shared by the hook simulator and the
// community sandbox.
func runHookCommand(ctx context.Context, command string, payload []byte, timeoutSeconds int) simulateResponse {
	if timeoutSeconds <= 0 {
		timeoutSeconds = 10
	}
	cctx, cancel := context.WithTimeout(ctx, time.Duration(timeoutSeconds)*time.Second)
	defer cancel()

	cmd := exec.CommandContext(cctx, "sh", "-c", command)
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
