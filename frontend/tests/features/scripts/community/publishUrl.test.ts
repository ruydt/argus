import { describe, expect, it } from 'vitest'

import { buildMetaHeader, buildPublishUrl } from '@/features/scripts/community/publishUrl'

const base = {
  id: 'git-autostash',
  title: 'Auto-stash',
  purpose: 'stash before checkout',
  event: 'PreToolUse',
  matcher: 'Bash',
  runtime: 'node',
  body: 'console.log(1)',
}

describe('buildMetaHeader', () => {
  it('emits the required fields between markers', () => {
    const header = buildMetaHeader(base)
    expect(header).toContain('// @argus-meta')
    expect(header).toContain('// title: Auto-stash')
    expect(header).toContain('// event: PreToolUse')
    expect(header).toContain('// matcher: Bash')
    expect(header).toContain('// @end')
  })
})

describe('buildPublishUrl', () => {
  it('prefills the body for a small script', () => {
    const { url, prefilled } = buildPublishUrl('alice', base)
    expect(prefilled).toBe(true)
    expect(url).toContain('/argus-hooks/registry/new/main')
    expect(url).toContain('filename=scripts%2Falice%2Fgit-autostash.js')
    expect(url).toContain('&value=')
  })

  it('falls back to no prefill for a large script', () => {
    const big = { ...base, body: 'x'.repeat(8000) }
    const { url, prefilled } = buildPublishUrl('alice', big)
    expect(prefilled).toBe(false)
    expect(url).not.toContain('&value=')
  })
})
