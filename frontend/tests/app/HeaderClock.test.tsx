import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HeaderClock } from '@/app/HeaderClock'

describe('HeaderClock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-13T10:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the current time and ticks every second', () => {
    render(<HeaderClock />)
    const initial = screen.getByTestId('header-clock').textContent
    expect(initial).toContain(new Date('2026-06-13T10:00:00').toLocaleTimeString())

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByTestId('header-clock').textContent).toContain(
      new Date('2026-06-13T10:00:01').toLocaleTimeString()
    )
  })
})
