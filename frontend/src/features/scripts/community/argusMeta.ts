export type ArgusMeta = {
  title: string
  author?: string
  events: string[]
  agents: string[]
  command: string
  matcher: string
  purpose: string
  os?: string
}

// splitCSV → trimmed, de-duplicated, order-preserving tokens (events/agents).
export function splitCSV(value: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of value.split(',')) {
    const v = part.trim()
    if (v && !seen.has(v)) {
      seen.add(v)
      out.push(v)
    }
  }
  return out
}

// OS_OPTIONS are the concrete platforms a script can declare support for. A
// script may support several, stored as a comma-separated `os:` list (e.g.
// `linux, macos, windows`). The legacy aggregate tokens `both`/`posix` are no
// longer offered, but OsIcons still expands them when read from older data.
export const OS_OPTIONS = [
  { value: 'linux', label: 'Linux' },
  { value: 'macos', label: 'macOS' },
  { value: 'windows', label: 'Windows' },
]

export function runtimeFromExt(filename: string): string {
  if (filename.endsWith('.py')) return 'python3'
  if (filename.endsWith('.sh')) return 'sh'
  return 'node'
}

// Scalar string fields parsed verbatim; events/agents are list fields handled
// separately (comma-split), and legacy singular `event` folds into events.
const SCALAR_KEYS = ['title', 'author', 'command', 'matcher', 'purpose', 'os'] as const
const META_TAG = '@argus-meta'
const END_TAG = '@end'

// @argus-meta uses `//` comments in JS scripts and `#` comments in py/sh. The
// style is chosen by file extension when writing; both are accepted when reading.
function commentPrefix(filename: string): string {
  return filename.endsWith('.py') || filename.endsWith('.sh') ? '#' : '//'
}

// Field lines / markers accept either comment style.
const FIELD_RE = /^(?:\/\/|#)\s*(\w+):\s*(.*)$/

// findTag locates the earliest `// <tag>` or `# <tag>` at/after `from`, with the
// matched marker's length — or null when neither is present.
function findTag(body: string, tag: string, from = 0): { idx: number; len: number } | null {
  const slash = `// ${tag}`
  const hash = `# ${tag}`
  const i1 = body.indexOf(slash, from)
  const i2 = body.indexOf(hash, from)
  if (i1 === -1 && i2 === -1) return null
  if (i2 === -1 || (i1 !== -1 && i1 < i2)) return { idx: i1, len: slash.length }
  return { idx: i2, len: hash.length }
}

export function parseArgusMeta(body: string): Partial<ArgusMeta> {
  const start = findTag(body, META_TAG)
  if (!start) return {}
  const end = findTag(body, END_TAG, start.idx)
  if (!end) return {}
  const out: Partial<ArgusMeta> = {}
  const events: string[] = []
  const agents: string[] = []
  for (const line of body.slice(start.idx, end.idx).split('\n')) {
    const m = line.match(FIELD_RE)
    if (!m) continue
    const key = m[1]
    const value = m[2].trim()
    if (key === 'events' || key === 'event') events.push(...splitCSV(value))
    else if (key === 'agents') agents.push(...splitCSV(value))
    else if ((SCALAR_KEYS as readonly string[]).includes(key)) {
      out[key as (typeof SCALAR_KEYS)[number]] = value
    }
  }
  if (events.length) out.events = splitCSV(events.join(','))
  if (agents.length) out.agents = splitCSV(agents.join(','))
  return out
}

export function buildArgusMeta(m: ArgusMeta, prefix = '//'): string {
  const lines = [`${prefix} ${META_TAG}`, `${prefix} title: ${m.title}`]
  if (m.author) lines.push(`${prefix} author: ${m.author}`)
  lines.push(`${prefix} events: ${m.events.join(', ')}`)
  if (m.agents.length) lines.push(`${prefix} agents: ${m.agents.join(', ')}`)
  lines.push(`${prefix} command: ${m.command}`)
  if (m.matcher) lines.push(`${prefix} matcher: ${m.matcher}`)
  if (m.purpose) lines.push(`${prefix} purpose: ${m.purpose}`)
  if (m.os) lines.push(`${prefix} os: ${m.os}`)
  lines.push(`${prefix} ${END_TAG}`, '')
  return lines.join('\n')
}

function stripArgusMeta(body: string): string {
  const start = findTag(body, META_TAG)
  if (!start) return body
  const end = findTag(body, END_TAG, start.idx)
  if (!end) return body
  const before = body.slice(0, start.idx)
  const after = body.slice(end.idx + end.len).replace(/^\r?\n/, '')
  return before + after
}

export function injectMeta(body: string, m: ArgusMeta, filename = ''): string {
  return (
    buildArgusMeta(m, commentPrefix(filename)) + '\n' + stripArgusMeta(body).replace(/^\n+/, '')
  )
}

const RUN_LOG_TAG = '@argus-run-log'

// Per-runtime run-logger prelude. Each appends one line to
// ~/.argus/hook-scripts.log on run — `<ISO> <agent> - <file> INFO ran` — using
// only environment variables (never stdin), so it can't consume the payload or
// break the script. The agent is detected from env vars each runtime is known to
// set (CLAUDECODE, GOOSE_TERMINAL/AGENT, CURSOR_*, AUGMENT_*, GEMINI_*); agents
// with no documented hook env var (codex, copilot, qwen, …) fall back to
// `unknown`. Returns null for unrecognised runtimes.
function runLoggerPrelude(filename: string): string | null {
  const note = `${RUN_LOG_TAG} — records each run in ~/.argus/hook-scripts.log (added on share)`
  if (filename.endsWith('.js')) {
    return `// ${note}
try {
  const _fs = require('fs'),
    _os = require('os'),
    _p = require('path'),
    _e = process.env
  const _agent =
    _e.CLAUDECODE === '1'
      ? 'claudecode'
      : _e.GOOSE_TERMINAL === '1' || _e.AGENT === 'goose'
        ? 'goose'
        : _e.CURSOR_VERSION || _e.CURSOR_PROJECT_DIR
          ? 'cursor'
          : _e.AUGMENT_PROJECT_DIR || _e.AUGMENT_CONVERSATION_ID
            ? 'augment'
            : _e.GEMINI_PROJECT_DIR || _e.GEMINI_SESSION_ID
              ? 'antigravity'
              : 'unknown'
  _fs.appendFileSync(
    _p.join(_os.homedir(), '.argus', 'hook-scripts.log'),
    \`\${new Date().toISOString()} \${_agent} - ${filename} INFO ran\\n\`
  )
} catch (_) {}
`
  }
  if (filename.endsWith('.py')) {
    return `# ${note}
try:
    import os as _os, datetime as _dt
    _e = _os.environ
    _agent = (
        'claudecode' if _e.get('CLAUDECODE') == '1'
        else 'goose' if _e.get('GOOSE_TERMINAL') == '1' or _e.get('AGENT') == 'goose'
        else 'cursor' if _e.get('CURSOR_VERSION') or _e.get('CURSOR_PROJECT_DIR')
        else 'augment' if _e.get('AUGMENT_PROJECT_DIR') or _e.get('AUGMENT_CONVERSATION_ID')
        else 'antigravity' if _e.get('GEMINI_PROJECT_DIR') or _e.get('GEMINI_SESSION_ID')
        else 'unknown'
    )
    _ts = _dt.datetime.now(_dt.timezone.utc).isoformat()
    with open(_os.path.expanduser('~/.argus/hook-scripts.log'), 'a') as _f:
        _f.write(f"{_ts} {_agent} - ${filename} INFO ran\\n")
except Exception:
    pass
`
  }
  if (filename.endsWith('.sh')) {
    return `# ${note}
{
  _agent=unknown
  if [ "\${CLAUDECODE:-}" = "1" ]; then _agent=claudecode
  elif [ "\${GOOSE_TERMINAL:-}" = "1" ] || [ "\${AGENT:-}" = "goose" ]; then _agent=goose
  elif [ -n "\${CURSOR_VERSION:-}\${CURSOR_PROJECT_DIR:-}" ]; then _agent=cursor
  elif [ -n "\${AUGMENT_PROJECT_DIR:-}\${AUGMENT_CONVERSATION_ID:-}" ]; then _agent=augment
  elif [ -n "\${GEMINI_PROJECT_DIR:-}\${GEMINI_SESSION_ID:-}" ]; then _agent=antigravity
  fi
  printf '%s %s - ${filename} INFO ran\\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$_agent"
} >> "$HOME/.argus/hook-scripts.log" 2>/dev/null || true
`
  }
  return null
}

// injectRunLogger adds the run-logger prelude after the @argus-meta block.
// Idempotent; no-op for unrecognised runtimes.
export function injectRunLogger(body: string, filename: string): string {
  if (body.includes(RUN_LOG_TAG)) return body
  const prelude = runLoggerPrelude(filename)
  if (!prelude) return body
  const end = findTag(body, END_TAG)
  if (!end) return prelude + body
  const nl = body.indexOf('\n', end.idx + end.len)
  const at = nl === -1 ? body.length : nl + 1
  return body.slice(0, at) + '\n' + prelude + body.slice(at)
}
