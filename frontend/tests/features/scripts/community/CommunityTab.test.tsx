import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CommunityTab } from '@/features/scripts/community/CommunityTab'

beforeEach(() => {
  class IO {
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', IO as unknown as typeof IntersectionObserver)
})
afterEach(() => vi.restoreAllMocks())

function makeScripts(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    author: 'alice',
    title: `Script ${i}`,
    purpose: 'p',
    event: 'PreToolUse',
    runtime: 'node',
    tier: 'community',
    sha256: 'x',
    source: `scripts/alice/s${i}.js`,
    installed: false,
    runtime_available: true,
  }))
}

describe('CommunityTab', () => {
  it('renders only the first 50 of a large list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => makeScripts(120) })
    )
    render(<CommunityTab query="" />)
    await waitFor(() => expect(screen.getByText('Script 0')).toBeInTheDocument())
    expect(screen.getByText('Script 49')).toBeInTheDocument()
    expect(screen.queryByText('Script 50')).not.toBeInTheDocument()
  })

  it('search finds a script beyond the first 50 (whole-registry search)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => makeScripts(120) })
    )
    render(<CommunityTab query="Script 99" />)
    await waitFor(() => expect(screen.getByText('Script 99')).toBeInTheDocument())
  })
})
