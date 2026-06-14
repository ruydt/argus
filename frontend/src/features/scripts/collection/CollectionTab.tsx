import { useState } from 'react'
import { ExternalLink } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { useCollection } from './useCollection'
import { DeviceFlowModal } from './DeviceFlowModal'
import { CollectionRow } from './CollectionRow'
import { UploadShareDialog } from './UploadShareDialog'

type CollectionTabProps = {
  query: string
}

export function CollectionTab({ query }: CollectionTabProps) {
  const {
    authenticated,
    gistUrl,
    entries,
    loading,
    error,
    deviceCode,
    startLogin,
    cancelLogin,
    logout,
    saveToGist,
    install,
    removeLocal,
    removeGist,
    removeBoth,
    publishFiles,
  } = useCollection()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } catch {
      setNotice('Action failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  // Upgrading scope (gist -> public_repo) needs fresh consent. An existing
  // gist-only token makes /api/github/status report authenticated, which would
  // short-circuit the device-flow poll, so log out first then start a new login.
  function reauthForSharing() {
    void run(async () => {
      await logout()
      await startLogin()
    })
  }

  function guardedSave(filename: string) {
    if (!authenticated) {
      setNotice('Sign in with GitHub to back up to your gist.')
      void run(startLogin)
      return
    }
    void run(() => saveToGist(filename))
  }

  const filtered = entries.filter((e) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return e.title.toLowerCase().includes(q) || e.filename.toLowerCase().includes(q)
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
      <div className="flex items-center justify-between text-[0.72rem] text-[#888]">
        {authenticated ? (
          <span>Signed in to GitHub</span>
        ) : (
          <span>Local scripts only — sign in to sync with a gist.</span>
        )}
        <div className="flex items-center gap-2">
          {authenticated && gistUrl ? (
            <a
              href={gistUrl}
              target="_blank"
              rel="noreferrer"
              className="flex w-fit items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <ExternalLink className="size-3" />
              View scripts on GitHub
            </a>
          ) : null}
          {authenticated ? (
            <UploadShareDialog onPublish={publishFiles} onNeedsLogin={reauthForSharing} />
          ) : null}
          {authenticated ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => run(logout)}>
              Logout
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => run(startLogin)}>
              Sign in with GitHub
            </Button>
          )}
        </div>
      </div>

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
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-hidden rounded-md border border-white/[0.06]">
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
              onSaveToGist={guardedSave}
              onInstall={(id) => run(() => install(id))}
              onRemoveLocal={(filename) => run(() => removeLocal(filename))}
              onRemoveGist={(id) => run(() => removeGist(id))}
              onRemoveBoth={(entry) => run(() => removeBoth(entry))}
            />
          ))
        )}
      </div>

      <DeviceFlowModal device={deviceCode} onClose={cancelLogin} />
    </div>
  )
}
