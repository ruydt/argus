import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CollectionTab } from '@/features/scripts/collection/CollectionTab'

afterEach(() => vi.restoreAllMocks())

describe('CollectionTab', () => {
  it('shows the login panel when unauthenticated', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ authenticated: false }) })
      )
    )
    render(<CollectionTab />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Login with GitHub' })).toBeInTheDocument()
    )
  })

  it('lists collection scripts when authenticated', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/github/status')
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ authenticated: true, login: 'ruy' }),
          })
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              scripts: [
                { id: 'g', filename: 'g.js', title: 'Guard', origin: 'local', installed: false },
              ],
            }),
        })
      })
    )
    render(<CollectionTab />)
    await waitFor(() => expect(screen.getByText('Guard')).toBeInTheDocument())
    expect(screen.getByText((_, el) => el?.textContent === '@ruy')).toBeInTheDocument()
  })
})
