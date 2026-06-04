import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ElicitBlock } from '@/features/events/renderers/ElicitBlock'
import { DisplayBlock } from '@/features/events/renderers/DisplayBlock'

describe('ElicitBlock', () => {
  it('renders server name and prompt', () => {
    render(<ElicitBlock serverName="memory" prompt="Should I delete these files?" searchQuery="" />)
    expect(screen.getByText('memory')).toBeTruthy()
    expect(screen.getByText('Should I delete these files?')).toBeTruthy()
  })

  it('renders response when present', () => {
    render(<ElicitBlock serverName="memory" prompt="Delete files?" response="No" searchQuery="" />)
    expect(screen.getByText('No')).toBeTruthy()
  })

  it('returns null when no server name and no prompt', () => {
    const { container } = render(<ElicitBlock searchQuery="" />)
    expect(container.firstChild).toBeNull()
  })
})

describe('DisplayBlock', () => {
  it('renders message content', () => {
    render(<DisplayBlock message="Hello from the model" searchQuery="" />)
    expect(screen.getByText('Hello from the model')).toBeTruthy()
  })

  it('returns null when message is empty', () => {
    const { container } = render(<DisplayBlock searchQuery="" />)
    expect(container.firstChild).toBeNull()
  })
})
