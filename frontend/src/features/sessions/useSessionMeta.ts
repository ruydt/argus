import { useCallback, useEffect, useState } from 'react'

// Pins and tags are local-first: stored in localStorage keyed by session id.
// No backend round-trip, instant, and survives reloads. (Single-user tool — no
// cross-device sync needed.)
const PINS_KEY = 'argus_session_pins'
const TAGS_KEY = 'argus_session_tags'
// sessionId → ms timestamp of the newest event the user has seen for it.
const SEEN_KEY = 'argus_session_seen'

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

function loadSeen(): Record<string, number> {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {}
  } catch {
    return {}
  }
}

export type SessionMeta = {
  pinned: Set<string>
  tags: Record<string, string>
  seen: Record<string, number>
  togglePin: (id: string) => void
  setTag: (id: string, tag: string) => void
  removeTag: (id: string) => void
  markSeen: (id: string, timeMs: number) => void
}

export function useSessionMeta(): SessionMeta {
  const [pinned, setPinned] = useState<Set<string>>(() => new Set(loadPins()))
  const [tags, setTags] = useState<Record<string, string>>(loadTags)
  const [seen, setSeen] = useState<Record<string, number>>(loadSeen)

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

  useEffect(() => {
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
    } catch {
      /* storage unavailable */
    }
  }, [seen])

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

  // Record the newest event time the user has seen for a session. Monotonic — a
  // later visit never lowers the watermark, so a newer Stop re-flags it.
  const markSeen = useCallback((id: string, timeMs: number) => {
    setSeen((prev) => ((prev[id] ?? 0) >= timeMs ? prev : { ...prev, [id]: timeMs }))
  }, [])

  return { pinned, tags, seen, togglePin, setTag, removeTag, markSeen }
}
