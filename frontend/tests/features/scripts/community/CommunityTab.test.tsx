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
    purpose: 'a purpose line',
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
  it('renders filenames (not titles/purpose) and no Test button', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => makeScripts(3) })
    )
    render(<CommunityTab query="" />)
    await waitFor(() => expect(screen.getByText('s0.js')).toBeInTheDocument())
    expect(screen.getAllByText('by alice').length).toBeGreaterThan(0)
    expect(screen.getAllByText('PreToolUse').length).toBeGreaterThan(0)
    expect(screen.queryByText('Script 0')).not.toBeInTheDocument()
    expect(screen.queryByText('a purpose line')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^test$/i })).not.toBeInTheDocument()
  })

  it('renders only the first 50 of a large list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => makeScripts(120) })
    )
    render(<CommunityTab query="" />)
    await waitFor(() => expect(screen.getByText('s0.js')).toBeInTheDocument())
    expect(screen.getByText('s49.js')).toBeInTheDocument()
    expect(screen.queryByText('s50.js')).not.toBeInTheDocument()
  })

  it('search filters the whole list (finds a script past the first 50)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => makeScripts(120) })
    )
    render(<CommunityTab query="s99" />)
    await waitFor(() => expect(screen.getByText('s99.js')).toBeInTheDocument())
  })
})
