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
  timeout_unit?: string
  supports_matcher?: boolean
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

function mockFetch(agentsResp: { agents: AgentStatus[]; enabled: string[] }) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/agents')) {
      return Promise.resolve({ ok: true, json: async () => agentsResp })
    }
    // hooks-config GET and diagnostics both return shape-appropriate empties.
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

describe('HooksConfigPage editable adapters', () => {
  it('drives the event picker and presets from a new editable agent’s own events', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      mockFetch({
        agents: [
          status({
            id: 'antigravity',
            display_name: 'Antigravity CLI',
            editing_supported: true,
            installed: true,
            timeout_unit: 'seconds',
            supports_matcher: true,
            events: ['PreInvocation', 'PostInvocation', 'SessionStart'],
          }),
        ],
        enabled: ['antigravity'],
      })
    )
    renderPage()

    // Structured editor (not guided panel) renders: Save control is present.
    await waitFor(() => expect(screen.getByLabelText('Save hooks config')).toBeTruthy())

    // Presets are generated from the agent's own events — selector renders.
    expect(screen.getByText('Apply preset…')).toBeTruthy()

    // The "Add hook event" picker offers Antigravity events, not Claude's.
    await user.click(screen.getByLabelText('Add hook event'))
    await waitFor(() => expect(screen.getByRole('option', { name: 'PreInvocation' })).toBeTruthy())
    expect(screen.queryByRole('option', { name: 'SubagentStart' })).toBeNull()
  })

  it('explains plugin agents accurately in the guided panel', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        agents: [
          status({
            id: 'opencode',
            display_name: 'OpenCode',
            config_kind: 'plugin',
            editing_supported: false,
            installed: true,
          }),
        ],
        enabled: ['opencode'],
      })
    )
    renderPage()

    await waitFor(() => expect(screen.getByText(/TypeScript\/JavaScript plugin code/)).toBeTruthy())
    // Still surfaces the agent-scoped ingest endpoint to wire up manually.
    expect(screen.getByText(/api\/hook\?agent=opencode/)).toBeTruthy()
  })
})
