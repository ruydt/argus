# hooker

Local-first monitoring dashboard for AI coding agent activity. Receives hook payloads from
Claude Code and Codex, normalizes them to a canonical event model, persists to
SQLite, and streams to a React SPA in real time.

## Quick start

```bash
git clone https://github.com/duytrandt04-afk/hooker
cd hooker
make build   # builds frontend, copies dist/, compiles Go binary
~/.local/bin/hooker-monitor
```

> **Requirements:** Go 1.25+, Node.js 18+, pnpm 10.x
>
> The Go binary embeds the React SPA at compile time (`//go:embed all:dist`), so the
> frontend must be built before `go build`. `make build` handles this in one step.

Then follow [docs/quickstart.md](docs/quickstart.md) to configure agent hooks and verify
your first event.

## Documentation

- [docs/quickstart.md](docs/quickstart.md) - first-event walkthrough (under 10 minutes)
- [docs/install.md](docs/install.md) - full install reference, support matrix, data lifecycle
- [docs/privacy.md](docs/privacy.md) - capture categories, ignore controls, export implications
- [docs/security.md](docs/security.md) - local threat model and remote-sharing posture
- [docs/releases.md](docs/releases.md) - release runbook and conventional commit format

## License

[LICENSE](LICENSE)
