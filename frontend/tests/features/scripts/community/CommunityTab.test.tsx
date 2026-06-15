import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CommunityTab } from '@/features/scripts/community/CommunityTab'
import { __resetCommunityCache, useCommunity } from '@/features/scripts/community/useCommunity'

// CommunityTab now takes its data controller as a prop (lifted to ScriptsPage);
// this harness wires a real useCommunity() so the existing fetch-driven tests
// keep exercising the same load path.
function Harness({ query }: { query: string }) {
  const community = useCommunity()
  return <CommunityTab query={query} community={community} />
}

beforeEach(() => {
  class IO {
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', IO as unknown as typeof IntersectionObserver)
})
afterEach(() => {
  vi.restoreAllMocks()
  __resetCommunityCache()
})

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
    render(<Harness query="" />)
    await waitFor(() => expect(screen.getByText('s0.js')).toBeInTheDocument())
    // Author only (no /id suffix).
    expect(screen.getAllByText('alice').length).toBe(3)
    expect(screen.queryByText('alice/s0')).not.toBeInTheDocument()
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
    render(<Harness query="" />)
    await waitFor(() => expect(screen.getByText('s0.js')).toBeInTheDocument())
    expect(screen.getByText('s49.js')).toBeInTheDocument()
    expect(screen.queryByText('s50.js')).not.toBeInTheDocument()
  })

  it('search filters the whole list (finds a script past the first 50)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => makeScripts(120) })
    )
    render(<Harness query="s99" />)
    await waitFor(() => expect(screen.getByText('s99.js')).toBeInTheDocument())
  })

  it('search matches the filename extension (so .js/.sh/.py are findable)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => makeScripts(3) })
    )
    render(<Harness query="js" />)
    await waitFor(() => expect(screen.getByText('s0.js')).toBeInTheDocument())
  })

  it('opens source in a modal when a row is clicked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.startsWith('/api/community/script')) {
          return { ok: true, json: async () => ({ id: 's0', body: 'console.log("source")' }) }
        }
        return { ok: true, json: async () => makeScripts(1) }
      })
    )
    render(<Harness query="" />)
    const rowButton = await screen.findByRole('button', { name: /s0\.js/i })
    fireEvent.click(rowButton)
    expect(await screen.findByText('console.log("source")')).toBeInTheDocument()
  })
})
