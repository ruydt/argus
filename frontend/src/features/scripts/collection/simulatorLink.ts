import type { CollectionEntry } from '@/types'

// simulatorPath builds the hooks-config deep link that opens the simulator with
// this script's hook event + file preselected.
export function simulatorPath(entry: CollectionEntry): string {
  const params = new URLSearchParams({ view: 'simulator', script: entry.filename })
  if (entry.event) params.set('event', entry.event)
  return `/hooks-config?${params.toString()}`
}
