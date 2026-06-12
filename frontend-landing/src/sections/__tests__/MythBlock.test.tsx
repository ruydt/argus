import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MythBlock } from '../MythBlock'

describe('MythBlock', () => {
  it('tells the Panoptes story', () => {
    render(<MythBlock />)
    expect(screen.getByText(/Argus Panoptes/)).toBeInTheDocument()
    expect(screen.getByText(/peacock/)).toBeInTheDocument()
  })

  it('pairs the myth with the privacy counterweight', () => {
    render(<MythBlock />)
    expect(screen.getByText(/stays on your machine/i)).toBeInTheDocument()
  })
})
