import { describe, expect, it } from 'vitest'

import {
  buildArgusMeta,
  injectMeta,
  parseArgusMeta,
  runtimeFromExt,
  splitCSV,
} from '@/features/scripts/community/argusMeta'

const FULL = [
  '// @argus-meta',
  '// title: Demo',
  '// events: PreToolUse, PostToolUse',
  '// agents: claudecode, codex',
  '// command: node demo.js',
  '// matcher: Bash',
  '// purpose: do a thing',
  '// @end',
  '',
  'console.log(1)',
  '',
].join('\n')

describe('runtimeFromExt', () => {
  it('maps extensions to runtimes', () => {
    expect(runtimeFromExt('a.js')).toBe('node')
    expect(runtimeFromExt('a.py')).toBe('python3')
    expect(runtimeFromExt('a.sh')).toBe('sh')
    expect(runtimeFromExt('a.txt')).toBe('node')
  })
})

describe('splitCSV', () => {
  it('trims, drops blanks, and de-duplicates while keeping order', () => {
    expect(splitCSV(' a, b ,a, ,c ')).toEqual(['a', 'b', 'c'])
    expect(splitCSV('')).toEqual([])
  })
})

describe('parseArgusMeta', () => {
  it('extracts all fields from a full header', () => {
    const m = parseArgusMeta(FULL)
    expect(m).toMatchObject({
      title: 'Demo',
      events: ['PreToolUse', 'PostToolUse'],
      agents: ['claudecode', 'codex'],
      command: 'node demo.js',
      matcher: 'Bash',
      purpose: 'do a thing',
    })
  })
  it('folds the legacy singular event field into events', () => {
    const m = parseArgusMeta('// @argus-meta\n// title: Old\n// event: Stop\n// @end\n')
    expect(m.events).toEqual(['Stop'])
  })
  it('returns only what is present (partial header)', () => {
    const m = parseArgusMeta('// @argus-meta\n// title: Only\n// @end\n')
    expect(m.title).toBe('Only')
    expect(m.events).toBeUndefined()
    expect(m.agents).toBeUndefined()
  })
  it('returns empty when no header', () => {
    expect(parseArgusMeta('console.log(1)\n')).toEqual({})
  })
})

describe('injectMeta', () => {
  const meta = {
    title: 'T',
    events: ['Stop'],
    agents: ['claudecode'],
    command: 'node t.js',
    matcher: '',
    purpose: '',
  }

  it('prepends a header to a headerless file', () => {
    const out = injectMeta('console.log(1)\n', meta)
    expect(out.startsWith('// @argus-meta')).toBe(true)
    expect(out).toContain('// title: T')
    expect(out).toContain('// events: Stop')
    expect(out).toContain('// agents: claudecode')
    expect(out).toContain('console.log(1)')
    expect(out.match(/\/\/ @argus-meta/g)?.length).toBe(1)
  })

  it('replaces an existing header (exactly one block remains)', () => {
    const out = injectMeta(FULL, meta)
    expect(out.match(/\/\/ @argus-meta/g)?.length).toBe(1)
    expect(out.match(/\/\/ @end/g)?.length).toBe(1)
    expect(out).toContain('// events: Stop')
    expect(out).not.toContain('// events: PreToolUse, PostToolUse')
    expect(out).toContain('console.log(1)')
  })
})

describe('buildArgusMeta', () => {
  it('omits empty optional fields', () => {
    const h = buildArgusMeta({
      title: 'T',
      events: ['Stop'],
      agents: ['codex'],
      command: 'sh t.sh',
      matcher: '',
      purpose: '',
    })
    expect(h).toContain('// title: T')
    expect(h).toContain('// events: Stop')
    expect(h).toContain('// agents: codex')
    expect(h).not.toContain('// matcher:')
    expect(h).not.toContain('// purpose:')
    expect(h).toContain('// @end')
  })
})
