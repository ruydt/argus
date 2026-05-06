package codex

import (
	"bufio"
	"encoding/json"
	"os"
	"regexp"
	"strings"
)

type DiffInput struct {
	OldStr string
	NewStr string
}

type SessionUsage struct {
	InputTokens         int `json:"input_tokens"`
	OutputTokens        int `json:"output_tokens"`
	CacheCreationTokens int `json:"cache_creation_tokens"`
	CacheReadTokens     int `json:"cache_read_tokens"`
	Turns               int `json:"turns"`
}

func MatchesTranscript(transcriptPath string) bool {
	return !strings.Contains(transcriptPath, "/.claude/")
}

func Diff(input DiffInput) (oldStr, newStr string) {
	return input.OldStr, input.NewStr
}

var hunkHeader = regexp.MustCompile(`^@@\s*-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?`)

// ParseApplyPatch extracts one unified-diff hunk from an apply_patch command body.
// It returns old/new text blocks and the old-file start line from the hunk header.
func ParseApplyPatch(command string) (oldStr, newStr string, startLine int) {
	if !strings.Contains(command, "*** Begin Patch") {
		return "", "", 0
	}

	lines := strings.Split(command, "\n")
	var oldLines, newLines []string
	inHunk := false

	for _, line := range lines {
		trimmed := strings.TrimLeft(line, " \t")
		if !inHunk {
			if m := hunkHeader.FindStringSubmatch(trimmed); m != nil {
				startLine = atoi(m[1])
				inHunk = true
			}
			continue
		}

		if strings.HasPrefix(trimmed, "@@") || strings.HasPrefix(trimmed, "*** End Patch") {
			break
		}
		if strings.HasPrefix(trimmed, `\ No newline`) {
			continue
		}
		if strings.HasPrefix(trimmed, " ") {
			text := strings.TrimPrefix(trimmed, " ")
			oldLines = append(oldLines, text)
			newLines = append(newLines, text)
			continue
		}
		if strings.HasPrefix(trimmed, "-") {
			oldLines = append(oldLines, strings.TrimPrefix(trimmed, "-"))
			continue
		}
		if strings.HasPrefix(trimmed, "+") {
			newLines = append(newLines, strings.TrimPrefix(trimmed, "+"))
			continue
		}
	}

	if len(oldLines) == 0 && len(newLines) == 0 {
		return "", "", 0
	}
	return strings.Join(oldLines, "\n"), strings.Join(newLines, "\n"), startLine
}

func atoi(s string) int {
	n := 0
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c < '0' || c > '9' {
			break
		}
		n = n*10 + int(c-'0')
	}
	return n
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
			Payload struct {
				Type string `json:"type"`
				Info struct {
					Total struct {
						InputTokens       int `json:"input_tokens"`
						CachedInputTokens int `json:"cached_input_tokens"`
						OutputTokens      int `json:"output_tokens"`
					} `json:"total_token_usage"`
				} `json:"info"`
			} `json:"payload"`
		}
		if json.Unmarshal(scanner.Bytes(), &entry) != nil {
			continue
		}
		if entry.Type != "event_msg" || entry.Payload.Type != "token_count" {
			continue
		}
		u.InputTokens = entry.Payload.Info.Total.InputTokens
		u.CacheReadTokens = entry.Payload.Info.Total.CachedInputTokens
		u.OutputTokens = entry.Payload.Info.Total.OutputTokens
		u.Turns++
	}
	return u
}
