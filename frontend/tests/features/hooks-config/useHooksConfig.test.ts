import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHooksConfig } from '@/features/hooks-config/hooks/useHooksConfig'

const emptyConfig = { hooks: {} }
const populatedConfig = {
  hooks: {
    SessionStart: [
      { hooks: [{ type: 'command', command: 'curl http://localhost:10804/api/hook' }] },
    ],
  },
}

function stripIds<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (key, current) => (key === 'id' ? undefined : current)))
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => emptyConfig }))
})

afterEach(() => vi.clearAllMocks())

describe('useHooksConfig', () => {
  it('starts with loading=true', () => {
    const { result } = renderHook(() => useHooksConfig('claudecode'))
    expect(result.current.loading).toBe(true)
  })

  it('populates config on successful fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => populatedConfig })
    )
    const { result } = renderHook(() => useHooksConfig('claudecode'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(stripIds(result.current.config)).toEqual(populatedConfig)
    expect(result.current.config?.hooks.SessionStart?.[0]?.id).toEqual(expect.any(String))
    expect(result.current.config?.hooks.SessionStart?.[0]?.hooks[0]?.id).toEqual(expect.any(String))
    expect(result.current.isDirty).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('sets error on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    const { result } = renderHook(() => useHooksConfig('codex'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toContain('HTTP 500')
    expect(result.current.config).toBeNull()
  })

  it('isDirty becomes true after setDraftJSON with different content', async () => {
    const { result } = renderHook(() => useHooksConfig('claudecode'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setDraftJSON('{"hooks":{"PreToolUse":[]}}'))
    expect(result.current.isDirty).toBe(true)
  })

  it('isDirty stays false when setDraftJSON matches saved content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => emptyConfig }))
    const { result } = renderHook(() => useHooksConfig('claudecode'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setDraftJSON(JSON.stringify(emptyConfig, null, 2)))
    expect(result.current.isDirty).toBe(false)
  })

  it('discardChanges resets unsaved edits back to the last saved config', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => populatedConfig })
    )
    const { result } = renderHook(() => useHooksConfig('claudecode'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const savedJSON = result.current.draftJSON

    act(() => result.current.setDraftJSON('{"hooks":{"Stop":[]}}'))
    expect(result.current.isDirty).toBe(true)

    act(() => result.current.discardChanges())

    expect(result.current.isDirty).toBe(false)
    expect(result.current.draftJSON).toBe(savedJSON)
    expect(stripIds(result.current.config)).toEqual(populatedConfig)
  })

  it('save calls PUT and clears isDirty on success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => emptyConfig })
      .mockResolvedValueOnce({ ok: true, json: async () => populatedConfig })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useHooksConfig('claudecode'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setDraftJSON(JSON.stringify(populatedConfig, null, 2)))
    expect(result.current.isDirty).toBe(true)

    await act(() => result.current.save())

    expect(result.current.isDirty).toBe(false)
    expect(result.current.saveError).toBeNull()
    expect(stripIds(result.current.config)).toEqual(populatedConfig)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/hooks-config?agent=claudecode',
      expect.objectContaining({ method: 'PUT' })
    )
  })

  it('save sets saveError on PUT failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => emptyConfig })
        .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'disk full' })
    )
    const { result } = renderHook(() => useHooksConfig('claudecode'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setDraftJSON('{"hooks":{}}'))
    await act(() => result.current.save())

    expect(result.current.saveError).toBeTruthy()
  })

  it('reload triggers a new fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => emptyConfig })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useHooksConfig('codex'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.reload())
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })
})
