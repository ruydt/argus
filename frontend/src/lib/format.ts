import type { ReactNode } from 'react'
import { createElement } from 'react'

/** Truncate a string ID to the first 8 characters */
export function shortId(value: string): string {
  return value ? value.substring(0, 8) : 'unknown'
}

/** Format token count with k suffix */
export function fmtTokens(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value)
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
