import { readFile, readdir, writeFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, relative } from 'node:path'

const SCRIPTS_DIR = 'scripts'

// @argus-meta uses `//` comments in JS scripts and `#` comments in py/sh; accept
// either marker + field style.
function findTag(text, tag) {
  const i1 = text.indexOf(`// ${tag}`)
  const i2 = text.indexOf(`# ${tag}`)
  if (i1 === -1) return i2
  if (i2 === -1) return i1
  return Math.min(i1, i2)
}

function parseHeader(text) {
  const start = findTag(text, '@argus-meta')
  const end = findTag(text, '@end')
  if (start === -1 || end === -1) return null
  const meta = {}
  for (const line of text.slice(start, end).split('\n')) {
    const m = line.match(/^(?:\/\/|#)\s*(\w+):\s*(.*)$/)
    if (m) meta[m[1]] = m[2].trim()
  }
  return meta
}

// splitCSV → trimmed, de-duplicated, order-preserving tokens (events/agents).
function splitCSV(value) {
  const out = []
  const seen = new Set()
  for (const part of (value ?? '').split(',')) {
    const v = part.trim()
    if (v && !seen.has(v)) {
      seen.add(v)
      out.push(v)
    }
  }
  return out
}

async function walk(dir) {
  const out = []
  let entries
  try {
    entries = await readdir(dir)
  } catch {
    return out // scripts/ may not exist yet
  }
  for (const name of entries) {
    const p = join(dir, name)
    const s = await stat(p)
    if (s.isDirectory()) out.push(...(await walk(p)))
    else if (/\.(js|sh|py)$/.test(name)) out.push(p)
  }
  return out
}

export async function buildIndex(root = '.') {
  const files = (await walk(join(root, SCRIPTS_DIR))).sort()
  const scripts = []
  for (const file of files) {
    const text = await readFile(file, 'utf8')
    const meta = parseHeader(text)
    if (!meta || !meta.title) continue
    const rel = relative(root, file).split('\\').join('/')
    const author = rel.split('/')[1]
    const id = rel.split('/').pop().replace(/\.(js|sh|py)$/, '')
    const sha256 = createHash('sha256').update(text).digest('hex')
    const command = meta.command ?? ''
    const runtime = command ? command.split(/\s+/)[0] : (meta.runtime ?? 'node')
    // events: prefer the plural header; fall back to the legacy singular `event`.
    const events = meta.events ? splitCSV(meta.events) : splitCSV(meta.event)
    const agents = splitCSV(meta.agents)
    scripts.push({
      id,
      author,
      title: meta.title,
      purpose: meta.purpose ?? '',
      events,
      agents,
      matcher: meta.matcher ?? '',
      command,
      runtime,
      os: meta.os ?? 'linux, macos, windows',
      tier: 'community',
      sha256,
      source: rel,
      published_at: meta.published ?? '',
    })
  }
  return { schema_version: 1, scripts }
}

// Run as a CLI: regenerate index.json in the current directory.
if (import.meta.url === `file://${process.argv[1]}`) {
  const index = await buildIndex('.')
  await writeFile('index.json', JSON.stringify(index, null, 2) + '\n')
  console.log(`wrote index.json with ${index.scripts.length} scripts`)
}
