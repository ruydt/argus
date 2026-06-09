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

		ctx, cancel := context.WithTimeout(r.Context(), time.Duration(timeoutSeconds)*time.Second)
		defer cancel()

		cmd := exec.CommandContext(ctx, "sh", "-c", req.Command)
		cmd.Stdin = bytes.NewReader(req.Payload)

		var stdout, stderr bytes.Buffer
		cmd.Stdout = &stdout
		cmd.Stderr = &stderr

		start := time.Now()
		runErr := cmd.Run()
		durationMs := time.Since(start).Milliseconds()

		exitCode := 0
		if runErr != nil {
			if ctx.Err() == context.DeadlineExceeded {
				exitCode = -1
				if stderr.Len() == 0 {
					stderr.WriteString("hook timed out after " + strconv.Itoa(timeoutSeconds) + "s")
				}
			} else if exitErr, ok := runErr.(*exec.ExitError); ok {
				exitCode = exitErr.ExitCode()
			} else {
				// context deadline exceeded or OS-level failure
				exitCode = -1
				if stderr.Len() == 0 {
					stderr.WriteString("hook timed out after " + strconv.Itoa(timeoutSeconds) + "s")
				}
			}
		}

		resp := simulateResponse{
			Stdout:     stdout.String(),
			Stderr:     stderr.String(),
			ExitCode:   exitCode,
			DurationMs: durationMs,
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	})
}
