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
  assert.equal(s.os, 'linux, macos, windows') // default when meta omits os
  assert.deepEqual(s.events, ['PreToolUse']) // legacy singular `event` folds into events
  assert.deepEqual(s.agents, []) // none declared
  assert.equal(s.sha256, createHash('sha256').update(body).digest('hex'))
})

test('buildIndex parses plural events and agents lists', async () => {
  const root = await mkdtemp(join(tmpdir(), 'reg-'))
  await mkdir(join(root, 'scripts', 'ruydt'), { recursive: true })
  const body = [
    '// @argus-meta',
    '// title: Multi',
    '// events: PreToolUse, PostToolUse',
    '// agents: claudecode, codex',
    '// @end',
    '',
    'console.log(1)',
    '',
  ].join('\n')
  await writeFile(join(root, 'scripts', 'ruydt', 'multi.js'), body)

  const index = await buildIndex(root)
  const s = index.scripts[0]
  assert.deepEqual(s.events, ['PreToolUse', 'PostToolUse'])
  assert.deepEqual(s.agents, ['claudecode', 'codex'])
})

test('buildIndex reads an explicit os field from the header', async () => {
  const root = await mkdtemp(join(tmpdir(), 'reg-'))
  await mkdir(join(root, 'scripts', 'ruydt'), { recursive: true })
  const body = ['// @argus-meta', '// title: Mac', '// os: macos', '// @end', '', 'console.log(1)', ''].join(
    '\n'
  )
  await writeFile(join(root, 'scripts', 'ruydt', 'mac.js'), body)

  const index = await buildIndex(root)

  assert.equal(index.scripts[0].author, 'ruydt')
  assert.equal(index.scripts[0].os, 'macos')
})

test('buildIndex indexes .sh and .py scripts, stripping their extension for the id', async () => {
  const root = await mkdtemp(join(tmpdir(), 'reg-'))
  await mkdir(join(root, 'scripts', 'bob'), { recursive: true })
  const shBody = ['// @argus-meta', '// title: Shell', '// runtime: sh', '// @end', '', 'echo hi', ''].join(
    '\n'
  )
  const pyBody = ['// @argus-meta', '// title: Py', '// runtime: python3', '// @end', '', 'print(1)', ''].join(
    '\n'
  )
  await writeFile(join(root, 'scripts', 'bob', 'notify.sh'), shBody)
  await writeFile(join(root, 'scripts', 'bob', 'scan.py'), pyBody)

  const index = await buildIndex(root)

  const byId = Object.fromEntries(index.scripts.map((s) => [s.id, s]))
  assert.equal(index.scripts.length, 2)
  assert.equal(byId['notify'].source, 'scripts/bob/notify.sh')
  assert.equal(byId['notify'].runtime, 'sh')
  assert.equal(byId['scan'].source, 'scripts/bob/scan.py')
  assert.equal(byId['scan'].runtime, 'python3')
})
