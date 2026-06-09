import { act, renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useSplitViewInteractions } from '@/features/events/hooks/useEventsPageInteractions'

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>
}

function makeDragEvent(): React.DragEvent {
  return {
    preventDefault: () => {},
    dataTransfer: { dropEffect: '' as DataTransfer['dropEffect'] },
  } as unknown as React.DragEvent
}

describe('useSplitViewInteractions — handleDragOver', () => {
  it('sets dragOverPanel on first call', () => {
    const { result } = renderHook(
      () => useSplitViewInteractions({ filteredEvents: [], sortOrder: 'newest' }),
      { wrapper }
    )
    act(() => {
      result.current.handleDragOver(1)(makeDragEvent())
    })
    expect(result.current.dragOverPanel).toBe(1)
  })

  it('updates dragOverPanel when called with a different panel', () => {
    const { result } = renderHook(
      () => useSplitViewInteractions({ filteredEvents: [], sortOrder: 'newest' }),
      { wrapper }
    )
    act(() => {
      result.current.handleDragOver(1)(makeDragEvent())
    })
    act(() => {
      result.current.handleDragOver(2)(makeDragEvent())
    })
    expect(result.current.dragOverPanel).toBe(2)
  })

  it('dragOverPanel stays unchanged when called repeatedly with same panel', () => {
    const { result } = renderHook(
      () => useSplitViewInteractions({ filteredEvents: [], sortOrder: 'newest' }),
      { wrapper }
    )
    act(() => {
      result.current.handleDragOver(1)(makeDragEvent())
    })
    act(() => {
      result.current.handleDragOver(1)(makeDragEvent())
    })
    expect(result.current.dragOverPanel).toBe(1)
  })
})

describe('useSplitViewInteractions — handleDragLeave', () => {
  it('clears dragOverPanel', () => {
    const { result } = renderHook(
      () => useSplitViewInteractions({ filteredEvents: [], sortOrder: 'newest' }),
      { wrapper }
    )
    act(() => {
      result.current.handleDragOver(1)(makeDragEvent())
    })
    act(() => {
      result.current.handleDragLeave({
        currentTarget: document.createElement('div'),
        relatedTarget: null,
      } as unknown as React.DragEvent)
    })
    expect(result.current.dragOverPanel).toBeNull()
  })
})

describe('useSplitViewInteractions — sessionStorage restore', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('starts with splitView=false when sessionStorage is empty', () => {
    const { result } = renderHook(
      () => useSplitViewInteractions({ filteredEvents: [], sortOrder: 'newest' }),
      { wrapper }
    )
    expect(result.current.splitView).toBe(false)
  })

  it('restores splitView=true from sessionStorage', () => {
    sessionStorage.setItem('events_split_enabled', 'true')
    sessionStorage.setItem('events_split_panel2_sessions', JSON.stringify(['sess-abc']))
    sessionStorage.setItem('events_split_panel2_event_keys', '[]')

    const { result } = renderHook(
      () => useSplitViewInteractions({ filteredEvents: [], sortOrder: 'newest' }),
      { wrapper }
    )
    expect(result.current.splitView).toBe(true)
  })

  it('writes split state to sessionStorage when split view toggled', () => {
    const events = [
      {
        time: new Date().toISOString(),
        action: 'BASH' as const,
        path: '',
        session: 'sess-1',
        transcript_path: '/path/to/session.jsonl',
      },
    ]

    const { result } = renderHook(
      () => useSplitViewInteractions({ filteredEvents: events, sortOrder: 'newest' }),
      { wrapper }
    )

    act(() => { result.current.toggleSplitView() })
    // useEffect runs synchronously inside act
    expect(sessionStorage.getItem('events_split_enabled')).toBe('true')
  })
})
