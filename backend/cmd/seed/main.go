package main

import (
	"crypto/sha256"
	"database/sql"
	"fmt"
	"log/slog"
	"math/rand"
	"os"
	"time"

	_ "modernc.org/sqlite"
)

func main() {
	// Seed directly against the local SQLite file used by the backend server.
	dbPath := "/home/leeduy0403/emruy/backend/cmd/server/hooker.db"
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		slog.Error("failed to open db", "err", err)
		os.Exit(1)
	}
	defer func() {
		if err := db.Close(); err != nil {
			slog.Error("failed to close db", "err", err)
		}
	}()

	// Define mock data for seeding the database with realistic agent activity
	agents := []string{"claudecode", "codex", "cline"}
	models := []string{"claude-3-5-sonnet-20241022", "gpt-4o", "claude-3-opus-20240229"}
	actions := []string{"BASH", "EDIT", "READ", "LS", "CREATE", "DELETE"}
	sources := []string{"startup", "cli", "web"}
	hooks := []string{"SessionStart", "PreToolUse", "PostToolUse", "ToolError", "SessionStop"}

	// Use a single anchor time so all generated timestamps stay internally consistent.
	now := time.Now()

	for i := 1; i <= 50; i++ {
		// Give each seeded session a predictable id so seeded rows are easy to inspect manually.
		sessionID := fmt.Sprintf("sess-%03d", i)
		agent := agents[rand.Intn(len(agents))]
		model := models[rand.Intn(len(models))]
		source := sources[rand.Intn(len(sources))]
		cwd := fmt.Sprintf("/home/user/project-%d", rand.Intn(10))
		transcriptPath := fmt.Sprintf("%s/transcript-%s.jsonl", cwd, sessionID)

		// Spread synthetic sessions over the last 48 hours to make dashboard views look active.
		startedAt := now.Add(time.Duration(-rand.Intn(48)) * time.Hour)
		lastSeenAt := startedAt.Add(time.Duration(rand.Intn(60)) * time.Minute)

		// Keep token totals high enough to produce more realistic-looking usage aggregates.
		inputTokens := rand.Intn(50000) + 1000
		outputTokens := rand.Intn(5000) + 100
		turns := rand.Intn(50) + 1

		// Insert or update session record with random usage metrics and timestamps
		_, err = db.Exec(`
			INSERT INTO sessions (
				session_id, agent, model, source, cwd, transcript_path, started_at, last_seen_at,
				input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, turns
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(session_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
			sessionID, agent, model, source, cwd, transcriptPath, startedAt.Format(time.RFC3339), lastSeenAt.Format(time.RFC3339),
			inputTokens, outputTokens, rand.Intn(2000), rand.Intn(10000), turns,
		)
		if err != nil {
			slog.Error("failed to insert session", "session_id", sessionID, "err", err)
			continue
		}

		numEvents := rand.Intn(11) + 5
		// Vary event volume per session so seeded timelines are not uniformly shaped.
		// Generate and insert multiple hook events for each session to simulate a timeline
		for j := 0; j < numEvents; j++ {
			eventTime := startedAt.Add(time.Duration(j) * time.Minute)
			hookName := hooks[rand.Intn(len(hooks))]
			action := actions[rand.Intn(len(actions))]

			// Reuse coarse turn ids while keeping tool invocation ids unique within the session.
			turnID := fmt.Sprintf("turn-%d", j/2)
			toolUseID := fmt.Sprintf("tool-%d", j)

			// Keep each generated event idempotent so rerunning the seed avoids duplicate hook rows.
			dedupKey := fmt.Sprintf("%x", sha256.Sum256([]byte(fmt.Sprintf("%s|%s|%s|%s|%s", sessionID, turnID, toolUseID, hookName, eventTime.Format(time.RFC3339)))))

			// Store minimal placeholder payload fields because the dashboard only needs lightweight seed data.
			_, err = db.Exec(`
				INSERT OR IGNORE INTO hook_events (
					created_at, agent, session_id, hook_event_name, turn_id, tool_use_id,
					tool_name, model, source, cwd, transcript_path, action, path, command,
					ctx_before, ctx_after, raw_payload, dedup_key
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', '', ?)`,
				eventTime.Format(time.RFC3339), agent, sessionID, hookName, turnID, toolUseID,
				"tool_name", model, source, cwd, transcriptPath, action, "/file/path/test.go", "ls -la",
				dedupKey,
			)
			if err != nil {
				slog.Error("failed to insert event", "session_id", sessionID, "err", err)
			}
		}
	}

	fmt.Println("Successfully seeded 50 sessions and their events.")
}
