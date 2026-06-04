import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HooksConfigPage } from '@/features/hooks-config/HooksConfigPage'

const emptyConfig = { hooks: {} }

function renderPage() {
  return render(
    <MemoryRouter>
      <HooksConfigPage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => emptyConfig }))
})

afterEach(() => vi.clearAllMocks())

describe('HooksConfigPage', () => {
  it('renders page heading', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Hooks Config')).toBeTruthy())
  })

  it('shows Claude Code and Codex tabs', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Claude Code' })).toBeTruthy()
      expect(screen.getByRole('tab', { name: 'Codex' })).toBeTruthy()
    })
  })

  it('Save button is disabled when config is unchanged', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save hooks config/i })).toBeTruthy()
    )
    expect(screen.getByRole('button', { name: /save hooks config/i })).toBeDisabled()
  })

  it('shows "Saved" status when config is unchanged and loaded', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy())
  })

  it('shows error card when load fails for active agent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    renderPage()
    await waitFor(() => expect(screen.getByText(/failed to load hooks config/i)).toBeTruthy())
  })

  it('shows loading skeleton initially', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    renderPage()
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()
  })

  it('shows Structured and JSON view mode tabs after load', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /structured/i })).toBeTruthy()
      expect(screen.getByRole('tab', { name: /json/i })).toBeTruthy()
    })
  })

  it('shows a discard changes action in the structured editor toolbar', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /discard changes/i })).toBeTruthy()
    })
  })

  it('renders CodeMirror editor region in JSON mode', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('tab', { name: /json/i }))
    expect(screen.getByRole('region', { name: /hooks config json/i })).toBeTruthy()
  })
})
