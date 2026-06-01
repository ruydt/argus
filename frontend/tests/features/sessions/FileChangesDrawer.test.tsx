import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FileChangesDrawer } from '@/features/sessions/FileChangesDrawer'
import type { FileChangeGroup } from '@/types/sessions'

function buildGroup(overrides: Partial<FileChangeGroup> = {}): FileChangeGroup {
  return {
    path: '/src/foo.ts',
    count: 1,
    changes: [
      {
        time: '2026-05-21T10:00:00.000Z',
        tool: 'edit',
        new_string: 'line one\nline two\nline three',
        start_line: 5,
      } as import('@/types/sessions').FileChangeEvent,
    ],
    ...overrides,
  }
}

function renderDrawer(groups: FileChangeGroup[]) {
  return render(
    <FileChangesDrawer
      sessionId="sess-1"
      sessionStartedAt="2026-05-21T10:00:00.000Z"
      groups={groups}
      loading={false}
      error={null}
      onClose={() => {}}
    />
  )
}

describe('FileChangesDrawer ChangeRow expand/collapse', () => {
  it('shows a chevron on a ChangeRow that has new_string', () => {
    renderDrawer([buildGroup()])
    // Expand the FileRow first to see ChangeRows
    fireEvent.click(screen.getByText(/foo\.ts/))
    // ChevronRight icon should be present (row is collapsed initially)
    expect(document.querySelector('svg')).not.toBeNull()
  })

  it('expands to show line-numbered code when ChangeRow is clicked', () => {
    renderDrawer([buildGroup()])
    fireEvent.click(screen.getByText(/foo\.ts/))
    // Click the ChangeRow (the edit label row)
    const editLabel = screen.getByText('edit')
    fireEvent.click(editLabel.closest('div') as HTMLElement)
    // Line 5 | line one should appear
    expect(screen.getByText(/5 │ line one/)).toBeDefined()
  })

  it('shows start_line as first line number', () => {
    renderDrawer([buildGroup()])
    fireEvent.click(screen.getByText(/foo\.ts/))
    fireEvent.click(screen.getByText('edit').closest('div') as HTMLElement)
    expect(screen.getByText(/5 │/)).toBeDefined()
    expect(screen.getByText(/7 │/)).toBeDefined()
  })

  it('collapses code when ChangeRow is clicked again', () => {
    renderDrawer([buildGroup()])
    fireEvent.click(screen.getByText(/foo\.ts/))
    const editDiv = screen.getByText('edit').closest('div') as HTMLElement
    fireEvent.click(editDiv)
    expect(screen.getByText(/5 │ line one/)).toBeDefined()
    fireEvent.click(editDiv)
    expect(screen.queryByText(/5 │ line one/)).toBeNull()
  })

  it('does not show chevron or expand when new_string and old_string are both absent', () => {
    const group = buildGroup({
      changes: [
        {
          time: '2026-05-21T10:00:00.000Z',
          tool: 'edit',
        } as import('@/types/sessions').FileChangeEvent,
      ],
    })
    renderDrawer([group])
    fireEvent.click(screen.getByText(/foo\.ts/))
    // Should not find any expandable code block
    expect(screen.queryByText(/│/)).toBeNull()
  })
})
