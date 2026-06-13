import { describe, expect, it } from 'vitest'

import { filterBundles, filterScripts } from '@/features/scripts/scriptFilters'
import type { ScriptBundle, ScriptPackage } from '@/types'

const pkg = (over: Partial<ScriptPackage>): ScriptPackage => ({
  id: 'x',
  filename: 'x.js',
  version: '1.0.0',
  title: 'X',
  purpose: 'does x',
  event: 'Stop',
  matcher: '',
  runtime: 'node',
  agents: [],
  author: 'argus',
  source: '',
  tier: 'official',
  checksum: '',
  body: '',
  installed: false,
  runtime_available: true,
  ...over,
})

describe('filterScripts', () => {
  const packages = [
    pkg({
      id: 'block-dangerous',
      title: 'Block dangerous',
      purpose: 'deny rm -rf',
      event: 'PreToolUse',
    }),
    pkg({ id: 'stop', title: 'Stop notification', purpose: 'notify on finish', event: 'Stop' }),
  ]

  it('returns everything for an empty query', () => {
    expect(filterScripts(packages, '   ')).toHaveLength(2)
  })

  it('matches on title/id/purpose/event case-insensitively', () => {
    expect(filterScripts(packages, 'BLOCK').map((p) => p.id)).toEqual(['block-dangerous'])
    expect(filterScripts(packages, 'notify').map((p) => p.id)).toEqual(['stop'])
    expect(filterScripts(packages, 'pretooluse').map((p) => p.id)).toEqual(['block-dangerous'])
  })

  it('returns empty when nothing matches', () => {
    expect(filterScripts(packages, 'zzz')).toHaveLength(0)
  })
})

describe('filterBundles', () => {
  const bundles: ScriptBundle[] = [
    { id: 'safety', title: 'Safety starter', description: 'guardrails', packages: [] },
    { id: 'notify', title: 'Notifications', description: 'pings', packages: [] },
  ]

  it('matches on title and description', () => {
    expect(filterBundles(bundles, 'guard').map((b) => b.id)).toEqual(['safety'])
    expect(filterBundles(bundles, 'NOTIF').map((b) => b.id)).toEqual(['notify'])
  })
})
