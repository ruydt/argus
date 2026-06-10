# Hook Scripts Log Design

## Goal

Add `~/.argus/hook-scripts.log` so Diagnostics can show execution details from Argus-generated hook scripts under `~/.argus/hooks/`.

Scope is limited to scripts Argus generates and owns. Arbitrary user-created scripts in `~/.argus/hooks/` are not captured because Argus does not control their execution unless it wraps or rewrites user commands.

## User Outcome

The Diagnostics File System card lists `hook-scripts.log` alongside `argus.log` and `build.log`. Users can click Tail and see recent script activity when Argus's generated hook scripts run, especially startup and activation failures that may otherwise be hidden by hook output suppression.

## Architecture

Logging is produced by installer-generated scripts and consumed by existing diagnostics log-tail infrastructure.

- `install.sh` writes generated scripts that append best-effort diagnostic lines to `~/.argus/hook-scripts.log`.
- Backend filesystem scan includes `hook-scripts.log` in the stable log list.
- Backend log-tail endpoint whitelists a new `file=hook-scripts` value and maps it to `hook-scripts.log`.
- Frontend diagnostics type and File System card reuse existing log row/tail UI for the third log.

No database schema changes are needed.

## Log Producers

`start-argus.sh` logs these events:

- script start
- server already running with installed binary
- different binary found on Argus port
- old PID kill requested
- server launch attempted through `nohup`

`argus-activate.js` logs these events:

- activation start
- server offline and start script invoked
- server still offline after startup wait
- SQLite count query succeeded
- SQLite count query failed and status fallback used
- unexpected top-level activation failure

Each line uses this format:

```text
2026-06-10T12:34:56.789Z argus-activate.js INFO server online
```

Logging is best effort. Any logging failure is ignored so hook execution behavior is unchanged.

## Privacy

Log lines must not include raw hook payloads, prompts, tool outputs, diffs, file contents, environment dumps, or arbitrary command output. Lines may include script name, event label, PID, and coarse status.

## Backend

`scanFileSystem()` changes its log list from:

- `argus.log`
- `build.log`

to:

- `argus.log`
- `build.log`
- `hook-scripts.log`

`LogTail` accepts:

- `file=argus` -> `argus.log`
- `file=build` -> `build.log`
- `file=hook-scripts` -> `hook-scripts.log`

Unknown values still return `400`. Missing files still return `200` with empty `lines`.

## Frontend

`useLogTail` accepts `'hook-scripts'` in addition to `'argus'` and `'build'`.

`FileSystemCard` maps `hook-scripts.log` to `useLogTail('hook-scripts', 50)`. Existing UI behavior remains: log rows are listed from diagnostics, Tail fetches on open, Refresh fetches again, missing logs show the existing empty/not-found message.

## Tests

Backend tests:

- filesystem scan returns three stable logs and marks `hook-scripts.log` present when file exists
- log-tail returns `hook-scripts.log` for `file=hook-scripts`
- invalid log-tail file values remain rejected

Frontend tests:

- `useLogTail('hook-scripts')` calls `/api/diagnostics/log-tail?file=hook-scripts&lines=...`
- File System card can tail `hook-scripts.log`

Installer verification:

- confirm generated script templates contain `hook-scripts.log`
- confirm logging helpers are best effort and do not change normal output contract

## Non-Goals

- Do not capture arbitrary user scripts in `~/.argus/hooks/`.
- Do not rotate or truncate `hook-scripts.log` in this change.
- Do not send script logs to SQLite or event stream.
- Do not expose a new diagnostics page; extend existing File System card only.
