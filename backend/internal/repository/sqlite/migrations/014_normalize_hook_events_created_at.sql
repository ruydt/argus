-- Normalize legacy created_at values to UTC RFC3339 ("Z" suffix) so direct
-- string comparison equals time comparison. Rows written by the service were
-- already normalized; this rewrites only rows that differ (e.g. timezone
-- offsets from older versions or direct inserts).
UPDATE hook_events
SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', created_at)
WHERE created_at IS NOT NULL
  AND created_at != ''
  AND strftime('%Y-%m-%dT%H:%M:%SZ', created_at) IS NOT NULL
  AND created_at != strftime('%Y-%m-%dT%H:%M:%SZ', created_at);

CREATE INDEX IF NOT EXISTS idx_hook_events_created_at ON hook_events(created_at);
