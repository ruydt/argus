import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Outlet, Route, Routes, useOutletContext } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Layout } from '@/app/Layout'
import type { LayoutOutletContext } from '@/types'

const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}

vi.mock('@/features/version/VersionBadge', () => ({
  VersionBadge: () => null,
}))

beforeEach(() => {
  vi.stubGlobal('localStorage', localStorageMock)
  vi.clearAllMocks()
  localStorageMock.getItem.mockReturnValue(null)
})

function SearchQueryProbe() {
  const { searchQuery, setSearchQuery } = useOutletContext<LayoutOutletContext>()

  return (
    <div>
      <button type="button" onClick={() => setSearchQuery((prev) => prev + 'x')}>
        append query
      </button>
      <output data-testid="search-query">{searchQuery}</output>
    </div>
  )
}

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<SearchQueryProbe />} />
          <Route path="*" element={<Outlet />} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('Layout outlet context', () => {
  it('resolves functional search query updates against the previous value', () => {
    renderLayout()

    fireEvent.click(screen.getByRole('button', { name: /append query/i }))

    expect(screen.getByTestId('search-query')).toHaveTextContent('x')
  })
})
