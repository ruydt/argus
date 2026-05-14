import type { ReactNode } from 'react'
import { createElement } from 'react'

/** Truncate a string ID to the first 8 characters */
export function shortId(value: string): string {
  return value ? value.substring(0, 8) : 'unknown'
}

/** Format token count with K/M suffixes */
export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

/** Highlight matching text in a string */
export function highlight(text: string, query: string): ReactNode {
  if (!query) return text
  const escaped = query.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return createElement(
    'span',
    null,
    ...parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? createElement('mark', { key: i }, part) : part
    )
  )
}
