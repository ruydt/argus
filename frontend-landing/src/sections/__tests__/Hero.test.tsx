import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Hero } from '../Hero'

const INSTALL_CMD = 'git clone https://github.com/duytrandt04-afk/argus && make build'

describe('Hero', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  it('renders the main heading', () => {
    render(<Hero />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('renders GitHub CTA link', () => {
    render(<Hero />)
    const link = screen.getByRole('link', { name: /view on github/i })
    expect(link).toHaveAttribute('href', 'https://github.com/duytrandt04-afk/argus')
  })

  it('renders install snippet', () => {
    render(<Hero />)
    expect(screen.getByText(INSTALL_CMD)).toBeInTheDocument()
  })

  it('copies install command on button click', async () => {
    render(<Hero />)
    const copyBtn = screen.getByRole('button', { name: /copy/i })
    await userEvent.click(copyBtn)
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(INSTALL_CMD)
  })

  it('shows copied feedback after clicking copy', async () => {
    render(<Hero />)
    const copyBtn = screen.getByRole('button', { name: /copy/i })
    await userEvent.click(copyBtn)
    expect(copyBtn.closest('.hero-snippet')?.querySelector('.copied')).toBeTruthy()
  })
})
