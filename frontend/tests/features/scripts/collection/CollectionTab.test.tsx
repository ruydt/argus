import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CollectionTab } from '@/features/scripts/collection/CollectionTab'
import { __resetCollectionCache } from '@/features/scripts/collection/useCollection'

afterEach(() => {
  vi.restoreAllMocks()
  __resetCollectionCache()
})

const view = {
  authenticated: true,
  entries: [{ id: 'a', filename: 'a.js', title: 'Alpha', local: true, gist: false }],
}

function renderTab(query = '') {
  return render(
    <MemoryRouter>
      <CollectionTab query={query} />
    </MemoryRouter>
  )
}

describe('CollectionTab', () => {
  it('shows entries and the Upload & share control when authenticated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => view }))
    renderTab()
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /upload & share/i })).toBeInTheDocument()
  })

  it('does not render a Publish button on rows', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => view }))
    renderTab()
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /^publish$/i })).not.toBeInTheDocument()
  })
})
