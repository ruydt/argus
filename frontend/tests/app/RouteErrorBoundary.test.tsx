import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RouteErrorBoundary } from '@/app/RouteErrorBoundary'

function Boom({ message }: { message: string }): never {
  throw new Error(message)
}

describe('RouteErrorBoundary', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
  afterEach(() => vi.restoreAllMocks())

  it('renders children when nothing throws', () => {
    render(
      <RouteErrorBoundary>
        <p>page content</p>
      </RouteErrorBoundary>
    )
    expect(screen.getByText('page content')).toBeTruthy()
  })

  it('shows a reload prompt for a stale-chunk error instead of blanking', () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      writable: true,
    })
    render(
      <RouteErrorBoundary>
        <Boom message="Failed to fetch dynamically imported module: /assets/x.js" />
      </RouteErrorBoundary>
    )
    expect(screen.getByText('This page couldn’t load')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /reload/i }))
    expect(reload).toHaveBeenCalled()
  })

  it('surfaces a generic error message for non-chunk errors', () => {
    render(
      <RouteErrorBoundary>
        <Boom message="kaboom in render" />
      </RouteErrorBoundary>
    )
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    expect(screen.getByText('kaboom in render')).toBeTruthy()
  })
})
