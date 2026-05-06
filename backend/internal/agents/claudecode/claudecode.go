package claudecode

import (
	"bufio"
	"encoding/json"
	"os"
	"strings"
)

type DiffInput struct {
	OldString string
	NewString string
}

type SessionUsage struct {
	InputTokens         int `json:"input_tokens"`
	OutputTokens        int `json:"output_tokens"`
	CacheCreationTokens int `json:"cache_creation_tokens"`
	CacheReadTokens     int `json:"cache_read_tokens"`
	Turns               int `json:"turns"`
}

func MatchesTranscript(transcriptPath string) bool {
	return strings.Contains(transcriptPath, "/.claude/")
}

func Diff(input DiffInput) (oldStr, newStr string) {
	return input.OldString, input.NewString
}

// ModelFromTranscript scans a Claude Code session JSONL for the first
// assistant message and returns its model string.
func ModelFromTranscript(transcriptPath string) string {
	f, err := os.Open(transcriptPath)
	if err != nil {
		return ""
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 2*1024*1024), 2*1024*1024)
	for scanner.Scan() {
		var entry struct {
			Type    string `json:"type"`
			Message struct {
				Model string `json:"model"`
			} `json:"message"`
		}
		if json.Unmarshal(scanner.Bytes(), &entry) == nil &&
			entry.Type == "assistant" && entry.Message.Model != "" {
			return entry.Message.Model
		}
	}
	return ""
}

func ComputeUsage(transcriptPath string) SessionUsage {
	f, err := os.Open(transcriptPath)
	if err != nil {
		return SessionUsage{}
	}
	defer f.Close()
	var u SessionUsage
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 4*1024*1024), 4*1024*1024)
	for scanner.Scan() {
		var entry struct {
			Type    string `json:"type"`
			Message struct {
				Usage struct {
					InputTokens         int `json:"input_tokens"`
					OutputTokens        int `json:"output_tokens"`
					CacheCreationTokens int `json:"cache_creation_input_tokens"`
					CacheReadTokens     int `json:"cache_read_input_tokens"`
				} `json:"usage"`
			} `json:"message"`
		}
		if json.Unmarshal(scanner.Bytes(), &entry) == nil && entry.Type == "assistant" {
			u.InputTokens += entry.Message.Usage.InputTokens
			u.OutputTokens += entry.Message.Usage.OutputTokens
			u.CacheCreationTokens += entry.Message.Usage.CacheCreationTokens
			u.CacheReadTokens += entry.Message.Usage.CacheReadTokens
			u.Turns++
		}
	}
	return u
}
