import { useEffect, useMemo, useRef, useState } from 'react'

import { Skeleton } from '@/components/ui/skeleton'

import type { CommunityController } from './useCommunity'
import { CommunityRow } from './CommunityRow'

type CommunityTabProps = {
  query: string
  community: CommunityController
}

const PAGE = 50

export function CommunityTab({ query, community }: CommunityTabProps) {
  const { scripts, loading, error, install, getBody } = community
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
        (s.events ?? []).join(' ').toLowerCase().includes(q) ||
        (s.agents ?? []).join(' ').toLowerCase().includes(q) ||
        (s.purpose ?? '').toLowerCase().includes(q)
    )
  }, [scripts, query])

  useEffect(() => {
    // Reset the infinite-scroll window when the search query changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      <p className="px-3 py-8 text-center text-sm text-muted-foreground">
        Couldn't reach the script registry. Try again shortly.
      </p>
    )
  }

  const shown = filtered.slice(0, visible)

  return (
    <div>
      <div className="flex items-center gap-4 border-b border-foreground/[0.12] px-2 pb-2 text-[0.68rem] tracking-[0.12em] text-muted-foreground uppercase">
        <span className="w-7 shrink-0 text-right">#</span>
        <span className="flex-1">Script</span>
        <span className="hidden w-40 shrink-0 md:block">Events</span>
        <span className="hidden w-24 shrink-0 md:block">Agents</span>
        <span className="hidden w-24 shrink-0 md:block">OS</span>
        <span className="w-20 shrink-0 text-right">Action</span>
      </div>
      {shown.length === 0 ? (
        <p className="px-3 py-8 text-center text-sm text-muted-foreground">
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
