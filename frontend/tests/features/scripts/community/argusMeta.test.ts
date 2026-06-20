import { describe, expect, it } from 'vitest'

import {
  buildArgusMeta,
  injectMeta,
  injectRunLogger,
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
  it('parses a #-comment header (py/sh scripts)', () => {
    const m = parseArgusMeta(
      '# @argus-meta\n# title: Shell\n# events: Stop\n# agents: codex\n# @end\n\necho hi\n'
    )
    expect(m).toMatchObject({ title: 'Shell', events: ['Stop'], agents: ['codex'] })
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

  it('uses #-comment headers for py/sh by filename', () => {
    const out = injectMeta('echo hi\n', meta, 'hook.sh')
    expect(out.startsWith('# @argus-meta')).toBe(true)
    expect(out).toContain('# title: T')
    expect(out).toContain('# events: Stop')
    expect(out).not.toContain('// @argus-meta')
  })
})

describe('injectRunLogger', () => {
  const headed =
    '// @argus-meta\n// title: T\n// events: Stop\n// agents: claudecode\n// @end\n\nconsole.log(1)\n'

  it('inserts the run-log prelude after the meta block for .js', () => {
    const out = injectRunLogger(headed, 'demo.js')
    expect(out).toContain('// @argus-run-log')
    expect(out).toContain('- demo.js INFO ran')
    expect(out.indexOf('// @end')).toBeLessThan(out.indexOf('// @argus-run-log'))
    expect(out.indexOf('// @argus-run-log')).toBeLessThan(out.indexOf('console.log(1)'))
    // the meta header block stays clean (mark lives below @end)
    const metaBlock = out.slice(out.indexOf('// @argus-meta'), out.indexOf('// @end'))
    expect(metaBlock).not.toContain('@argus-run-log')
  })

  it('inserts a #-comment python prelude for .py', () => {
    const headedPy = '# @argus-meta\n# title: T\n# events: Stop\n# @end\n\nprint(1)\n'
    const out = injectRunLogger(headedPy, 'hook.py')
    expect(out).toContain('# @argus-run-log')
    expect(out).toContain('import os as _os, datetime as _dt')
    expect(out).toContain('- hook.py INFO ran')
    expect(out).not.toContain('// @argus-run-log')
  })

  it('inserts a #-comment shell prelude for .sh', () => {
    const headedSh = '# @argus-meta\n# title: T\n# events: Stop\n# @end\n\necho hi\n'
    const out = injectRunLogger(headedSh, 'hook.sh')
    expect(out).toContain('# @argus-run-log')
    expect(out).toContain('date -u +%Y-%m-%dT%H:%M:%SZ')
    expect(out).toContain('- hook.sh INFO ran')
  })

  it('is idempotent', () => {
    const once = injectRunLogger(headed, 'demo.js')
    expect(injectRunLogger(once, 'demo.js')).toBe(once)
  })

  it('skips unrecognised runtimes', () => {
    expect(injectRunLogger(headed, 'notes.txt')).toBe(headed)
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
