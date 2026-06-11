import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SimulatorTab } from '@/features/hooks-config/SimulatorTab'
import type { AgentKey } from '@/features/hooks-config/types'

vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value }: { value: string }) => <pre>{value}</pre>,
}))

const HOOKS = [
  { name: 'README.md', path: '/Users/dev/.argus/hooks/README.md' },
  { name: 'stop.js', path: '/Users/dev/.argus/hooks/stop.js' },
  { name: 'notify.sh', path: '/Users/dev/.argus/hooks/notify.sh' },
]

function stubDiagnosticsFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/diagnostics')) {
        return new Response(JSON.stringify({ fileSystem: { hooks: HOOKS } }), { status: 200 })
      }
      return new Response('{}', { status: 200 })
    })
  )
}

function renderTab(agent: AgentKey, onCommandValueChange = vi.fn()) {
  render(
    <SimulatorTab
      agent={agent}
      config={{ hooks: {} }}
      eventType="PreToolUse"
      onEventTypeChange={vi.fn()}
      commandValue=""
      onCommandValueChange={onCommandValueChange}
      payloadJSON="{}"
      onPayloadJSONChange={vi.fn()}
      customCommandText=""
      onCustomCommandTextChange={vi.fn()}
      onApply={vi.fn()}
      applying={false}
    />
  )
  return onCommandValueChange
}

describe('SimulatorTab script options', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    // Radix Select uses pointer capture and scrollIntoView APIs absent from jsdom —
    // stub them so the dropdown portal mounts without errors when the trigger is clicked.
    window.HTMLElement.prototype.hasPointerCapture = () => false
    window.HTMLElement.prototype.setPointerCapture = () => {}
    window.HTMLElement.prototype.releasePointerCapture = () => {}
    window.HTMLElement.prototype.scrollIntoView = () => {}
  })

  it('lists hook scripts and composes CLAUDECODE command for claudecode agent', async () => {
    stubDiagnosticsFetch()
    const onChange = renderTab('claudecode')
    const user = userEvent.setup()

    const commandTrigger = await screen.findByRole('combobox', { name: /hook command/i })
    await user.click(commandTrigger)

    expect(await screen.findByText('script: stop.js')).toBeInTheDocument()
    expect(screen.getByText('script: notify.sh')).toBeInTheDocument()
    expect(screen.queryByText(/README/)).not.toBeInTheDocument()

    await user.click(screen.getByText('script: stop.js'))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('CLAUDECODE=1 node "/Users/dev/.argus/hooks/stop.js"')
    })
  })

  it('composes bare command for codex agent and sh for .sh scripts', async () => {
    stubDiagnosticsFetch()
    const onChange = renderTab('codex')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('combobox', { name: /hook command/i }))
    await user.click(await screen.findByText('script: notify.sh'))

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('sh "/Users/dev/.argus/hooks/notify.sh"')
    })
  })
})
