package sqlite

import (
	"bytes"
	"compress/gzip"
	"context"
	"database/sql"
	_ "embed"
	"encoding/json"
	"errors"
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

	"argus/internal/agents/codex"
	"argus/internal/domain"
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

//go:embed migrations/009_new_event_fields.sql
var schema009 string

//go:embed migrations/010_add_created_at_index.sql
var schema010 string

//go:embed migrations/011_permission_fields.sql
var schema011 string

//go:embed migrations/012_repair_normalization_fields.sql
var schema012 string

//go:embed migrations/013_repair_new_event_fields.sql
var schema013 string

//go:embed migrations/014_normalize_hook_events_created_at.sql
var schema014 string

//go:embed migrations/015_drop_redundant_created_index.sql
var schema015 string

//go:embed migrations/016_session_model_usage.sql
var schema016 string

//go:embed migrations/017_audit_indexes.sql
var schema017 string

//go:embed migrations/018_drop_usage.sql
var schema018 string

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

func (d *DB) DBHealth() (domain.DiagnosticsDBHealth, error) {
	var h domain.DiagnosticsDBHealth
	_ = d.db.QueryRow(`PRAGMA journal_mode`).Scan(&h.JournalMode)
	_ = d.db.QueryRow(`PRAGMA page_count`).Scan(&h.PageCount)
	_ = d.db.QueryRow(`PRAGMA page_size`).Scan(&h.PageSizeBytes)
	_ = d.db.QueryRow(`SELECT COALESCE(MAX(version), 0) FROM schema_migrations`).Scan(&h.MigrationVersion)
	return h, nil
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
		{6, schema006},
		{7, schema007},
		{8, schema008},
		{9, schema009},
		{10, schema010},
		{11, schema011},
		{12, schema012},
		{13, schema013},
		{14, schema014},
		{15, schema015},
		{16, schema016},
		{17, schema017},
		{18, schema018},
	}

	// Downgrade guard: refuse to start against a DB stamped with a higher
	// migration version than this binary knows. Running an older binary against a
	// newer schema risks silent corruption — fail loud instead (no upgrade
	// surprises). New/empty DBs report 0 and pass.
	knownMax := migrations[len(migrations)-1].version
	var storedMax int
	_ = d.db.QueryRow(`SELECT COALESCE(MAX(version), 0) FROM schema_migrations`).Scan(&storedMax)
	if storedMax > knownMax {
		return fmt.Errorf("database schema version %d is newer than this binary supports (%d); upgrade argus to open it", storedMax, knownMax)
	}

	for _, m := range migrations {
		var count int
		_ = d.db.QueryRow(`SELECT COUNT(*) FROM schema_migrations WHERE version = ?`, m.version).Scan(&count)
		if count > 0 {
			continue
		}
		if err := d.applyMigration(m.version, m.sql); err != nil {
			return err
		}
	}
	return nil
}

// applyMigration executes each semicolon-separated statement individually within a
// single transaction. "duplicate column name" errors are silently skipped so repair
// migrations are idempotent on DBs that already have the column from a manual fix or
// a prior migration run.
func (d *DB) applyMigration(version int, sql string) error {
	tx, err := d.db.Begin()
	if err != nil {
		return fmt.Errorf("migration %d begin: %w", version, err)
	}
	for _, stmt := range splitSQL(sql) {
		if _, err := tx.Exec(stmt); err != nil {
			if strings.Contains(err.Error(), "duplicate column name") {
				// Column already present — schema already correct for this statement.
				continue
			}
			_ = tx.Rollback()
			return fmt.Errorf("migration %d: %w", version, err)
		}
	}
	if _, err := tx.Exec(`INSERT INTO schema_migrations (version) VALUES (?)`, version); err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("record migration %d: %w", version, err)
	}
	return tx.Commit()
}

// splitSQL splits a migration file into individual statements, stripping -- comments
// so semicolons inside comment text are not treated as statement delimiters.
func splitSQL(sql string) []string {
	var lines []string
	for _, line := range strings.Split(sql, "\n") {
		if !strings.HasPrefix(strings.TrimSpace(line), "--") {
			lines = append(lines, line)
		}
	}
	var stmts []string
	for _, s := range strings.Split(strings.Join(lines, "\n"), ";") {
		s = strings.TrimSpace(s)
		if s != "" {
			stmts = append(stmts, s)
		}
	}
	return stmts
}

func (d *DB) Add(e domain.NormalizedEvent) error {
	ctx, cancel := context.WithTimeout(context.Background(), sqliteWriteTimeout)
	defer cancel()

	// Normalize created_at to UTC RFC3339 at write time so string comparison
	// equals time comparison for all read-path predicates and ORDER BY clauses.
	createdAt := normalizeToUTC(e.Time)

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
			normalizer_version, agent_version, normalization_status,
			expansion_type, command_name, memory_type, load_reason, branch, server_name,
			tool_input_questions_json, permission_suggestions_json
		) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		createdAt, e.Agent, e.Session, e.HookEventName, e.TurnID, e.ToolUseID,
		e.Tool, e.Model, e.Source, e.CWD, e.TranscriptPath,
		nullStr(e.Action), nullStr(e.Path), nullStr(e.Command),
		nullStr(e.OldString), nullStr(e.NewString), nullInt(e.StartLine),
		jsonSlice(e.CtxBefore), jsonSlice(e.CtxAfter),
		gzipPayload(e.RawPayload), dedupKey(e),
		nullStr(e.Prompt), nullStr(e.Description), nullStr(e.PermissionMode), nullStr(e.Response),
		nullStr(e.ErrorMessage), nullStr(e.ErrorType),
		nullStr(e.SubagentID), nullStr(e.SubagentType),
		nullStr(e.TaskID), nullStr(e.TaskTitle), nullStr(e.TaskDescription),
		nullStr(e.NotificationType), nullStr(e.NotificationTitle), nullStr(e.NotificationMessage),
		nullStr(e.ChangeType), nullStr(e.OldCWD), nullStr(e.NewCWD), nullStr(e.ToolCallsJSON),
		nullStr(e.ToolResultStdout), nullStr(e.ToolResultStderr), nullInt(e.DurationMS), nullStr(e.Trigger),
		nullStr(e.NormalizerVersion), nullStr(e.AgentVersion), normalizationStatus(e.NormalizationStatus),
		nullStr(e.ExpansionType), nullStr(e.CommandName), nullStr(e.MemoryType),
		nullStr(e.LoadReason), nullStr(e.Branch), nullStr(e.ServerName),
		nullStr(e.ToolInputQuestionsJSON), nullStr(e.PermissionSuggestionsJSON),
	)
	return err
}

func (d *DB) List(limit int) ([]domain.NormalizedEvent, error) {
	return d.listWithWhere("", nil, limit, 0)
}

func (d *DB) ListBySession(sessionID string, limit int) ([]domain.NormalizedEvent, error) {
	return d.listWithWhere("WHERE session_id = ?", []any{sessionID}, limit, 0)
}

func (d *DB) ListByTimeRange(since, until, sessionID string, beforeID int64, limit int) ([]domain.NormalizedEvent, int64, bool, error) {
	var conditions []string
	var args []any

	if sessionID != "" {
		conditions = append(conditions, "session_id = ?")
		args = append(args, sessionID)
	}
	if since != "" {
		conditions = append(conditions, "created_at >= ?")
		args = append(args, normalizeToUTC(since))
	}
	if until != "" {
		conditions = append(conditions, "created_at < ?")
		args = append(args, normalizeToUTC(until))
	}
	if beforeID > 0 {
		conditions = append(conditions, "id < ?")
		args = append(args, beforeID)
	}

	where := ""
	if len(conditions) > 0 {
		where = "WHERE " + strings.Join(conditions, " AND ")
	}

	// Fetch limit+1 to detect hasMore without a separate COUNT query.
	fetchLimit := limit + 1
	events, err := d.listWithWhere(where, args, fetchLimit, 0)
	if err != nil {
		return nil, 0, false, err
	}

	hasMore := len(events) > limit
	if hasMore {
		events = events[:limit]
	}

	var minID int64
	if len(events) > 0 {
		// Retrieve the DB id of the oldest event in the page for cursor use.
		// listWithWhere returns events ORDER BY id DESC, so last element is oldest.
		oldest := events[len(events)-1]
		row := d.db.QueryRow("SELECT id FROM hook_events WHERE dedup_key = ? LIMIT 1", oldest.DedupKey)
		if err := row.Scan(&minID); err != nil {
			// Non-fatal: cursor is best-effort; hasMore already computed.
			minID = 0
		}
	}

	return events, minID, hasMore, nil
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
		       COALESCE(normalizer_version,''), COALESCE(agent_version,''), COALESCE(normalization_status,''),
		       COALESCE(expansion_type,''), COALESCE(command_name,''),
		       COALESCE(memory_type,''), COALESCE(load_reason,''),
		       COALESCE(branch,''), COALESCE(server_name,''),
		       COALESCE(tool_input_questions_json,''), COALESCE(permission_suggestions_json,''),
		       COALESCE(dedup_key,'')
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
			&e.ExpansionType, &e.CommandName, &e.MemoryType, &e.LoadReason, &e.Branch, &e.ServerName,
			&e.ToolInputQuestionsJSON, &e.PermissionSuggestionsJSON,
			&e.DedupKey,
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

func (d *DB) ListBySessionsTimeRange(since, until, search string, beforeCursor int64, sessionLimit int) ([]domain.NormalizedEvent, int64, bool, error) {
	var sb strings.Builder
	var sessionArgs []any

	sb.WriteString(`SELECT session_id, MAX(id) as max_id FROM hook_events WHERE 1=1`)
	if since != "" {
		sb.WriteString(" AND created_at >= ?")
		sessionArgs = append(sessionArgs, normalizeToUTC(since))
	}
	if until != "" {
		sb.WriteString(" AND created_at < ?")
		sessionArgs = append(sessionArgs, normalizeToUTC(until))
	}
	// Match a session if its id or project path contains the query. LIKE is
	// ASCII case-insensitive in SQLite by default, which suits hex ids + paths.
	if search != "" {
		sb.WriteString(" AND (session_id LIKE ? OR cwd LIKE ?)")
		like := "%" + search + "%"
		sessionArgs = append(sessionArgs, like, like)
	}
	sb.WriteString(" GROUP BY session_id")
	if beforeCursor > 0 {
		sb.WriteString(" HAVING MAX(id) < ?")
		sessionArgs = append(sessionArgs, beforeCursor)
	}
	sb.WriteString(" ORDER BY MAX(id) DESC LIMIT ?")
	sessionArgs = append(sessionArgs, sessionLimit+1)

	rows, err := d.db.Query(sb.String(), sessionArgs...)
	if err != nil {
		return nil, 0, false, err
	}
	defer rows.Close()

	type entry struct {
		sessionID string
		maxID     int64
	}
	var sessions []entry
	for rows.Next() {
		var e entry
		if err := rows.Scan(&e.sessionID, &e.maxID); err != nil {
			return nil, 0, false, err
		}
		sessions = append(sessions, e)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, false, err
	}

	hasMore := len(sessions) > sessionLimit
	if hasMore {
		sessions = sessions[:sessionLimit]
	}
	if len(sessions) == 0 {
		return nil, 0, false, nil
	}

	// Cursor = max_id of oldest session (last in DESC-ordered result).
	cursor := sessions[len(sessions)-1].maxID

	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(sessions)), ",")
	var conditions []string
	var eventArgs []any

	conditions = append(conditions, fmt.Sprintf("session_id IN (%s)", placeholders))
	for _, s := range sessions {
		eventArgs = append(eventArgs, s.sessionID)
	}
	if since != "" {
		conditions = append(conditions, "created_at >= ?")
		eventArgs = append(eventArgs, normalizeToUTC(since))
	}
	if until != "" {
		conditions = append(conditions, "created_at < ?")
		eventArgs = append(eventArgs, normalizeToUTC(until))
	}

	events, err := d.listWithWhere("WHERE "+strings.Join(conditions, " AND "), eventArgs, 0, 0)
	if err != nil {
		return nil, 0, false, err
	}
	return events, cursor, hasMore, nil
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

// ListProjectsPage returns one page of projects ordered by last activity, with
// an optional substring filter on cwd (which also covers the derived project
// name). total is the full count of matching projects, used by the handler to
// compute has_more. LIKE is ASCII case-insensitive in SQLite, which suits paths.
func (d *DB) ListProjectsPage(search string, page, size int) ([]domain.Project, int, error) {
	if page < 1 {
		page = 1
	}
	if size < 1 {
		size = 20
	}

	where := ""
	var whereArgs []any
	if s := strings.TrimSpace(search); s != "" {
		where = "WHERE cwd LIKE ?"
		whereArgs = append(whereArgs, "%"+s+"%")
	}

	var total int
	countQuery := "SELECT COUNT(*) FROM (SELECT cwd FROM sessions " + where + " GROUP BY cwd)"
	if err := d.db.QueryRow(countQuery, whereArgs...).Scan(&total); err != nil {
		return nil, 0, err
	}

	query := `
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
		FROM sessions ` + where + `
		GROUP BY cwd
		ORDER BY last_activity DESC
		LIMIT ? OFFSET ?`
	args := append(append([]any{}, whereArgs...), size, (page-1)*size)

	rows, err := d.db.Query(query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var projects []domain.Project
	for rows.Next() {
		var p domain.Project
		var agents string
		if err := rows.Scan(&p.CWD, &p.SessionCount, &p.LastActivity, &p.TotalTokens, &agents, &p.LiveCount); err != nil {
			return nil, 0, err
		}
		p.Name = projectName(p.CWD)
		p.Agents = splitAgents(agents)
		projects = append(projects, p)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return projects, total, nil
}

func (d *DB) ListSessions() ([]domain.Session, error) {
	return d.listSessionsWhere("", nil)
}

func (d *DB) ListSessionsByCWD(cwd, since string) ([]domain.Session, error) {
	clauses := []string{"cwd = ?"}
	args := []any{cwd}
	if since != "" {
		clauses = append(clauses, "last_seen_at >= ?")
		args = append(args, normalizeToUTC(since))
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
	query += "ORDER BY started_at DESC, last_seen_at DESC"

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
	query += "ORDER BY started_at DESC, last_seen_at DESC LIMIT ? OFFSET ?"
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
		clauses = append(clauses, "last_seen_at >= ?")
		args = append(args, normalizeToUTC(since))
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

func (d *DB) DiagnosticsStorageStats() (domain.DiagnosticsStorageStats, error) {
	var stats domain.DiagnosticsStorageStats
	if err := d.db.QueryRow("SELECT COUNT(*) FROM hook_events").Scan(&stats.TotalEvents); err != nil {
		return stats, fmt.Errorf("diagnostics total events: %w", err)
	}
	if err := d.db.QueryRow("SELECT COUNT(*) FROM sessions").Scan(&stats.TotalSessions); err != nil {
		return stats, fmt.Errorf("diagnostics total sessions: %w", err)
	}
	var latest string
	if err := d.db.QueryRow(`
		SELECT created_at
		FROM hook_events
		ORDER BY created_at DESC
		LIMIT 1
	`).Scan(&latest); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return stats, nil
		}
		return stats, fmt.Errorf("diagnostics latest event: %w", err)
	}
	stats.LatestEventAt = &latest
	return stats, nil
}

func (d *DB) DiagnosticsAgentStats() ([]domain.DiagnosticsAgentStats, error) {
	stats := map[string]*domain.DiagnosticsAgentStats{}
	for _, agent := range []string{"claudecode", "codex"} {
		stats[agent] = &domain.DiagnosticsAgentStats{Agent: agent}
	}

	sessionRows, err := d.db.Query(`
		SELECT agent, COUNT(*) AS event_count
		FROM hook_events
		WHERE agent IN ('claudecode', 'codex')
		GROUP BY agent
	`)
	if err != nil {
		return nil, fmt.Errorf("diagnostics agent sessions: %w", err)
	}
	defer sessionRows.Close()
	for sessionRows.Next() {
		var agent string
		var count int
		if err := sessionRows.Scan(&agent, &count); err != nil {
			return nil, fmt.Errorf("diagnostics agent session scan: %w", err)
		}
		stats[agent].EventCount = count
	}
	if err := sessionRows.Err(); err != nil {
		return nil, fmt.Errorf("diagnostics agent sessions rows: %w", err)
	}

	lastSeenRows, err := d.db.Query(`
		SELECT s.agent, s.last_seen_at
		FROM sessions s
		WHERE s.agent IN ('claudecode', 'codex')
		  AND s.last_seen_at = (
		    SELECT s2.last_seen_at
		    FROM sessions s2
		    WHERE s2.agent = s.agent
		    ORDER BY datetime(s2.last_seen_at) DESC, s2.last_seen_at DESC
		    LIMIT 1
		  )
		GROUP BY s.agent
	`)
	if err != nil {
		return nil, fmt.Errorf("diagnostics agent last seen: %w", err)
	}
	defer lastSeenRows.Close()
	for lastSeenRows.Next() {
		var agent, lastSeen string
		if err := lastSeenRows.Scan(&agent, &lastSeen); err != nil {
			return nil, fmt.Errorf("diagnostics agent last seen scan: %w", err)
		}
		stats[agent].LastSeenAt = &lastSeen
	}
	if err := lastSeenRows.Err(); err != nil {
		return nil, fmt.Errorf("diagnostics agent last seen rows: %w", err)
	}

	eventRows, err := d.db.Query(`
		WITH inferred AS (
			SELECT
				CASE
					WHEN agent IN ('claudecode', 'codex') THEN agent
					WHEN transcript_path LIKE '%/.claude/%' THEN 'claudecode'
					WHEN source = 'codex' THEN 'codex'
					ELSE ''
				END AS inferred_agent,
				normalization_status,
				normalizer_version,
				created_at
			FROM hook_events
		)
		SELECT inferred_agent,
		       SUM(CASE WHEN normalization_status = 'degraded' THEN 1 ELSE 0 END) AS degraded_count
		FROM inferred
		WHERE inferred_agent IN ('claudecode', 'codex')
		GROUP BY inferred_agent
	`)
	if err != nil {
		return nil, fmt.Errorf("diagnostics agent events: %w", err)
	}
	defer eventRows.Close()
	for eventRows.Next() {
		var agent string
		var degraded int
		if err := eventRows.Scan(&agent, &degraded); err != nil {
			return nil, fmt.Errorf("diagnostics agent events scan: %w", err)
		}
		stats[agent].DegradedCount = degraded
	}
	if err := eventRows.Err(); err != nil {
		return nil, fmt.Errorf("diagnostics agent events rows: %w", err)
	}

	versionRows, err := d.db.Query(`
		SELECT * FROM (
			SELECT 'claudecode' AS agent, normalizer_version
			FROM hook_events
			WHERE (agent = 'claudecode' OR (agent = '' AND transcript_path LIKE '%/.claude/%'))
			  AND COALESCE(normalizer_version, '') != ''
			ORDER BY created_at DESC, id DESC
			LIMIT 1
		)
		UNION ALL
		SELECT * FROM (
			SELECT 'codex' AS agent, normalizer_version
			FROM hook_events
			WHERE (agent = 'codex' OR (agent = '' AND source = 'codex'))
			  AND COALESCE(normalizer_version, '') != ''
			ORDER BY created_at DESC, id DESC
			LIMIT 1
		)
	`)
	if err != nil {
		return nil, fmt.Errorf("diagnostics agent normalizer versions: %w", err)
	}
	defer versionRows.Close()
	for versionRows.Next() {
		var agent, normalizerVersion string
		if err := versionRows.Scan(&agent, &normalizerVersion); err != nil {
			return nil, fmt.Errorf("diagnostics agent normalizer version scan: %w", err)
		}
		stats[agent].NormalizerVersion = &normalizerVersion
	}
	if err := versionRows.Err(); err != nil {
		return nil, fmt.Errorf("diagnostics agent normalizer versions rows: %w", err)
	}

	rateRows, err := d.db.Query(`
		SELECT agent,
			SUM(CASE WHEN datetime(created_at) >= datetime('now', '-1 hour') THEN 1 ELSE 0 END),
			SUM(CASE WHEN datetime(created_at) >= datetime('now', '-24 hours') THEN 1 ELSE 0 END)
		FROM hook_events
		WHERE agent IN ('claudecode', 'codex')
		GROUP BY agent
	`)
	if err != nil {
		return nil, fmt.Errorf("diagnostics agent rates: %w", err)
	}
	defer rateRows.Close()
	for rateRows.Next() {
		var agent string
		var h, d int
		if err := rateRows.Scan(&agent, &h, &d); err != nil {
			return nil, fmt.Errorf("diagnostics agent rates scan: %w", err)
		}
		if s, ok := stats[agent]; ok {
			s.EventsLastHour = h
			s.EventsLast24h = d
		}
	}
	if err := rateRows.Err(); err != nil {
		return nil, fmt.Errorf("diagnostics agent rates rows: %w", err)
	}

	out := make([]domain.DiagnosticsAgentStats, 0, 2)
	for _, agent := range []string{"claudecode", "codex"} {
		stat := *stats[agent]
		if stat.EventCount == 0 && stat.LastSeenAt == nil && stat.DegradedCount == 0 && stat.NormalizerVersion == nil {
			continue
		}
		out = append(out, stat)
	}
	return out, nil
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
			-- All-zero incoming usage means no usage was computed for this event
			-- (throttled or transcript unreadable) — keep the stored values.
			input_tokens = CASE WHEN (excluded.input_tokens + excluded.output_tokens + excluded.cache_creation_tokens + excluded.cache_read_tokens + excluded.turns) > 0 THEN excluded.input_tokens ELSE sessions.input_tokens END,
			output_tokens = CASE WHEN (excluded.input_tokens + excluded.output_tokens + excluded.cache_creation_tokens + excluded.cache_read_tokens + excluded.turns) > 0 THEN excluded.output_tokens ELSE sessions.output_tokens END,
			cache_creation_tokens = CASE WHEN (excluded.input_tokens + excluded.output_tokens + excluded.cache_creation_tokens + excluded.cache_read_tokens + excluded.turns) > 0 THEN excluded.cache_creation_tokens ELSE sessions.cache_creation_tokens END,
			cache_read_tokens = CASE WHEN (excluded.input_tokens + excluded.output_tokens + excluded.cache_creation_tokens + excluded.cache_read_tokens + excluded.turns) > 0 THEN excluded.cache_read_tokens ELSE sessions.cache_read_tokens END,
			turns = CASE WHEN (excluded.input_tokens + excluded.output_tokens + excluded.cache_creation_tokens + excluded.cache_read_tokens + excluded.turns) > 0 THEN excluded.turns ELSE sessions.turns END`,
		sessionID, agent, model, source, cwd, transcriptPath, eventTime, eventTime, nullStr(endedAt),
		usage.InputTokens, usage.OutputTokens, usage.CacheCreationTokens, usage.CacheReadTokens, usage.Turns,
	)
	return err
}

// DeleteProjectByCWD removes every event and session recorded under cwd in one
// transaction, so a half-deleted project can never be observed.
func (d *DB) DeleteProjectByCWD(cwd string) (int64, int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), sqliteWriteTimeout)
	defer cancel()

	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, 0, err
	}
	defer func() { _ = tx.Rollback() }()

	evRes, err := tx.ExecContext(ctx, `DELETE FROM hook_events WHERE cwd = ?`, cwd)
	if err != nil {
		return 0, 0, err
	}
	// Drop per-model usage for the sessions about to be deleted (no cwd column,
	// so scope by the session ids under this cwd).
	if _, err := tx.ExecContext(ctx,
		`DELETE FROM session_model_usage WHERE session_id IN (SELECT session_id FROM sessions WHERE cwd = ?)`, cwd); err != nil {
		return 0, 0, err
	}
	sessRes, err := tx.ExecContext(ctx, `DELETE FROM sessions WHERE cwd = ?`, cwd)
	if err != nil {
		return 0, 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, 0, err
	}

	eventsDeleted, _ := evRes.RowsAffected()
	sessionsDeleted, _ := sessRes.RowsAffected()
	return sessionsDeleted, eventsDeleted, nil
}

func (d *DB) MarkStaleSessions(cutoff time.Time) (int64, error) {
	res, err := d.db.Exec(`
		UPDATE sessions
		SET ended_at = last_seen_at
		WHERE (ended_at IS NULL OR ended_at = '')
		  AND datetime(last_seen_at) < datetime(?)`,
		cutoff.UTC().Format(time.RFC3339),
	)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
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
		s := normalizeToUTC(since)
		eventClauses = append(eventClauses, "created_at >= ?")
		sessionClauses = append(sessionClauses, "started_at >= ?")
		eventArgs = append(eventArgs, s)
		sessionArgs = append(sessionArgs, s)
	}
	if until != "" {
		u := normalizeToUTC(until)
		eventClauses = append(eventClauses, "created_at <= ?")
		sessionClauses = append(sessionClauses, "started_at <= ?")
		eventArgs = append(eventArgs, u)
		sessionArgs = append(sessionArgs, u)
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
		SELECT strftime('%s', created_at, 'localtime') as bucket, COUNT(*) 
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
		SELECT strftime('%s', created_at, 'localtime') as bucket, COALESCE(NULLIF(agent, ''), 'unknown') as agent_name, COUNT(*) 
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
		SELECT strftime('%s', started_at, 'localtime') as bucket,
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
		SELECT strftime('%s', started_at, 'localtime') as bucket,
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

	// Top Events (hook_event_name when available, falls back to action)
	if rows, err := d.db.Query(`
		SELECT COALESCE(NULLIF(hook_event_name, ''), action) AS event_name, COUNT(*) as count
		FROM hook_events
		WHERE (hook_event_name IS NOT NULL AND hook_event_name != '') OR (action IS NOT NULL AND action != '')`+buildAndClause(eventClauses)+`
		GROUP BY event_name
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
	return domain.ComputeDedupKey(e)
}

func (d *DB) GetRawPayload(dedupKey string) ([]byte, error) {
	var raw []byte
	err := d.db.QueryRow(
		`SELECT raw_payload FROM hook_events WHERE dedup_key = ? LIMIT 1`,
		dedupKey,
	).Scan(&raw)
	if err == sql.ErrNoRows || len(raw) == 0 {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return gunzipPayload(raw)
}

// fileSizeBytes returns the on-disk size of the main database file derived from
// the page count and size (works for both file and :memory: databases).
func (d *DB) fileSizeBytes() (int64, error) {
	var pageCount, pageSize int64
	if err := d.db.QueryRow(`PRAGMA page_count`).Scan(&pageCount); err != nil {
		return 0, err
	}
	if err := d.db.QueryRow(`PRAGMA page_size`).Scan(&pageSize); err != nil {
		return 0, err
	}
	return pageCount * pageSize, nil
}

// Compact gzip-compresses any raw_payload rows still stored uncompressed (rows
// written before compression existed) in batches, then VACUUMs to release the
// freed pages back to the filesystem. Lossless: only the storage encoding of
// raw_payload changes. Safe to run repeatedly — already-compressed rows are
// skipped via the gzip-magic filter.
func (d *DB) Compact(ctx context.Context) (domain.CompactResult, error) {
	var res domain.CompactResult
	before, err := d.fileSizeBytes()
	if err != nil {
		return res, err
	}
	res.BeforeBytes = before

	const batchSize = 500
	// fetchBatch reads one page of still-uncompressed rows. Kept in a closure so
	// rows.Close() can be deferred (the result set is fully read before the tx).
	fetchBatch := func() (ids []int64, raws [][]byte, err error) {
		rows, err := d.db.QueryContext(ctx, `
			SELECT id, raw_payload FROM hook_events
			WHERE LENGTH(raw_payload) > 0 AND hex(substr(raw_payload, 1, 2)) != '1F8B'
			LIMIT ?`, batchSize)
		if err != nil {
			return nil, nil, err
		}
		defer func() { _ = rows.Close() }()
		for rows.Next() {
			var id int64
			var raw []byte
			if err := rows.Scan(&id, &raw); err != nil {
				return nil, nil, err
			}
			ids = append(ids, id)
			raws = append(raws, raw)
		}
		return ids, raws, rows.Err()
	}

	for {
		ids, raws, err := fetchBatch()
		if err != nil {
			return res, err
		}
		if len(ids) == 0 {
			break
		}

		tx, err := d.db.BeginTx(ctx, nil)
		if err != nil {
			return res, err
		}
		for i, id := range ids {
			if _, err := tx.ExecContext(ctx, `UPDATE hook_events SET raw_payload = ? WHERE id = ?`, gzipPayload(raws[i]), id); err != nil {
				_ = tx.Rollback()
				return res, err
			}
		}
		if err := tx.Commit(); err != nil {
			return res, err
		}
		res.RowsCompressed += len(ids)
	}

	// VACUUM rewrites the file, releasing freelist pages. Cannot run in a tx.
	if _, err := d.db.ExecContext(ctx, `VACUUM`); err != nil {
		return res, err
	}

	after, err := d.fileSizeBytes()
	if err != nil {
		return res, err
	}
	res.AfterBytes = after
	return res, nil
}

// PruneEvents deletes events older than the before cutoff (RFC3339 UTC, matching
// created_at's stored form) and/or trims the table to the maxEvents newest rows.
// Either bound is skipped when empty/zero. Returns the number of rows deleted.
// Sessions are left intact; only the high-volume hook_events table is pruned.
func (d *DB) PruneEvents(ctx context.Context, before string, maxEvents int) (int64, error) {
	var total int64
	if before != "" {
		res, err := d.db.ExecContext(ctx, `DELETE FROM hook_events WHERE created_at < ?`, before)
		if err != nil {
			return total, err
		}
		n, _ := res.RowsAffected()
		total += n
	}
	if maxEvents > 0 {
		res, err := d.db.ExecContext(ctx, `
			DELETE FROM hook_events WHERE id < (
				SELECT MIN(id) FROM (SELECT id FROM hook_events ORDER BY id DESC LIMIT ?)
			)`, maxEvents)
		if err != nil {
			return total, err
		}
		n, _ := res.RowsAffected()
		total += n
	}
	return total, nil
}

// ReplaceSessionModelUsage replaces all per-model usage rows for a session in one
// transaction (delete-then-insert), so the stored breakdown always reflects the
// latest computed values.
func (d *DB) ReplaceSessionModelUsage(sessionID string, models []domain.ModelUsageBreakdown) error {
	ctx, cancel := context.WithTimeout(context.Background(), sqliteWriteTimeout)
	defer cancel()
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM session_model_usage WHERE session_id = ?`, sessionID); err != nil {
		_ = tx.Rollback()
		return err
	}
	for _, m := range models {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO session_model_usage
				(session_id, model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, turns)
			VALUES (?,?,?,?,?,?,?)`,
			sessionID, m.Model, m.InputTokens, m.OutputTokens, m.CacheCreationTokens, m.CacheReadTokens, m.Turns); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

// GetSessionModelUsage returns all persisted per-model usage rows keyed by
// session ID. Used by the dashboard to avoid re-scanning transcripts.
func (d *DB) GetSessionModelUsage() (map[string][]domain.ModelUsageBreakdown, error) {
	rows, err := d.db.Query(`
		SELECT session_id, model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, turns
		FROM session_model_usage`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string][]domain.ModelUsageBreakdown{}
	for rows.Next() {
		var sid string
		var m domain.ModelUsageBreakdown
		if err := rows.Scan(&sid, &m.Model, &m.InputTokens, &m.OutputTokens, &m.CacheCreationTokens, &m.CacheReadTokens, &m.Turns); err != nil {
			return nil, err
		}
		out[sid] = append(out[sid], m)
	}
	return out, rows.Err()
}

// gzipPayload compresses a raw hook payload for storage. raw_payload is a
// near-verbatim duplicate of the normalized columns and is read only on demand
// by the "view raw" endpoint, so gzip (~85% smaller on JSON) costs nothing on
// hot paths. Returns a non-nil empty slice for empty input to satisfy the
// NOT NULL column (INSERT OR IGNORE would silently drop a NULL row).
func gzipPayload(raw []byte) []byte {
	if len(raw) == 0 {
		return []byte{}
	}
	var buf bytes.Buffer
	zw := gzip.NewWriter(&buf)
	if _, err := zw.Write(raw); err != nil {
		_ = zw.Close()
		return raw // fall back to storing uncompressed on error
	}
	if err := zw.Close(); err != nil {
		return raw
	}
	return buf.Bytes()
}

// gunzipPayload reverses gzipPayload. Rows written before compression was
// introduced are plain JSON without the gzip magic bytes and pass through
// unchanged, so old and new rows are both readable.
func gunzipPayload(stored []byte) ([]byte, error) {
	if len(stored) < 2 || stored[0] != 0x1f || stored[1] != 0x8b {
		return stored, nil
	}
	zr, err := gzip.NewReader(bytes.NewReader(stored))
	if err != nil {
		return nil, err
	}
	defer func() { _ = zr.Close() }()
	return io.ReadAll(zr)
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
		WHERE started_at >= ?
		ORDER BY started_at ASC`, normalizeToUTC(since))
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

const fileChangeCondition = `(
	LOWER(tool_name) IN ('write','edit','multiedit','str_replace','create_file','notebook_edit',
	                      'str_replace_based_edit_tool','str_replace_based_edit','new_file','create',
	                      'apply_patch')
	OR COALESCE(old_string,'') != ''
	OR COALESCE(new_string,'') != ''
)`

func (d *DB) GetFileChanges(sessionID string) ([]domain.FileChangeGroup, error) {
	rows, err := d.db.Query(`
		SELECT path, COALESCE(tool_name,''), created_at, COALESCE(action,''),
		       COALESCE(old_string,''), COALESCE(new_string,''), COALESCE(start_line,0),
		       COALESCE(command,'')
		FROM hook_events
		WHERE session_id = ?
		  AND path != '' AND path IS NOT NULL
		  AND NOT (
		    hook_event_name = 'PostToolUse'
		    AND tool_use_id != '' AND tool_use_id IS NOT NULL
		    AND EXISTS (
		      SELECT 1 FROM hook_events pre
		      WHERE pre.session_id = hook_events.session_id
		        AND pre.tool_use_id = hook_events.tool_use_id
		        AND pre.hook_event_name = 'PreToolUse'
		    )
		  )
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
		var path, tool, createdAt, action, oldStr, newStr, command string
		var startLine int
		if err := rows.Scan(&path, &tool, &createdAt, &action, &oldStr, &newStr, &startLine, &command); err != nil {
			return nil, err
		}
		if strings.EqualFold(tool, "apply_patch") && oldStr == "" && newStr == "" && command != "" {
			_, hunks := codex.ParseApplyPatch(command)
			oldStr, newStr = codex.PatchSnippetStrings(hunks)
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
		       COALESCE(normalizer_version,''), COALESCE(agent_version,''), COALESCE(normalization_status,''),
		       COALESCE(expansion_type,''), COALESCE(command_name,''),
		       COALESCE(memory_type,''), COALESCE(load_reason,''),
		       COALESCE(branch,''), COALESCE(server_name,''),
		       COALESCE(tool_input_questions_json,''), COALESCE(permission_suggestions_json,'')
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
			&e.ExpansionType, &e.CommandName, &e.MemoryType, &e.LoadReason, &e.Branch, &e.ServerName,
			&e.ToolInputQuestionsJSON, &e.PermissionSuggestionsJSON,
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
