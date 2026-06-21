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
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Hooks' })).toBeTruthy())
  })

  it('shows the agent switcher', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Claude Code/ })).toBeTruthy()
      expect(screen.getByRole('tab', { name: /Codex/ })).toBeTruthy()
    })
  })

  it('disables Delete all events when there are no events', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /delete all events/i })).toBeTruthy()
    )
    expect(screen.getByRole('button', { name: /delete all events/i })).toBeDisabled()
  })

  it('opens a confirm dialog from Delete all events', async () => {
    const cfg = {
      hooks: { PostToolUse: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] },
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve({
          ok: true,
          json: async () => (String(url).includes('/api/hooks-config') ? cfg : emptyConfig),
        })
      )
    )
    const user = userEvent.setup()
    renderPage()
    const btn = await screen.findByRole('button', { name: /delete all events/i })
    await waitFor(() => expect(btn).not.toBeDisabled())
    await user.click(btn)
    expect(await screen.findByText(/delete all events\?/i)).toBeTruthy()
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

  it('shows the Open Simulator toggle in structured view', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /open simulator/i })).toBeTruthy()
    })
  })

  it('switches to the simulator view when Open Simulator is clicked', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /open simulator/i }))
    expect(await screen.findByRole('button', { name: /back to structured/i })).toBeTruthy()
  })
})
