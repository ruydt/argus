import { useCallback, useEffect, useRef, useState } from 'react'

import type { CollectionEntry, CollectionView, DeviceCodeResponse } from '@/types'

type State = {
  authenticated: boolean
  login?: string
  gistUrl?: string
  entries: CollectionEntry[]
  loading: boolean
  error: string | null
}

// Session cache: survives tab switches / remounts so My Collection shows
// instantly on return (avoids a refetch + GitHub gist round-trip every time);
// reload() revalidates in the background. Reset via __resetCollectionCache (tests).
type CachedView = {
  authenticated: boolean
  login?: string
  gistUrl?: string
  entries: CollectionEntry[]
}
let cache: CachedView | null = null
export function __resetCollectionCache() {
  cache = null
}

export type CollectionController = ReturnType<typeof useCollection>

export function useCollection() {
  const [state, setState] = useState<State>({
    authenticated: cache?.authenticated ?? false,
    login: cache?.login,
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
        login: view.login,
        gistUrl: view.gist_url,
        entries: view.entries ?? [],
      }
      setState({ ...cache, loading: false, error: null })
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: (e as Error).message }))
    }
  }, [])

  useEffect(() => {
    // Only auto-fetch on the FIRST ever mount (cold cache). Navigating back to
    // the page reuses the session cache; an explicit reload() (e.g. on tab
    // switch) is the only thing that revalidates after that.
    if (cache === null) {
      void (async () => {
        await reload()
      })()
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [reload])

  // share=true requests the broader publish scope (gist + public_repo); a plain
  // login asks for gist only so signing in never grants public-repo write access.
  const startLogin = useCallback(
    async (share = false) => {
      const resp = await fetch(`/api/github/device${share ? '?share=1' : ''}`, { method: 'POST' })
      if (!resp.ok) throw new Error(`device ${resp.status}`)
      const dc: DeviceCodeResponse = await resp.json()
      setDeviceCode(dc)
      if (pollRef.current) clearInterval(pollRef.current)
      // Stop polling once the device code expires — otherwise it spins forever on
      // a code that can no longer succeed. Wrap each tick so a transient fetch
      // failure is ignored (keep polling) instead of throwing an unhandled rejection.
      const deadline = Date.now() + (dc.expires_in || 900) * 1000
      pollRef.current = setInterval(
        async () => {
          if (Date.now() > deadline) {
            if (pollRef.current) clearInterval(pollRef.current)
            pollRef.current = null
            setDeviceCode(null)
            setState((s) => ({ ...s, error: 'Device code expired — try signing in again.' }))
            return
          }
          try {
            const resp = await fetch('/api/github/status')
            if (!resp.ok) return
            const status = await resp.json()
            if (status.authenticated) {
              if (pollRef.current) clearInterval(pollRef.current)
              pollRef.current = null
              setDeviceCode(null)
              await reload()
            }
          } catch {
            // transient network error — keep polling until the deadline
          }
        },
        (dc.interval || 5) * 1000
      )
    },
    [reload]
  )

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

  const reveal = useCallback(async (filename: string) => {
    const resp = await fetch('/api/collection/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename }),
    })
    if (!resp.ok) throw new Error(`reveal ${resp.status}`)
  }, [])

  const getLocalBody = useCallback(async (filename: string): Promise<string> => {
    const resp = await fetch(`/api/collection/local?filename=${encodeURIComponent(filename)}`)
    if (!resp.ok) throw new Error(`body ${resp.status}`)
    const data: { filename: string; body: string } = await resp.json()
    return data.body
  }, [])

  const gistBodyCache = useRef<Map<string, string>>(new Map())

  const getGistBody = useCallback(async (id: string): Promise<string> => {
    const cached = gistBodyCache.current.get(id)
    if (cached !== undefined) return cached
    const resp = await fetch(`/api/collection/gist?id=${encodeURIComponent(id)}`)
    if (!resp.ok) throw new Error(`gist body ${resp.status}`)
    const data: { id: string; body: string } = await resp.json()
    gistBodyCache.current.set(id, data.body)
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
    reveal,
    getLocalBody,
    getGistBody,
    publishFiles,
  }
}
