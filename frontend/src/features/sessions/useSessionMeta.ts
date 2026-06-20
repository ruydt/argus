import { useCallback, useEffect, useState } from 'react'

// Pins and tags are local-first: stored in localStorage keyed by session id.
// No backend round-trip, instant, and survives reloads. (Single-user tool — no
// cross-device sync needed.)
const PINS_KEY = 'argus_session_pins'
const TAGS_KEY = 'argus_session_tags'

function loadPins(): string[] {
  try {
    const raw = localStorage.getItem(PINS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

function loadTags(): Record<string, string> {
  try {
    const raw = localStorage.getItem(TAGS_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

export type SessionMeta = {
  pinned: Set<string>
  tags: Record<string, string>
  togglePin: (id: string) => void
  setTag: (id: string, tag: string) => void
  removeTag: (id: string) => void
}

export function useSessionMeta(): SessionMeta {
  const [pinned, setPinned] = useState<Set<string>>(() => new Set(loadPins()))
  const [tags, setTags] = useState<Record<string, string>>(loadTags)

  useEffect(() => {
    try {
      localStorage.setItem(PINS_KEY, JSON.stringify([...pinned]))
    } catch {
      /* storage unavailable */
    }
  }, [pinned])

  useEffect(() => {
    try {
      localStorage.setItem(TAGS_KEY, JSON.stringify(tags))
    } catch {
      /* storage unavailable */
    }
  }, [tags])

  const togglePin = useCallback((id: string) => {
    setPinned((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const setTag = useCallback((id: string, tag: string) => {
    const trimmed = tag.trim()
    setTags((prev) => {
      if (!trimmed) {
        if (!(id in prev)) return prev
        const next = { ...prev }
        delete next[id]
        return next
      }
      return { ...prev, [id]: trimmed }
    })
  }, [])

  const removeTag = useCallback((id: string) => {
    setTags((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  return { pinned, tags, togglePin, setTag, removeTag }
}
