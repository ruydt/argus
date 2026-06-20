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
const META_START = '// @argus-meta'
const META_END = '// @end'

export function parseArgusMeta(body: string): Partial<ArgusMeta> {
  const start = body.indexOf(META_START)
  const end = body.indexOf(META_END)
  if (start === -1 || end === -1 || end < start) return {}
  const out: Partial<ArgusMeta> = {}
  const events: string[] = []
  const agents: string[] = []
  for (const line of body.slice(start, end).split('\n')) {
    const m = line.match(/^\/\/\s*(\w+):\s*(.*)$/)
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

export function buildArgusMeta(m: ArgusMeta): string {
  const lines = [META_START, `// title: ${m.title}`]
  if (m.author) lines.push(`// author: ${m.author}`)
  lines.push(`// events: ${m.events.join(', ')}`)
  if (m.agents.length) lines.push(`// agents: ${m.agents.join(', ')}`)
  lines.push(`// command: ${m.command}`)
  if (m.matcher) lines.push(`// matcher: ${m.matcher}`)
  if (m.purpose) lines.push(`// purpose: ${m.purpose}`)
  if (m.os) lines.push(`// os: ${m.os}`)
  lines.push(META_END, '')
  return lines.join('\n')
}

function stripArgusMeta(body: string): string {
  const start = body.indexOf(META_START)
  if (start === -1) return body
  const endIdx = body.indexOf(META_END, start)
  if (endIdx === -1) return body
  const before = body.slice(0, start)
  const after = body.slice(endIdx + META_END.length).replace(/^\r?\n/, '')
  return before + after
}

export function injectMeta(body: string, m: ArgusMeta): string {
  return buildArgusMeta(m) + '\n' + stripArgusMeta(body).replace(/^\n+/, '')
}
