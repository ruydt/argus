import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { CollectionEntry } from '@/types'

import type { CollectionController } from './useCollection'
import { CollectionRow } from './CollectionRow'
import { simulatorPath } from './simulatorLink'

type CollectionTabProps = {
  query: string
  collection: CollectionController
}

export function CollectionTab({ query, collection }: CollectionTabProps) {
  const navigate = useNavigate()

  function testInSimulator(entry: CollectionEntry) {
    navigate(simulatorPath(entry))
  }

  const {
    authenticated,
    entries,
    loading,
    error,
    startLogin,
    saveToGist,
    install,
    removeLocal,
    removeGist,
    removeBoth,
  } = collection
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ text: string; href?: string } | null>(null)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } catch {
      setNotice({ text: 'Action failed. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  function guardedSave(filename: string) {
    if (!authenticated) {
      setNotice({ text: 'Sign in with GitHub to back up to your gist.' })
      void run(startLogin)
      return
    }
    void run(() => saveToGist(filename))
  }

  const filtered = entries.filter((e) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      e.title.toLowerCase().includes(q) ||
      e.filename.toLowerCase().includes(q) ||
      e.id.toLowerCase().includes(q) ||
      (e.event ?? '').toLowerCase().includes(q) ||
      (e.runtime ?? '').toLowerCase().includes(q)
    )
  })

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {notice ? (
        <div className="flex items-center justify-between rounded-md border border-black/[0.08] bg-black/[0.03] px-3 py-2 text-[0.78rem] text-[#666666]">
          <span>
            {notice.text}
            {notice.href ? (
              <>
                {' '}
                <a
                  className="text-foreground underline"
                  href={notice.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  View PR
                </a>
              </>
            ) : null}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto px-1 py-0 text-[#777] hover:text-[#171717]"
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
          >
            ✕
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div>
        <div className="flex items-center gap-4 border-b border-black/[0.12] px-2 pb-2 text-[0.68rem] tracking-[0.12em] text-[#666666] uppercase">
          <span className="w-7 shrink-0 text-right">#</span>
          <span className="flex-1">Script</span>
          <span className="hidden w-36 shrink-0 md:block">Event</span>
          <span className="hidden w-44 shrink-0 md:block">Status</span>
          <span className="w-40 shrink-0 text-right">Action</span>
        </div>
        {filtered.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-[#777]">
            {query
              ? `No scripts match "${query}".`
              : 'Nothing here yet. Install scripts from the Community tab.'}
          </p>
        ) : (
          filtered.map((e, i) => (
            <CollectionRow
              key={e.filename}
              entry={e}
              index={i + 1}
              busy={busy}
              onTest={testInSimulator}
              onSaveToGist={guardedSave}
              onInstall={(id) => run(() => install(id))}
              onRemoveLocal={(filename) => run(() => removeLocal(filename))}
              onRemoveGist={(id) => run(() => removeGist(id))}
              onRemoveBoth={(entry) => run(() => removeBoth(entry))}
              getBody={(entry) =>
                entry.local
                  ? collection.getLocalBody(entry.filename)
                  : collection.getGistBody(entry.id)
              }
            />
          ))
        )}
      </div>
    </div>
  )
}
