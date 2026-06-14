import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CollectionTab } from '@/features/scripts/collection/CollectionTab'

afterEach(() => vi.restoreAllMocks())

const view = {
  authenticated: true,
  entries: [{ id: 'a', filename: 'a.js', title: 'Alpha', local: true, gist: false }],
}

describe('CollectionTab', () => {
  it('shows entries and the Upload & share control when authenticated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => view }))
    render(<CollectionTab query="" />)
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /upload & share/i })).toBeInTheDocument()
  })

  it('does not render a Publish button on rows', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => view }))
    render(<CollectionTab query="" />)
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /^publish$/i })).not.toBeInTheDocument()
  })
})
