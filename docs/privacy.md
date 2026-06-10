# Privacy

Argus is local-first, but it records sensitive development context. Treat the
SQLite database, NDJSON exports, SQLite snapshots, logs, and backups as private
developer data.

## Captured Data

Argus can capture and store:

- **Prompts** - user prompts and agent instructions present in hook payloads.
- **Diffs** - code changes and patch content reported by agents.
- **File paths** - current working directories and explicit file paths.
- **Tool outputs** - command output, file reads, search results, and tool results.
- **Raw payloads** - the original hook request body for each ingested event.
- **Exports** - NDJSON event streams and SQLite snapshots copied out of the app.

Argus does not send this data to an external service by itself. Any exposure
comes from where you run it, where you store the database, and how you share
exports or backups.

## Ignore Controls

The default ignore file is:

```text
~/.config/argus/ignore
```

Set `ARGUS_IGNORE` to use a different ignore file path.

Ignore rules are path controls. Matching is limited to the normalized event
`cwd` and explicit `path` fields. Argus does not scan prompts, tool output,
diffs, or raw payload text for path-like substrings.

When an event matches the ignore rules, it is not ingested:

- no SQLite database row is written
- no SSE broadcast is sent to connected browser tabs
- only safe metadata should appear in backend logs

Use ignore rules for repositories or paths that should never appear in argus,
such as client projects, secret material, generated credential files, or
private notes.

## Export Implications

NDJSON exports contain full-fidelity event records. SQLite snapshots contain the
complete database at the time of export. Both can include prompts, diffs, file
paths, tool outputs, raw payloads, and other captured metadata.

Handle exported `.ndjson` files and `.db` snapshots as sensitive data:

- store them outside shared folders unless sharing is intentional
- avoid attaching them to issues, pull requests, or support threads
- delete temporary exports after use
- encrypt archives before moving them off your machine

SQLite backups should include the `.db`, `.db-wal`, and `.db-shm` files when the
server has been running in WAL mode.
