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
