import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RawPayloadModal } from '@/features/events/RawPayloadModal'

function renderModal(props: Partial<Parameters<typeof RawPayloadModal>[0]> = {}) {
  return render(
    <RawPayloadModal
      dedupKey="abc123"
      label="PreToolUse · Bash · 10:23:01"
      open={true}
      onClose={vi.fn()}
      {...props}
    />
  )
}

describe('RawPayloadModal', () => {
  afterEach(() => vi.clearAllMocks())

  it('shows loading skeleton while fetching', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    renderModal()
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()
  })

  it('renders the field view after fetch succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ raw_payload: { tool_name: 'Bash', duration_ms: 1505 } }),
      })
    )
    renderModal()
    await waitFor(() => expect(screen.getByText('Tool Name')).toBeTruthy())
    expect(screen.getByText('Bash')).toBeTruthy()
    expect(screen.getByText('Duration Ms')).toBeTruthy()
    expect(screen.getByText('1505')).toBeTruthy()
  })

  it('renders CodeMirror editor when the JSON tab is selected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ raw_payload: { tool: 'Bash', input: 'echo hi' } }),
      })
    )
    const user = userEvent.setup()
    renderModal()
    await user.click(await screen.findByRole('tab', { name: 'JSON' }))
    await waitFor(() => expect(document.querySelector('.cm-editor')).not.toBeNull())
  })

  it('shows error message when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
    renderModal()
    await waitFor(() => expect(screen.getByText(/failed to load raw payload/i)).toBeTruthy())
  })

  it('shows error message when fetch returns non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    renderModal()
    await waitFor(() => expect(screen.getByText(/failed to load raw payload/i)).toBeTruthy())
  })

  it('does not fetch when modal is closed', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderModal({ open: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
