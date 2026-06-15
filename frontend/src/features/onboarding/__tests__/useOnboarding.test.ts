import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockMoveNext, mockDestroy, mockDrive, mockDriver } = vi.hoisted(() => {
  const mockMoveNext = vi.fn()
  const mockDestroy = vi.fn()
  const mockDrive = vi.fn()
  const mockDriver = vi.fn(() => ({
    drive: mockDrive,
    destroy: mockDestroy,
    moveNext: mockMoveNext,
  }))
  return { mockMoveNext, mockDestroy, mockDrive, mockDriver }
})

vi.mock('driver.js', () => ({ driver: mockDriver }))
vi.mock('../driverConfig', () => ({ createDriverConfig: () => ({}) }))
vi.mock('../tourSteps', () => ({
  buildFirstVisitSteps: ({
    onComplete,
  }: {
    onComplete: () => void
    navigate: unknown
    getDriver: unknown
  }) => [{ popover: { title: 'Step 1', onNextClick: onComplete } }],
}))
vi.mock('../pageTours', () => ({
  PAGE_TOURS: {
    '/': [{ popover: { title: 'Events step' } }],
    '/dashboard': [{ popover: { title: 'Dashboard step' } }],
  },
}))

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
}

const navigateMock = vi.fn()
const forceSidebarOpenMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('localStorage', localStorageMock)
  vi.clearAllMocks()
  vi.useFakeTimers()
  localStorageMock.getItem.mockReturnValue(null)
})

// IMPORTANT: import the hook AFTER the mocks
import { useOnboarding } from '../useOnboarding'

describe('useOnboarding', () => {
  it('starts first-visit tour on mount when flag not set', async () => {
    localStorageMock.getItem.mockReturnValue(null)

    renderHook(() =>
      useOnboarding({ navigate: navigateMock, forceSidebarOpen: forceSidebarOpenMock })
    )

    act(() => vi.advanceTimersByTime(900))

    expect(forceSidebarOpenMock).toHaveBeenCalledTimes(1)
    expect(mockDriver).toHaveBeenCalledTimes(1)
    expect(mockDrive).toHaveBeenCalledTimes(1)
  })

  it('skips first-visit tour when flag is set', async () => {
    localStorageMock.getItem.mockReturnValue('1')

    renderHook(() =>
      useOnboarding({ navigate: navigateMock, forceSidebarOpen: forceSidebarOpenMock })
    )

    act(() => vi.advanceTimersByTime(900))

    expect(forceSidebarOpenMock).not.toHaveBeenCalled()
    expect(mockDriver).not.toHaveBeenCalled()
  })

  it('markDone sets localStorage flag and clears isFirstVisitTourActive', async () => {
    localStorageMock.getItem.mockReturnValue(null)

    const { result } = renderHook(() =>
      useOnboarding({ navigate: navigateMock, forceSidebarOpen: forceSidebarOpenMock })
    )

    act(() => vi.advanceTimersByTime(900))

    expect(result.current.isFirstVisitTourActive).toBe(true)

    act(() => result.current.markDone())

    expect(localStorageMock.setItem).toHaveBeenCalledWith('argus_onboarding_done', '1')
    expect(result.current.isFirstVisitTourActive).toBe(false)
  })

  it('startPageTour drives for a known route', async () => {
    localStorageMock.getItem.mockReturnValue('1')

    const { result } = renderHook(() =>
      useOnboarding({ navigate: navigateMock, forceSidebarOpen: forceSidebarOpenMock })
    )

    act(() => vi.advanceTimersByTime(900))

    act(() => result.current.startPageTour('/'))

    expect(mockDriver).toHaveBeenCalledTimes(1)
    expect(mockDrive).toHaveBeenCalledTimes(1)
  })

  it('startPageTour does nothing for an unknown route', async () => {
    localStorageMock.getItem.mockReturnValue('1')

    const { result } = renderHook(() =>
      useOnboarding({ navigate: navigateMock, forceSidebarOpen: forceSidebarOpenMock })
    )

    act(() => vi.advanceTimersByTime(900))

    act(() => result.current.startPageTour('/unknown'))

    expect(mockDriver).not.toHaveBeenCalled()
  })
})
