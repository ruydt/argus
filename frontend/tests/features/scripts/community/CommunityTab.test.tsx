import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CommunityTab } from '@/features/scripts/community/CommunityTab'

afterEach(() => vi.restoreAllMocks())

const officialCatalog = {
  packages: [
    {
      id: 'block-dangerous',
      filename: 'block-dangerous.js',
      version: '1.0.0',
      title: 'Block dangerous commands',
      purpose: 'deny dangerous shell',
      event: 'PreToolUse',
      runtime: 'node',
      agents: ['claude-code'],
      author: 'argus',
      source: '',
      tier: 'official',
      checksum: '',
      body: '',
      installed: false,
      runtime_available: true,
    },
  ],
  bundles: [],
}

const communityScripts = [
  {
    id: 'git-autostash',
    author: 'alice',
    title: 'Auto-stash',
    purpose: 'stash',
    event: 'PreToolUse',
    runtime: 'node',
    tier: 'community',
    sha256: 'abc',
    source: 'scripts/alice/git-autostash.js',
    installed: false,
    runtime_available: true,
  },
]

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url === '/api/scripts/catalog')
        return Promise.resolve({ ok: true, json: async () => officialCatalog })
      if (url === '/api/community/catalog')
        return Promise.resolve({ ok: true, json: async () => communityScripts })
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })
  )
}

describe('CommunityTab', () => {
  it('renders official and community single scripts together', async () => {
    stubFetch()
    render(<CommunityTab query="" />)
    await waitFor(() => expect(screen.getByText('Block dangerous commands')).toBeInTheDocument())
    expect(screen.getByText('Auto-stash')).toBeInTheDocument()
    expect(screen.getByText('community')).toBeInTheDocument()
  })

  it('filters across both sources', async () => {
    stubFetch()
    render(<CommunityTab query="autostash" />)
    await waitFor(() => expect(screen.getByText('Auto-stash')).toBeInTheDocument())
    expect(screen.queryByText('Block dangerous commands')).not.toBeInTheDocument()
  })
})
