package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	hookURL    = "http://127.0.0.1:8765/api/hook"
	chatsDir   = "/home/huyng/.gemini/tmp/hooker/chats"
	pollInterval = 2 * time.Second
)

type TranscriptLine struct {
	Type      string      `json:"type"`
	ToolCalls []ToolCall `json:"toolCalls"`
	Timestamp string      `json:"timestamp"`
	Model     string      `json:"model"`
}

type ToolCall struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Args      map[string]interface{} `json:"args"`
	Result    []struct {
		FunctionResponse struct {
			Response struct {
				Output   string `json:"output"`
				ExitCode int    `json:"exitCode"`
			} `json:"response"`
		} `json:"functionResponse"`
	} `json:"result"`
	Status    string `json:"status"`
	Timestamp string `json:"timestamp"`
}

func main() {
	offsets := make(map[string]int64)

	for {
		files, err := filepath.Glob(filepath.Join(chatsDir, "*.jsonl"))
		if err != nil {
			log.Printf("Glob error: %v", err)
			time.Sleep(pollInterval)
			continue
		}

		for _, file := range files {
			processFile(file, offsets)
		}

		time.Sleep(pollInterval)
	}
}

func processFile(path string, offsets map[string]int64) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	stat, _ := f.Stat()
	offset := offsets[path]

	if stat.Size() < offset {
		// File rotated or truncated
		offset = 0
	}

	if stat.Size() == offset {
		return
	}

	_, _ = f.Seek(offset, 0)
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		var tl TranscriptLine
		if err := json.Unmarshal([]byte(line), &tl); err != nil {
			continue
		}

		if tl.Type == "gemini" && len(tl.ToolCalls) > 0 {
			sessionID := extractSessionID(path)
			for _, tc := range tl.ToolCalls {
				sendToolHooks(sessionID, path, tl.Model, tc)
			}
		}
	}

	newOffset, _ := f.Seek(0, io.SeekCurrent)
	offsets[path] = newOffset
}

func extractSessionID(path string) string {
	base := filepath.Base(path)
	// session-DATE-ID.jsonl
	parts := strings.Split(strings.TrimSuffix(base, ".jsonl"), "-")
	if len(parts) >= 3 {
		return parts[len(parts)-1]
	}
	return base
}

func sendToolHooks(sessionID, path, model string, tc ToolCall) {
	// BeforeTool
	payload := map[string]interface{}{
		"agent":           "geminicli",
		"session_id":      sessionID,
		"transcript_path": path,
		"hook_event_name": "BeforeTool",
		"tool_name":       tc.Name,
		"tool_input":      tc.Args,
		"model":           model,
		"turn_id":         tc.ID,
	}
	sendHook(payload)

	// AfterTool if success
	if tc.Status == "success" {
		afterPayload := map[string]interface{}{
			"agent":           "geminicli",
			"session_id":      sessionID,
			"transcript_path": path,
			"hook_event_name": "AfterTool",
			"tool_name":       tc.Name,
			"tool_input":      tc.Args,
			"model":           model,
			"turn_id":         tc.ID,
		}
		if len(tc.Result) > 0 {
			afterPayload["response"] = tc.Result[0].FunctionResponse.Response.Output
		}
		sendHook(afterPayload)
	}
}

func sendHook(payload interface{}) {
	data, _ := json.Marshal(payload)
	resp, err := http.Post(hookURL, "application/json", bytes.NewBuffer(data))
	if err != nil {
		log.Printf("Hook error: %v", err)
		return
	}
	_ = resp.Body.Close()
}
