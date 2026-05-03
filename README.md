# emruy

`emruy` is a local Codex hook monitor that records hook events and shows them in a browser UI.

## Run

```bash
go run main.go
```

Open the UI in your browser at:

```text
http://127.0.0.1:8765
```

## Hook setup

This project expects Codex hooks to POST JSON to the local monitor at:

```text
http://127.0.0.1:8765/api/hook
```

The sample hook config in `.codex/hooks.json` forwards Codex hook payloads to that endpoint.

## Notes

- Events are grouped by `session_id` and `transcript_path`.
- Bash tool events display the raw command.
- The UI is meant for local debugging and inspection.

