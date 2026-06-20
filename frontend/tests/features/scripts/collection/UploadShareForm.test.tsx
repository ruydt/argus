import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { UploadShareForm } from '@/features/scripts/collection/UploadShareForm'

beforeAll(() => {
  // jsdom shims Radix Dialog/Select may touch
  Element.prototype.scrollIntoView = vi.fn()
  // @ts-expect-error jsdom shim
  Element.prototype.hasPointerCapture = vi.fn()
})

// The form fetches GET /api/agents on mount to drive the agent + event pickers.
const AGENTS = [
  { id: 'claudecode', display_name: 'Claude Code', events: ['Stop', 'PreToolUse'] },
  { id: 'codex', display_name: 'Codex', events: ['Stop', 'SessionStart'] },
]

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => AGENTS }) as unknown as Response)
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const HEADED = [
  '// @argus-meta',
  '// title: Demo',
  '// events: Stop',
  '// agents: claudecode',
  '// command: node demo.js',
  '// @end',
  '',
  'console.log(1)',
  '',
].join('\n')

describe('UploadShareForm', () => {
  it('walks a headed file to the description step and submits injected bodies', async () => {
    const onSubmit = vi.fn()
    render(
      <UploadShareForm
        files={[{ name: 'demo.js', body: HEADED }]}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />
    )
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Demo')
    // Agents load async; the preselected claudecode chip appears once fetched.
    await screen.findByRole('button', { name: /Claude Code/i })

    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /pull request description/i }), {
      target: { value: 'my desc' },
    })
    fireEvent.click(screen.getByRole('button', { name: /share/i }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const [outFiles, description] = onSubmit.mock.calls[0]
    expect(description).toContain('my desc')
    expect(description).toContain('## Scripts')
    expect(description).toContain('### demo.js')
    expect(description).toContain('// @argus-meta')
    expect(outFiles[0].name).toBe('demo.js')
    expect(outFiles[0].body).toContain('// title: Demo')
    expect(outFiles[0].body).toContain('// events: Stop')
    expect(outFiles[0].body).toContain('// agents: claudecode')
    expect(outFiles[0].body.match(/\/\/ @argus-meta/g).length).toBe(1)
  })

  it('keeps Next disabled until an agent is selected, then enables it', async () => {
    render(
      <UploadShareForm
        files={[{ name: 'demo.js', body: HEADED }]}
        onSubmit={() => {}}
        onCancel={() => {}}
      />
    )
    // Headed file has title + events + agents → enabled once chips render.
    const codex = await screen.findByRole('button', { name: /Codex/i })
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled()

    // Adding codex is allowed (union of events still valid). Removing the only
    // agent (claudecode) would disable Next — verify the agent toggle is wired.
    fireEvent.click(codex)
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled()
  })

  it('disables Next for a headerless file with no agents chosen', async () => {
    render(
      <UploadShareForm
        files={[{ name: 'x.js', body: 'console.log(1)\n' }]}
        onSubmit={() => {}}
        onCancel={() => {}}
      />
    )
    await screen.findByRole('button', { name: /Claude Code/i })
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
  })

  it('writes selected OS platforms as a comma list into the meta', async () => {
    const onSubmit = vi.fn()
    render(
      <UploadShareForm
        files={[{ name: 'demo.js', body: HEADED }]}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />
    )
    await screen.findByRole('button', { name: /Claude Code/i })
    fireEvent.click(screen.getByRole('button', { name: 'Linux' }))
    fireEvent.click(screen.getByRole('button', { name: 'macOS' }))
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    fireEvent.click(screen.getByRole('button', { name: /share/i }))

    const [outFiles] = onSubmit.mock.calls[0]
    expect(outFiles[0].body).toContain('// os: linux, macos')
  })

  it('only shows events from the selected agents (union)', async () => {
    render(
      <UploadShareForm
        files={[{ name: 'demo.js', body: HEADED }]}
        onSubmit={() => {}}
        onCancel={() => {}}
      />
    )
    await screen.findByRole('button', { name: /Claude Code/i })
    // claudecode selected → its events offered; codex-only SessionStart hidden.
    expect(screen.getByRole('button', { name: 'PreToolUse' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'SessionStart' })).toBeNull()
    // Add codex → SessionStart now appears in the union.
    fireEvent.click(screen.getByRole('button', { name: /Codex/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'SessionStart' })).toBeInTheDocument()
    )
  })
})
