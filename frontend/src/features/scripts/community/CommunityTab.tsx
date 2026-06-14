import { useEffect, useMemo, useRef, useState } from 'react'

import { Skeleton } from '@/components/ui/skeleton'

import { useCommunity } from './useCommunity'
import { CommunityRow } from './CommunityRow'

type CommunityTabProps = {
  query: string
}

const PAGE = 50

export function CommunityTab({ query }: CommunityTabProps) {
  const { scripts, loading, error, install, getBody } = useCommunity()
  const [busy, setBusy] = useState(false)
  const [visible, setVisible] = useState(PAGE)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return scripts
    return scripts.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.author.toLowerCase().includes(q) ||
        s.source.toLowerCase().includes(q) ||
        (s.event ?? '').toLowerCase().includes(q) ||
        (s.purpose ?? '').toLowerCase().includes(q)
    )
  }, [scripts, query])

  useEffect(() => {
    setVisible(PAGE)
  }, [query])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisible((v) => Math.min(v + PAGE, filtered.length))
      }
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [filtered.length])

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

  const shown = filtered.slice(0, visible)

  return (
    <div className="overflow-hidden rounded-md border border-white/[0.06]">
      {shown.length === 0 ? (
        <p className="px-3 py-8 text-center text-sm text-[#777]">
          {query ? `No scripts match "${query}".` : 'No scripts in the registry yet.'}
        </p>
      ) : (
        <>
          {shown.map((s, i) => (
            <CommunityRow
              key={`${s.author}/${s.id}`}
              script={s}
              index={i + 1}
              busy={busy}
              onInstall={(id) => run(() => install(id))}
              getBody={getBody}
            />
          ))}
          <div ref={sentinelRef} className="h-8" aria-hidden />
        </>
      )}
    </div>
  )
}
