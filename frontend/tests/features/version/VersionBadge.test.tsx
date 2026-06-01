import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VersionBadge } from '@/features/version/VersionBadge'

function renderBadge() {
  return render(<VersionBadge />)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '1.2.3', commit: 'abcdef123', buildDate: '2026-05-31' }),
    })
  )
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('VersionBadge', () => {
  it('renders version with shortened commit when commit is a hash', async () => {
    renderBadge()
    const badge = await screen.findByLabelText('Application version: v1.2.3 (abcdef1)')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent('v1.2.3 (abcdef1)')
  })

  it('renders version without commit suffix when commit is "none"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: '1.2.3', commit: 'none', buildDate: '2026-05-31' }),
      })
    )
    renderBadge()
    const badge = await screen.findByLabelText('Application version: v1.2.3')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent('v1.2.3')
    expect(badge.textContent).not.toContain('(')
  })

  it('renders nothing while fetch is pending', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    const { container } = renderBadge()
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByLabelText(/Application version:/)).not.toBeInTheDocument()
  })

  it('renders nothing when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network failure')))
    const { container } = renderBadge()
    await waitFor(() => {
      expect(screen.queryByLabelText(/Application version:/)).not.toBeInTheDocument()
    })
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when fetch returns non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    )
    const { container } = renderBadge()
    await waitFor(() => {
      expect(screen.queryByLabelText(/Application version:/)).not.toBeInTheDocument()
    })
    expect(container).toBeEmptyDOMElement()
  })
})
