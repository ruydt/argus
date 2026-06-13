import { useState } from 'react'

import { Skeleton } from '@/components/ui/skeleton'

import { useScriptCatalog } from './hooks/useScriptCatalog'
import { ScriptCard } from './ScriptCard'
import { BundleCard } from './BundleCard'

export function ScriptsPage() {
  const { catalog, loading, error, install, installBundle, remove } = useScriptCatalog()
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <main className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : error || !catalog ? (
          <p className="text-sm text-destructive">Failed to load scripts: {error}</p>
        ) : (
          <div className="space-y-8">
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Bundles</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {catalog.bundles.map((b) => (
                  <BundleCard
                    key={b.id}
                    bundle={b}
                    packages={catalog.packages}
                    busy={busy}
                    onInstallBundle={(id) => run(() => installBundle(id))}
                  />
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-lg font-semibold">All scripts</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {catalog.packages.map((p) => (
                  <ScriptCard
                    key={p.id}
                    script={p}
                    busy={busy}
                    onInstall={(id) => run(() => install(id))}
                    onDelete={(id) => run(() => remove(id))}
                  />
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
