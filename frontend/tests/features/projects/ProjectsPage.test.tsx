import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectsPage } from '@/features/projects/ProjectsPage'

const PROJECT = {
  cwd: '/work/demo',
  name: 'demo',
  session_count: 3,
  last_activity: '2026-06-11T10:00:00Z',
  total_tokens: 1234,
  agents: ['claudecode'],
  live_count: 0,
}

function mockFetch(impl: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = impl(String(input), init)
      return new Response(JSON.stringify(body), { status: 200 })
    })
  )
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ProjectsPage />
    </MemoryRouter>
  )
}

describe('ProjectsPage delete', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('opens confirm dialog with session count and deletes on confirm', async () => {
    let deleted = false
    mockFetch((url, init) => {
      if (init?.method === 'DELETE') {
        deleted = true
        return { sessions_deleted: 3, events_deleted: 42 }
      }
      return { projects: deleted ? [] : [PROJECT] }
    })

    renderPage()
    const deleteBtn = await screen.findByRole('button', { name: /delete project demo/i })
    fireEvent.click(deleteBtn)

    expect(await screen.findByText(/permanently deletes 3 session/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))

    await waitFor(() => {
      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls
      const deleteCall = calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'DELETE'
      )
      expect(deleteCall?.[0]).toContain('/api/projects?cwd=' + encodeURIComponent('/work/demo'))
    })
    await waitFor(() => {
      expect(screen.queryByTestId('project-card')).not.toBeInTheDocument()
    })
  })

  it('cancel closes dialog without DELETE call', async () => {
    mockFetch((_url, init) => {
      if (init?.method === 'DELETE') throw new Error('must not delete')
      return { projects: [PROJECT] }
    })

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /delete project demo/i }))
    fireEvent.click(await screen.findByRole('button', { name: /cancel/i }))

    await waitFor(() => {
      expect(screen.queryByText(/permanently deletes/i)).not.toBeInTheDocument()
    })
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE')).toBe(
      false
    )
  })
})
