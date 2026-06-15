import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { CollectionTab } from '@/features/scripts/collection/CollectionTab'
import type { CollectionController } from '@/features/scripts/collection/useCollection'

function fakeCollection(over: Partial<CollectionController> = {}): CollectionController {
  return {
    authenticated: true,
    login: 'octocat',
    gistUrl: undefined,
    entries: [{ id: 'a', filename: 'a.js', title: 'Alpha', local: true, gist: false }],
    loading: false,
    error: null,
    deviceCode: null,
    reload: vi.fn(),
    startLogin: vi.fn(),
    cancelLogin: vi.fn(),
    logout: vi.fn(),
    saveToGist: vi.fn(),
    install: vi.fn(),
    removeLocal: vi.fn(),
    removeGist: vi.fn(),
    removeBoth: vi.fn(),
    getLocalBody: vi.fn(),
    publishFiles: vi.fn(),
    ...over,
  } as CollectionController
}

function renderTab(query = '', collection = fakeCollection()) {
  return render(
    <MemoryRouter>
      <CollectionTab query={query} collection={collection} />
    </MemoryRouter>
  )
}

describe('CollectionTab', () => {
  it('renders entries by filename from the collection controller', () => {
    renderTab()
    expect(screen.getByText('a.js')).toBeInTheDocument()
  })

  it('does not render a Publish button on rows (sharing lives in the account menu)', () => {
    renderTab()
    expect(screen.queryByRole('button', { name: /^publish$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /upload & share/i })).not.toBeInTheDocument()
  })
})
