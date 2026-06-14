import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SimulatorTab } from '@/features/hooks-config/SimulatorTab'

afterEach(() => vi.restoreAllMocks())

function noop() {}

const baseProps = {
  agent: 'codex' as const,
  config: null,
  eventType: 'Stop',
  onEventTypeChange: noop,
  commandValue: '',
  payloadJSON: '{}',
  onPayloadJSONChange: noop,
  customCommandText: '',
  onCustomCommandTextChange: noop,
  onApply: async () => {},
  applying: false,
}

describe('SimulatorTab initialScript', () => {
  it('preselects the command for the matching local script once loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          fileSystem: { hooks: [{ name: 'cost-warn.js', path: '/h/cost-warn.js' }] },
        }),
      })
    )
    const onCommandValueChange = vi.fn()
    render(
      <SimulatorTab
        {...baseProps}
        initialScript="cost-warn.js"
        onCommandValueChange={onCommandValueChange}
      />
    )
    await waitFor(() => expect(onCommandValueChange).toHaveBeenCalledWith('node "/h/cost-warn.js"'))
  })
})
