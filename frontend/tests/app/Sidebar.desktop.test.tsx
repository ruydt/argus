import type { ComponentProps } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Sidebar } from '@/app/Sidebar'

function renderSidebar(props: ComponentProps<typeof Sidebar>) {
  return render(
    <MemoryRouter>
      <Sidebar {...props} />
    </MemoryRouter>
  )
}

describe('Sidebar desktop toggle placement', () => {
  it('renders a desktop collapse toggle inside the sidebar and calls onToggleCollapse', () => {
    const onToggleCollapse = vi.fn()

    renderSidebar({
      collapsed: false,
      mode: 'desktop',
      onToggleCollapse,
    })

    const sidebar = screen.getByRole('complementary')
    const collapseButton = within(sidebar).getByRole('button', { name: /collapse sidebar/i })

    fireEvent.click(collapseButton)

    expect(onToggleCollapse).toHaveBeenCalledTimes(1)
  })

  it('keeps desktop labels mounted so they can animate between expanded and collapsed states', () => {
    const { rerender } = renderSidebar({
      collapsed: false,
      mode: 'desktop',
      onToggleCollapse: vi.fn(),
    })

    expect(screen.getByText('Dashboard').closest('.sidebar-label-motion')).toHaveClass(
      'sidebar-label-open'
    )
    expect(screen.queryByText('Monitor')).not.toBeInTheDocument()

    rerender(
      <MemoryRouter>
        <Sidebar collapsed mode="desktop" onToggleCollapse={vi.fn()} />
      </MemoryRouter>
    )

    expect(screen.getByText('Dashboard').closest('.sidebar-label-motion')).toHaveClass(
      'sidebar-label-closed'
    )
    expect(screen.queryByText('Monitor')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /overview dashboard/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /ai insights/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument()
  })

  it('does not render version text before runtime version fetch resolves', () => {
    renderSidebar({
      collapsed: false,
      mode: 'desktop',
      onToggleCollapse: vi.fn(),
    })

    expect(screen.queryByLabelText(/application version:/i)).not.toBeInTheDocument()
  })

  it('keeps the mobile close control separate and does not render the desktop collapse button', () => {
    const onClose = vi.fn()

    renderSidebar({
      collapsed: false,
      mode: 'mobile',
      open: true,
      onClose,
    })

    screen.getByRole('dialog', { name: /primary navigation/i })
    const closeButton = screen.getByRole('button', { name: /close sidebar/i })

    expect(screen.queryByRole('button', { name: /collapse sidebar/i })).not.toBeInTheDocument()

    fireEvent.click(closeButton)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders a Diagnostics nav item linking to /diagnostics', () => {
    renderSidebar({
      collapsed: false,
      mode: 'desktop',
      onToggleCollapse: vi.fn(),
    })

    expect(screen.getByRole('link', { name: /system diagnostics/i })).toBeInTheDocument()
  })
})
