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

  it('renders Install tab by default', () => {
    render(<QuickInstall />)
    expect(screen.getByText(/install.sh/i)).toBeInTheDocument()
  })

  it('switches to Configure Hooks tab', async () => {
    render(<QuickInstall />)
    await userEvent.click(screen.getByRole('button', { name: /configure hooks/i }))
    expect(screen.getByText(/PostToolUse/i)).toBeInTheDocument()
  })

  it('switches to Open Dashboard tab', async () => {
    render(<QuickInstall />)
    await userEvent.click(screen.getByRole('button', { name: /open dashboard/i }))
    expect(screen.getByText(/localhost:10804/i)).toBeInTheDocument()
  })

  it('Install tab is active by default', () => {
    render(<QuickInstall />)
    expect(screen.getByRole('button', { name: /^install$/i })).toHaveClass('active')
  })

  it('switches to Contribute tab', async () => {
    render(<QuickInstall />)
    await userEvent.click(screen.getByRole('button', { name: /contribute/i }))
    expect(screen.getByText(/make build-local/i)).toBeInTheDocument()
  })

  it('clicked tab becomes active', async () => {
    render(<QuickInstall />)
    const hooksTab = screen.getByRole('button', { name: /configure hooks/i })
    await userEvent.click(hooksTab)
    expect(hooksTab).toHaveClass('active')
  })
})
