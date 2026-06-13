import type { ScriptBundle, ScriptPackage } from '@/types'

// filterScripts matches a query (case-insensitive substring) against a script's
// title, id, purpose, event, and matcher. Empty query returns everything.
// Today this runs client-side over the bundled catalog; the same signature will
// back an online search later.
export function filterScripts(packages: ScriptPackage[], query: string): ScriptPackage[] {
  const q = query.trim().toLowerCase()
  if (!q) return packages
  return packages.filter((p) =>
    [p.title, p.id, p.purpose, p.event, p.matcher ?? ''].some((field) =>
      field.toLowerCase().includes(q)
    )
  )
}

// filterBundles matches a query against a bundle's title and description.
export function filterBundles(bundles: ScriptBundle[], query: string): ScriptBundle[] {
  const q = query.trim().toLowerCase()
  if (!q) return bundles
  return bundles.filter((b) =>
    [b.title, b.description].some((field) => field.toLowerCase().includes(q))
  )
}
