package sqlite

import (
	"context"
	"crypto/sha256"
	"database/sql"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"path/filepath"
	"slices"
	"strings"
	"sync/atomic"
	"time"

	// Register SQLite driver for database/sql.
	_ "modernc.org/sqlite"

	"hooker/internal/domain"
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

//go:embed migrations/006_compact_trigger.sql
var schema006 string

//go:embed migrations/007_session_ended_at.sql
var schema007 string

//go:embed migrations/008_normalization_fields.sql
var schema008 string

type DB struct {
	db     *sql.DB
	ready  atomic.Bool
	cancel context.CancelFunc
}

const sqliteBusyTimeoutMS = 750
const sqliteWriteTimeout = 1500 * time.Millisecond

// RawDB exposes the underlying *sql.DB for tests and narrow storage utilities.
func (d *DB) RawDB() *sql.DB { return d.db }

func New(path string) (*DB, error) {
	// modernc.org/sqlite uses _pragma=name(value) format for connection parameters.
	db, err := sql.Open("sqlite", fmt.Sprintf("%s?_pragma=busy_timeout(%d)&_pragma=journal_mode(wal)&_pragma=synchronous(normal)", path, sqliteBusyTimeoutMS))
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	if path == ":memory:" {
		// A plain in-memory SQLite database is per connection, so tests that use
		// :memory: must stay on one connection to see the migrated schema.
		db.SetMaxOpenConns(1)
	} else {
		// Hook requests must not queue behind unrelated dashboard/session reads.
		// WAL mode allows concurrent readers; SQLite still serializes writes.
		db.SetMaxOpenConns(8)
		db.SetMaxIdleConns(8)
	}
	d := &DB{db: db}
	if err := d.migrate(); err != nil {
		return nil, err
	}
	d.ready.Store(true)
	ctx, cancel := context.WithCancel(context.Background())
	d.cancel = cancel
	startWALCheckpoint(ctx, db, 5*time.Minute)
	return d, nil
}

// Close stops the WAL checkpoint goroutine and closes the underlying database.
func (d *DB) Close() error {
	d.cancel()
	return d.db.Close()
}

// Ready reports whether the database is open and migrations are complete.
func (d *DB) Ready() bool { return d.ready.Load() }

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
		{6, schema006},
		{7, schema007},
		{8, schema008},
	}
	for _, m := range migrations {
		var count int
		_ = d.db.QueryRow(`SELECT COUNT(*) FROM schema_migrations WHERE version = ?`, m.version).Scan(&count)
		if count > 0 {
			continue
		}
		tx, err := d.db.Begin()
		if err != nil {
			return fmt.Errorf("migration %d begin: %w", m.version, err)
		}
		if _, err := tx.Exec(m.sql); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("migration %d: %w", m.version, err)
		}
		if _, err := tx.Exec(`INSERT INTO schema_migrations (version) VALUES (?)`, m.version); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("record migration %d: %w", m.version, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("migration %d commit: %w", m.version, err)
		}
	}
	return nil
}

func (d *DB) Add(e domain.NormalizedEvent) error {
	ctx, cancel := context.WithTimeout(context.Background(), sqliteWriteTimeout)
	defer cancel()

	_, err := d.db.ExecContext(ctx, `
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
			tool_result_stdout, tool_result_stderr, duration_ms, trigger,
			normalizer_version, agent_version, normalization_status
		) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
		nullStr(e.ToolResultStdout), nullStr(e.ToolResultStderr), nullInt(e.DurationMS), nullStr(e.Trigger),
		nullStr(e.NormalizerVersion), nullStr(e.AgentVersion), normalizationStatus(e.NormalizationStatus),
	)
	return err
}

func (d *DB) List(limit int) ([]domain.NormalizedEvent, error) {
	return d.listWithWhere("", nil, limit, 0)
}

func (d *DB) ListBySession(sessionID string, limit int) ([]domain.NormalizedEvent, error) {
	return d.listWithWhere("WHERE session_id = ?", []any{sessionID}, limit, 0)
}

func (d *DB) listWithWhere(where string, args []any, limit, offset int) ([]domain.NormalizedEvent, error) {
	query := `
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
		       COALESCE(duration_ms,0), COALESCE(trigger,''),
		       COALESCE(normalizer_version,''), COALESCE(agent_version,''), COALESCE(normalization_status,'')
		FROM hook_events
	`
	if where != "" {
		query += where + "\n"
	}
	query += "ORDER BY id DESC\n"

	queryArgs := append([]any{}, args...)
	if limit > 0 {
		query += "LIMIT ? OFFSET ?"
		queryArgs = append(queryArgs, limit, offset)
	}

	rows, err := d.db.Query(query, queryArgs...)
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
			&e.ToolResultStdout, &e.ToolResultStderr, &e.DurationMS, &e.Trigger,
			&e.NormalizerVersion, &e.AgentVersion, &e.NormalizationStatus,
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

func (d *DB) ListProjects() ([]domain.Project, error) {
	rows, err := d.db.Query(`
		SELECT
			COALESCE(cwd, '') AS cwd,
			COUNT(session_id) AS session_count,
			MAX(last_seen_at) AS last_activity,
			SUM(
				COALESCE(input_tokens,0) +
				COALESCE(output_tokens,0) +
				COALESCE(cache_creation_tokens,0) +
				COALESCE(cache_read_tokens,0)
			) AS total_tokens,
			GROUP_CONCAT(DISTINCT agent) AS agents,
			SUM(CASE WHEN (ended_at IS NULL OR ended_at = '') THEN 1 ELSE 0 END) AS live_count
		FROM sessions
		GROUP BY cwd
		ORDER BY last_activity DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var projects []domain.Project
	for rows.Next() {
		var p domain.Project
		var agents string
		if err := rows.Scan(&p.CWD, &p.SessionCount, &p.LastActivity, &p.TotalTokens, &agents, &p.LiveCount); err != nil {
			return nil, err
		}
		p.Name = projectName(p.CWD)
		p.Agents = splitAgents(agents)
		projects = append(projects, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return mergeChildProjects(projects), nil
}

// mergeChildProjects collapses sessions from subdirectory CWDs into their
// nearest parent project so e.g. /foo/bar doesn't show alongside /foo.
func mergeChildProjects(projects []domain.Project) []domain.Project {
	slices.SortStableFunc(projects, func(a, b domain.Project) int {
		return len(a.CWD) - len(b.CWD)
	})

	merged := make([]domain.Project, 0, len(projects))
	for _, p := range projects {
		parentIdx := -1
		for i := range merged {
			if merged[i].CWD != "" && strings.HasPrefix(p.CWD, merged[i].CWD+"/") {
				parentIdx = i // keep updating to get deepest match
			}
		}
		if parentIdx >= 0 {
			par := &merged[parentIdx]
			par.SessionCount += p.SessionCount
			par.TotalTokens += p.TotalTokens
			par.LiveCount += p.LiveCount
			if p.LastActivity > par.LastActivity {
				par.LastActivity = p.LastActivity
			}
			seen := make(map[string]struct{}, len(par.Agents))
			for _, a := range par.Agents {
				seen[a] = struct{}{}
			}
			for _, a := range p.Agents {
				if _, ok := seen[a]; !ok {
					par.Agents = append(par.Agents, a)
				}
			}
		} else {
			merged = append(merged, p)
		}
	}

	slices.SortStableFunc(merged, func(a, b domain.Project) int {
		switch {
		case a.LastActivity > b.LastActivity:
			return -1
		case a.LastActivity < b.LastActivity:
			return 1
		default:
			return 0
		}
	})
	return merged
}

func (d *DB) ListSessions() ([]domain.Session, error) {
	return d.listSessionsWhere("", nil)
}

func (d *DB) ListSessionsByCWD(cwd, since string) ([]domain.Session, error) {
	clauses := []string{"cwd = ?"}
	args := []any{cwd}
	if since != "" {
		clauses = append(clauses, "datetime(last_seen_at) >= datetime(?)")
		args = append(args, since)
	}
	return d.listSessionsWhere("WHERE "+strings.Join(clauses, " AND "), args)
}

func (d *DB) listSessionsWhere(where string, args []any) ([]domain.Session, error) {
	query := `
		SELECT session_id, agent, COALESCE(model,''), COALESCE(source,''), COALESCE(cwd,''), 
		       COALESCE(transcript_path,''), started_at, last_seen_at, COALESCE(ended_at,''),
		       COALESCE(input_tokens,0), COALESCE(output_tokens,0), COALESCE(cache_creation_tokens,0), 
		       COALESCE(cache_read_tokens,0), COALESCE(turns,0)
		FROM sessions
	`
	if where != "" {
		query += where + "\n"
	}
	query += "ORDER BY datetime(started_at) DESC, datetime(last_seen_at) DESC"

	rows, err := d.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []domain.Session
	for rows.Next() {
		var s domain.Session
		if err := rows.Scan(
			&s.SessionID, &s.Agent, &s.Model, &s.Source, &s.CWD,
			&s.TranscriptPath, &s.StartedAt, &s.LastSeenAt, &s.EndedAt,
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

func (d *DB) listSessionsWherePaged(where string, args []any, limit, offset int) ([]domain.Session, error) {
	query := `
		SELECT session_id, agent, COALESCE(model,''), COALESCE(source,''), COALESCE(cwd,''),
		       COALESCE(transcript_path,''), started_at, last_seen_at, COALESCE(ended_at,''),
		       COALESCE(input_tokens,0), COALESCE(output_tokens,0), COALESCE(cache_creation_tokens,0),
		       COALESCE(cache_read_tokens,0), COALESCE(turns,0)
		FROM sessions
	`
	if where != "" {
		query += where + "\n"
	}
	query += "ORDER BY datetime(started_at) DESC, datetime(last_seen_at) DESC LIMIT ? OFFSET ?"
	queryArgs := append(append([]any{}, args...), limit, offset)

	rows, err := d.db.Query(query, queryArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []domain.Session
	for rows.Next() {
		var s domain.Session
		if err := rows.Scan(
			&s.SessionID, &s.Agent, &s.Model, &s.Source, &s.CWD,
			&s.TranscriptPath, &s.StartedAt, &s.LastSeenAt, &s.EndedAt,
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

func (d *DB) ListSessionsByCWDPage(cwd, since string, page, size int) ([]domain.Session, int, error) {
	clauses := []string{"cwd = ?"}
	args := []any{cwd}
	if since != "" {
		clauses = append(clauses, "datetime(last_seen_at) >= datetime(?)")
		args = append(args, since)
	}
	where := "WHERE " + strings.Join(clauses, " AND ")

	var total int
	if err := d.db.QueryRow("SELECT COUNT(*) FROM sessions "+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * size
	sessions, err := d.listSessionsWherePaged(where, args, size, offset)
	return sessions, total, err
}

func (d *DB) GetTracesPage(sessionID, since string, page, size int) ([]domain.NormalizedEvent, int, error) {
	var clauses []string
	var args []any
	if sessionID != "" {
		clauses = append(clauses, "session_id = ?")
		args = append(args, sessionID)
	}
	if since != "" {
		clauses = append(clauses, "datetime(created_at) >= datetime(?)")
		args = append(args, since)
	}
	where := ""
	if len(clauses) > 0 {
		where = "WHERE " + strings.Join(clauses, " AND ")
	}

	var total int
	countQuery := "SELECT COUNT(*) FROM hook_events"
	if where != "" {
		countQuery += " " + where
	}
	if err := d.db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * size
	events, err := d.listWithWhere(where, args, size, offset)
	return events, total, err
}

func projectName(cwd string) string {
	if cwd == "" {
		return "unknown"
	}
	name := filepath.Base(cwd)
	if name == "." || name == string(filepath.Separator) {
		return cwd
	}
	return name
}

func splitAgents(raw string) []string {
	if raw == "" {
		return []string{}
	}
	parts := strings.Split(raw, ",")
	agents := make([]string, 0, len(parts))
	for _, part := range parts {
		agent := strings.TrimSpace(part)
		if agent != "" {
			agents = append(agents, agent)
		}
	}
	return agents
}

func normalizeToUTC(s string) string {
	if s == "" {
		return s
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.UTC().Format(time.RFC3339)
	}
	return s
}

func (d *DB) UpsertSession(sessionID, agent, model, source, cwd, transcriptPath, eventTime, endedAt string, usage domain.SessionUsage) error {
	if eventTime == "" {
		eventTime = time.Now().UTC().Format(time.RFC3339)
	} else {
		eventTime = normalizeToUTC(eventTime)
	}
	endedAt = normalizeToUTC(endedAt)
	_, err := d.db.Exec(`
		INSERT INTO sessions (
			session_id, agent, model, source, cwd, transcript_path, started_at, last_seen_at, ended_at,
			input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, turns
		)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT(session_id) DO UPDATE SET
			model        = COALESCE(NULLIF(excluded.model,''), sessions.model),
			last_seen_at = CASE
				WHEN datetime(excluded.last_seen_at) > datetime(sessions.last_seen_at)
				THEN excluded.last_seen_at
				ELSE sessions.last_seen_at
			END,
			ended_at = CASE
				WHEN (excluded.ended_at IS NULL OR excluded.ended_at = '')
					AND sessions.ended_at IS NOT NULL AND sessions.ended_at != ''
					AND datetime(excluded.last_seen_at) > datetime(sessions.ended_at)
				THEN NULL
				WHEN excluded.ended_at IS NULL OR excluded.ended_at = ''
				THEN sessions.ended_at
				WHEN (sessions.ended_at IS NULL OR sessions.ended_at = '')
					AND datetime(excluded.ended_at) >= datetime(sessions.last_seen_at)
				THEN excluded.ended_at
				WHEN sessions.ended_at IS NULL OR sessions.ended_at = ''
				THEN sessions.ended_at
				WHEN datetime(excluded.ended_at) > datetime(sessions.ended_at)
				THEN excluded.ended_at
				ELSE sessions.ended_at
			END,
			input_tokens = excluded.input_tokens,
			output_tokens = excluded.output_tokens,
			cache_creation_tokens = excluded.cache_creation_tokens,
			cache_read_tokens = excluded.cache_read_tokens,
			turns = excluded.turns`,
		sessionID, agent, model, source, cwd, transcriptPath, eventTime, eventTime, nullStr(endedAt),
		usage.InputTokens, usage.OutputTokens, usage.CacheCreationTokens, usage.CacheReadTokens, usage.Turns,
	)
	return err
}

func (d *DB) GetDashboardStats(since, until string) (*domain.DashboardStats, error) {
	bucketFormat, bucketGranularity := timelineBucketFormat(since, until)
	stats := &domain.DashboardStats{
		TimelineGranularity:  bucketGranularity,
		Timeline:             []domain.TimelineBucket{},
		TimelineByAgent:      []domain.AgentTimelineBucket{},
		TokenTimeline:        []domain.TokenTimelineBucket{},
		TokenTimelineByAgent: []domain.TokenTimelineAgentBucket{},
		TopActions:           []domain.ActionCount{},
		AgentUsage:           []domain.AgentModelUsage{},
		SessionUsage:         []domain.DashboardSessionUsage{},
	}

	var eventClauses []string
	var sessionClauses []string
	var eventArgs []any
	var sessionArgs []any
	if since != "" {
		eventClauses = append(eventClauses, "datetime(created_at) >= datetime(?)")
		sessionClauses = append(sessionClauses, "datetime(started_at) >= datetime(?)")
		eventArgs = append(eventArgs, since)
		sessionArgs = append(sessionArgs, since)
	}
	if until != "" {
		eventClauses = append(eventClauses, "datetime(created_at) <= datetime(?)")
		sessionClauses = append(sessionClauses, "datetime(started_at) <= datetime(?)")
		eventArgs = append(eventArgs, until)
		sessionArgs = append(sessionArgs, until)
	}

	eventWhere := ""
	if len(eventClauses) > 0 {
		eventWhere = " WHERE " + strings.Join(eventClauses, " AND ")
	}

	sessionWhere := ""
	if len(sessionClauses) > 0 {
		sessionWhere = " WHERE " + strings.Join(sessionClauses, " AND ")
	}

	// Basic Counts
	_ = d.db.QueryRow("SELECT COUNT(*) FROM sessions"+sessionWhere, sessionArgs...).Scan(&stats.TotalSessions)
	_ = d.db.QueryRow("SELECT COUNT(*) FROM hook_events"+eventWhere, eventArgs...).Scan(&stats.TotalEvents)

	var in, out sql.NullInt64
	_ = d.db.QueryRow("SELECT SUM(input_tokens), SUM(output_tokens) FROM sessions"+sessionWhere, sessionArgs...).Scan(&in, &out)
	stats.TotalInputTokens = int(in.Int64)
	stats.TotalOutputTokens = int(out.Int64)

	// Timeline
	if rows, err := d.db.Query(fmt.Sprintf(`
		SELECT strftime('%s', created_at) as bucket, COUNT(*) 
		FROM hook_events 
		WHERE created_at IS NOT NULL`+buildAndClause(eventClauses)+`
		GROUP BY bucket 
		ORDER BY bucket ASC
	`, bucketFormat), eventArgs...); err == nil {
		defer func() { _ = rows.Close() }()
		for rows.Next() {
			var b domain.TimelineBucket
			if err := rows.Scan(&b.Date, &b.Count); err == nil {
				stats.Timeline = append(stats.Timeline, b)
			}
		}
		_ = rows.Err()
	} else {
		slog.Warn("dashboard: timeline query", "err", err)
	}

	// Timeline By Agent
	if rows, err := d.db.Query(fmt.Sprintf(`
		SELECT strftime('%s', created_at) as bucket, COALESCE(NULLIF(agent, ''), 'unknown') as agent_name, COUNT(*) 
		FROM hook_events 
		WHERE created_at IS NOT NULL`+buildAndClause(eventClauses)+`
		GROUP BY bucket, agent_name
		ORDER BY bucket ASC, agent_name ASC
	`, bucketFormat), eventArgs...); err == nil {
		defer func() { _ = rows.Close() }()
		for rows.Next() {
			var b domain.AgentTimelineBucket
			if err := rows.Scan(&b.Date, &b.Agent, &b.Count); err == nil {
				stats.TimelineByAgent = append(stats.TimelineByAgent, b)
			}
		}
		_ = rows.Err()
	} else {
		slog.Warn("dashboard: timeline by agent query", "err", err)
	}

	// Token Timeline
	if rows, err := d.db.Query(fmt.Sprintf(`
		SELECT strftime('%s', started_at) as bucket,
		       SUM(input_tokens), SUM(output_tokens),
		       SUM(cache_creation_tokens), SUM(cache_read_tokens)
		FROM sessions
		WHERE started_at IS NOT NULL`+buildAndClause(sessionClauses)+`
		GROUP BY bucket
		ORDER BY bucket ASC
	`, bucketFormat), sessionArgs...); err == nil {
		defer func() { _ = rows.Close() }()
		for rows.Next() {
			var b domain.TokenTimelineBucket
			if err := rows.Scan(&b.Date, &b.Input, &b.Output, &b.CacheCreation, &b.CacheRead); err == nil {
				stats.TokenTimeline = append(stats.TokenTimeline, b)
			}
		}
		_ = rows.Err()
	} else {
		slog.Warn("dashboard: token timeline query", "err", err)
	}

	// Token Timeline By Agent
	if rows, err := d.db.Query(fmt.Sprintf(`
		SELECT strftime('%s', started_at) as bucket,
		       COALESCE(NULLIF(agent, ''), 'unknown') as agent_name,
		       SUM(input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens)
		FROM sessions
		WHERE started_at IS NOT NULL`+buildAndClause(sessionClauses)+`
		GROUP BY bucket, agent_name
		ORDER BY bucket ASC, agent_name ASC
	`, bucketFormat), sessionArgs...); err == nil {
		defer func() { _ = rows.Close() }()
		for rows.Next() {
			var b domain.TokenTimelineAgentBucket
			if err := rows.Scan(&b.Date, &b.Agent, &b.Total); err == nil {
				stats.TokenTimelineByAgent = append(stats.TokenTimelineByAgent, b)
			}
		}
		_ = rows.Err()
	} else {
		slog.Warn("dashboard: token timeline by agent query", "err", err)
	}

	// Top Actions
	if rows, err := d.db.Query(`
		SELECT action, COUNT(*) as count
		FROM hook_events
		WHERE action IS NOT NULL AND action != ''`+buildAndClause(eventClauses)+`
		GROUP BY action
		ORDER BY count DESC
		LIMIT 10
	`, eventArgs...); err == nil {
		defer func() { _ = rows.Close() }()
		for rows.Next() {
			var a domain.ActionCount
			if err := rows.Scan(&a.Name, &a.Value); err == nil {
				stats.TopActions = append(stats.TopActions, a)
			}
		}
		_ = rows.Err()
	} else {
		slog.Warn("dashboard: top actions query", "err", err)
	}

	// Agent Usage
	if rows, err := d.db.Query(`
		SELECT agent, model, SUM(input_tokens), SUM(output_tokens), SUM(cache_creation_tokens), SUM(cache_read_tokens)
		FROM sessions`+sessionWhere+`
		GROUP BY agent, model
	`, sessionArgs...); err == nil {
		defer func() { _ = rows.Close() }()
		for rows.Next() {
			var u domain.AgentModelUsage
			if err := rows.Scan(&u.Agent, &u.Model, &u.Input, &u.Output, &u.CacheCreation, &u.CacheRead); err == nil {
				stats.AgentUsage = append(stats.AgentUsage, u)
			}
		}
		_ = rows.Err()
	} else {
		slog.Warn("dashboard: agent usage query", "err", err)
	}

	return stats, nil
}

func buildAndClause(clauses []string) string {
	if len(clauses) == 0 {
		return ""
	}
	return " AND " + strings.Join(clauses, " AND ")
}

func timelineBucketFormat(since, until string) (format string, granularity string) {
	const (
		hourly = "%Y-%m-%d %H:00"
		daily  = "%Y-%m-%d 00:00"
	)

	if since == "" {
		return daily, "day"
	}

	start, err := time.Parse(time.RFC3339, since)
	if err != nil {
		return hourly, "hour"
	}

	end := time.Now().UTC()
	if until != "" {
		parsedEnd, endErr := time.Parse(time.RFC3339, until)
		if endErr != nil {
			return hourly, "hour"
		}
		end = parsedEnd
	}

	if end.Sub(start) <= 48*time.Hour {
		return hourly, "hour"
	}
	return daily, "day"
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

// normalizationStatus returns 'ok' when the status is empty so that the
// NOT NULL DEFAULT constraint on normalization_status is always satisfied
// without relying on SQLite's DEFAULT keyword (which doesn't fire when an
// explicit NULL is supplied via INSERT).
func normalizationStatus(s string) string {
	if s == "" {
		return "ok"
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

func (d *DB) GetSessionTree(since string) ([]domain.SessionTreeNode, error) {
	// 1. Load sessions since cutoff
	sessRows, err := d.db.Query(`
		SELECT session_id, agent, COALESCE(model,''), COALESCE(source,''), COALESCE(cwd,''),
		       COALESCE(transcript_path,''), started_at, last_seen_at, COALESCE(ended_at,''),
		       COALESCE(input_tokens,0), COALESCE(output_tokens,0),
		       COALESCE(cache_creation_tokens,0), COALESCE(cache_read_tokens,0), COALESCE(turns,0)
		FROM sessions
		WHERE datetime(started_at) >= datetime(?)
		ORDER BY started_at ASC`, since)
	if err != nil {
		return nil, err
	}
	defer sessRows.Close()

	sessionMap := map[string]domain.Session{}
	for sessRows.Next() {
		var s domain.Session
		if err := sessRows.Scan(
			&s.SessionID, &s.Agent, &s.Model, &s.Source, &s.CWD,
			&s.TranscriptPath, &s.StartedAt, &s.LastSeenAt, &s.EndedAt,
			&s.Usage.InputTokens, &s.Usage.OutputTokens,
			&s.Usage.CacheCreationTokens, &s.Usage.CacheReadTokens, &s.Usage.Turns,
		); err != nil {
			return nil, err
		}
		sessionMap[s.SessionID] = s
	}
	if err := sessRows.Err(); err != nil {
		return nil, err
	}

	// 2. Parent session → agent_ids (from SubagentStart events)
	spawnRows, err := d.db.Query(`
		SELECT DISTINCT session_id, subagent_id
		FROM hook_events
		WHERE hook_event_name = 'SubagentStart' AND subagent_id != ''`)
	if err != nil {
		return nil, err
	}
	defer spawnRows.Close()

	parentToAgents := map[string][]string{}
	for spawnRows.Next() {
		var parentID, agentID string
		if err := spawnRows.Scan(&parentID, &agentID); err != nil {
			return nil, err
		}
		parentToAgents[parentID] = append(parentToAgents[parentID], agentID)
	}
	if err := spawnRows.Err(); err != nil {
		return nil, err
	}

	// 3. agent_id → child session_id (events fired by subagent carry subagent_id)
	childRows, err := d.db.Query(`
		SELECT DISTINCT session_id, subagent_id
		FROM hook_events
		WHERE subagent_id != '' AND hook_event_name != 'SubagentStart'`)
	if err != nil {
		return nil, err
	}
	defer childRows.Close()

	agentToSession := map[string]string{}
	for childRows.Next() {
		var sessID, agentID string
		if err := childRows.Scan(&sessID, &agentID); err != nil {
			return nil, err
		}
		agentToSession[agentID] = sessID
	}
	if err := childRows.Err(); err != nil {
		return nil, err
	}

	// 4. Build parent → []SessionTreeNode map; track which sessions are children.
	// Only add a child entry when the child session is actually known — this prevents
	// zero-value Session structs from reaching the frontend when a subagent was spawned
	// but hasn't sent any events yet (or falls outside the since window).
	childSessionIDs := map[string]bool{}
	parentToChildren := map[string][]domain.SessionTreeNode{}
	for parentID, agentIDs := range parentToAgents {
		for _, agentID := range agentIDs {
			childSessID := agentToSession[agentID]
			if childSessID == "" {
				continue
			}
			childSession, ok := sessionMap[childSessID]
			if !ok || childSession.SessionID == "" {
				continue
			}
			childSessionIDs[childSessID] = true
			parentToChildren[parentID] = append(parentToChildren[parentID], domain.SessionTreeNode{
				Session: childSession,
				AgentID: agentID,
			})
		}
	}

	// 5. Recursively build tree nodes. visited prevents infinite loops on corrupt data.
	var buildNode func(sessID string, visited map[string]bool) domain.SessionTreeNode
	buildNode = func(sessID string, visited map[string]bool) domain.SessionTreeNode {
		node := domain.SessionTreeNode{Session: sessionMap[sessID]}
		for _, child := range parentToChildren[sessID] {
			cid := child.Session.SessionID
			if cid == "" || visited[cid] {
				continue
			}
			next := map[string]bool{}
			for k, v := range visited {
				next[k] = v
			}
			next[cid] = true
			node.Children = append(node.Children, buildNode(cid, next))
		}
		if node.Children == nil {
			node.Children = []domain.SessionTreeNode{}
		}
		return node
	}

	// 6. Collect roots (sessions not appearing as children), sorted by started_at
	sorted := make([]domain.Session, 0, len(sessionMap))
	for _, s := range sessionMap {
		sorted = append(sorted, s)
	}
	slices.SortFunc(sorted, func(a, b domain.Session) int {
		return strings.Compare(a.StartedAt, b.StartedAt)
	})

	var roots []domain.SessionTreeNode
	built := map[string]bool{}
	var markBuilt func(node domain.SessionTreeNode)
	markBuilt = func(node domain.SessionTreeNode) {
		if node.Session.SessionID != "" {
			built[node.Session.SessionID] = true
		}
		for _, child := range node.Children {
			markBuilt(child)
		}
	}
	for _, s := range sorted {
		if !childSessionIDs[s.SessionID] {
			node := buildNode(s.SessionID, map[string]bool{s.SessionID: true})
			roots = append(roots, node)
			markBuilt(node)
		}
	}

	// Corrupt cyclical graphs can make every node appear as a child and produce no roots.
	// Keep tree resilient by adding any unbuilt sessions as standalone roots.
	for _, s := range sorted {
		if built[s.SessionID] {
			continue
		}
		node := buildNode(s.SessionID, map[string]bool{s.SessionID: true})
		roots = append(roots, node)
		markBuilt(node)
	}
	return roots, nil
}

func (d *DB) GetTraces(sessionID, since string) ([]domain.NormalizedEvent, error) {
	var clauses []string
	var args []any
	if sessionID != "" {
		clauses = append(clauses, "session_id = ?")
		args = append(args, sessionID)
	}
	if since != "" {
		clauses = append(clauses, "datetime(created_at) >= datetime(?)")
		args = append(args, since)
	}

	where := ""
	if len(clauses) > 0 {
		where = "WHERE " + strings.Join(clauses, " AND ")
	}
	return d.listWithWhere(where, args, 0, 0)
}

const fileChangeCondition = `(
	LOWER(tool_name) IN ('write','edit','multiedit','str_replace','create_file','notebook_edit',
	                      'str_replace_based_edit_tool','str_replace_based_edit','new_file','create')
	OR COALESCE(old_string,'') != ''
	OR COALESCE(new_string,'') != ''
)`

func (d *DB) GetFileChanges(sessionID string) ([]domain.FileChangeGroup, error) {
	rows, err := d.db.Query(`
		SELECT path, COALESCE(tool_name,''), created_at, COALESCE(action,''),
		       COALESCE(old_string,''), COALESCE(new_string,''), COALESCE(start_line,0)
		FROM hook_events
		WHERE session_id = ?
		  AND path != '' AND path IS NOT NULL
		  AND `+fileChangeCondition+`
		ORDER BY path, id ASC
	`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type entry = domain.FileChangeGroup
	groups := map[string]*entry{}
	order := []string{}
	for rows.Next() {
		var path, tool, createdAt, action, oldStr, newStr string
		var startLine int
		if err := rows.Scan(&path, &tool, &createdAt, &action, &oldStr, &newStr, &startLine); err != nil {
			return nil, err
		}
		if _, ok := groups[path]; !ok {
			groups[path] = &entry{Path: path}
			order = append(order, path)
		}
		g := groups[path]
		g.Count++
		ev := domain.FileChangeEvent{Time: createdAt, Tool: tool, Action: action, StartLine: startLine}
		if oldStr != "" {
			ev.OldString = oldStr
		}
		if newStr != "" {
			ev.NewString = newStr
		}
		g.Changes = append(g.Changes, ev)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	result := make([]domain.FileChangeGroup, 0, len(order))
	for _, p := range order {
		result = append(result, *groups[p])
	}
	return result, nil
}

// startWALCheckpoint runs PRAGMA wal_checkpoint(PASSIVE) on the given interval.
// PASSIVE mode checkpoints without blocking writers. This prevents WAL file growth
// from long-lived SSE read connections that hold read transactions open.
func startWALCheckpoint(ctx context.Context, db *sql.DB, interval time.Duration) {
	go func() {
		t := time.NewTicker(interval)
		defer t.Stop()
		for {
			select {
			case <-t.C:
				if _, err := db.ExecContext(ctx, `PRAGMA wal_checkpoint(PASSIVE)`); err != nil {
					slog.Warn("wal checkpoint", "err", err)
				}
			case <-ctx.Done():
				return
			}
		}
	}()
}

func (d *DB) GetSessionFileChangeCounts(ids []string) (map[string]int, error) {
	if len(ids) == 0 {
		return map[string]int{}, nil
	}
	placeholders := strings.Repeat("?,", len(ids))
	placeholders = placeholders[:len(placeholders)-1]
	args := make([]any, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	rows, err := d.db.Query(`
		SELECT session_id, COUNT(DISTINCT path) AS cnt
		FROM hook_events
		WHERE session_id IN (`+placeholders+`)
		  AND path != '' AND path IS NOT NULL
		  AND `+fileChangeCondition+`
		GROUP BY session_id
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := map[string]int{}
	for rows.Next() {
		var sid string
		var cnt int
		if err := rows.Scan(&sid, &cnt); err != nil {
			return nil, err
		}
		result[sid] = cnt
	}
	return result, rows.Err()
}

// ExportEvents streams all events as NDJSON to w (DATA-04).
// Rows are read in INSERT order (id ASC) via a cursor — never buffered in memory.
func (d *DB) ExportEvents(ctx context.Context, w io.Writer) error {
	rows, err := d.db.QueryContext(ctx, `
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
		       COALESCE(duration_ms,0), COALESCE(trigger,''),
		       COALESCE(normalizer_version,''), COALESCE(agent_version,''), COALESCE(normalization_status,'')
		FROM hook_events ORDER BY id ASC`)
	if err != nil {
		return fmt.Errorf("export events query: %w", err)
	}
	defer rows.Close()

	enc := json.NewEncoder(w)
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
			&e.ToolResultStdout, &e.ToolResultStderr, &e.DurationMS, &e.Trigger,
			&e.NormalizerVersion, &e.AgentVersion, &e.NormalizationStatus,
		); err != nil {
			return fmt.Errorf("export events scan: %w", err)
		}
		_ = json.Unmarshal([]byte(ctxBefore), &e.CtxBefore)
		_ = json.Unmarshal([]byte(ctxAfter), &e.CtxAfter)
		if err := enc.Encode(e); err != nil {
			return fmt.Errorf("export events encode: %w", err)
		}
	}
	return rows.Err()
}

// ExportSnapshot writes a full-fidelity SQLite copy to destPath via VACUUM INTO (DATA-05).
// destPath must be a path in the OS temp directory — it is never user-supplied.
func (d *DB) ExportSnapshot(ctx context.Context, destPath string) error {
	if _, err := d.db.ExecContext(ctx, `VACUUM INTO ?`, destPath); err != nil {
		return fmt.Errorf("vacuum into: %w", err)
	}
	return nil
}
