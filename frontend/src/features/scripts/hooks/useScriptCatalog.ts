import { useCallback, useEffect, useState } from 'react'

import type { ScriptCatalog } from '@/types'

type State = {
  catalog: ScriptCatalog | null
  loading: boolean
  error: string | null
}

export function useScriptCatalog() {
  const [state, setState] = useState<State>({ catalog: null, loading: true, error: null })

  const reload = useCallback(async () => {
    try {
      const resp = await fetch('/api/scripts/catalog')
      if (!resp.ok) throw new Error(`catalog ${resp.status}`)
      const catalog: ScriptCatalog = await resp.json()
      setState({ catalog, loading: false, error: null })
    } catch (e) {
      setState({ catalog: null, loading: false, error: (e as Error).message })
    }
  }, [])

  useEffect(() => {
    // Wrap in an async IIFE so the fetch-driven setState happens off the
    // effect's synchronous path (no cascading-render lint warning).
    void (async () => {
      await reload()
    })()
  }, [reload])

  const install = useCallback(
    async (id: string) => {
      const resp = await fetch('/api/scripts/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!resp.ok) throw new Error(`install ${resp.status}`)
      await reload()
    },
    [reload]
  )

  const installBundle = useCallback(
    async (id: string) => {
      const resp = await fetch('/api/scripts/install-bundle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!resp.ok) throw new Error(`install-bundle ${resp.status}`)
      await reload()
    },
    [reload]
  )

  const remove = useCallback(
    async (id: string) => {
      const resp = await fetch(`/api/scripts/installed?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!resp.ok) throw new Error(`delete ${resp.status}`)
      await reload()
    },
    [reload]
  )

  return { ...state, reload, install, installBundle, remove }
}
