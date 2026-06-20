import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HooksConfigPage } from '@/features/hooks-config/HooksConfigPage'

type AgentStatus = {
  id: string
  display_name: string
  docs_url: string
  config_kind: string
  hooks_config_path: string
  editing_supported: boolean
  installed: boolean
  hooks_configured: boolean
  events?: string[]
}

function status(over: Partial<AgentStatus> & { id: string }): AgentStatus {
  return {
    display_name: over.id,
    docs_url: '',
    config_kind: 'json-hooks-file',
    hooks_config_path: `~/.${over.id}/hooks.json`,
    editing_supported: false,
    installed: false,
    hooks_configured: false,
    ...over,
  }
}

// Route the global fetch mock by URL so /api/agents, /api/agents/enabled and
// /api/hooks-config each return shape-appropriate JSON.
function mockFetch(agentsResp: { agents: AgentStatus[]; enabled: string[] }) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/api/agents/enabled')) {
      if (init?.method === 'POST') {
        const id = JSON.parse(String(init.body)).id as string
        return Promise.resolve({
          ok: true,
          json: async () => ({ enabled: [...agentsResp.enabled, id] }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ enabled: agentsResp.enabled }) })
    }
    if (url.includes('/api/agents')) {
      return Promise.resolve({ ok: true, json: async () => agentsResp })
    }
    return Promise.resolve({ ok: true, json: async () => ({ hooks: {} }) })
  })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <HooksConfigPage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  try {
    sessionStorage.clear()
  } catch {
    /* ignore */
  }
})

afterEach(() => vi.clearAllMocks())

describe('HooksConfigPage multi-agent', () => {
  it('renders a tab for each enabled agent', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        agents: [
          status({
            id: 'claudecode',
            display_name: 'Claude Code',
            editing_supported: true,
            installed: true,
          }),
          status({ id: 'codex', display_name: 'Codex', editing_supported: true, installed: true }),
          status({ id: 'cursor', display_name: 'Cursor', installed: true }),
        ],
        enabled: ['claudecode', 'codex', 'cursor'],
      })
    )
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Claude Code/ })).toBeTruthy()
      expect(screen.getByRole('tab', { name: /Codex/ })).toBeTruthy()
      expect(screen.getByRole('tab', { name: /Cursor/ })).toBeTruthy()
    })
  })

  it('shows the guided-setup panel for a non-editable agent', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      mockFetch({
        agents: [
          status({
            id: 'claudecode',
            display_name: 'Claude Code',
            editing_supported: true,
            installed: true,
          }),
          status({ id: 'codex', display_name: 'Codex', editing_supported: true, installed: true }),
          status({
            id: 'cursor',
            display_name: 'Cursor',
            installed: true,
            docs_url: 'https://cursor.com/docs/hooks',
            events: ['preToolUse'],
          }),
        ],
        enabled: ['claudecode', 'codex', 'cursor'],
      })
    )
    renderPage()

    await user.click(await screen.findByRole('tab', { name: /Cursor/ }))
    // The guided panel surfaces the agent-scoped ingest endpoint.
    await waitFor(() => expect(screen.getByText(/api\/hook\?agent=cursor/)).toBeTruthy())
  })

  it('adds an installed agent via the Add-agent picker', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      mockFetch({
        agents: [
          status({
            id: 'claudecode',
            display_name: 'Claude Code',
            editing_supported: true,
            installed: true,
          }),
          status({ id: 'codex', display_name: 'Codex', editing_supported: true, installed: true }),
          status({ id: 'cursor', display_name: 'Cursor', installed: true }),
        ],
        enabled: ['claudecode', 'codex'],
      })
    )
    renderPage()

    await user.click(await screen.findByRole('button', { name: /add agent/i }))
    await user.click(await screen.findByRole('option', { name: /Cursor/ }))

    await waitFor(() => expect(screen.getByRole('tab', { name: /Cursor/ })).toBeTruthy())
  })

  it('allows removing a default agent (Claude Code)', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        agents: [
          status({
            id: 'claudecode',
            display_name: 'Claude Code',
            editing_supported: true,
            installed: true,
          }),
          status({ id: 'codex', display_name: 'Codex', editing_supported: true, installed: true }),
        ],
        enabled: ['claudecode', 'codex'],
      })
    )
    renderPage()
    // The two defaults are no longer pinned — the active one shows a Remove button.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Remove Claude Code/ })).toBeTruthy()
    )
  })

  it('shows an empty state when every agent is removed', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        agents: [
          status({
            id: 'claudecode',
            display_name: 'Claude Code',
            editing_supported: true,
            installed: true,
          }),
        ],
        enabled: [],
      })
    )
    renderPage()
    await waitFor(() => expect(screen.getByText('No agents added')).toBeTruthy())
    // No remove button and no agent tabs when nothing is enabled.
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull()
    expect(screen.queryByRole('tab')).toBeNull()
  })
})
