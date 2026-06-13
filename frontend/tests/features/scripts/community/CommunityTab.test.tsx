import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CommunityTab } from '@/features/scripts/community/CommunityTab'

afterEach(() => vi.restoreAllMocks())

const scripts = [
  {
    id: 'git-autostash',
    author: 'alice',
    title: 'Auto-stash',
    purpose: 'stash before checkout',
    event: 'PreToolUse',
    runtime: 'node',
    tier: 'community',
    sha256: 'abc',
    source: 'scripts/alice/git-autostash.js',
    installed: false,
    runtime_available: true,
  },
]

describe('CommunityTab', () => {
  it('renders rows with a community badge', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => scripts }))
    render(<CommunityTab query="" />)
    await waitFor(() => expect(screen.getByText('Auto-stash')).toBeInTheDocument())
    expect(screen.getByText('community')).toBeInTheDocument()
  })

  it('filters by query', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => scripts }))
    render(<CommunityTab query="nomatch" />)
    await waitFor(() => expect(screen.getByText(/No community scripts match/)).toBeInTheDocument())
  })
})
