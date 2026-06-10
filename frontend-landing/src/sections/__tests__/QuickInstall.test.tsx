import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QuickInstall } from '../QuickInstall'

describe('QuickInstall', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  it('renders Clone & Build tab by default', () => {
    render(<QuickInstall />)
    expect(screen.getByText(/git clone/i)).toBeInTheDocument()
  })

  it('switches to Configure Hooks tab', async () => {
    render(<QuickInstall />)
    await userEvent.click(screen.getByRole('button', { name: /configure hooks/i }))
    expect(screen.getByText(/PostToolUse/i)).toBeInTheDocument()
  })

  it('switches to Open Dashboard tab', async () => {
    render(<QuickInstall />)
    await userEvent.click(screen.getByRole('button', { name: /open dashboard/i }))
    expect(screen.getByText(/localhost:5173/i)).toBeInTheDocument()
  })

  it('Clone & Build tab is active by default', () => {
    render(<QuickInstall />)
    expect(screen.getByRole('button', { name: /clone & build/i })).toHaveClass('active')
  })

  it('clicked tab becomes active', async () => {
    render(<QuickInstall />)
    const hooksTab = screen.getByRole('button', { name: /configure hooks/i })
    await userEvent.click(hooksTab)
    expect(hooksTab).toHaveClass('active')
  })
})
