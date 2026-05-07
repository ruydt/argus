package sqlite

import (
	"crypto/sha256"
	"database/sql"
	_ "embed"
	"encoding/json"
	"fmt"
	"log"
	"slices"
	"time"

	_ "modernc.org/sqlite"

	"agent-monitor/internal/domain"
)

//go:embed migrations/001_init.sql
var schema001 string

//go:embed migrations/002_add_event_fields.sql
var schema002 string

//go:embed migrations/003_tool_calls.sql
var schema003 string

//go:embed migrations/004_tool_result.sql
var schema004 string

//go:embed migrations/005_session_usage.sql
var schema005 string

type DB struct {
	db *sql.DB
}

func New(path string) (*DB, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	d := &DB{db: db}
	if err := d.migrate(); err != nil {
		return nil, err
	}
	return d, nil
}

func (d *DB) migrate() error {
	if _, err := d.db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)`); err != nil {
		return fmt.Errorf("create migrations table: %w", err)
	}
	migrations := []struct {
		version int
		sql     string
	}{
		{1, schema001},
		{2, schema002},
		{3, schema003},
		{4, schema004},
		{5, schema005},
	}
	for _, m := range migrations {
		var count int
		_ = d.db.QueryRow(`SELECT COUNT(*) FROM schema_migrations WHERE version = ?`, m.version).Scan(&count)
		if count > 0 {
			continue
		}
		if _, err := d.db.Exec(m.sql); err != nil {
			return fmt.Errorf("migration %d: %w", m.version, err)
		}
		if _, err := d.db.Exec(`INSERT INTO schema_migrations (version) VALUES (?)`, m.version); err != nil {
			return fmt.Errorf("record migration %d: %w", m.version, err)
		}
	}
	return nil
}

func (d *DB) Add(e domain.NormalizedEvent) error {
	_, err := d.db.Exec(`
		INSERT OR IGNORE INTO hook_events (
			created_at, agent, session_id, hook_event_name, turn_id, tool_use_id,
			tool_name, model, source, cwd, transcript_path,
			action, path, command, old_string, new_string, start_line,
			ctx_before, ctx_after, raw_payload, dedup_key,
			prompt, description, permission_mode, response,
			error_message, error_type,
			subagent_id, subagent_type,
			task_id, task_title, task_description,
			notification_type, notification_title, notification_message,
			change_type, old_cwd, new_cwd, tool_calls_json,
			tool_result_stdout, tool_result_stderr, duration_ms
		) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		e.Time, e.Agent, e.Session, e.HookEventName, e.TurnID, e.ToolUseID,
		e.Tool, e.Model, e.Source, e.CWD, e.TranscriptPath,
		nullStr(e.Action), nullStr(e.Path), nullStr(e.Command),
		nullStr(e.OldString), nullStr(e.NewString), nullInt(e.StartLine),
		jsonSlice(e.CtxBefore), jsonSlice(e.CtxAfter),
		string(e.RawPayload), dedupKey(e),
		nullStr(e.Prompt), nullStr(e.Description), nullStr(e.PermissionMode), nullStr(e.Response),
		nullStr(e.ErrorMessage), nullStr(e.ErrorType),
		nullStr(e.SubagentID), nullStr(e.SubagentType),
		nullStr(e.TaskID), nullStr(e.TaskTitle), nullStr(e.TaskDescription),
		nullStr(e.NotificationType), nullStr(e.NotificationTitle), nullStr(e.NotificationMessage),
		nullStr(e.ChangeType), nullStr(e.OldCWD), nullStr(e.NewCWD), nullStr(e.ToolCallsJSON),
		nullStr(e.ToolResultStdout), nullStr(e.ToolResultStderr), nullInt(e.DurationMS),
	)
	return err
}

func (d *DB) List(limit int) ([]domain.NormalizedEvent, error) {
	rows, err := d.db.Query(`
		SELECT created_at, agent, session_id, hook_event_name,
		       COALESCE(turn_id,''), COALESCE(tool_use_id,''),
		       COALESCE(tool_name,''), COALESCE(model,''), COALESCE(source,''),
		       COALESCE(cwd,''), COALESCE(transcript_path,''),
		       COALESCE(action,''), COALESCE(path,''), COALESCE(command,''),
		       COALESCE(old_string,''), COALESCE(new_string,''),
		       COALESCE(start_line,0), ctx_before, ctx_after,
		       COALESCE(prompt,''), COALESCE(description,''),
		       COALESCE(permission_mode,''), COALESCE(response,''),
		       COALESCE(error_message,''), COALESCE(error_type,''),
		       COALESCE(subagent_id,''), COALESCE(subagent_type,''),
		       COALESCE(task_id,''), COALESCE(task_title,''), COALESCE(task_description,''),
		       COALESCE(notification_type,''), COALESCE(notification_title,''), COALESCE(notification_message,''),
		       COALESCE(change_type,''), COALESCE(old_cwd,''), COALESCE(new_cwd,''),
		       COALESCE(tool_calls_json,''),
		       COALESCE(tool_result_stdout,''), COALESCE(tool_result_stderr,''),
		       COALESCE(duration_ms,0)
		FROM hook_events
		ORDER BY id DESC
		LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []domain.NormalizedEvent
	for rows.Next() {
		var e domain.NormalizedEvent
		var ctxBefore, ctxAfter string
		if err := rows.Scan(
			&e.Time, &e.Agent, &e.Session, &e.HookEventName,
			&e.TurnID, &e.ToolUseID, &e.Tool, &e.Model, &e.Source,
			&e.CWD, &e.TranscriptPath,
			&e.Action, &e.Path, &e.Command,
			&e.OldString, &e.NewString, &e.StartLine,
			&ctxBefore, &ctxAfter,
			&e.Prompt, &e.Description,
			&e.PermissionMode, &e.Response,
			&e.ErrorMessage, &e.ErrorType,
			&e.SubagentID, &e.SubagentType,
			&e.TaskID, &e.TaskTitle, &e.TaskDescription,
			&e.NotificationType, &e.NotificationTitle, &e.NotificationMessage,
			&e.ChangeType, &e.OldCWD, &e.NewCWD, &e.ToolCallsJSON,
			&e.ToolResultStdout, &e.ToolResultStderr, &e.DurationMS,
		); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(ctxBefore), &e.CtxBefore)
		_ = json.Unmarshal([]byte(ctxAfter), &e.CtxAfter)
		events = append(events, e)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	slices.Reverse(events)
	return events, nil
}

func (d *DB) SessionModel(sessionID string) (string, error) {
	var model string
	err := d.db.QueryRow(
		`SELECT COALESCE(model,'') FROM sessions WHERE session_id = ?`, sessionID,
	).Scan(&model)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return model, err
}

func (d *DB) ListSessions() ([]domain.Session, error) {
	rows, err := d.db.Query(`
		SELECT session_id, agent, COALESCE(model,''), COALESCE(source,''), COALESCE(cwd,''), 
		       COALESCE(transcript_path,''), started_at, last_seen_at,
		       COALESCE(input_tokens,0), COALESCE(output_tokens,0), COALESCE(cache_creation_tokens,0), 
		       COALESCE(cache_read_tokens,0), COALESCE(turns,0)
		FROM sessions
		ORDER BY last_seen_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []domain.Session
	for rows.Next() {
		var s domain.Session
		if err := rows.Scan(
			&s.SessionID, &s.Agent, &s.Model, &s.Source, &s.CWD,
			&s.TranscriptPath, &s.StartedAt, &s.LastSeenAt,
			&s.Usage.InputTokens, &s.Usage.OutputTokens, &s.Usage.CacheCreationTokens,
			&s.Usage.CacheReadTokens, &s.Usage.Turns,
		); err != nil {
			return nil, err
		}
		sessions = append(sessions, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return sessions, nil
}

func (d *DB) UpsertSession(sessionID, agent, model, source, cwd, transcriptPath string, usage domain.SessionUsage) error {
	now := time.Now().Format(time.RFC3339)
	_, err := d.db.Exec(`
		INSERT INTO sessions (
			session_id, agent, model, source, cwd, transcript_path, started_at, last_seen_at,
			input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, turns
		)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT(session_id) DO UPDATE SET
			model        = COALESCE(NULLIF(excluded.model,''), sessions.model),
			last_seen_at = excluded.last_seen_at,
			input_tokens = excluded.input_tokens,
			output_tokens = excluded.output_tokens,
			cache_creation_tokens = excluded.cache_creation_tokens,
			cache_read_tokens = excluded.cache_read_tokens,
			turns = excluded.turns`,
		sessionID, agent, model, source, cwd, transcriptPath, now, now,
		usage.InputTokens, usage.OutputTokens, usage.CacheCreationTokens, usage.CacheReadTokens, usage.Turns,
	)
	return err
}

func (d *DB) GetDashboardStats(since string) (*domain.DashboardStats, error) {
	stats := &domain.DashboardStats{
		Timeline:     []domain.TimelineBucket{},
		TopActions:   []domain.ActionCount{},
		AgentUsage:   []domain.AgentModelUsage{},
		SessionUsage: []domain.DashboardSessionUsage{},
	}

	// Build WHERE clauses based on 'since'
	eventWhere := ""
	sessionWhere := ""
	var args []any
	if since != "" {
		eventWhere = " AND created_at >= ?"
		sessionWhere = " WHERE started_at >= ?"
		args = append(args, since)
	}

	// Basic Counts
	_ = d.db.QueryRow("SELECT COUNT(*) FROM sessions"+sessionWhere, args...).Scan(&stats.TotalSessions)
	_ = d.db.QueryRow("SELECT COUNT(*) FROM hook_events WHERE 1=1"+eventWhere, args...).Scan(&stats.TotalEvents)

	var in, out sql.NullInt64
	_ = d.db.QueryRow("SELECT SUM(input_tokens), SUM(output_tokens) FROM sessions"+sessionWhere, args...).Scan(&in, &out)
	stats.TotalInputTokens = int(in.Int64)
	stats.TotalOutputTokens = int(out.Int64)

	// Timeline
	if rows, err := d.db.Query(`
		SELECT strftime('%Y-%m-%d %H:00', created_at) as bucket, COUNT(*) 
		FROM hook_events 
		WHERE created_at IS NOT NULL`+eventWhere+`
		GROUP BY bucket 
		ORDER BY bucket ASC
	`, args...); err == nil {
		defer rows.Close()
		for rows.Next() {
			var b domain.TimelineBucket
			if err := rows.Scan(&b.Date, &b.Count); err == nil {
				stats.Timeline = append(stats.Timeline, b)
			}
		}
		_ = rows.Err()
	} else if err != nil {
		log.Printf("dashboard: timeline query: %v", err)
	}

	// Top Actions
	if rows, err := d.db.Query(`
		SELECT action, COUNT(*) as count 
		FROM hook_events 
		WHERE action IS NOT NULL AND action != ''`+eventWhere+`
		GROUP BY action 
		ORDER BY count DESC 
		LIMIT 10
	`, args...); err == nil {
		defer rows.Close()
		for rows.Next() {
			var a domain.ActionCount
			if err := rows.Scan(&a.Name, &a.Value); err == nil {
				stats.TopActions = append(stats.TopActions, a)
			}
		}
		_ = rows.Err()
	} else if err != nil {
		log.Printf("dashboard: top actions query: %v", err)
	}

	// Agent Usage
	if rows, err := d.db.Query(`
		SELECT agent, model, SUM(input_tokens), SUM(output_tokens) 
		FROM sessions`+sessionWhere+`
		GROUP BY agent, model
	`, args...); err == nil {
		defer rows.Close()
		for rows.Next() {
			var u domain.AgentModelUsage
			if err := rows.Scan(&u.Agent, &u.Model, &u.Input, &u.Output); err == nil {
				stats.AgentUsage = append(stats.AgentUsage, u)
			}
		}
		_ = rows.Err()
	} else if err != nil {
		log.Printf("dashboard: agent usage query: %v", err)
	}

	return stats, nil
}

func dedupKey(e domain.NormalizedEvent) string {
	h := sha256.Sum256([]byte(
		e.Session + "|" + e.TurnID + "|" + e.ToolUseID + "|" + e.HookEventName + "|" + e.Time,
	))
	return fmt.Sprintf("%x", h)
}

func nullStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func nullInt(n int) any {
	if n == 0 {
		return nil
	}
	return n
}

func jsonSlice[T any](v []T) string {
	if v == nil {
		return "[]"
	}
	b, _ := json.Marshal(v)
	return string(b)
}
