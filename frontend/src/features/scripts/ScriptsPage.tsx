import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PaginationBar } from '@/components/shared/PaginationBar'

import { useScriptCatalog } from './hooks/useScriptCatalog'
import { ScriptRow } from './ScriptRow'
import { BundleCard } from './BundleCard'
import { filterBundles, filterScripts } from './scriptFilters'
import { CollectionTab } from './collection/CollectionTab'
import { CommunityTab } from './community/CommunityTab'
import { buildMetaHeader, buildPublishUrl } from './community/publishUrl'
import type { ScriptPackage } from '@/types'

type Tab = 'all' | 'installed' | 'bundles' | 'collection' | 'community'

const DEFAULT_PAGE_SIZE = 10

export function ScriptsPage() {
  const { catalog, loading, error, install, installBundle, remove } = useScriptCatalog()
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [notice, setNotice] = useState<string | null>(null)

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

  async function addToCollection(
    origin: 'bundled' | 'local',
    script: { id: string; filename: string }
  ) {
    const body =
      origin === 'bundled' ? { origin, id: script.id } : { origin, filename: script.filename }
    try {
      const resp = await fetch('/api/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (resp.status === 401) {
        setNotice('Log in with GitHub to use your collection.')
        changeTab('collection')
        return
      }
      if (resp.status === 409) {
        setNotice(`“${script.id}” is already in your collection.`)
        return
      }
      if (!resp.ok) {
        setNotice('Could not add to collection.')
        return
      }
      setNotice(`Added “${script.id}” to your collection.`)
    } catch {
      setNotice('Could not add to collection.')
    }
  }

  async function publish(script: ScriptPackage) {
    try {
      const resp = await fetch('/api/github/status')
      const status: { authenticated: boolean; login?: string } = await resp.json()
      if (!status.authenticated || !status.login) {
        setNotice('Log in with GitHub (My Collection tab) to publish.')
        changeTab('collection')
        return
      }
      const fields = {
        id: script.id,
        title: script.title,
        purpose: script.purpose,
        event: script.event,
        matcher: script.matcher,
        runtime: script.runtime,
        body: script.body,
      }
      const { url, prefilled } = buildPublishUrl(status.login, fields)
      if (!prefilled) {
        await navigator.clipboard.writeText(buildMetaHeader(fields) + '\n' + script.body)
        setNotice('Script copied — paste it into the new file on GitHub.')
      }
      window.open(url, '_blank', 'noopener')
    } catch {
      setNotice('Could not start publishing.')
    }
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
            <ToggleGroupItem value="collection">My Collection</ToggleGroupItem>
            <ToggleGroupItem value="community">Community</ToggleGroupItem>
          </ToggleGroup>

          {notice ? (
            <div className="flex items-center justify-between rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[0.78rem] text-[#bbb]">
              <span>{notice}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto px-1 py-0 text-[#777] hover:text-[#ccc]"
                onClick={() => setNotice(null)}
                aria-label="Dismiss"
              >
                ✕
              </Button>
            </div>
          ) : null}

          {tab === 'collection' ? (
            <CollectionTab />
          ) : tab === 'community' ? (
            <CommunityTab query={query} />
          ) : tab === 'bundles' ? (
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
                    onAddToCollection={(id) =>
                      run(() =>
                        addToCollection(tab === 'installed' ? 'local' : 'bundled', {
                          id,
                          filename: p.filename,
                        })
                      )
                    }
                    onPublish={tab === 'installed' ? publish : undefined}
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
