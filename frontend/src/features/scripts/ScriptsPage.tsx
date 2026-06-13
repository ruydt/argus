import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PaginationBar } from '@/components/shared/PaginationBar'

import { useScriptCatalog } from './hooks/useScriptCatalog'
import { ScriptRow } from './ScriptRow'
import { BundleCard } from './BundleCard'
import { filterBundles, filterScripts } from './scriptFilters'

type Tab = 'all' | 'installed' | 'bundles'

const DEFAULT_PAGE_SIZE = 10

export function ScriptsPage() {
  const { catalog, loading, error, install, installBundle, remove } = useScriptCatalog()
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  function changeTab(next: Tab) {
    setTab(next)
    setPage(0)
  }

  function changeQuery(next: string) {
    setQuery(next)
    setPage(0)
  }

  const packages = useMemo(() => catalog?.packages ?? [], [catalog])
  const bundles = useMemo(() => catalog?.bundles ?? [], [catalog])
  const installedCount = packages.filter((p) => p.installed).length

  const filteredScripts = useMemo(() => {
    const scope = tab === 'installed' ? packages.filter((p) => p.installed) : packages
    return filterScripts(scope, query)
  }, [packages, tab, query])

  const filteredBundles = useMemo(() => filterBundles(bundles, query), [bundles, query])

  const totalPages = Math.max(1, Math.ceil(filteredScripts.length / pageSize))
  const clampedPage = Math.min(page, totalPages - 1)
  const pageStart = clampedPage * pageSize
  const pageEnd = Math.min(pageStart + pageSize, filteredScripts.length)
  const visibleScripts = filteredScripts.slice(pageStart, pageEnd)
  const needsPagination = filteredScripts.length > pageSize

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <main className="flex-1 overflow-y-auto p-6">
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        </main>
      </div>
    )
  }

  if (error || !catalog) {
    return (
      <div className="flex h-full flex-col">
        <main className="flex-1 overflow-y-auto p-6">
          <p className="text-sm text-destructive">Failed to load scripts: {error}</p>
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#666]" />
            <Input
              value={query}
              onChange={(e) => changeQuery(e.target.value)}
              placeholder="Search scripts…"
              aria-label="Search scripts"
              className="pl-9"
            />
          </div>

          <ToggleGroup
            type="single"
            value={tab}
            onValueChange={(v) => v && changeTab(v as Tab)}
            className="justify-start"
          >
            <ToggleGroupItem value="all">All ({packages.length})</ToggleGroupItem>
            <ToggleGroupItem value="installed">Installed ({installedCount})</ToggleGroupItem>
            <ToggleGroupItem value="bundles">Bundles ({bundles.length})</ToggleGroupItem>
          </ToggleGroup>

          {tab === 'bundles' ? (
            filteredBundles.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-[#777]">
                No bundles match “{query}”.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {filteredBundles.map((b) => (
                  <BundleCard
                    key={b.id}
                    bundle={b}
                    packages={packages}
                    busy={busy}
                    onInstallBundle={(id) => run(() => installBundle(id))}
                  />
                ))}
              </div>
            )
          ) : (
            <div className="overflow-hidden rounded-md border border-white/[0.06]">
              {needsPagination && (
                <PaginationBar
                  page={clampedPage}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  totalItems={filteredScripts.length}
                  rangeStart={pageStart}
                  rangeEnd={pageEnd}
                  defaultPageSize={DEFAULT_PAGE_SIZE}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => {
                    setPageSize(size)
                    setPage(0)
                  }}
                />
              )}
              {visibleScripts.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-[#777]">
                  {tab === 'installed'
                    ? 'No installed scripts yet.'
                    : `No scripts match “${query}”.`}
                </p>
              ) : (
                visibleScripts.map((p, i) => (
                  <ScriptRow
                    key={p.id}
                    script={p}
                    index={pageStart + i + 1}
                    busy={busy}
                    canDelete={tab === 'installed'}
                    onInstall={(id) => run(() => install(id))}
                    onDelete={(id) => run(() => remove(id))}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
