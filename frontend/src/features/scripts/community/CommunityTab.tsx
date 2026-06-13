import { useMemo, useState } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { PaginationBar } from '@/components/shared/PaginationBar'

import { useCommunity } from './useCommunity'
import { CommunityRow } from './CommunityRow'

type CommunityTabProps = {
  query: string
}

const PAGE_SIZE = 10

export function CommunityTab({ query }: CommunityTabProps) {
  const { scripts, loading, error, install, getBody, simulate } = useCommunity()
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return scripts
    return scripts.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        (s.purpose ?? '').toLowerCase().includes(q)
    )
  }, [scripts, query])

  async function runInstall(id: string) {
    setBusy(true)
    try {
      await install(id)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <p className="px-3 py-8 text-center text-sm text-[#777]">
        Couldn't reach the script registry. Try again shortly.
      </p>
    )
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const clampedPage = Math.min(page, totalPages - 1)
  const start = clampedPage * PAGE_SIZE
  const end = Math.min(start + PAGE_SIZE, filtered.length)
  const visible = filtered.slice(start, end)

  return (
    <div className="overflow-hidden rounded-md border border-white/[0.06]">
      {filtered.length > PAGE_SIZE && (
        <PaginationBar
          page={clampedPage}
          totalPages={totalPages}
          pageSize={PAGE_SIZE}
          totalItems={filtered.length}
          rangeStart={start}
          rangeEnd={end}
          defaultPageSize={PAGE_SIZE}
          onPageChange={setPage}
          onPageSizeChange={() => setPage(0)}
        />
      )}
      {visible.length === 0 ? (
        <p className="px-3 py-8 text-center text-sm text-[#777]">
          {query ? `No community scripts match "${query}".` : 'No community scripts yet.'}
        </p>
      ) : (
        visible.map((s, i) => (
          <CommunityRow
            key={`${s.author}/${s.id}`}
            script={s}
            index={start + i + 1}
            busy={busy}
            onInstall={runInstall}
            getBody={getBody}
            simulate={simulate}
          />
        ))
      )}
    </div>
  )
}
