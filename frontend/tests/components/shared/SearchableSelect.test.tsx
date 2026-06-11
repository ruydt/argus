import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchableSelect } from '@/components/shared/SearchableSelect'

const OPTIONS = [
  { label: 'alpha one', value: 'a1' },
  { label: 'beta two', value: 'b2' },
  { label: 'gamma three', value: 'g3' },
]

function setupStubs() {
  window.HTMLElement.prototype.scrollIntoView = () => {}
  window.HTMLElement.prototype.hasPointerCapture = () => false
  window.HTMLElement.prototype.setPointerCapture = () => {}
  window.HTMLElement.prototype.releasePointerCapture = () => {}
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
}

describe('SearchableSelect', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    setupStubs()
  })

  it('shows placeholder, opens with all options, selects and closes', async () => {
    const onValueChange = vi.fn()
    render(
      <SearchableSelect
        value=""
        onValueChange={onValueChange}
        options={OPTIONS}
        placeholder="Pick one"
        ariaLabel="Pick one"
      />
    )
    const user = userEvent.setup()

    const trigger = screen.getByRole('combobox', { name: /pick one/i })
    expect(trigger).toHaveTextContent('Pick one')

    await user.click(trigger)
    expect(await screen.findByText('alpha one')).toBeInTheDocument()
    expect(screen.getByText('beta two')).toBeInTheDocument()
    expect(screen.getByText('gamma three')).toBeInTheDocument()

    await user.click(screen.getByText('beta two'))
    expect(onValueChange).toHaveBeenCalledWith('b2')
    await waitFor(() => {
      expect(screen.queryByText('alpha one')).not.toBeInTheDocument()
    })
  })

  it('filters options by search text and shows empty state', async () => {
    render(
      <SearchableSelect
        value="a1"
        onValueChange={vi.fn()}
        options={OPTIONS}
        placeholder="Pick one"
        ariaLabel="Pick one"
        emptyText="Nothing found"
      />
    )
    const user = userEvent.setup()

    const trigger = screen.getByRole('combobox', { name: /pick one/i })
    expect(trigger).toHaveTextContent('alpha one')

    await user.click(trigger)
    const input = await screen.findByPlaceholderText('Search…')

    await user.type(input, 'beta')
    const listbox = screen.getByRole('listbox')
    await waitFor(() => {
      expect(within(listbox).queryByText('alpha one')).not.toBeInTheDocument()
    })
    expect(within(listbox).getByText('beta two')).toBeInTheDocument()

    await user.clear(input)
    await user.type(input, 'zzzz')
    expect(await screen.findByText('Nothing found')).toBeInTheDocument()
  })

  it('renders disabled trigger', () => {
    render(
      <SearchableSelect
        value=""
        onValueChange={vi.fn()}
        options={OPTIONS}
        placeholder="Pick one"
        ariaLabel="Pick one"
        disabled
      />
    )
    expect(screen.getByRole('combobox', { name: /pick one/i })).toBeDisabled()
  })
})
