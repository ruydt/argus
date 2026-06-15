import { useState } from 'react'
import { CircleUser, ExternalLink, LogOut, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

import type { CollectionController } from './useCollection'
import { DeviceFlowModal } from './DeviceFlowModal'
import { UploadShareDialog } from './UploadShareDialog'

type AccountMenuProps = {
  collection: CollectionController
}

// lucide-react dropped brand icons, so ship the GitHub mark inline.
function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

/**
 * Collapsed GitHub account control for the Scripts page header: shows only the
 * avatar; clicking it reveals the username, gist link, Upload & share, and
 * logout (or a sign-in prompt). Lives in the header so it sits on the same
 * level as the page title, regardless of which tab is active.
 */
export function AccountMenu({ collection }: AccountMenuProps) {
  const {
    authenticated,
    login,
    gistUrl,
    deviceCode,
    startLogin,
    cancelLogin,
    logout,
    publishFiles,
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

  // Upgrading scope (gist -> public_repo) needs fresh consent. An existing
  // gist-only token reports authenticated, short-circuiting the device poll, so
  // log out first then start a new login.
  function reauthForSharing() {
    void run(async () => {
      await logout()
      await startLogin()
    })
  }

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="GitHub account"
            className="rounded-full"
          >
            {authenticated && login ? (
              <img
                src={`https://github.com/${login}.png?size=48`}
                alt=""
                className="size-6 rounded-full border border-white/[0.12]"
              />
            ) : (
              <CircleUser className="size-5 text-muted-foreground" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-1">
          {authenticated ? (
            <div className="flex flex-col">
              <div className="flex items-center gap-2 px-2 py-1.5">
                {login ? (
                  <img
                    src={`https://github.com/${login}.png?size=48`}
                    alt=""
                    className="size-6 shrink-0 rounded-full border border-white/[0.12]"
                  />
                ) : null}
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px] font-medium text-foreground">
                    {login ?? 'GitHub'}
                  </span>
                  {gistUrl ? (
                    <a
                      href={gistUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex w-fit items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <ExternalLink className="size-2.5" />
                      View scripts on Gist
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="my-1 h-px bg-white/[0.08]" />

              <UploadShareDialog
                onPublish={publishFiles}
                onNeedsLogin={reauthForSharing}
                onResult={setNotice}
                icon={<Upload className="size-3.5" />}
                className="menu-item w-full justify-start gap-2 border-0 bg-transparent px-2 font-normal shadow-none"
              />

              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => run(logout)}
                className="menu-item justify-start gap-2 hover:!text-[var(--destructive)]"
              >
                <LogOut className="size-3.5" />
                Logout
              </Button>

              {notice ? (
                <p className="px-2 py-1.5 text-[12px] text-muted-foreground">
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
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 p-1.5">
              <p className="text-[12px] text-muted-foreground">
                Sign in to save and share your favourite scripts.
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => run(startLogin)}
                className="justify-center gap-2"
              >
                <GithubMark className="size-3.5" />
                Sign in with GitHub
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      <DeviceFlowModal device={deviceCode} onClose={cancelLogin} />
    </>
  )
}
