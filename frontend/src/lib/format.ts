import type { ReactNode } from 'react'
import { createElement } from 'react'

/** Truncate a string ID to the first 8 characters */
export function shortId(value: string): string {
  return value ? value.substring(0, 8) : 'unknown'
}

const timeFormatCache = new Map<string, string>()

/**
 * Format an ISO timestamp as a locale time string, cached per timestamp so
 * list re-renders don't re-run Date parsing and locale formatting per row.
 */
export function formatEventTime(iso: string): string {
  const cached = timeFormatCache.get(iso)
  if (cached !== undefined) return cached
  if (timeFormatCache.size > 20_000) timeFormatCache.clear()
  const formatted = new Date(iso).toLocaleTimeString([], { hour12: false })
  timeFormatCache.set(iso, formatted)
  return formatted
}

/**
 * Format an ISO timestamp as a short, human relative label ("just now", "5m
 * ago", "3h ago", "2d ago"). Falls back to a locale date for anything older
 * than a week so old sessions stay legible.
 */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = Date.now() - then
  const sec = Math.floor(diffMs / 1000)
  if (sec < 45) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString()
}

let lastHighlightQuery: string | null = null
let lastHighlightRegex: RegExp | null = null

function highlightRegex(query: string): RegExp {
  if (query !== lastHighlightQuery || lastHighlightRegex === null) {
    const escaped = query.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&')
    lastHighlightQuery = query
    lastHighlightRegex = new RegExp(`(${escaped})`, 'gi')
  }
  return lastHighlightRegex
}

/** Highlight matching text in a string */
export function highlight(text: string, query: string): ReactNode {
  if (!query) return text
  const parts = text.split(highlightRegex(query))
  return createElement(
    'span',
    null,
    ...parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? createElement('mark', { key: i }, part) : part
    )
  )
}
