import { useRef, useState } from 'react'
import { CheckCircle2, Download } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { CommunityScript } from '@/types'

import { OsIcons } from '../OsIcons'
import { ScriptViewerModal } from '../ScriptViewerModal'

type CommunityRowProps = {
  script: CommunityScript
  index: number
  busy: boolean
  onInstall: (id: string) => void
  getBody: (id: string) => Promise<string>
}

function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

function filenameOf(script: CommunityScript): string {
  return script.source.split('/').pop() ?? script.id
}

export function CommunityRow({ script, index, busy, onInstall, getBody }: CommunityRowProps) {
  const [viewing, setViewing] = useState(false)
  // One flat row matches the header grid exactly. Row-click opens the viewer;
  // pointer-down-capture flags button presses so action buttons don't also open
  // it (fires before Radix re-dispatches the portaled trigger click).
  const skipOpen = useRef(false)
  function openFromAction() {
    if (skipOpen.current) {
      skipOpen.current = false
      return
    }
    setViewing(true)
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={openFromAction}
        onPointerDownCapture={(e) => {
          skipOpen.current = (e.target as HTMLElement).closest('button') != null
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setViewing(true)
          }
        }}
        className="flex cursor-pointer items-center gap-4 border-b border-foreground/[0.08] px-2 py-3.5 hover:bg-foreground/[0.02]"
      >
        <span className="w-7 shrink-0 text-right text-[0.8rem] tabular-nums text-muted-foreground">
          {index}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
          <span className="truncate text-sm font-semibold text-foreground">
            {filenameOf(script)}
          </span>
          <span className="truncate text-[0.8rem] text-muted-foreground">{script.author}</span>
        </div>
        <div className="hidden w-44 shrink-0 items-center gap-1 md:flex">
          {script.event ? <Badge variant="outline">{script.event}</Badge> : null}
          {!script.runtime_available ? (
            <Badge variant="outline" className="border-amber-600/40 text-amber-500">
              needs {script.runtime}
            </Badge>
          ) : null}
        </div>
        <div className="hidden w-32 shrink-0 md:flex">
          <OsIcons os={script.os} />
        </div>
        <div className="flex w-40 shrink-0 items-center justify-end gap-2">
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  size="sm"
                  variant="ghost"
                  aria-label={`View ${script.author} on GitHub`}
                  className="size-8 p-0 text-muted-foreground"
                >
                  <a
                    href={`https://github.com/${script.author}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <GithubMark className="size-3.5" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{script.author} on GitHub</TooltipContent>
            </Tooltip>
            {!script.installed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => onInstall(script.id)}
                    aria-label="Install script"
                    className="size-8 p-0 text-muted-foreground"
                  >
                    <Download className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Install</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex size-8 items-center justify-center text-green-500">
                    <CheckCircle2 className="size-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>Installed</TooltipContent>
              </Tooltip>
            )}
          </TooltipProvider>
        </div>
      </div>

      <ScriptViewerModal
        title={filenameOf(script)}
        open={viewing}
        onOpenChange={setViewing}
        load={() => getBody(script.id)}
      />
    </>
  )
}
