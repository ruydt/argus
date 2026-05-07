// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Layout } from '@/components/Layout'
import { Dashboard } from './Dashboard'

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

function renderDashboardPage() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route path="dashboard" element={<Dashboard />} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('Dashboard payload compatibility', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MockStorage())
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
        if (url.includes('/api/dashboard/stats')) {
          return new Response(
            JSON.stringify({
              total_sessions: 1,
              total_events: 2,
              total_input_tokens: 100,
              total_output_tokens: 20,
              timeline: [],
              top_actions: [],
              agent_usage: [{ agent: 'codex', model: 'gpt-5.4', input: 100, output: 20 }],
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
        return new Response(JSON.stringify({}), { status: 404 })
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders dashboard even when session_usage is missing from API response', async () => {
    renderDashboardPage()

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Usage' })).toBeInTheDocument()
    )
    expect(screen.getByRole('tab', { name: 'Token usage' })).toBeInTheDocument()
  })
})
