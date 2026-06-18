package main

import (
	"crypto/sha256"
	"database/sql"
	"flag"
	"fmt"
	"log/slog"
	"math/rand"
	"os"
	"time"

	"argus/internal/config"

	_ "modernc.org/sqlite"
)

func main() {
	if err := run(); err != nil {
		slog.Error("seed failed", "err", err)
		os.Exit(1)
	}
}

func run() error {
	// Seed directly against the same local SQLite file the backend server uses.
	// Override with -db or the DB_PATH env var; otherwise the repo default is used.
	dbFlag := flag.String("db", "", "path to argus SQLite DB (default: DB_PATH env or repo default)")
	flag.Parse()
	dbPath := *dbFlag
	if dbPath == "" {
		dbPath = config.Load().DBPath
	}
	slog.Info("seeding", "db", dbPath)
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return fmt.Errorf("failed to open db: %w", err)
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

	failures := 0
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

		// Insert or update session record with lifecycle fields only (usage columns dropped in migration 018).
		_, err = db.Exec(`
			INSERT INTO sessions (
				session_id, agent, model, source, cwd, transcript_path, started_at, last_seen_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(session_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
			sessionID, agent, model, source, cwd, transcriptPath, startedAt.Format(time.RFC3339), lastSeenAt.Format(time.RFC3339),
		)
		if err != nil {
			slog.Error("failed to insert session", "session_id", sessionID, "err", err)
			failures++
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
				failures++
			}
		}
	}

	if failures > 0 {
		slog.Error("seed completed with failures", "failures", failures)
		return fmt.Errorf("seed completed with %d failures", failures)
	}
	fmt.Println("Successfully seeded 50 sessions and their events.")
	return nil
}
