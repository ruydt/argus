import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CollectionTab } from '@/features/scripts/collection/CollectionTab'

afterEach(() => vi.restoreAllMocks())

const view = {
  authenticated: false,
  entries: [
    { id: 'a', filename: 'a.js', title: 'Alpha', local: true, gist: false },
    { id: 'b', filename: 'b.js', title: 'Beta', local: false, gist: true },
  ],
}

describe('CollectionTab', () => {
  it('lists union entries and shows Sign in when logged out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => view }))
    render(<CollectionTab query="" />)
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in with github/i })).toBeInTheDocument()
  })

  it('filters by query', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => view }))
    render(<CollectionTab query="alpha" />)
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())
    expect(screen.queryByText('Beta')).not.toBeInTheDocument()
  })
})
