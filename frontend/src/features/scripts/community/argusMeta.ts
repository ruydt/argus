export type ArgusMeta = {
  title: string
  author?: string
  event: string
  command: string
  matcher: string
  purpose: string
  os?: string
}

// OS_OPTIONS are the platform-support values a script may declare. 'both' is the
// cross-platform default; 'posix' is macOS + Linux (shell/CLI tools, not Windows).
export const OS_OPTIONS = [
  { value: 'both', label: 'All (Linux, macOS, Windows)' },
  { value: 'posix', label: 'macOS & Linux' },
  { value: 'macos', label: 'macOS only' },
  { value: 'windows', label: 'Windows only' },
  { value: 'linux', label: 'Linux only' },
]

export const HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'SessionStart',
  'SessionEnd',
  'Stop',
  'SubagentStop',
  'PermissionRequest',
  'Notification',
  'PreCompact',
]

export function runtimeFromExt(filename: string): string {
  if (filename.endsWith('.py')) return 'python3'
  if (filename.endsWith('.sh')) return 'sh'
  return 'node'
}

const FIELD_KEYS: (keyof ArgusMeta)[] = [
  'title',
  'author',
  'event',
  'command',
  'matcher',
  'purpose',
  'os',
]
const META_START = '// @argus-meta'
const META_END = '// @end'

export function parseArgusMeta(body: string): Partial<ArgusMeta> {
  const start = body.indexOf(META_START)
  const end = body.indexOf(META_END)
  if (start === -1 || end === -1 || end < start) return {}
  const out: Partial<ArgusMeta> = {}
  for (const line of body.slice(start, end).split('\n')) {
    const m = line.match(/^\/\/\s*(\w+):\s*(.*)$/)
    if (!m) continue
    const key = m[1] as keyof ArgusMeta
    if (FIELD_KEYS.includes(key)) out[key] = m[2].trim()
  }
  return out
}

export function buildArgusMeta(m: ArgusMeta): string {
  const lines = [META_START, `// title: ${m.title}`]
  if (m.author) lines.push(`// author: ${m.author}`)
  lines.push(`// event: ${m.event}`, `// command: ${m.command}`)
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
