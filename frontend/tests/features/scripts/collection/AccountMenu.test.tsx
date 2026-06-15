import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AccountMenu } from '@/features/scripts/collection/AccountMenu'
import type { CollectionController } from '@/features/scripts/collection/useCollection'

function fakeCollection(over: Partial<CollectionController> = {}): CollectionController {
  return {
    authenticated: true,
    login: 'octocat',
    gistUrl: 'https://gist.github.com/octocat/abc',
    entries: [],
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

describe('AccountMenu', () => {
  it('collapses to an avatar trigger; reveals account controls on click', () => {
    render(<AccountMenu collection={fakeCollection()} />)

    // Collapsed: controls hidden until the avatar is clicked.
    expect(screen.queryByRole('button', { name: /upload & share/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /github account/i }))

    expect(screen.getByRole('button', { name: /upload & share/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument()
    expect(screen.getByText('View scripts on Gist')).toBeInTheDocument()
  })

  it('offers sign-in when unauthenticated', () => {
    render(<AccountMenu collection={fakeCollection({ authenticated: false, login: undefined })} />)
    fireEvent.click(screen.getByRole('button', { name: /github account/i }))
    expect(screen.getByRole('button', { name: /sign in with github/i })).toBeInTheDocument()
  })
})
