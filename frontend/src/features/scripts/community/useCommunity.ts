import { useCallback, useEffect, useState } from 'react'

import type { CommunityScript } from '@/types'

type State = {
  scripts: CommunityScript[]
  loading: boolean
  error: string | null
}

export type SimulateResult = {
  stdout: string
  stderr: string
  exit_code: number
  duration_ms: number
}

export function useCommunity() {
  const [state, setState] = useState<State>({ scripts: [], loading: true, error: null })

  const reload = useCallback(async () => {
    try {
      const resp = await fetch('/api/community/catalog')
      if (!resp.ok) throw new Error(`community ${resp.status}`)
      const scripts: CommunityScript[] = await resp.json()
      setState({ scripts, loading: false, error: null })
    } catch (e) {
      setState({ scripts: [], loading: false, error: (e as Error).message })
    }
  }, [])

  useEffect(() => {
    // Async IIFE keeps the fetch-driven setState off the effect's sync path.
    void (async () => {
      await reload()
    })()
  }, [reload])

  const install = useCallback(
    async (id: string) => {
      const resp = await fetch('/api/community/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!resp.ok) throw new Error(`install ${resp.status}`)
      await reload()
    },
    [reload]
  )

  const getBody = useCallback(async (id: string): Promise<string> => {
    const resp = await fetch(`/api/community/script?id=${encodeURIComponent(id)}`)
    if (!resp.ok) throw new Error(`script ${resp.status}`)
    const data: { id: string; body: string } = await resp.json()
    return data.body
  }, [])

  const simulate = useCallback(async (id: string, payload: unknown): Promise<SimulateResult> => {
    const resp = await fetch('/api/community/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, payload }),
    })
    if (!resp.ok) throw new Error(`simulate ${resp.status}`)
    return resp.json()
  }, [])

  return { ...state, reload, install, getBody, simulate }
}
