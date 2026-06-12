import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WhyBlock } from '../WhyBlock'

describe('WhyBlock', () => {
  it('renders four numbered problems', () => {
    render(<WhyBlock />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(4)
  })

  it('states the thesis', () => {
    render(<WhyBlock />)
    expect(screen.getByText(/control plane/)).toBeInTheDocument()
  })
})
