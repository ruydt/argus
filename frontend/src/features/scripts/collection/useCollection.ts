import { useCallback, useEffect, useRef, useState } from 'react'

import type { CollectionEntry, CollectionView, DeviceCodeResponse } from '@/types'

type State = {
  authenticated: boolean
  gistUrl?: string
  entries: CollectionEntry[]
  loading: boolean
  error: string | null
}

// Session cache: survives tab switches / remounts so My Collection shows
// instantly on return (avoids a refetch + GitHub gist round-trip every time);
// reload() revalidates in the background. Reset via __resetCollectionCache (tests).
type CachedView = { authenticated: boolean; gistUrl?: string; entries: CollectionEntry[] }
let cache: CachedView | null = null
export function __resetCollectionCache() {
  cache = null
}

export function useCollection() {
  const [state, setState] = useState<State>({
    authenticated: cache?.authenticated ?? false,
    gistUrl: cache?.gistUrl,
    entries: cache?.entries ?? [],
    loading: cache === null,
    error: null,
  })
  const [deviceCode, setDeviceCode] = useState<DeviceCodeResponse | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const reload = useCallback(async () => {
    try {
      const resp = await fetch('/api/collection')
      if (!resp.ok) throw new Error(`collection ${resp.status}`)
      const view: CollectionView = await resp.json()
      cache = {
        authenticated: view.authenticated,
        gistUrl: view.gist_url,
        entries: view.entries ?? [],
      }
      setState({ ...cache, loading: false, error: null })
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: (e as Error).message }))
    }
  }, [])

  useEffect(() => {
    void (async () => {
      await reload()
    })()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [reload])

  const startLogin = useCallback(async () => {
    const resp = await fetch('/api/github/device', { method: 'POST' })
    if (!resp.ok) throw new Error(`device ${resp.status}`)
    const dc: DeviceCodeResponse = await resp.json()
    setDeviceCode(dc)
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(
      async () => {
        const status = await (await fetch('/api/github/status')).json()
        if (status.authenticated) {
          if (pollRef.current) clearInterval(pollRef.current)
          setDeviceCode(null)
          await reload()
        }
      },
      (dc.interval || 5) * 1000
    )
  }, [reload])

  const cancelLogin = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = null
    setDeviceCode(null)
  }, [])

  const logout = useCallback(async () => {
    await fetch('/api/github/logout', { method: 'POST' })
    await reload()
  }, [reload])

  const saveToGist = useCallback(
    async (filename: string) => {
      const resp = await fetch('/api/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin: 'local', filename }),
      })
      if (!resp.ok && resp.status !== 409) throw new Error(`save ${resp.status}`)
      await reload()
    },
    [reload]
  )

  const install = useCallback(
    async (id: string) => {
      const resp = await fetch('/api/collection/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!resp.ok && resp.status !== 409) throw new Error(`install ${resp.status}`)
      await reload()
    },
    [reload]
  )

  const removeLocal = useCallback(async (filename: string) => {
    const resp = await fetch(`/api/collection/local?filename=${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    })
    if (!resp.ok) throw new Error(`remove local ${resp.status}`)
  }, [])

  const removeGist = useCallback(async (id: string) => {
    const resp = await fetch(`/api/collection?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!resp.ok) throw new Error(`remove gist ${resp.status}`)
  }, [])

  const removeBoth = useCallback(
    async (entry: CollectionEntry) => {
      if (entry.local) await removeLocal(entry.filename)
      if (entry.gist) await removeGist(entry.id)
      await reload()
    },
    [removeLocal, removeGist, reload]
  )

  const removeLocalOnly = useCallback(
    async (filename: string) => {
      await removeLocal(filename)
      await reload()
    },
    [removeLocal, reload]
  )

  const removeGistOnly = useCallback(
    async (id: string) => {
      await removeGist(id)
      await reload()
    },
    [removeGist, reload]
  )

  const getLocalBody = useCallback(async (filename: string): Promise<string> => {
    const resp = await fetch(`/api/collection/local?filename=${encodeURIComponent(filename)}`)
    if (!resp.ok) throw new Error(`body ${resp.status}`)
    const data: { filename: string; body: string } = await resp.json()
    return data.body
  }, [])

  const publishFiles = useCallback(
    async (files: { name: string; body: string }[], description: string): Promise<string> => {
      const resp = await fetch('/api/registry/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files, description }),
      })
      if (resp.status === 401) throw new Error('unauthenticated')
      if (resp.status === 403) throw new Error('needs-scope')
      if (!resp.ok) throw new Error(`publish ${resp.status}`)
      const data: { pull_request_url: string } = await resp.json()
      return data.pull_request_url
    },
    []
  )

  return {
    ...state,
    deviceCode,
    reload,
    startLogin,
    cancelLogin,
    logout,
    saveToGist,
    install,
    removeLocal: removeLocalOnly,
    removeGist: removeGistOnly,
    removeBoth,
    getLocalBody,
    publishFiles,
  }
}
