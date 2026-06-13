import { readFile, readdir, writeFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, relative } from 'node:path'

const SCRIPTS_DIR = 'scripts'

function parseHeader(text) {
  const start = text.indexOf('// @argus-meta')
  const end = text.indexOf('// @end')
  if (start === -1 || end === -1) return null
  const meta = {}
  for (const line of text.slice(start, end).split('\n')) {
    const m = line.match(/^\/\/\s*(\w+):\s*(.*)$/)
    if (m) meta[m[1]] = m[2].trim()
  }
  return meta
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
    else if (name.endsWith('.js')) out.push(p)
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
    const id = rel.split('/').pop().replace(/\.js$/, '')
    const sha256 = createHash('sha256').update(text).digest('hex')
    scripts.push({
      id,
      author,
      title: meta.title,
      purpose: meta.purpose ?? '',
      event: meta.event ?? '',
      matcher: meta.matcher ?? '',
      runtime: meta.runtime ?? 'node',
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
