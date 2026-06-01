# Phase 10: Diagnostics Backend Performance - Pattern Map

**Mapped:** 2026-06-01
**Files analyzed:** 1 (sqlite.go — single-file SQL rewrite)
**Analogs found:** 1 / 1 (exact: `ListProjects()` MAX aggregate pattern within same file)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/internal/repository/sqlite/sqlite.go` | repository | CRUD / transform | Same file — `ListProjects()` at line 269 | exact (same table, same MAX pattern) |

---

## Pattern Assignments

### `backend/internal/repository/sqlite/sqlite.go` — `DiagnosticsAgentStats()` rewrite

**Analog:** `ListProjects()` in the same file (lines 269–303)

---

#### Correlated subquery being replaced — `lastSeenRows` (lines 550–562)

The current query performs a correlated subquery per agent row:

```sql
-- CURRENT (O(n²) — replace this)
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
```

---

#### MAX aggregate template — `ListProjects()` (lines 270–285)

This is the direct template to copy. `MAX(last_seen_at)` on the sessions table, string comparison, no `datetime()` wrapper:

```go
// sqlite.go lines 270–285 — exact MAX pattern to copy
rows, err := d.db.Query(`
    SELECT
        COALESCE(cwd, '') AS cwd,
        COUNT(session_id) AS session_count,
        MAX(last_seen_at) AS last_activity,   -- <-- template for lastSeenRows fix
        ...
    FROM sessions
    GROUP BY cwd
    ORDER BY last_activity DESC`)
```

**Fix to apply for `lastSeenRows`** — collapse to a single `SELECT agent, MAX(last_seen_at) FROM sessions GROUP BY agent`:

```sql
-- TARGET (O(n) — copy this structure)
SELECT agent, MAX(last_seen_at)
FROM sessions
WHERE agent IN ('claudecode', 'codex')
GROUP BY agent
```

The Go pointer scan pattern that follows (`var agent, lastSeen string` → `stats[agent].LastSeenAt = &lastSeen`) is already correct and must not change.

---

#### Correlated subquery being replaced — `versionRows` (lines 614–639)

The current query references the `inferred` CTE from inside a correlated subquery over itself:

```sql
-- CURRENT (O(n²) — replace this)
WITH inferred AS (
    SELECT
        CASE
            WHEN agent IN ('claudecode', 'codex') THEN agent
            WHEN transcript_path LIKE '%/.claude/%' THEN 'claudecode'
            WHEN source = 'codex' THEN 'codex'
            ELSE ''
        END AS inferred_agent,
        normalizer_version,
        created_at
    FROM hook_events
    WHERE COALESCE(normalizer_version, '') != ''
)
SELECT e.inferred_agent, e.normalizer_version
FROM inferred e
WHERE e.inferred_agent IN ('claudecode', 'codex')
  AND e.created_at = (
    SELECT e2.created_at
    FROM inferred e2
    WHERE e2.inferred_agent = e.inferred_agent
    ORDER BY datetime(e2.created_at) DESC, e2.created_at DESC
    LIMIT 1
  )
GROUP BY e.inferred_agent
```

**Fix to apply for `versionRows`** — add a second `latest` CTE using `MAX(created_at) GROUP BY inferred_agent`, then JOIN back to get the `normalizer_version` for that row. The `inferred` CTE body is unchanged (D-02):

```sql
-- TARGET (O(n) — two-CTE pattern per D-04)
WITH inferred AS (
    SELECT
        CASE
            WHEN agent IN ('claudecode', 'codex') THEN agent
            WHEN transcript_path LIKE '%/.claude/%' THEN 'claudecode'
            WHEN source = 'codex' THEN 'codex'
            ELSE ''
        END AS inferred_agent,
        normalizer_version,
        created_at
    FROM hook_events
    WHERE COALESCE(normalizer_version, '') != ''
),
latest AS (
    SELECT inferred_agent, MAX(created_at) AS max_ts
    FROM inferred
    WHERE inferred_agent IN ('claudecode', 'codex')
    GROUP BY inferred_agent
)
SELECT i.inferred_agent, i.normalizer_version
FROM inferred i
JOIN latest l ON i.inferred_agent = l.inferred_agent AND i.created_at = l.max_ts
WHERE i.inferred_agent IN ('claudecode', 'codex')
GROUP BY i.inferred_agent
```

---

#### Agent inference CASE expression — canonical form (lines 579–590 and 615–626)

This block appears in both `eventRows` and `versionRows`. **Do not change it.** Copy exactly as-is into the rewritten `versionRows` `inferred` CTE:

```sql
-- Canonical agent inference — copy verbatim, do not simplify (D-02)
CASE
    WHEN agent IN ('claudecode', 'codex') THEN agent
    WHEN transcript_path LIKE '%/.claude/%' THEN 'claudecode'
    WHEN source = 'codex' THEN 'codex'
    ELSE ''
END AS inferred_agent
```

---

#### Standard query+scan pattern used throughout the function (lines 528–576)

Every query in `DiagnosticsAgentStats()` follows this exact structure. New queries must match it:

```go
// Pattern: d.db.Query → defer rows.Close() → scan loop → rows.Err() check
// Example: sessionRows block (lines 528–548)
sessionRows, err := d.db.Query(`...`)
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
```

For `lastSeenRows` the scan uses a `string` pointer assignment:

```go
// lastSeenRows scan pattern (lines 567–573)
for lastSeenRows.Next() {
    var agent, lastSeen string
    if err := lastSeenRows.Scan(&agent, &lastSeen); err != nil {
        return nil, fmt.Errorf("diagnostics agent last seen scan: %w", err)
    }
    stats[agent].LastSeenAt = &lastSeen
}
```

For `versionRows` the scan also uses a `string` pointer assignment:

```go
// versionRows scan pattern (lines 644–650)
for versionRows.Next() {
    var agent, normalizerVersion string
    if err := versionRows.Scan(&agent, &normalizerVersion); err != nil {
        return nil, fmt.Errorf("diagnostics agent normalizer version scan: %w", err)
    }
    stats[agent].NormalizerVersion = &normalizerVersion
}
```

---

#### Error wrapping format (lines 534–575 and 641–653)

All error sites in the function follow `fmt.Errorf("diagnostics agent [area]: %w", err)`. Match this naming for any new error sites introduced by the rewrite:

```go
// Error naming convention — match exactly
fmt.Errorf("diagnostics agent last seen: %w", err)          // Query error
fmt.Errorf("diagnostics agent last seen scan: %w", err)     // Scan error
fmt.Errorf("diagnostics agent last seen rows: %w", err)     // rows.Err() error

fmt.Errorf("diagnostics agent normalizer versions: %w", err)         // Query error
fmt.Errorf("diagnostics agent normalizer version scan: %w", err)     // Scan error
fmt.Errorf("diagnostics agent normalizer versions rows: %w", err)    // rows.Err() error
```

---

## Shared Patterns

### Query+scan boilerplate
**Source:** `backend/internal/repository/sqlite/sqlite.go` lines 528–548 (sessionRows block)
**Apply to:** Both rewritten queries (`lastSeenRows` and `versionRows`)

The pattern is: `Query` → error check with `fmt.Errorf` → `defer rows.Close()` → `for rows.Next()` scan loop with inline error check → `rows.Err()` check after loop.

### MAX string aggregate (no datetime() wrapping)
**Source:** `backend/internal/repository/sqlite/sqlite.go` line 274 — `MAX(last_seen_at) AS last_activity`
**Apply to:** `lastSeenRows` rewrite
ISO 8601 strings sort lexicographically; `datetime()` wrapping is unnecessary overhead. Use bare `MAX(col)`.

### CTE chaining for latest-row-per-group
**Source:** D-04 decision — no prior analog in the file; use two-CTE pattern (`inferred` + `latest`) as described above.
**Apply to:** `versionRows` rewrite only.

---

## No Analog Found

None — all patterns are present in the existing file.

---

## Unchanged Files (contract lock)

| File | Role | Why Unchanged |
|------|------|---------------|
| `backend/internal/domain/diagnostics.go` | domain | Output struct shape must not change (D-01) |
| `backend/internal/repository/repository.go` | interface | Method signature must not change (D-01) |
| `backend/internal/handler/diagnostics.go` | handler | No changes needed outside `sqlite.go` |
| `backend/tests/internal/handler/diagnostics_test.go` | test | Existing tests gate correctness; run as-is (D-06) |

---

## Metadata

**Analog search scope:** `backend/internal/repository/sqlite/sqlite.go`, `backend/internal/domain/diagnostics.go`, `backend/internal/repository/repository.go`, `backend/tests/internal/handler/diagnostics_test.go`
**Files scanned:** 4
**Pattern extraction date:** 2026-06-01
