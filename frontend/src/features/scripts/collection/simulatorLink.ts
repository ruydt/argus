import type { CollectionEntry } from '@/types'

// simulatorPath builds the Hooks page deep link that opens the simulator with
// this script's hook event + file preselected.
export function simulatorPath(entry: CollectionEntry): string {
  const params = new URLSearchParams({ view: 'simulator', script: entry.filename })
  const firstEvent = entry.events?.[0]
  if (firstEvent) params.set('event', firstEvent)
  return `/hooks?${params.toString()}`
}
