import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

import { buildIndex } from '../build-index.mjs'

test('buildIndex parses the header and computes sha256', async () => {
  const root = await mkdtemp(join(tmpdir(), 'reg-'))
  await mkdir(join(root, 'scripts', 'alice'), { recursive: true })
  const body = [
    '// @argus-meta',
    '// title: Demo',
    '// event: PreToolUse',
    '// runtime: node',
    '// purpose: demo script',
    '// @end',
    '',
    'console.log("hi")',
    '',
  ].join('\n')
  await writeFile(join(root, 'scripts', 'alice', 'demo.js'), body)

  const index = await buildIndex(root)

  assert.equal(index.schema_version, 1)
  assert.equal(index.scripts.length, 1)
  const s = index.scripts[0]
  assert.equal(s.id, 'demo')
  assert.equal(s.author, 'alice')
  assert.equal(s.title, 'Demo')
  assert.equal(s.runtime, 'node')
  assert.equal(s.tier, 'community')
  assert.equal(s.source, 'scripts/alice/demo.js')
  assert.equal(s.sha256, createHash('sha256').update(body).digest('hex'))
})
