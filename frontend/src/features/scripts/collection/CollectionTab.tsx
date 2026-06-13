import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { useCollection } from './useCollection'
import { GitHubLoginPanel } from './GitHubLoginPanel'
import { DeviceFlowModal } from './DeviceFlowModal'
import { CollectionRow } from './CollectionRow'

export function CollectionTab() {
  const { status, collection, loading, error, deviceCode, startLogin, logout, install, remove } =
    useCollection()
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    )
  }

  if (!status?.authenticated) {
    return (
      <>
        <GitHubLoginPanel onLogin={() => run(startLogin)} busy={busy} />
        <DeviceFlowModal device={deviceCode} onClose={() => undefined} />
      </>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[0.72rem] text-[#888]">
        <span>
          Signed in as <span className="text-[#ccc]">@{status.login}</span>
        </span>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => run(logout)}>
          Logout
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="overflow-hidden rounded-md border border-white/[0.06]">
        {!collection || collection.scripts.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-[#777]">
            Your collection is empty. Add scripts from the All or Installed tabs.
          </p>
        ) : (
          collection.scripts.map((s, i) => (
            <CollectionRow
              key={s.id}
              script={s}
              index={i + 1}
              busy={busy}
              onInstall={(id) => run(() => install(id))}
              onRemove={(id) => run(() => remove(id))}
            />
          ))
        )}
      </div>
    </div>
  )
}
