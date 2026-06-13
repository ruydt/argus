import { useMemo, useState } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { PaginationBar } from '@/components/shared/PaginationBar'
import type { CommunityScript, ScriptPackage } from '@/types'

import { useScriptCatalog } from '../hooks/useScriptCatalog'
import { BundleCard } from '../BundleCard'
import { ScriptRow } from '../ScriptRow'
import { useCommunity } from './useCommunity'
import { CommunityRow } from './CommunityRow'

type CommunityTabProps = {
  query: string
}

type SingleItem =
  | { kind: 'official'; pkg: ScriptPackage }
  | { kind: 'community'; script: CommunityScript }

const PAGE_SIZE = 10

function matchesPkg(p: ScriptPackage, q: string) {
  return (
    p.title.toLowerCase().includes(q) ||
    p.id.toLowerCase().includes(q) ||
    p.purpose.toLowerCase().includes(q)
  )
}

function matchesCommunity(s: CommunityScript, q: string) {
  return (
    s.title.toLowerCase().includes(q) ||
    s.id.toLowerCase().includes(q) ||
    (s.purpose ?? '').toLowerCase().includes(q)
  )
}

export function CommunityTab({ query }: CommunityTabProps) {
  const {
    catalog,
    loading: officialLoading,
    install: installOfficial,
    installBundle,
  } = useScriptCatalog()
  const { scripts: community, install: installCommunity, getBody, simulate } = useCommunity()
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState(0)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const packages = useMemo(() => catalog?.packages ?? [], [catalog])
  const bundles = useMemo(() => catalog?.bundles ?? [], [catalog])

  const items = useMemo<SingleItem[]>(() => {
    const q = query.trim().toLowerCase()
    const official: SingleItem[] = packages
      .filter((p) => !q || matchesPkg(p, q))
      .map((p) => ({ kind: 'official', pkg: p }))
    const remote: SingleItem[] = community
      .filter((s) => !q || matchesCommunity(s, q))
      .map((s) => ({ kind: 'community', script: s }))
    return [...official, ...remote]
  }, [packages, community, query])

  if (officialLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    )
  }

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const clampedPage = Math.min(page, totalPages - 1)
  const start = clampedPage * PAGE_SIZE
  const end = Math.min(start + PAGE_SIZE, items.length)
  const visible = items.slice(start, end)

  return (
    <div className="space-y-6">
      {bundles.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-[0.78rem] font-semibold tracking-wide text-[#999] uppercase">
            Bundles
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {bundles.map((b) => (
              <BundleCard
                key={b.id}
                bundle={b}
                packages={packages}
                busy={busy}
                onInstallBundle={(id) => run(() => installBundle(id))}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-[0.78rem] font-semibold tracking-wide text-[#999] uppercase">
          Single scripts
        </h2>
        <div className="overflow-hidden rounded-md border border-white/[0.06]">
          {items.length > PAGE_SIZE ? (
            <PaginationBar
              page={clampedPage}
              totalPages={totalPages}
              pageSize={PAGE_SIZE}
              totalItems={items.length}
              rangeStart={start}
              rangeEnd={end}
              defaultPageSize={PAGE_SIZE}
              onPageChange={setPage}
              onPageSizeChange={() => setPage(0)}
            />
          ) : null}
          {visible.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-[#777]">
              {query ? `No scripts match "${query}".` : 'No scripts available.'}
            </p>
          ) : (
            visible.map((item, i) =>
              item.kind === 'official' ? (
                <ScriptRow
                  key={`o:${item.pkg.id}`}
                  script={item.pkg}
                  index={start + i + 1}
                  busy={busy}
                  onInstall={(id) => run(() => installOfficial(id))}
                  onDelete={() => {}}
                />
              ) : (
                <CommunityRow
                  key={`c:${item.script.author}/${item.script.id}`}
                  script={item.script}
                  index={start + i + 1}
                  busy={busy}
                  onInstall={(id) => run(() => installCommunity(id))}
                  getBody={getBody}
                  simulate={simulate}
                />
              )
            )
          )}
        </div>
      </section>
    </div>
  )
}
