import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Layout } from './Layout'
import { Events } from '../pages/Events'

class MockEventSource {
  static instances: MockEventSource[] = []

  url: string
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
  }

  close() {}

  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent<string>)
  }
}

class MockStorage {
  private data = new Map<string, string>()

  getItem(key: string) {
    return this.data.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.data.set(key, value)
  }

  removeItem(key: string) {
    this.data.delete(key)
  }

  clear() {
    this.data.clear()
  }
}

function renderEventsPage() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Events />} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('Layout session collapse persistence', () => {
  beforeEach(() => {
    MockEventSource.instances = []
    vi.stubGlobal('localStorage', new MockStorage())

    vi.stubGlobal('EventSource', MockEventSource)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input)
        if (url.endsWith('/api/sessions')) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (url.endsWith('/api/events')) {
          return new Response(JSON.stringify({ events: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({}), { status: 404 })
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps collapsed sessions closed after page reload', async () => {
    const event = {
      time: new Date().toISOString(),
      action: 'PROMPT',
      path: 'src/demo.ts',
      session: 'sess-1',
    }

    const firstRender = renderEventsPage()
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1))

    MockEventSource.instances[0].emit(event)

    await screen.findByText('src/demo.ts')
    fireEvent.click(screen.getByText('sess-1'))

    await waitFor(() => expect(screen.queryByText('src/demo.ts')).not.toBeInTheDocument())

    firstRender.unmount()

    renderEventsPage()
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(2))

    MockEventSource.instances[1].emit(event)

    await screen.findByText('sess-1')
    await waitFor(() => expect(screen.queryByText('src/demo.ts')).not.toBeInTheDocument())
  })
})
